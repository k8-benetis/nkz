"""
Base Weather Provider - Abstract class for weather data providers
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta


class BaseWeatherProvider(ABC):
    """Abstract base class for weather data providers"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
    
    @abstractmethod
    def get_historical_weather(
        self,
        latitude: float,
        longitude: float,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get historical weather data
        
        Args:
            latitude: Latitude
            longitude: Longitude
            start_date: Start date for historical data
            end_date: End date for historical data
        
        Returns:
            List of weather observations
        """
        pass
    
    @abstractmethod
    def get_forecast(
        self,
        latitude: float,
        longitude: float,
        days: int = 14
    ) -> List[Dict[str, Any]]:
        """
        Get weather forecast
        
        Args:
            latitude: Latitude
            longitude: Longitude
            days: Number of forecast days
        
        Returns:
            List of forecast data points
        """
        pass
    
    def normalize_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize provider-specific data to unified format
        
        Args:
            raw_data: Raw data from provider
        
        Returns:
            Normalized data dictionary
        """
        return {
            'observed_at': raw_data.get('time'),
            'temp_avg': raw_data.get('temperature_2m'),
            'temp_min': raw_data.get('temperature_2m_min'),
            'temp_max': raw_data.get('temperature_2m_max'),
            'humidity_avg': raw_data.get('relative_humidity_2m'),
            'precip_mm': raw_data.get('precipitation'),
            'solar_rad_w_m2': raw_data.get('solar_radiation'),
            'solar_rad_ghi_w_m2': raw_data.get('global_horizontal_irradiance'),
            'solar_rad_dni_w_m2': raw_data.get('direct_normal_irradiance'),
            'eto_mm': raw_data.get('et0_fao_evapotranspiration'),
            'soil_moisture_0_10cm': raw_data.get('soil_moisture_0_10cm'),
            'soil_moisture_10_40cm': raw_data.get('soil_moisture_10_40cm'),
            'wind_speed_ms': raw_data.get('wind_speed_10m'),
            'wind_direction_deg': raw_data.get('wind_direction_10m'),
            'pressure_hpa': raw_data.get('surface_pressure'),
        }

