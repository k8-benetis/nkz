#!/usr/bin/env python3
# =============================================================================
# Frost Risk Model
# =============================================================================
# Evaluates frost risk based on minimum temperature.
#
# Risk scale:
#   temp_min > 2°C    → no risk
#   0 to 2°C          → low (watch zone — radiative frost possible)
#   -2 to 0°C         → medium (light frost, damage to sensitive crops)
#   -5 to -2°C        → high (moderate frost, damage to most crops)
#   < -5°C            → critical (severe frost, damage to all vegetation)
#
# Configurable thresholds (model_config keys):
#   watch_threshold:    default 2°C  (begin watching)
#   light_threshold:    default 0°C  (light frost)
#   moderate_threshold: default -2°C (moderate frost)
#   severe_threshold:   default -5°C (severe frost)

from typing import Dict, Any
from .base_model import BaseRiskModel


class FrostRiskModel(BaseRiskModel):
    """Model for evaluating frost risk based on minimum temperature."""

    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate frost risk.

        Requires:
            - weather: must include temp_min

        Returns high probability when temperature approaches or drops below 0°C.
        """
        weather_data = data_sources.get('weather')

        if not weather_data:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather data'},
                'confidence': 0.0
            }

        temp_min = weather_data.get('temp_min')

        if temp_min is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'temp_min': None,
                    'condition': 'no_data',
                    'recommendation': 'Sin datos de temperatura mínima disponibles.'
                },
                'confidence': 0.0
            }

        watch_thr = self._get_config_value('watch_threshold', 2.0)
        light_thr = self._get_config_value('light_threshold', 0.0)
        moderate_thr = self._get_config_value('moderate_threshold', -2.0)
        severe_thr = self._get_config_value('severe_threshold', -5.0)

        if temp_min > watch_thr:
            probability = 5.0
            condition = 'no_risk'
            recommendation = (
                f'Temperatura mínima {temp_min:.1f}°C: sin riesgo de helada.'
            )
        elif temp_min > light_thr:
            probability = 40.0
            condition = 'watch'
            recommendation = (
                f'Temperatura mínima {temp_min:.1f}°C: zona de vigilancia. '
                'Posible helada radiante en zonas bajas y despejadas.'
            )
        elif temp_min > moderate_thr:
            probability = 65.0
            condition = 'light_frost'
            recommendation = (
                f'Temperatura mínima {temp_min:.1f}°C: helada leve. '
                'Daños probables en cultivos sensibles (flores, brotes tiernos).'
            )
        elif temp_min > severe_thr:
            probability = 85.0
            condition = 'moderate_frost'
            recommendation = (
                f'Temperatura mínima {temp_min:.1f}°C: helada moderada. '
                'Daños a la mayoría de cultivos. Activar protección.'
            )
        else:
            probability = 98.0
            condition = 'severe_frost'
            recommendation = (
                f'Temperatura mínima {temp_min:.1f}°C: helada severa. '
                'Daños graves a toda la vegetación. Protección urgente.'
            )

        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'temp_min': temp_min,
                'condition': condition,
                'recommendation': recommendation,
                'thresholds': {
                    'watch_threshold': watch_thr,
                    'light_threshold': light_thr,
                    'moderate_threshold': moderate_thr,
                    'severe_threshold': severe_thr,
                }
            },
            'confidence': 1.0
        }
