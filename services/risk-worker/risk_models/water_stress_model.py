#!/usr/bin/env python3
# =============================================================================
# Water Stress Risk Model
# =============================================================================
# Evaluates crop water stress using:
#   1. Water balance: precip_mm - eto_mm (primary signal)
#   2. Soil moisture: soil_moisture_0_10cm (secondary signal if available)
#
# Water balance interpretation:
#   > 5 mm/day (surplus)    → no stress
#   0 to 5 mm/day           → slight deficit (watch)
#   -5 to 0 mm/day          → moderate deficit
#   -15 to -5 mm/day        → significant stress
#   < -15 mm/day            → severe stress
#
# Soil moisture reference ranges (volumetric water content %):
#   > 30%   → saturated / waterlogged
#   20-30%  → field capacity (optimal)
#   15-20%  → adequate
#   10-15%  → stress onset
#   < 10%   → severe stress (near permanent wilting point)
#
# Configurable thresholds (model_config keys):
#   balance_watch:    default 0.0   mm (above = no stress)
#   balance_moderate: default -5.0  mm
#   balance_stress:   default -15.0 mm
#   soil_stress_min:  default 15.0  % (below = stress onset)
#   soil_severe_min:  default 10.0  % (below = severe stress)
#   soil_weight:      default 0.3   (blend weight for soil signal, 0=ignore)

from typing import Dict, Any, Optional
from .base_model import BaseRiskModel


class WaterStressRiskModel(BaseRiskModel):
    """Model for evaluating crop water stress from water balance and soil moisture."""

    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate water stress risk.

        Requires:
            - weather: must include precip_mm and eto_mm for water balance.
              Optionally soil_moisture_0_10cm for soil signal blend.

        Returns high probability when water deficit is significant.
        """
        weather_data = data_sources.get('weather')

        if not weather_data:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather data'},
                'confidence': 0.0
            }

        precip = weather_data.get('precip_mm')
        eto = weather_data.get('eto_mm')
        soil_moisture: Optional[float] = weather_data.get('soil_moisture_0_10cm')

        # Need at least one of: water balance or soil moisture
        if precip is None and eto is None and soil_moisture is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'condition': 'no_data',
                    'recommendation': 'Sin datos de precipitación, ETo ni humedad de suelo.'
                },
                'confidence': 0.0
            }

        balance_watch = self._get_config_value('balance_watch', 0.0)
        balance_moderate = self._get_config_value('balance_moderate', -5.0)
        balance_stress = self._get_config_value('balance_stress', -15.0)
        soil_stress_min = self._get_config_value('soil_stress_min', 15.0)
        soil_severe_min = self._get_config_value('soil_severe_min', 10.0)
        soil_weight = self._get_config_value('soil_weight', 0.3)

        confidence = 1.0
        factors = []

        # ── Water balance signal ───────────────────────────────────────────────
        balance_score: Optional[float] = None
        water_balance: Optional[float] = None

        if precip is not None and eto is not None:
            water_balance = precip - eto
            if water_balance > balance_watch:
                balance_score = 5.0
                factors.append(f'Balance hídrico {water_balance:+.1f} mm: sin déficit')
            elif water_balance > balance_moderate:
                balance_score = 35.0
                factors.append(f'Balance hídrico {water_balance:+.1f} mm: déficit leve')
            elif water_balance > balance_stress:
                balance_score = 68.0
                factors.append(f'Balance hídrico {water_balance:+.1f} mm: estrés hídrico')
            else:
                balance_score = 92.0
                factors.append(f'Balance hídrico {water_balance:+.1f} mm: estrés severo')
        else:
            confidence -= 0.4
            factors.append('Balance hídrico no disponible (falta precip o ETo)')

        # ── Soil moisture signal ───────────────────────────────────────────────
        soil_score: Optional[float] = None

        if soil_moisture is not None:
            if soil_moisture >= 20.0:
                soil_score = 5.0
                factors.append(f'Humedad suelo {soil_moisture:.1f}%: óptima')
            elif soil_moisture >= soil_stress_min:
                soil_score = 25.0
                factors.append(f'Humedad suelo {soil_moisture:.1f}%: adecuada')
            elif soil_moisture >= soil_severe_min:
                soil_score = 65.0
                factors.append(f'Humedad suelo {soil_moisture:.1f}%: inicio de estrés')
            else:
                soil_score = 90.0
                factors.append(f'Humedad suelo {soil_moisture:.1f}%: estrés severo')
        else:
            confidence -= 0.1

        # ── Blend signals ─────────────────────────────────────────────────────
        if balance_score is not None and soil_score is not None:
            probability = balance_score * (1 - soil_weight) + soil_score * soil_weight
        elif balance_score is not None:
            probability = balance_score
        elif soil_score is not None:
            probability = soil_score
        else:
            probability = 0.0
            confidence = 0.0

        # ── Recommendation ────────────────────────────────────────────────────
        if probability < 30:
            condition = 'no_stress'
            recommendation = 'Sin estrés hídrico. No se requiere riego adicional.'
        elif probability < 55:
            condition = 'mild_stress'
            recommendation = 'Estrés hídrico leve. Monitorizar y considerar riego preventivo.'
        elif probability < 75:
            condition = 'moderate_stress'
            recommendation = 'Estrés hídrico moderado. Programar riego en las próximas 24-48h.'
        else:
            condition = 'severe_stress'
            recommendation = 'Estrés hídrico severo. Riego urgente recomendado.'

        evaluation_data: Dict[str, Any] = {
            'condition': condition,
            'recommendation': recommendation,
            'factors': factors,
            'thresholds': {
                'balance_watch_mm': balance_watch,
                'balance_moderate_mm': balance_moderate,
                'balance_stress_mm': balance_stress,
                'soil_stress_min_pct': soil_stress_min,
                'soil_severe_min_pct': soil_severe_min,
            }
        }
        if water_balance is not None:
            evaluation_data['water_balance_mm'] = round(water_balance, 2)
            evaluation_data['precip_mm'] = precip
            evaluation_data['eto_mm'] = eto
        if soil_moisture is not None:
            evaluation_data['soil_moisture_0_10cm_pct'] = soil_moisture

        return {
            'probability_score': round(probability, 2),
            'evaluation_data': evaluation_data,
            'confidence': round(max(confidence, 0.0), 2)
        }
