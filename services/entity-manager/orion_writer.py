#!/usr/bin/env python3
# =============================================================================
# Orion Writer - Sync WeatherObserved entities to Orion-LD
# =============================================================================

import logging
import os
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import requests

logger = logging.getLogger(__name__)

# Get Orion URL from environment
ORION_URL = os.getenv('ORION_URL', 'http://orion-ld-service:1026')
CONTEXT_URL = os.getenv('CONTEXT_URL', 'https://nekazari.robotika.cloud/ngsi-ld-context.json')


def create_weather_observed_entity(
    parcel_id: str,
    tenant_id: str,
    location: Tuple[float, float],
    weather_data: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Create or update a WeatherObserved entity in Orion-LD for a parcel.
    
    Args:
        parcel_id: Parcel entity ID from Orion-LD
        tenant_id: Tenant ID
        location: Tuple of (longitude, latitude)
        weather_data: Weather data dict with keys like temperature, humidity, etc.
        headers: Optional headers dict (will be injected with FIWARE headers)
        
    Returns:
        Entity ID if successful, None otherwise
        
    Example:
        >>> weather_data = {
        ...     'temperature': 15.5,
        ...     'humidity': 65.0,
        ...     'wind_speed': 3.2,
        ...     'wind_direction': 180,
        ...     'pressure': 1013.25,
        ...     'precipitation': 0.0,
        ...     'source_confidence': 'SENSOR_REAL'
        ... }
        >>> entity_id = create_weather_observed_entity(
        ...     'urn:ngsi-ld:AgriParcel:tenant1:parcel1',
        ...     'tenant1',
        ...     (-1.6432, 42.8169),
        ...     weather_data
        ... )
    """
    try:
        lon, lat = location
        
        # Generate entity ID following NGSI-LD format
        # Extract parcel identifier from parcel_id
        parcel_identifier = parcel_id.split(':')[-1] if ':' in parcel_id else parcel_id
        entity_id = f"urn:ngsi-ld:WeatherObserved:{tenant_id}:parcel-{parcel_identifier}"
        
        # Build WeatherObserved entity
        entity = {
            '@context': [CONTEXT_URL],
            'id': entity_id,
            'type': 'WeatherObserved',
            'location': {
                'type': 'GeoProperty',
                'value': {
                    'type': 'Point',
                    'coordinates': [lon, lat]
                }
            },
            'dateObserved': {
                'type': 'Property',
                'value': {
                    '@type': 'DateTime',
                    '@value': datetime.utcnow().isoformat() + 'Z'
                }
            },
            'refParcel': {
                'type': 'Relationship',
                'object': parcel_id
            }
        }
        
        # Add weather properties
        if weather_data.get('temperature') is not None:
            entity['temperature'] = {
                'type': 'Property',
                'value': float(weather_data['temperature']),
                'unitCode': 'CEL'  # Celsius
            }
        
        if weather_data.get('humidity') is not None:
            entity['relativeHumidity'] = {
                'type': 'Property',
                'value': float(weather_data['humidity']),
                'unitCode': 'P1'  # Percentage
            }
        
        if weather_data.get('wind_speed') is not None:
            entity['windSpeed'] = {
                'type': 'Property',
                'value': float(weather_data['wind_speed']),
                'unitCode': 'MTS'  # Meters per second
            }
        
        if weather_data.get('wind_direction') is not None:
            entity['windDirection'] = {
                'type': 'Property',
                'value': float(weather_data['wind_direction']),
                'unitCode': 'DD'  # Degrees
            }
        
        if weather_data.get('pressure') is not None:
            entity['atmosphericPressure'] = {
                'type': 'Property',
                'value': float(weather_data['pressure']),
                'unitCode': 'A97'  # Hectopascal
            }
        
        if weather_data.get('precipitation') is not None:
            entity['precipitation'] = {
                'type': 'Property',
                'value': float(weather_data['precipitation']),
                'unitCode': 'MMT'  # Millimeters
            }
        
        # Add source confidence
        if weather_data.get('source_confidence'):
            entity['sourceConfidence'] = {
                'type': 'Property',
                'value': weather_data['source_confidence']
            }
        
        # Add sources breakdown if available
        if weather_data.get('sources'):
            entity['dataSources'] = {
                'type': 'Property',
                'value': weather_data['sources']
            }
        
        # Add agroclimatic metrics if available
        if weather_data.get('et0_today') is not None:
            entity['et0'] = {
                'type': 'Property',
                'value': float(weather_data['et0_today']),
                'unitCode': 'MMT'  # Millimeters
            }
        
        if weather_data.get('water_balance') is not None:
            entity['waterBalance'] = {
                'type': 'Property',
                'value': float(weather_data['water_balance']),
                'unitCode': 'MMT'  # Millimeters
            }
        
        # Prepare headers
        if headers is None:
            headers = {}
        
        headers['Content-Type'] = 'application/ld+json'
        
        # Inject FIWARE headers (if inject_fiware_headers is available)
        try:
            from common.auth_middleware import inject_fiware_headers
            headers = inject_fiware_headers(headers, tenant_id)
        except ImportError:
            # Fallback if common.auth_middleware not available
            headers['Fiware-Service'] = tenant_id
            headers['Fiware-ServicePath'] = '/'
        
        # Try to create entity
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        response = requests.post(orion_url, json=entity, headers=headers, timeout=10)
        
        if response.status_code in [201, 204]:
            logger.info(f"Created WeatherObserved entity {entity_id} for parcel {parcel_id}")
            return entity_id
        elif response.status_code == 409:
            # Entity already exists, update it
            logger.info(f"WeatherObserved entity {entity_id} already exists, updating...")
            return update_weather_observed_entity(entity_id, tenant_id, weather_data, headers)
        else:
            logger.error(f"Failed to create WeatherObserved entity: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"Error creating WeatherObserved entity: {e}", exc_info=True)
        return None


def update_weather_observed_entity(
    entity_id: str,
    tenant_id: str,
    weather_data: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Update an existing WeatherObserved entity in Orion-LD.
    
    Args:
        entity_id: WeatherObserved entity ID
        tenant_id: Tenant ID
        weather_data: Weather data dict
        headers: Optional headers dict
        
    Returns:
        Entity ID if successful, None otherwise
    """
    try:
        # Build update payload (only changed attributes)
        update_payload = {
            'dateObserved': {
                'type': 'Property',
                'value': {
                    '@type': 'DateTime',
                    '@value': datetime.utcnow().isoformat() + 'Z'
                }
            }
        }
        
        # Add weather properties
        if weather_data.get('temperature') is not None:
            update_payload['temperature'] = {
                'type': 'Property',
                'value': float(weather_data['temperature']),
                'unitCode': 'CEL'
            }
        
        if weather_data.get('humidity') is not None:
            update_payload['relativeHumidity'] = {
                'type': 'Property',
                'value': float(weather_data['humidity']),
                'unitCode': 'P1'
            }
        
        if weather_data.get('wind_speed') is not None:
            update_payload['windSpeed'] = {
                'type': 'Property',
                'value': float(weather_data['wind_speed']),
                'unitCode': 'MTS'
            }
        
        if weather_data.get('wind_direction') is not None:
            update_payload['windDirection'] = {
                'type': 'Property',
                'value': float(weather_data['wind_direction']),
                'unitCode': 'DD'
            }
        
        if weather_data.get('pressure') is not None:
            update_payload['atmosphericPressure'] = {
                'type': 'Property',
                'value': float(weather_data['pressure']),
                'unitCode': 'A97'
            }
        
        if weather_data.get('precipitation') is not None:
            update_payload['precipitation'] = {
                'type': 'Property',
                'value': float(weather_data['precipitation']),
                'unitCode': 'MMT'
            }
        
        if weather_data.get('source_confidence'):
            update_payload['sourceConfidence'] = {
                'type': 'Property',
                'value': weather_data['source_confidence']
            }
        
        if weather_data.get('sources'):
            update_payload['dataSources'] = {
                'type': 'Property',
                'value': weather_data['sources']
            }
        
        if weather_data.get('et0_today') is not None:
            update_payload['et0'] = {
                'type': 'Property',
                'value': float(weather_data['et0_today']),
                'unitCode': 'MMT'
            }
        
        if weather_data.get('water_balance') is not None:
            update_payload['waterBalance'] = {
                'type': 'Property',
                'value': float(weather_data['water_balance']),
                'unitCode': 'MMT'
            }
        
        # Prepare headers
        if headers is None:
            headers = {}
        
        headers['Content-Type'] = 'application/ld+json'
        
        # Inject FIWARE headers
        try:
            from common.auth_middleware import inject_fiware_headers
            headers = inject_fiware_headers(headers, tenant_id)
        except ImportError:
            headers['Fiware-Service'] = tenant_id
            headers['Fiware-ServicePath'] = '/'
        
        # Update entity
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
        response = requests.patch(orion_url, json=update_payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 204]:
            logger.info(f"Updated WeatherObserved entity {entity_id}")
            return entity_id
        else:
            logger.error(f"Failed to update WeatherObserved entity: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"Error updating WeatherObserved entity: {e}", exc_info=True)
        return None


def sync_parcel_weather_to_orion(
    parcel_id: str,
    tenant_id: str,
    location: Tuple[float, float],
    weather_data: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Sync weather data for a parcel to Orion-LD (create or update).
    
    This is a convenience function that calls create_weather_observed_entity,
    which handles both creation and updates.
    
    Args:
        parcel_id: Parcel entity ID
        tenant_id: Tenant ID
        location: Tuple of (longitude, latitude)
        weather_data: Weather data dict
        headers: Optional headers dict
        
    Returns:
        Entity ID if successful, None otherwise
    """
    return create_weather_observed_entity(parcel_id, tenant_id, location, weather_data, headers)




























