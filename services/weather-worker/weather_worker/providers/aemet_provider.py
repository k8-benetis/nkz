"""
AEMET Weather Provider - Secondary source for official weather alerts only
"""

import logging
import requests
import threading
import time
from typing import Dict, Any, List, Optional
from datetime import datetime
from .base_provider import BaseWeatherProvider

logger = logging.getLogger(__name__)


class AEMETProvider(BaseWeatherProvider):
    """
    AEMET OpenData provider - Refactored to only fetch official weather alerts
    Primary weather data should come from Open-Meteo
    """
    
    def __init__(
        self,
        api_key: str,
        api_url: str = "https://opendata.aemet.es/opendata/api",
        timeout: int = 15,
        cache_seconds: int = 1800
    ):
        if not api_key:
            raise ValueError("AEMET API key is required")
        
        super().__init__(api_key)
        self.api_url = api_url.rstrip('/')
        self.timeout = timeout
        self.cache_seconds = cache_seconds
        self.session = requests.Session()
        self._cache: Dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
    
    def get_weather_alerts(self, municipality_code: str) -> List[Dict[str, Any]]:
        """
        Get official weather alerts from AEMET for a municipality
        
        Args:
            municipality_code: INE municipality code
        
        Returns:
            List of weather alerts with type (YELLOW/ORANGE/RED) and category
        """
        try:
            # AEMET alerts endpoint
            endpoint = f"/avisos_cap/ultimoelaborado/area/{municipality_code[:2]}"  # Province code
            
            data = self._cached_request(endpoint, cache_seconds=3600)  # Cache for 1 hour
            
            if not data:
                return []
            
            alerts = []
            
            # Parse AEMET alerts format
            # AEMET returns alerts in a specific format - adapt based on actual API response
            if isinstance(data, list):
                for alert_data in data:
                    parsed = self._parse_alert(alert_data, municipality_code)
                    if parsed:
                        alerts.append(parsed)
            elif isinstance(data, dict):
                parsed = self._parse_alert(data, municipality_code)
                if parsed:
                    alerts.append(parsed)
            
            return alerts
            
        except Exception as e:
            logger.error(f"Error fetching AEMET alerts for municipality {municipality_code}: {e}")
            return []
    
    def _parse_alert(self, alert_data: Dict[str, Any], municipality_code: str) -> Optional[Dict[str, Any]]:
        """
        Parse AEMET alert data to unified format
        
        Args:
            alert_data: Raw alert data from AEMET
            municipality_code: Municipality INE code
        
        Returns:
            Normalized alert dictionary or None if invalid
        """
        try:
            # Map AEMET alert levels to our format
            # AEMET uses: 'Amarillo' (Yellow), 'Naranja' (Orange), 'Rojo' (Red)
            nivel = alert_data.get('nivel', '').upper()
            alert_type_map = {
                'AMARILLO': 'YELLOW',
                'NARANJA': 'ORANGE',
                'ROJO': 'RED',
                'YELLOW': 'YELLOW',
                'ORANGE': 'ORANGE',
                'RED': 'RED'
            }
            
            alert_type = alert_type_map.get(nivel)
            if not alert_type:
                logger.warning(f"Unknown AEMET alert level: {nivel}")
                return None
            
            # Map AEMET alert categories
            fenomeno = alert_data.get('fenomeno', '').upper()
            category_map = {
                'VIENTO': 'WIND',
                'LLUVIA': 'RAIN',
                'NIEVE': 'SNOW',
                'HELADA': 'FROST',
                'CALOR': 'HEAT',
                'FRIO': 'COLD',
                'TORMENTA': 'STORM',
                'NIEBLA': 'FOG'
            }
            
            alert_category = category_map.get(fenomeno, fenomeno)  # Use original if not mapped
            
            # Parse dates
            fecha_inicio = alert_data.get('fecha_inicio') or alert_data.get('inicio')
            fecha_fin = alert_data.get('fecha_fin') or alert_data.get('fin')
            
            try:
                effective_from = datetime.fromisoformat(fecha_inicio.replace('Z', '+00:00')) if fecha_inicio else datetime.now()
                effective_to = datetime.fromisoformat(fecha_fin.replace('Z', '+00:00')) if fecha_fin else datetime.now()
            except:
                effective_from = datetime.now()
                effective_to = datetime.now()
            
            return {
                'municipality_code': municipality_code,
                'alert_type': alert_type,
                'alert_category': alert_category,
                'effective_from': effective_from,
                'effective_to': effective_to,
                'description': alert_data.get('texto') or alert_data.get('descripcion') or '',
                'aemet_alert_id': alert_data.get('id') or alert_data.get('idAviso'),
                'aemet_zone_id': alert_data.get('zona') or alert_data.get('idZona'),
                'metadata': {
                    'fenomeno': alert_data.get('fenomeno'),
                    'nivel': alert_data.get('nivel'),
                    'raw_data': alert_data
                }
            }
            
        except Exception as e:
            logger.error(f"Error parsing AEMET alert: {e}")
            return None
    
    def get_historical_weather(
        self,
        latitude: float,
        longitude: float,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        NOT IMPLEMENTED - Use Open-Meteo for historical weather data
        
        This method is kept for interface compatibility but should not be used.
        AEMET is only used for official alerts.
        """
        logger.warning("AEMET provider should not be used for historical weather data. Use Open-Meteo instead.")
        return []
    
    def get_forecast(
        self,
        latitude: float,
        longitude: float,
        days: int = 14
    ) -> List[Dict[str, Any]]:
        """
        NOT IMPLEMENTED - Use Open-Meteo for forecast data
        
        This method is kept for interface compatibility but should not be used.
        AEMET is only used for official alerts.
        """
        logger.warning("AEMET provider should not be used for forecast data. Use Open-Meteo instead.")
        return []
    
    def _cached_request(self, endpoint: str, cache_seconds: Optional[int] = None) -> Any:
        """
        Make cached request to AEMET API
        
        Args:
            endpoint: API endpoint
            cache_seconds: Cache TTL in seconds
        
        Returns:
            Cached or fresh API response
        """
        cache_key = endpoint
        ttl = cache_seconds if cache_seconds is not None else self.cache_seconds
        
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached:
                expires_at, data = cached
                if time.time() < expires_at:
                    logger.debug(f"Returning cached data for {endpoint}")
                    return data
        
        data = self._request(endpoint)
        
        with self._lock:
            self._cache[cache_key] = (time.time() + ttl, data)
        
        return data
    
    def _request(self, endpoint: str) -> Any:
        """
        Make request to AEMET API
        
        Args:
            endpoint: API endpoint
        
        Returns:
            API response data
        """
        url = f"{self.api_url}{endpoint}"
        logger.debug(f"AEMET request: {url}")
        
        response = self.session.get(
            url,
            params={"api_key": self.api_key},
            timeout=self.timeout
        )
        response.raise_for_status()
        payload = response.json()
        
        estado = payload.get("estado")
        if estado and int(estado) != 200:
            logger.error(f"AEMET returned estado={estado} for {endpoint}")
            raise RuntimeError(f"AEMET error estado={estado}")
        
        datos_url = payload.get("datos")
        if not datos_url:
            raise RuntimeError(f"AEMET response missing datos URL for {endpoint}")
        
        datos_response = self.session.get(datos_url, timeout=self.timeout)
        datos_response.raise_for_status()
        content_type = datos_response.headers.get("Content-Type", "")
        
        if "application/json" in content_type or datos_response.text.strip().startswith("["):
            return datos_response.json()
        
        # Some endpoints return text/CSV; fallback to raw text
        return datos_response.text

