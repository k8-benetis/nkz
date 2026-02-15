#!/usr/bin/env python3
# =============================================================================
# Agronomic Risk Model
# =============================================================================
# Evaluates agronomic risks (pests, diseases) based on weather and NDVI data

from typing import Dict, Any
from .base_model import BaseRiskModel


class AgronomicRiskModel(BaseRiskModel):
    """Model for evaluating agronomic risks (pests, diseases)"""
    
    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate agronomic risk (e.g., Mildiu)
        
        Requires:
            - weather: Weather data from weather_observations
            - ndvi: NDVI data from ndvi_results or ndvi_rasters
        """
        weather_data = data_sources.get('weather')
        ndvi_data = data_sources.get('ndvi')
        
        # Validate required data sources
        if not self._validate_data_sources(['weather'], data_sources):
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing weather data'},
                'confidence': 0.0
            }
        
        # Get model configuration
        humidity_threshold = self._get_config_value('humidity_threshold', 80.0)
        temp_min = self._get_config_value('temp_range', [10, 25])[0]
        temp_max = self._get_config_value('temp_range', [10, 25])[1]
        ndvi_threshold = self._get_config_value('ndvi_threshold', 0.5)
        
        # Extract weather values
        humidity = weather_data.get('humidity_avg') or weather_data.get('humidity')
        temp_avg = weather_data.get('temp_avg') or weather_data.get('temperature')
        precip = weather_data.get('precip_mm') or weather_data.get('precipitation', 0)
        
        # Extract NDVI if available
        ndvi_value = None
        if ndvi_data:
            ndvi_value = ndvi_data.get('ndvi_mean') or ndvi_data.get('mean') or ndvi_data.get('value')
        
        # Calculate probability score
        probability = 0.0
        factors = []
        
        # Factor 1: Humidity (most important for Mildiu)
        if humidity and humidity >= humidity_threshold:
            humidity_factor = min(100, ((humidity - humidity_threshold) / (100 - humidity_threshold)) * 100)
            probability += humidity_factor * 0.5  # 50% weight
            factors.append(f"humidity_high: {humidity:.1f}%")
        elif humidity:
            factors.append(f"humidity_ok: {humidity:.1f}%")
        
        # Factor 2: Temperature range (optimal for fungal growth)
        if temp_avg:
            if temp_min <= temp_avg <= temp_max:
                temp_factor = 100  # Optimal temperature
                probability += temp_factor * 0.3  # 30% weight
                factors.append(f"temp_optimal: {temp_avg:.1f}°C")
            elif temp_avg < temp_min:
                temp_factor = max(0, 100 - ((temp_min - temp_avg) / temp_min) * 100)
                probability += temp_factor * 0.3
                factors.append(f"temp_low: {temp_avg:.1f}°C")
            else:
                temp_factor = max(0, 100 - ((temp_avg - temp_max) / temp_max) * 100)
                probability += temp_factor * 0.3
                factors.append(f"temp_high: {temp_avg:.1f}°C")
        
        # Factor 3: Precipitation (increases risk)
        if precip > 0:
            precip_factor = min(100, (precip / 10) * 100)  # 10mm = 100% factor
            probability += precip_factor * 0.1  # 10% weight
            factors.append(f"precipitation: {precip:.1f}mm")
        
        # Factor 4: NDVI (vegetation health - lower NDVI = more susceptible)
        if ndvi_value is not None:
            if ndvi_value < ndvi_threshold:
                ndvi_factor = ((ndvi_threshold - ndvi_value) / ndvi_threshold) * 100
                probability += ndvi_factor * 0.1  # 10% weight
                factors.append(f"ndvi_low: {ndvi_value:.2f}")
            else:
                factors.append(f"ndvi_ok: {ndvi_value:.2f}")
        
        # Ensure probability is between 0 and 100
        probability = max(0.0, min(100.0, probability))
        
        # Calculate confidence based on data completeness
        confidence = 1.0
        if not temp_avg:
            confidence -= 0.3
        if not humidity:
            confidence -= 0.3
        if ndvi_value is None:
            confidence -= 0.1
        confidence = max(0.0, confidence)
        
        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'humidity': humidity,
                'temperature': temp_avg,
                'precipitation': precip,
                'ndvi': ndvi_value,
                'factors': factors,
                'model_config': {
                    'humidity_threshold': humidity_threshold,
                    'temp_range': [temp_min, temp_max],
                    'ndvi_threshold': ndvi_threshold
                }
            },
            'confidence': round(confidence, 2)
        }

