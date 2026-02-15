"""
AgroStatusService - Fusion service for parcel agronomic status
Combines real sensor data with Open-Meteo fallback
"""

import logging
import json
import math
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple, List
from psycopg2.extras import RealDictCursor
import requests

logger = logging.getLogger(__name__)


class AgroStatusService:
    """Service to calculate agronomic status for parcels using data fusion"""
    
    def __init__(self, db_connection, tenant_id: str):
        """
        Initialize service
        
        Args:
            db_connection: PostgreSQL connection (with tenant context)
            tenant_id: Tenant ID for RLS
        """
        self.conn = db_connection
        self.tenant_id = tenant_id
        self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
    
    def calculate_centroid(self, location: Dict[str, Any]) -> Optional[Tuple[float, float]]:
        """
        Calculate centroid from GeoJSON Polygon
        
        Args:
            location: GeoJSON location (Polygon or Point) - can be NGSI-LD format or direct GeoJSON
            
        Returns:
            (longitude, latitude) or None if invalid
        """
        try:
            if not location:
                logger.warning("No location provided for centroid calculation")
                return None
            
            # Handle NGSI-LD format: {type: 'GeoProperty', value: {...}}
            if 'value' in location:
                geom = location['value']
            # Handle direct GeoJSON format: {type: 'Polygon', coordinates: [...]}
            elif 'type' in location and 'coordinates' in location:
                geom = location
            else:
                logger.warning(f"Invalid location format: {location}")
                return None
            
            # If Point, return coordinates directly
            if geom.get('type') == 'Point':
                coords = geom.get('coordinates', [])
                if len(coords) >= 2:
                    return (coords[0], coords[1])  # (lon, lat)
            
            # If Polygon, calculate centroid
            if geom.get('type') == 'Polygon':
                rings = geom.get('coordinates', [])
                if not rings or not rings[0]:
                    return None
                
                # Use first ring (exterior ring)
                ring = rings[0]
                
                # Simple centroid calculation (average of coordinates)
                # For more precision, use PostGIS ST_Centroid
                sum_lon = 0
                sum_lat = 0
                count = 0
                
                for coord in ring:
                    if len(coord) >= 2:
                        sum_lon += coord[0]
                        sum_lat += coord[1]
                        count += 1
                
                if count > 0:
                    return (sum_lon / count, sum_lat / count)
            
            # Try PostGIS if available
            try:
                # Use PostGIS ST_Centroid for more accurate calculation
                geom_json = json.dumps(geom)
                query = """
                    SELECT 
                        ST_X(ST_Centroid(ST_GeomFromGeoJSON(%s))) as lon,
                        ST_Y(ST_Centroid(ST_GeomFromGeoJSON(%s))) as lat
                """
                self.cursor.execute(query, (geom_json, geom_json))
                result = self.cursor.fetchone()
                if result:
                    return (result['lon'], result['lat'])
            except Exception as e:
                logger.warning(f"PostGIS centroid calculation failed, using simple method: {e}")
            
            return None
            
        except Exception as e:
            logger.error(f"Error calculating centroid: {e}")
            return None
    
    def get_parcel_sensors(self, parcel_id: str) -> List[Dict[str, Any]]:
        """
        Get sensors linked to parcel from parcel_sensors table
        
        Args:
            parcel_id: Parcel ID (Orion-LD URN or UUID)
            
        Returns:
            List of sensor info with sensor_id
        """
        try:
            # Query parcel_sensors table
            # Note: parcel_id might be URN, need to handle both
            # parcel_sensors references cadastral_parcels.id (UUID), not Orion-LD URN
            # We need to find the parcel by matching the Orion-LD ID
            # For now, try direct match, but ideally we'd have a mapping table
            query = """
                SELECT 
                    ps.sensor_id,
                    s.sensor_id as sensor_external_id,
                    s.sensor_type,
                    s.location,
                    ps.role,
                    ps.is_primary
                FROM parcel_sensors ps
                JOIN sensors s ON ps.sensor_id = s.id
                WHERE ps.parcel_id::text = %s 
                  AND ps.tenant_id = %s
                ORDER BY ps.is_primary DESC, ps.created_at DESC
            """
            
            self.cursor.execute(query, (parcel_id, self.tenant_id))
            results = self.cursor.fetchall()
            
            return [dict(row) for row in results]
            
        except Exception as e:
            logger.error(f"Error fetching parcel sensors: {e}")
            return []
    
    def get_latest_sensor_reading(self, sensor_id: str, max_age_minutes: int = 60) -> Optional[Dict[str, Any]]:
        """
        Get latest sensor reading from telemetry table
        
        Args:
            sensor_id: Sensor ID
            max_age_minutes: Maximum age of reading in minutes (default: 60)
            
        Returns:
            Latest reading dict with timestamp, temperature, humidity, moisture or None
        """
        try:
            cutoff_time = datetime.utcnow() - timedelta(minutes=max_age_minutes)
            
            # Query telemetry for latest readings
            # Note: telemetry uses device_id, need to map sensor_id to device_id
            # For now, assume sensor_id matches device_id or we need to join with sensors table
            query = """
                SELECT 
                    time as timestamp,
                    metric_name,
                    value,
                    unit
                FROM telemetry
                WHERE device_id = %s
                  AND tenant_id = %s
                  AND time >= %s
                ORDER BY time DESC
                LIMIT 100
            """
            
            self.cursor.execute(query, (sensor_id, self.tenant_id, cutoff_time))
            results = self.cursor.fetchall()
            
            if not results:
                return None
            
            # Aggregate metrics into single reading
            reading = {
                'timestamp': None,
                'temperature': None,
                'humidity': None,
                'moisture': None,
                'wind_speed': None,
            }
            
            for row in results:
                if not reading['timestamp']:
                    reading['timestamp'] = row['time']
                
                metric = row['metric_name']
                value = row['value']
                
                # Map common metric names
                if 'temp' in metric.lower() or 'temperature' in metric.lower():
                    reading['temperature'] = value
                elif 'humidity' in metric.lower() or 'rh' in metric.lower():
                    reading['humidity'] = value
                elif 'moisture' in metric.lower() or 'soil' in metric.lower():
                    reading['moisture'] = value
                elif 'wind' in metric.lower() or 'speed' in metric.lower():
                    reading['wind_speed'] = value
            
            # Check if reading is recent enough
            if reading['timestamp'] and reading['timestamp'] >= cutoff_time:
                return reading
            
            return None
            
        except Exception as e:
            logger.error(f"Error fetching sensor reading: {e}")
            return None
    
    def fetch_openmeteo_data(self, latitude: float, longitude: float) -> Optional[Dict[str, Any]]:
        """
        Fetch current weather data from Open-Meteo API
        
        Args:
            latitude: Latitude
            longitude: Longitude
            
        Returns:
            Weather data dict or None
        """
        try:
            url = "https://api.open-meteo.com/v1/forecast"
            params = {
                'latitude': latitude,
                'longitude': longitude,
                'current': [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'wind_speed_10m',
                    'wind_direction_10m',
                    'precipitation',
                    'weather_code'
                ],
                'hourly': [
                    'precipitation',
                    'et0_fao_evapotranspiration',
                    'soil_moisture_0_to_10cm'
                ],
                'daily': [
                    'precipitation_sum',
                    'et0_fao_evapotranspiration'
                ],
                'forecast_days': 3,  # For water balance calculation
                'timezone': 'auto'
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            current = data.get('current', {})
            hourly = data.get('hourly', {})
            daily = data.get('daily', {})
            
            # Extract current values
            result = {
                'temperature': current.get('temperature_2m'),
                'humidity': current.get('relative_humidity_2m'),
                'wind_speed': current.get('wind_speed_10m'),
                'wind_direction': current.get('wind_direction_10m'),
                'precipitation': current.get('precipitation', 0),
                'weather_code': current.get('weather_code'),
            }
            
            # Extract soil moisture (first hour if available)
            if hourly.get('soil_moisture_0_to_10cm'):
                times = hourly.get('time', [])
                if times:
                    # Get first available value
                    result['soil_moisture'] = hourly['soil_moisture_0_to_10cm'][0]
            
            # Calculate accumulated precipitation and ET0 for last 3 days
            if daily.get('precipitation_sum') and daily.get('et0_fao_evapotranspiration'):
                times = daily.get('time', [])
                precip_sums = daily.get('precipitation_sum', [])
                et0_sums = daily.get('et0_fao_evapotranspiration', [])
                
                # Sum last 3 days
                total_precip = sum(precip_sums[:3]) if len(precip_sums) >= 3 else sum(precip_sums)
                total_et0 = sum(et0_sums[:3]) if len(et0_sums) >= 3 else sum(et0_sums)
                
                result['precipitation_3d'] = total_precip
                result['et0_3d'] = total_et0
                result['water_balance'] = total_precip - total_et0
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching Open-Meteo data: {e}")
            return None
    
    def fuse_weather_data(
        self,
        parcel_id: str,
        parcel_location: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Fuse sensor and Open-Meteo data for parcel
        
        Args:
            parcel_id: Parcel ID
            parcel_location: Parcel location (GeoJSON)
            
        Returns:
            Fused weather data with source indicators
        """
        # Calculate centroid
        centroid = self.calculate_centroid(parcel_location)
        if not centroid:
            raise ValueError("Could not calculate parcel centroid")
        
        lon, lat = centroid
        
        # Initialize fused data
        fused = {
            'temperature': None,
            'humidity': None,
            'wind_speed': None,
            'soil_moisture': None,
            'precipitation_3d': None,
            'et0_3d': None,
            'water_balance': None,
            'sources': {},  # Track source for each metric
        }
        
        # Get parcel sensors
        sensors = self.get_parcel_sensors(parcel_id)
        
        # Try to get sensor data for each metric
        sensor_data_available = False
        
        for sensor in sensors:
            sensor_id = sensor.get('sensor_id') or sensor.get('sensor_external_id')
            if not sensor_id:
                continue
            
            reading = self.get_latest_sensor_reading(sensor_id)
            if not reading:
                continue
            
            sensor_data_available = True
            
            # Use sensor data if available
            if reading.get('temperature') is not None and fused['temperature'] is None:
                fused['temperature'] = reading['temperature']
                fused['sources']['temperature'] = 'SENSOR_REAL'
            
            if reading.get('humidity') is not None and fused['humidity'] is None:
                fused['humidity'] = reading['humidity']
                fused['sources']['humidity'] = 'SENSOR_REAL'
            
            if reading.get('wind_speed') is not None and fused['wind_speed'] is None:
                fused['wind_speed'] = reading['wind_speed']
                fused['sources']['wind_speed'] = 'SENSOR_REAL'
            
            if reading.get('moisture') is not None and fused['soil_moisture'] is None:
                fused['soil_moisture'] = reading['moisture']
                fused['sources']['soil_moisture'] = 'SENSOR_REAL'
        
        # Fetch Open-Meteo data as fallback
        openmeteo_data = self.fetch_openmeteo_data(lat, lon)
        
        if openmeteo_data:
            # Fill missing metrics with Open-Meteo
            if fused['temperature'] is None:
                fused['temperature'] = openmeteo_data.get('temperature')
                fused['sources']['temperature'] = 'OPEN-METEO'
            
            if fused['humidity'] is None:
                fused['humidity'] = openmeteo_data.get('humidity')
                fused['sources']['humidity'] = 'OPEN-METEO'
            
            if fused['wind_speed'] is None:
                fused['wind_speed'] = openmeteo_data.get('wind_speed')
                fused['sources']['wind_speed'] = 'OPEN-METEO'
            
            if fused['soil_moisture'] is None:
                fused['soil_moisture'] = openmeteo_data.get('soil_moisture')
                fused['sources']['soil_moisture'] = 'OPEN-METEO'
            
            # Water balance always from Open-Meteo (needs historical data)
            fused['precipitation_3d'] = openmeteo_data.get('precipitation_3d')
            fused['et0_3d'] = openmeteo_data.get('et0_3d')
            fused['water_balance'] = openmeteo_data.get('water_balance')
            fused['sources']['water_balance'] = 'OPEN-METEO'
        
        # Determine overall source confidence
        has_real_sensor = any(
            source == 'SENSOR_REAL' 
            for source in fused['sources'].values()
        )
        fused['source_confidence'] = 'SENSOR_REAL' if has_real_sensor else 'OPEN-METEO'
        
        return fused
    
    def calculate_delta_t(self, temperature: float, humidity: float) -> Optional[float]:
        """
        Calculate Delta T (wet-bulb depression)
        
        Args:
            temperature: Dry bulb temperature (°C)
            humidity: Relative humidity (%)
            
        Returns:
            Delta T in °C or None
        """
        try:
            if temperature is None or humidity is None:
                return None
            
            # Calculate dew point (Magnus formula)
            a = 17.27
            b = 237.7
            alpha = ((a * temperature) / (b + temperature)) + math.log(humidity / 100.0)
            dew_point = (b * alpha) / (a - alpha)
            
            # Approximate wet bulb temperature
            wet_bulb = temperature - (temperature - dew_point) * 0.4
            
            # Delta T = T_dry - T_wet
            delta_t = temperature - wet_bulb
            
            return round(delta_t, 2)
            
        except Exception as e:
            logger.error(f"Error calculating Delta T: {e}")
            return None
    
    def calculate_semaphores(self, fused_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate agronomic semaphores from fused data
        
        Args:
            fused_data: Fused weather data
            
        Returns:
            Semaphore status for spraying, workability, irrigation
        """
        semaphores = {
            'spraying': 'unknown',
            'workability': 'unknown',
            'irrigation': 'unknown',
        }
        
        # Spraying semaphore
        delta_t = self.calculate_delta_t(
            fused_data.get('temperature'),
            fused_data.get('humidity')
        )
        wind_speed_ms = fused_data.get('wind_speed', 0)
        wind_speed_kmh = wind_speed_ms * 3.6 if wind_speed_ms else 0
        precip_prob = fused_data.get('precipitation', 0)  # Simplified, could use probability
        
        if delta_t is not None and wind_speed_kmh is not None:
            # Green: Wind < 15km/h AND Delta T 2-8
            if wind_speed_kmh < 15 and 2 <= delta_t <= 8:
                semaphores['spraying'] = 'optimal'
            # Red: Wind > 20km/h OR Delta T > 10 OR Precip > 0.5mm
            elif wind_speed_kmh > 20 or delta_t > 10 or (precip_prob and precip_prob > 0.5):
                semaphores['spraying'] = 'not_suitable'
            # Yellow: Otherwise
            else:
                semaphores['spraying'] = 'caution'
        
        # Workability (Tempero) semaphore
        soil_moisture = fused_data.get('soil_moisture')
        if soil_moisture is not None:
            # Convert to percentage if needed (Open-Meteo returns 0-1, sensors might be %)
            if soil_moisture < 1.0:
                soil_moisture = soil_moisture * 100  # Convert to percentage
            
            # Green: 15-25%
            if 15 <= soil_moisture <= 25:
                semaphores['workability'] = 'optimal'
            # Red: > 25% (too wet)
            elif soil_moisture > 25:
                semaphores['workability'] = 'too_wet'
            # Yellow: < 10% (too dry)
            elif soil_moisture < 10:
                semaphores['workability'] = 'too_dry'
            else:
                semaphores['workability'] = 'caution'
        
        # Irrigation semaphore
        water_balance = fused_data.get('water_balance')
        if water_balance is not None:
            # Green: Balance > 0 (surplus)
            if water_balance > 0:
                semaphores['irrigation'] = 'satisfied'
            # Red: Balance < -5mm (deficit)
            elif water_balance < -5:
                semaphores['irrigation'] = 'deficit'
            # Yellow: Balance 0 to -5mm (alert)
            else:
                semaphores['irrigation'] = 'alert'
        
        return semaphores
    
    def get_parcel_agro_status(self, parcel_id: str, parcel_location: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get complete agronomic status for parcel
        
        Args:
            parcel_id: Parcel ID
            parcel_location: Parcel location (GeoJSON)
            
        Returns:
            Complete status with semaphores, metrics, and metadata
        """
        # Fuse data
        fused_data = self.fuse_weather_data(parcel_id, parcel_location)
        
        # Calculate semaphores
        semaphores = self.calculate_semaphores(fused_data)
        
        # Calculate Delta T
        delta_t = self.calculate_delta_t(
            fused_data.get('temperature'),
            fused_data.get('humidity')
        )
        
        return {
            'parcel_id': parcel_id,
            'semaphores': semaphores,
            'metrics': {
                'temperature': fused_data.get('temperature'),
                'humidity': fused_data.get('humidity'),
                'wind_speed': fused_data.get('wind_speed'),
                'soil_moisture': fused_data.get('soil_moisture'),
                'delta_t': delta_t,
                'water_balance': fused_data.get('water_balance'),
            },
            'source_confidence': fused_data.get('source_confidence', 'OPEN-METEO'),
            'sources': fused_data.get('sources', {}),
            'timestamp': datetime.utcnow().isoformat(),
        }

