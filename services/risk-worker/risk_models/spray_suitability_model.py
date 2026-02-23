#!/usr/bin/env python3
# =============================================================================
# Spray Suitability Risk Model
# =============================================================================
# Evaluates optimal spraying conditions based on Delta T.
#
# Delta T = dry bulb temperature - wet bulb temperature
# Optimal spraying conditions (Australian standard, widely adopted):
#   Delta T < 2°C  → not suitable (spray drift due to temperature inversion)
#   Delta T 2-8°C  → optimal
#   Delta T 8-10°C → caution (increased evaporation)
#   Delta T > 10°C → not suitable (excessive evaporation before target contact)

from typing import Dict, Any
from .base_model import BaseRiskModel


class SpraySuitabilityRiskModel(BaseRiskModel):
    """Model for evaluating spray suitability based on Delta T"""

    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate spray suitability risk.

        Requires:
            - weather: Weather data from weather_observations (must include delta_t)

        Returns high probability when conditions are UNSUITABLE for spraying.
        """
        weather_data = data_sources.get('weather')

        if not weather_data:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather data'},
                'confidence': 0.0
            }

        delta_t = weather_data.get('delta_t')

        # No delta_t recorded → skip evaluation (return 0 so it's not stored as a risk)
        if delta_t is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'delta_t': None,
                    'condition': 'no_data',
                    'recommendation': 'Sin datos de Delta T disponibles.'
                },
                'confidence': 0.0
            }

        optimal_min = self._get_config_value('optimal_min', 2)
        optimal_max = self._get_config_value('optimal_max', 8)
        caution_max = self._get_config_value('caution_max', 10)

        if optimal_min <= delta_t <= optimal_max:
            probability = 5.0
            condition = 'optimal'
            recommendation = (
                f'Delta T {delta_t:.1f}°C: condiciones óptimas para pulverizar.'
            )
        elif optimal_max < delta_t <= caution_max:
            probability = 50.0
            condition = 'caution'
            recommendation = (
                f'Delta T {delta_t:.1f}°C: precaución. Evaporación elevada. '
                'Aplicar en las horas más frescas del día.'
            )
        elif delta_t > caution_max:
            probability = 88.0
            condition = 'unsuitable_hot'
            recommendation = (
                f'Delta T {delta_t:.1f}°C: no apto para pulverizar. '
                'Evaporación excesiva antes de contacto con el objetivo.'
            )
        else:
            # delta_t < optimal_min (< 2°C)
            probability = 75.0
            condition = 'unsuitable_cold'
            recommendation = (
                f'Delta T {delta_t:.1f}°C: no apto para pulverizar. '
                'Riesgo de inversión térmica y deriva del producto.'
            )

        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'delta_t': delta_t,
                'condition': condition,
                'recommendation': recommendation,
                'thresholds': {
                    'optimal_min': optimal_min,
                    'optimal_max': optimal_max,
                    'caution_max': caution_max
                }
            },
            'confidence': 1.0
        }
