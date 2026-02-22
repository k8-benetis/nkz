#!/usr/bin/env python3
# =============================================================================
# Orion Writer - Sync WeatherObserved entities to Orion-LD
# =============================================================================

import logging
import os
import sys
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
import requests

# Add common directory to path
sys.path.insert(0, '/app/common')

logger = logging.getLogger(__name__)

# Get Orion URL from environment
ORION_URL = os.getenv('ORION_URL', 'http://orion-ld-service:1026')
CONTEXT_URL = os.getenv('CONTEXT_URL', '')


def find_existing_weather_observed(
    tenant_id: str,
    latitude: float,
    longitude: float,
    radius_km: float = 4.0
) -> Optional[Dict[str, Any]]:
    """
    Find existing WeatherObserved entity within radius (spatial clustering).
    
    This implements the "Virtual Station" concept: if a WeatherObserved entity
    already exists within 4km, reuse it instead of creating a new one.
    
    Args:
        tenant_id: Tenant ID
        latitude: Latitude to search from
        longitude: Longitude to search from
        radius_km: Search radius in kilometers (default: 4km for clustering)
    
    Returns:
        WeatherObserved entity if found, None otherwise
    """
    try:
        # Build geo-query to find WeatherObserved entities near location
        query_params = {
            'type': 'WeatherObserved',
            'georel': 'near;maxDistance=={}'.format(int(radius_km * 1000)),  # Convert to meters
            'geometry': 'Point',
            'coordinates': f'[{longitude},{latitude}]',
            'options': 'count'
        }
        
        headers = {
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/',
            'Accept': 'application/ld+json'
        }
        
        url = f"{ORION_URL}/ngsi-ld/v1/entities"
        response = requests.get(url, params=query_params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            entities = response.json()
            if isinstance(entities, list) and len(entities) > 0:
                # Return the first (closest) entity
                logger.debug(f"Found existing WeatherObserved entity within {radius_km}km of ({latitude}, {longitude})")
                return entities[0]
            elif isinstance(entities, dict):
                # Single entity returned
                logger.debug(f"Found existing WeatherObserved entity within {radius_km}km")
                return entities
            else:
                logger.debug(f"No existing WeatherObserved entities within {radius_km}km")
                return None
        elif response.status_code == 404:
            logger.debug(f"No WeatherObserved entities found within {radius_km}km")
            return None
        else:
            logger.warning(f"Error querying for existing WeatherObserved: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.warning(f"Error finding existing WeatherObserved: {e}")
        return None


def get_parcels_by_location(
    tenant_id: str,
    latitude: float,
    longitude: float,
    radius_km: float = 10.0
) -> List[Dict[str, Any]]:
    """
    Query Orion-LD for AgriParcel entities near a location.
    
    Args:
        tenant_id: Tenant ID
        latitude: Latitude
        longitude: Longitude
        radius_km: Search radius in kilometers (default: 10km)
    
    Returns:
        List of parcel entities from Orion-LD
    """
    try:
        # Build query to find parcels near location
        # Using NGSI-LD geo-query with nearPoint
        query_params = {
            'type': 'AgriParcel',
            'georel': 'near;maxDistance=={}'.format(int(radius_km * 1000)),  # Convert to meters
            'geometry': 'Point',
            'coordinates': f'[{longitude},{latitude}]',
            'options': 'count'
        }
        
        headers = {
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/',
            'Accept': 'application/ld+json',
        }
        if CONTEXT_URL:
            headers['Link'] = f'<{CONTEXT_URL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'

        url = f"{ORION_URL}/ngsi-ld/v1/entities"
        response = requests.get(url, params=query_params, headers=headers, timeout=10)

        if response.status_code == 200:
            entities = response.json()
            if isinstance(entities, list):
                logger.info(f"Found {len(entities)} parcels near ({latitude}, {longitude}) for tenant {tenant_id}")
                return entities
            else:
                logger.warning(f"Unexpected response format from Orion-LD: {type(entities)}")
                return []
        elif response.status_code == 404:
            logger.debug(f"No parcels found near ({latitude}, {longitude}) for tenant {tenant_id}")
            return []
        else:
            logger.error(f"Error querying Orion-LD for parcels: {response.status_code} - {response.text}")
            return []
            
    except Exception as e:
        logger.error(f"Error querying parcels from Orion-LD: {e}", exc_info=True)
        return []


def create_weather_observed_entity(
    parcel_id: str,
    tenant_id: str,
    location: Tuple[float, float],
    weather_data: Dict[str, Any],
    observed_at: Optional[datetime] = None
) -> Optional[str]:
    """
    Create or update a WeatherObserved entity in Orion-LD for a parcel.
    
    Args:
        parcel_id: Parcel entity ID from Orion-LD
        tenant_id: Tenant ID
        location: Tuple of (longitude, latitude)
        weather_data: Weather data dict with keys like temp_avg, humidity_avg, etc.
        observed_at: Observation timestamp (defaults to now)
    
    Returns:
        Entity ID if successful, None otherwise
    """
    try:
        lon, lat = location
        
        # Use provided timestamp or current time
        if observed_at is None:
            observed_at = datetime.utcnow()
        
        # Generate entity ID following NGSI-LD format
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
                    '@value': observed_at.isoformat() + 'Z'
                }
            },
            'refParcel': {
                'type': 'Relationship',
                'object': parcel_id
            }
        }
        
        # Add weather properties (map from weather_observations table format)
        if weather_data.get('temp_avg') is not None:
            entity['temperature'] = {
                'type': 'Property',
                'value': float(weather_data['temp_avg']),
                'unitCode': 'CEL'
            }
        
        if weather_data.get('humidity_avg') is not None:
            entity['relativeHumidity'] = {
                'type': 'Property',
                'value': float(weather_data['humidity_avg']),
                'unitCode': 'P1'  # Percentage
            }
        
        if weather_data.get('wind_speed_ms') is not None:
            entity['windSpeed'] = {
                'type': 'Property',
                'value': float(weather_data['wind_speed_ms']),
                'unitCode': 'MTS'  # Meters per second
            }
        
        if weather_data.get('wind_direction_deg') is not None:
            entity['windDirection'] = {
                'type': 'Property',
                'value': float(weather_data['wind_direction_deg']),
                'unitCode': 'DD'  # Degrees
            }
        
        if weather_data.get('pressure_hpa') is not None:
            entity['atmosphericPressure'] = {
                'type': 'Property',
                'value': float(weather_data['pressure_hpa']),
                'unitCode': 'A97'  # Hectopascal
            }
        
        if weather_data.get('precip_mm') is not None:
            entity['precipitation'] = {
                'type': 'Property',
                'value': float(weather_data['precip_mm']),
                'unitCode': 'MMT'  # Millimeters
            }
        
        # Add source information
        source = weather_data.get('source', 'OPEN-METEO')
        entity['sourceConfidence'] = {
            'type': 'Property',
            'value': source
        }
        
        # Add agroclimatic metrics if available
        if weather_data.get('eto_mm') is not None:
            entity['et0'] = {
                'type': 'Property',
                'value': float(weather_data['eto_mm']),
                'unitCode': 'MMT'
            }
        
        if weather_data.get('delta_t') is not None:
            entity['deltaT'] = {
                'type': 'Property',
                'value': float(weather_data['delta_t']),
                'unitCode': 'CEL'
            }
        
        # Prepare headers — no Link header: context is embedded inline in the body
        # (application/ld+json + Link is not allowed by the NGSI-LD spec)
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/',
        }

        # Try to create entity
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        response = requests.post(orion_url, json=entity, headers=headers, timeout=10)
        
        if response.status_code in [201, 204]:
            logger.info(f"Created WeatherObserved entity {entity_id} for parcel {parcel_id}")
            return entity_id
        elif response.status_code == 409:
            # Entity already exists, update it
            logger.debug(f"WeatherObserved entity {entity_id} already exists, updating...")
            return update_weather_observed_entity(entity_id, tenant_id, weather_data, observed_at, headers)
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
    observed_at: Optional[datetime] = None,
    headers: Optional[Dict[str, str]] = None,
    add_parcel_ref: Optional[str] = None
) -> Optional[str]:
    """
    Update an existing WeatherObserved entity in Orion-LD.
    
    Args:
        entity_id: WeatherObserved entity ID
        tenant_id: Tenant ID
        weather_data: Weather data dict
        observed_at: Observation timestamp
        headers: Optional headers dict
    
    Returns:
        Entity ID if successful, None otherwise
    """
    try:
        if observed_at is None:
            observed_at = datetime.utcnow()
        
        # Build update payload — @context required for application/ld+json
        update_payload = {
            '@context': [CONTEXT_URL] if CONTEXT_URL else [],
            'dateObserved': {
                'type': 'Property',
                'value': {
                    '@type': 'DateTime',
                    '@value': observed_at.isoformat() + 'Z'
                }
            }
        }
        
        # Add weather properties
        if weather_data.get('temp_avg') is not None:
            update_payload['temperature'] = {
                'type': 'Property',
                'value': float(weather_data['temp_avg']),
                'unitCode': 'CEL'
            }
        
        if weather_data.get('humidity_avg') is not None:
            update_payload['relativeHumidity'] = {
                'type': 'Property',
                'value': float(weather_data['humidity_avg']),
                'unitCode': 'P1'
            }
        
        if weather_data.get('wind_speed_ms') is not None:
            update_payload['windSpeed'] = {
                'type': 'Property',
                'value': float(weather_data['wind_speed_ms']),
                'unitCode': 'MTS'
            }
        
        if weather_data.get('wind_direction_deg') is not None:
            update_payload['windDirection'] = {
                'type': 'Property',
                'value': float(weather_data['wind_direction_deg']),
                'unitCode': 'DD'
            }
        
        if weather_data.get('pressure_hpa') is not None:
            update_payload['atmosphericPressure'] = {
                'type': 'Property',
                'value': float(weather_data['pressure_hpa']),
                'unitCode': 'A97'
            }
        
        if weather_data.get('precip_mm') is not None:
            update_payload['precipitation'] = {
                'type': 'Property',
                'value': float(weather_data['precip_mm']),
                'unitCode': 'MMT'
            }
        
        source = weather_data.get('source', 'OPEN-METEO')
        update_payload['sourceConfidence'] = {
            'type': 'Property',
            'value': source
        }
        
        if weather_data.get('eto_mm') is not None:
            update_payload['et0'] = {
                'type': 'Property',
                'value': float(weather_data['eto_mm']),
                'unitCode': 'MMT'
            }
        
        if weather_data.get('delta_t') is not None:
            update_payload['deltaT'] = {
                'type': 'Property',
                'value': float(weather_data['delta_t']),
                'unitCode': 'CEL'
            }
        
        # If add_parcel_ref is provided, we should add it to refParcel
        # Note: NGSI-LD relationships can be arrays, but for simplicity we'll just update
        # In a more complex implementation, we'd check if the parcel is already in refParcel
        # and only add it if not present
        if add_parcel_ref:
            # For now, we'll just log it - in production you might want to merge refParcel arrays
            logger.debug(f"Would add parcel {add_parcel_ref} to refParcel of {entity_id} (not implemented)")
        
        # Prepare headers
        if headers is None:
            headers = {}
        
        headers['Content-Type'] = 'application/ld+json'
        headers['Fiware-Service'] = tenant_id
        headers['Fiware-ServicePath'] = '/'
        # no Link header: context is embedded in the entity body (ld+json spec)

        # Update entity
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
        response = requests.patch(orion_url, json=update_payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 204]:
            logger.debug(f"Updated WeatherObserved entity {entity_id}")
            return entity_id
        else:
            logger.error(f"Failed to update WeatherObserved entity: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"Error updating WeatherObserved entity: {e}", exc_info=True)
        return None


def sync_weather_to_orion(
    tenant_id: str,
    latitude: float,
    longitude: float,
    weather_data: Dict[str, Any],
    observed_at: Optional[datetime] = None,
    radius_km: float = 10.0
) -> int:
    """
    Sync weather data to Orion-LD for all parcels near a location.
    
    This function:
    1. Queries Orion-LD for parcels near the location
    2. Creates/updates WeatherObserved entities for each parcel
    
    Args:
        tenant_id: Tenant ID
        latitude: Latitude of weather observation
        longitude: Longitude of weather observation
        weather_data: Weather data dict (from weather_observations table format)
        observed_at: Observation timestamp
        radius_km: Search radius for parcels (default: 10km)
    
    Returns:
        Number of WeatherObserved entities synced
    """
    try:
        # Get parcels near this location
        parcels = get_parcels_by_location(tenant_id, latitude, longitude, radius_km)
        
        if not parcels:
            logger.debug(f"No parcels found near ({latitude}, {longitude}) for tenant {tenant_id}")
            return 0
        
        synced_count = 0
        
        for parcel in parcels:
            parcel_id = parcel.get('id')
            if not parcel_id:
                continue
            
            # Extract parcel location (centroid) for WeatherObserved
            parcel_location = None
            location_attr = parcel.get('location')
            if location_attr:
                location_value = location_attr.get('value') if isinstance(location_attr, dict) else location_attr
                if isinstance(location_value, dict):
                    geom_type = location_value.get('type')
                    if geom_type == 'Point':
                        coords = location_value.get('coordinates', [])
                        if len(coords) >= 2:
                            parcel_location = (coords[0], coords[1])  # (lon, lat)
                    elif geom_type in ['Polygon', 'MultiPolygon']:
                        # Try to calculate centroid using geo_utils if available
                        try:
                            # Import geo_utils for centroid calculation
                            from weather_worker.geo_utils import calculate_centroid
                            centroid = calculate_centroid(location_value)
                            if centroid:
                                parcel_location = centroid  # (lon, lat)
                                logger.debug(f"Calculated centroid for parcel {parcel_id}: {centroid}")
                            else:
                                # Fallback to weather location
                                parcel_location = (longitude, latitude)
                        except ImportError:
                            # geo_utils not available, use weather location as fallback
                            logger.debug(f"geo_utils not available, using weather location for parcel {parcel_id}")
                            parcel_location = (longitude, latitude)
                        except Exception as e:
                            logger.warning(f"Error calculating centroid: {e}, using weather location")
                            parcel_location = (longitude, latitude)
            
            # If no location found, use weather observation location
            if not parcel_location:
                parcel_location = (longitude, latitude)
            
            # Create/update WeatherObserved entity with spatial clustering enabled
            entity_id = create_weather_observed_entity(
                parcel_id=parcel_id,
                tenant_id=tenant_id,
                location=parcel_location,
                weather_data=weather_data,
                observed_at=observed_at,
            )
            
            if entity_id:
                synced_count += 1
        
        logger.info(f"Synced {synced_count}/{len(parcels)} WeatherObserved entities to Orion-LD for tenant {tenant_id}")
        return synced_count
        
    except Exception as e:
        logger.error(f"Error syncing weather to Orion-LD: {e}", exc_info=True)
        return 0




























