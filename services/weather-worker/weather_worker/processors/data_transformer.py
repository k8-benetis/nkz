"""
Data Transformer - Transform provider data to unified database format
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class DataTransformer:
    """Transform weather data to unified database format"""
    
    @staticmethod
    def transform_observation(
        observation: Dict[str, Any],
        tenant_id: str,
        municipality_code: str,
        source: str,
        data_type: str,
        station_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transform observation to database format
        
        Args:
            observation: Provider observation data
            tenant_id: Tenant ID
            municipality_code: Municipality INE code
            source: Data source ('OPEN-METEO', 'AEMET', 'SENSOR_REAL')
            data_type: Data type ('FORECAST', 'HISTORY')
            station_id: Optional station ID
        
        Returns:
            Transformed observation ready for database insertion
        """
        try:
            observed_at = observation.get('observed_at') or observation.get('time')
            if isinstance(observed_at, str):
                observed_at = datetime.fromisoformat(observed_at.replace('Z', '+00:00'))
            elif not isinstance(observed_at, datetime):
                logger.warning(f"Invalid observed_at format: {observed_at}")
                return None
            
            # Build metrics JSONB (keep original for compatibility)
            metrics = {
                'temperature': observation.get('temp_avg'),
                'humidity': observation.get('humidity_avg'),
                'precipitation': observation.get('precip_mm'),
                'wind_speed': observation.get('wind_speed_ms'),
                'wind_direction': observation.get('wind_direction_deg'),
                'pressure': observation.get('pressure_hpa'),
            }
            
            # Build metadata
            metadata = observation.get('metadata', {})
            metadata['source'] = source
            metadata['data_type'] = data_type
            
            return {
                'tenant_id': tenant_id,
                'observed_at': observed_at,
                'municipality_code': municipality_code,
                'station_id': station_id,
                'source': source,
                'data_type': data_type,
                'temp_avg': observation.get('temp_avg'),
                'temp_min': observation.get('temp_min'),
                'temp_max': observation.get('temp_max'),
                'humidity_avg': observation.get('humidity_avg'),
                'precip_mm': observation.get('precip_mm'),
                'solar_rad_w_m2': observation.get('solar_rad_w_m2') or observation.get('solar_rad_ghi_w_m2'),
                'solar_rad_ghi_w_m2': observation.get('solar_rad_ghi_w_m2'),
                'solar_rad_dni_w_m2': observation.get('solar_rad_dni_w_m2'),
                'eto_mm': observation.get('eto_mm'),
                'soil_moisture_0_10cm': observation.get('soil_moisture_0_10cm'),
                'soil_moisture_10_40cm': observation.get('soil_moisture_10_40cm'),
                'wind_speed_ms': observation.get('wind_speed_ms'),
                'wind_direction_deg': observation.get('wind_direction_deg'),
                'pressure_hpa': observation.get('pressure_hpa'),
                'gdd_accumulated': observation.get('gdd_accumulated'),
                'delta_t': observation.get('delta_t'),
                'metrics': metrics,
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"Error transforming observation: {e}")
            return None
    
    @staticmethod
    def transform_alert(
        alert: Dict[str, Any],
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Transform alert to database format
        
        Args:
            alert: Provider alert data
            tenant_id: Tenant ID
        
        Returns:
            Transformed alert ready for database insertion
        """
        try:
            return {
                'tenant_id': tenant_id,
                'municipality_code': alert.get('municipality_code'),
                'alert_type': alert.get('alert_type'),
                'alert_category': alert.get('alert_category'),
                'effective_from': alert.get('effective_from'),
                'effective_to': alert.get('effective_to'),
                'description': alert.get('description'),
                'aemet_alert_id': alert.get('aemet_alert_id'),
                'aemet_zone_id': alert.get('aemet_zone_id'),
                'metadata': alert.get('metadata', {})
            }
            
        except Exception as e:
            logger.error(f"Error transforming alert: {e}")
            return None

