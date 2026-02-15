"""
Open-Meteo Weather Provider - Primary source for weather data
"""

import logging
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from .base_provider import BaseWeatherProvider

logger = logging.getLogger(__name__)


class OpenMeteoProvider(BaseWeatherProvider):
    """Open-Meteo weather data provider (primary source)"""
    
    def __init__(self, api_url: str = "https://api.open-meteo.com/v1", api_key: Optional[str] = None):
        super().__init__(api_key)
        self.api_url = api_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Nekazari-Weather-Worker/1.0'
        })
    
    def get_historical_weather(
        self,
        latitude: float,
        longitude: float,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get historical weather data from Open-Meteo
        
        Args:
            latitude: Latitude
            longitude: Longitude
            start_date: Start date (typically yesterday)
            end_date: End date (typically today)
        
        Returns:
            List of weather observations
        """
        try:
            url = f"{self.api_url}/forecast"
            params = {
                'latitude': latitude,
                'longitude': longitude,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'hourly': [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'precipitation',
                    'weather_code',
                    'wind_speed_10m',
                    'wind_direction_10m',
                    'surface_pressure',
                    'global_tilted_irradiance',  # Solar radiation (GHI)
                    'direct_normal_irradiance',  # DNI
                    'et0_fao_evapotranspiration'  # ET₀ for irrigation models
                ],
                'daily': [
                    'temperature_2m_max',
                    'temperature_2m_min',
                    'precipitation_sum',
                    'weather_code',
                    'et0_fao_evapotranspiration'
                ],
                'models': 'best_match',  # Use best available model
            }
            
            # For historical data, use historical API endpoint
            if start_date < datetime.now() - timedelta(days=1):
                url = f"{self.api_url}/forecast"
                # Open-Meteo historical data endpoint
                url = f"{self.api_url.replace('/v1', '/v1/forecast')}"
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            return self._parse_response(data, data_type='HISTORY')
            
        except Exception as e:
            logger.error(f"Error fetching Open-Meteo historical data: {e}")
            return []
    
    def get_forecast(
        self,
        latitude: float,
        longitude: float,
        days: int = 14
    ) -> List[Dict[str, Any]]:
        """
        Get weather forecast from Open-Meteo
        
        Args:
            latitude: Latitude
            longitude: Longitude
            days: Number of forecast days (max 16)
        
        Returns:
            List of forecast data points
        """
        try:
            url = f"{self.api_url}/forecast"
            params = {
                'latitude': latitude,
                'longitude': longitude,
                'forecast_days': min(days, 16),  # Open-Meteo max is 16 days
                'hourly': [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'precipitation',
                    'weather_code',
                    'wind_speed_10m',
                    'wind_direction_10m',
                    'surface_pressure',
                    'global_tilted_irradiance',  # Solar radiation (GHI)
                    'direct_normal_irradiance',  # DNI
                    'et0_fao_evapotranspiration'  # ET₀
                ],
                'daily': [
                    'temperature_2m_max',
                    'temperature_2m_min',
                    'precipitation_sum',
                    'weather_code',
                    'et0_fao_evapotranspiration'
                ],
                'models': 'best_match',
            }
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            return self._parse_response(data, data_type='FORECAST')
            
        except Exception as e:
            logger.error(f"Error fetching Open-Meteo forecast: {e}")
            return []
    
    def _parse_response(self, data: Dict[str, Any], data_type: str) -> List[Dict[str, Any]]:
        """
        Parse Open-Meteo API response to unified format
        
        Args:
            data: Raw API response
            data_type: 'HISTORY' or 'FORECAST'
        
        Returns:
            List of normalized weather observations
        """
        observations = []
        
        try:
            hourly = data.get('hourly', {})
            daily = data.get('daily', {})
            
            times = hourly.get('time', [])
            if not times:
                # Try daily data if hourly not available
                times = daily.get('time', [])
                is_daily = True
            else:
                is_daily = False
            
            for i, time_str in enumerate(times):
                try:
                    observed_at = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    
                    if is_daily:
                        # Daily data
                        obs = {
                            'time': observed_at,
                            'temperature_2m': daily.get('temperature_2m_max', [None])[i],
                            'temperature_2m_min': daily.get('temperature_2m_min', [None])[i],
                            'temperature_2m_max': daily.get('temperature_2m_max', [None])[i],
                            'relative_humidity_2m': None,  # Not available in daily
                            'precipitation': daily.get('precipitation_sum', [None])[i],
                            'wind_speed_10m': None,
                            'wind_direction_10m': None,
                            'surface_pressure': None,
                            'global_horizontal_irradiance': None,
                            'direct_normal_irradiance': None,
                            'et0_fao_evapotranspiration': daily.get('et0_fao_evapotranspiration', [None])[i],
                        }
                    else:
                        # Hourly data
                        obs = {
                            'time': observed_at,
                            'temperature_2m': hourly.get('temperature_2m', [None])[i],
                            'temperature_2m_min': None,
                            'temperature_2m_max': None,
                            'relative_humidity_2m': hourly.get('relative_humidity_2m', [None])[i],
                            'precipitation': hourly.get('precipitation', [None])[i],
                            'wind_speed_10m': hourly.get('wind_speed_10m', [None])[i],
                            'wind_direction_10m': hourly.get('wind_direction_10m', [None])[i],
                            'surface_pressure': hourly.get('surface_pressure', [None])[i],
                            'global_horizontal_irradiance': hourly.get('global_tilted_irradiance', [None])[i],
                            'direct_normal_irradiance': hourly.get('direct_normal_irradiance', [None])[i],
                            'et0_fao_evapotranspiration': hourly.get('et0_fao_evapotranspiration', [None])[i],
                        }
                    
                    # Normalize to unified format
                    normalized = self.normalize_data(obs)
                    normalized['source'] = 'OPEN-METEO'
                    normalized['data_type'] = data_type
                    
                    observations.append(normalized)
                    
                except Exception as e:
                    logger.warning(f"Error parsing observation at index {i}: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"Error parsing Open-Meteo response: {e}")
        
        return observations

