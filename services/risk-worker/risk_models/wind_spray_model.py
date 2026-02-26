#!/usr/bin/env python3
# =============================================================================
# Wind Spray Risk Model
# =============================================================================
# Evaluates whether wind conditions are suitable for applying phytosanitary
# products (herbicides, fungicides, insecticides).
#
# Reference: AEPLA (Asociación Empresarial para la Protección de las Plantas)
# and EU Directive 2009/128/EC on Sustainable Use of Pesticides.
#
# Wind thresholds (ground-based application):
#   < 3 m/s  (~11 km/h)  → suitable
#   3-5 m/s  (11-18 km/h) → caution (spray drift risk)
#   > 5 m/s  (> 18 km/h) → not suitable (excessive drift, EU Directive limit)
#
# Configurable thresholds (model_config keys):
#   suitable_max:  default 3.0  m/s
#   caution_max:   default 5.0  m/s

from typing import Dict, Any
from .base_model import BaseRiskModel


class WindSprayRiskModel(BaseRiskModel):
    """Model for evaluating wind conditions for phytosanitary applications."""

    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate wind spray risk.

        Requires:
            - weather: must include wind_speed_ms

        Returns high probability when wind conditions are unsuitable for spraying.
        """
        weather_data = data_sources.get('weather')

        if not weather_data:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather data'},
                'confidence': 0.0
            }

        wind_speed = weather_data.get('wind_speed_ms')

        if wind_speed is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'wind_speed_ms': None,
                    'condition': 'no_data',
                    'recommendation': 'Sin datos de velocidad del viento disponibles.'
                },
                'confidence': 0.0
            }

        suitable_max = self._get_config_value('suitable_max', 3.0)
        caution_max = self._get_config_value('caution_max', 5.0)

        wind_kmh = round(wind_speed * 3.6, 1)

        if wind_speed <= suitable_max:
            probability = 5.0
            condition = 'suitable'
            recommendation = (
                f'Viento {wind_speed:.1f} m/s ({wind_kmh} km/h): '
                'condiciones adecuadas para pulverización.'
            )
        elif wind_speed <= caution_max:
            probability = 60.0
            condition = 'caution'
            recommendation = (
                f'Viento {wind_speed:.1f} m/s ({wind_kmh} km/h): '
                'precaución. Riesgo de deriva. Utilizar boquillas antideriva '
                'y reducir presión de trabajo.'
            )
        else:
            probability = 90.0
            condition = 'unsuitable'
            recommendation = (
                f'Viento {wind_speed:.1f} m/s ({wind_kmh} km/h): '
                'no apto para pulverización. '
                'Supera el límite EU Directiva 2009/128/CE (18 km/h). '
                'Esperar condiciones más calmadas.'
            )

        # Add wind direction context if available
        wind_dir = weather_data.get('wind_direction_deg')
        evaluation_data: Dict[str, Any] = {
            'wind_speed_ms': wind_speed,
            'wind_speed_kmh': wind_kmh,
            'condition': condition,
            'recommendation': recommendation,
            'thresholds': {
                'suitable_max_ms': suitable_max,
                'caution_max_ms': caution_max,
            }
        }
        if wind_dir is not None:
            evaluation_data['wind_direction_deg'] = wind_dir

        return {
            'probability_score': round(probability, 2),
            'evaluation_data': evaluation_data,
            'confidence': 1.0
        }
