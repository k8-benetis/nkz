#!/usr/bin/env python3
# =============================================================================
# Energy Risk Model
# =============================================================================
# Evaluates energy risks (solar efficiency) based on weather and telemetry

from typing import Dict, Any
from .base_model import BaseRiskModel


class EnergyRiskModel(BaseRiskModel):
    """Model for evaluating energy risks (solar efficiency)"""
    
    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate energy risk (e.g., Low Solar Efficiency)
        
        Requires:
            - weather: Weather data (solar radiation)
            - telemetry: Telemetry data (energy production)
        """
        weather_data = data_sources.get('weather')
        telemetry_data = data_sources.get('telemetry')
        
        # Validate required data sources
        if not self._validate_data_sources(['weather', 'telemetry'], data_sources):
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather or telemetry data'},
                'confidence': 0.0
            }
        
        # Get model configuration
        efficiency_threshold = self._get_config_value('efficiency_threshold', 0.7)
        min_radiation = self._get_config_value('min_radiation_w_m2', 200.0)
        
        # Extract solar radiation from weather
        solar_rad = weather_data.get('solar_rad_w_m2') or weather_data.get('solar_rad_ghi_w_m2') or weather_data.get('radiation')
        
        # Extract energy production from telemetry
        energy_production = None
        if isinstance(telemetry_data, list):
            # Find latest energy production metric
            for metric in telemetry_data:
                if metric.get('metric_name') in ['energyProduction', 'powerOutput', 'kwh']:
                    energy_production = metric.get('value')
                    break
        elif isinstance(telemetry_data, dict):
            energy_production = telemetry_data.get('energyProduction') or telemetry_data.get('powerOutput') or telemetry_data.get('kwh') or telemetry_data.get('value')
        
        if solar_rad is None or energy_production is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing solar radiation or energy production data'},
                'confidence': 0.0
            }
        
        # Only evaluate if there's sufficient radiation
        if solar_rad < min_radiation:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'solar_radiation': solar_rad,
                    'min_radiation': min_radiation,
                    'reason': 'Insufficient solar radiation for evaluation'
                },
                'confidence': 0.0
            }
        
        # Calculate expected efficiency
        # Simplified model: Expected production = solar_rad * panel_area * efficiency_factor
        # For now, we'll use a normalized approach: actual / expected
        # Assuming standard panel efficiency of ~20% and 1m² panel area
        # Expected production (kWh) ≈ solar_rad (W/m²) * 0.0002 * hours
        # For hourly evaluation: Expected ≈ solar_rad * 0.0002
        
        # Normalize: actual production should be proportional to radiation
        # If we have historical data, we could calculate expected more accurately
        # For now, use a simple ratio: actual / (solar_rad * expected_factor)
        
        # Expected production factor (kWh per W/m² per hour)
        # This is a simplified model - in production, use actual panel specs
        expected_factor = 0.0002  # Simplified: 0.2 kWh per 1000 W/m² per hour
        
        expected_production = solar_rad * expected_factor
        actual_efficiency = energy_production / expected_production if expected_production > 0 else 0
        
        # Calculate probability score
        # Lower efficiency = higher risk probability
        if actual_efficiency < efficiency_threshold:
            # Efficiency below threshold
            # Probability increases as efficiency decreases
            efficiency_deficit = efficiency_threshold - actual_efficiency
            max_deficit = efficiency_threshold  # Maximum possible deficit
            
            probability = min(100.0, (efficiency_deficit / max_deficit) * 100)
            
            # Adjust based on severity
            if actual_efficiency < 0.5:
                probability = min(100.0, probability + 20)  # Critical
            elif actual_efficiency < 0.6:
                probability = min(100.0, probability + 10)  # High
        else:
            # Efficiency is acceptable
            probability = max(0.0, ((efficiency_threshold - actual_efficiency) / efficiency_threshold) * 50)
        
        # Ensure probability is between 0 and 100
        probability = max(0.0, min(100.0, probability))
        
        # Confidence based on data quality
        confidence = 1.0
        if solar_rad < min_radiation * 1.5:  # Low radiation = less reliable
            confidence -= 0.2
        
        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'solar_radiation_w_m2': solar_rad,
                'energy_production_kwh': energy_production,
                'expected_production_kwh': expected_production,
                'actual_efficiency': round(actual_efficiency, 3),
                'efficiency_threshold': efficiency_threshold,
                'efficiency_deficit': round(efficiency_threshold - actual_efficiency, 3),
                'risk_reason': f'Efficiency {actual_efficiency:.1%} below threshold {efficiency_threshold:.1%}'
            },
            'confidence': round(confidence, 2)
        }

