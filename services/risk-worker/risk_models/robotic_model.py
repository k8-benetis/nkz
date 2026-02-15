#!/usr/bin/env python3
# =============================================================================
# Robotic Risk Model
# =============================================================================
# Evaluates robotic risks (battery, failures) based on telemetry data

from typing import Dict, Any
from .base_model import BaseRiskModel


class RoboticRiskModel(BaseRiskModel):
    """Model for evaluating robotic risks (battery, failures)"""
    
    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate robotic risk (e.g., Battery Critical)
        
        Requires:
            - telemetry: Telemetry data from telemetry table
        """
        telemetry_data = data_sources.get('telemetry')
        
        # Validate required data sources
        if not self._validate_data_sources(['telemetry'], data_sources):
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing telemetry data'},
                'confidence': 0.0
            }
        
        # Get model configuration
        battery_threshold = self._get_config_value('battery_threshold', 15.0)
        
        # Extract battery level from telemetry
        battery_level = None
        if isinstance(telemetry_data, list):
            # Find latest battery metric
            for metric in telemetry_data:
                if metric.get('metric_name') == 'batteryLevel' or metric.get('metric_name') == 'battery':
                    battery_level = metric.get('value')
                    break
        elif isinstance(telemetry_data, dict):
            battery_level = telemetry_data.get('batteryLevel') or telemetry_data.get('battery') or telemetry_data.get('value')
        
        if battery_level is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Battery level not found in telemetry'},
                'confidence': 0.0
            }
        
        # Calculate probability score
        # Lower battery = higher risk probability
        if battery_level <= battery_threshold:
            # Critical range: battery <= threshold
            # Probability increases as battery decreases
            if battery_level <= 5:
                probability = 95.0  # Critical
            elif battery_level <= 10:
                probability = 85.0  # High
            elif battery_level <= battery_threshold:
                # Linear interpolation between 10% and threshold
                probability = 60.0 + ((battery_threshold - battery_level) / (battery_threshold - 10)) * 25.0
            else:
                probability = 60.0
        else:
            # Below threshold but not critical
            # Probability decreases as battery increases
            if battery_level <= 20:
                probability = 50.0
            elif battery_level <= 30:
                probability = 30.0
            else:
                probability = 10.0
        
        # Ensure probability is between 0 and 100
        probability = max(0.0, min(100.0, probability))
        
        # Confidence is high if we have recent telemetry
        confidence = 1.0
        
        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'battery_level': battery_level,
                'battery_threshold': battery_threshold,
                'risk_reason': f'Battery at {battery_level:.1f}% (threshold: {battery_threshold}%)'
            },
            'confidence': round(confidence, 2)
        }

