#!/usr/bin/env python3
# =============================================================================
# Geo Utils - Geographic utilities for parcel operations
# =============================================================================

import logging
from typing import Dict, Any, Optional, Tuple
from shapely.geometry import shape, Point
from shapely.errors import GEOSException

logger = logging.getLogger(__name__)


def calculate_centroid(geometry: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """
    Calculate the centroid (center point) of a GeoJSON geometry.
    
    Args:
        geometry: GeoJSON geometry object (Polygon, MultiPolygon, Point, etc.)
        
    Returns:
        Tuple of (longitude, latitude) or None if calculation fails
        
    Example:
        >>> geometry = {
        ...     "type": "Polygon",
        ...     "coordinates": [[[lon1, lat1], [lon2, lat2], ...]]
        ... }
        >>> centroid = calculate_centroid(geometry)
        >>> lon, lat = centroid
    """
    if not geometry:
        logger.warning("Empty geometry provided to calculate_centroid")
        return None
    
    try:
        # Convert GeoJSON to Shapely geometry
        shapely_geom = shape(geometry)
        
        # Calculate centroid
        centroid = shapely_geom.centroid
        
        # Return as (longitude, latitude) tuple
        return (centroid.x, centroid.y)
        
    except (GEOSException, ValueError, KeyError, TypeError) as e:
        logger.error(f"Error calculating centroid: {e}", exc_info=True)
        return None


def get_parcel_location(parcel_entity: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """
    Extract location from an AgriParcel entity from Orion-LD.
    
    Handles different location formats:
    - location.value (GeoJSON Polygon/MultiPolygon/Point) - PRIMARY FORMAT
    - location (direct GeoJSON)
    - location.coordinates (Point coordinates)
    
    Args:
        parcel_entity: AgriParcel entity from Orion-LD
        
    Returns:
        Tuple of (longitude, latitude) or None if not found
    """
    if not parcel_entity:
        logger.warning("Empty parcel_entity provided to get_parcel_location")
        return None
    
    parcel_id = parcel_entity.get('id', 'unknown')
    
    # Try location.value (NGSI-LD format) - PRIMARY FORMAT for drawn parcels
    location_attr = parcel_entity.get('location')
    if location_attr:
        if isinstance(location_attr, dict):
            # NGSI-LD format: location.value contains the GeoJSON
            location_value = location_attr.get('value')
            if location_value:
                if isinstance(location_value, dict):
                    # It's a GeoJSON object (Polygon, MultiPolygon, Point, etc.)
                    geom_type = location_value.get('type', '')
                    if geom_type in ['Polygon', 'MultiPolygon']:
                        # Calculate centroid from polygon geometry
                        centroid = calculate_centroid(location_value)
                        if centroid:
                            logger.info(f"Extracted centroid from {geom_type} for parcel {parcel_id}: {centroid}")
                            return centroid
                    elif geom_type == 'Point':
                        # Direct point coordinates
                        coords = location_value.get('coordinates', [])
                        if len(coords) >= 2:
                            logger.info(f"Extracted Point coordinates for parcel {parcel_id}: ({coords[0]}, {coords[1]})")
                            return tuple(coords[:2])
                    else:
                        logger.warning(f"Unsupported geometry type {geom_type} for parcel {parcel_id}")
                elif isinstance(location_value, list) and len(location_value) >= 2:
                    # It's a [lon, lat] array (Point format)
                    logger.info(f"Extracted Point array for parcel {parcel_id}: {location_value[:2]}")
                    return tuple(location_value[:2])
        
        # Direct GeoJSON format (if location itself is the geometry)
        if isinstance(location_attr, dict) and location_attr.get('type'):
            geom_type = location_attr.get('type', '')
            if geom_type in ['Polygon', 'MultiPolygon']:
                centroid = calculate_centroid(location_attr)
                if centroid:
                    logger.info(f"Extracted centroid from direct {geom_type} for parcel {parcel_id}: {centroid}")
                    return centroid
            elif geom_type == 'Point':
                coords = location_attr.get('coordinates', [])
                if len(coords) >= 2:
                    logger.info(f"Extracted Point from direct geometry for parcel {parcel_id}: ({coords[0]}, {coords[1]})")
                    return tuple(coords[:2])
    
    # Try location.coordinates (Point format) - legacy format
    if isinstance(location_attr, dict):
        coordinates = location_attr.get('coordinates')
        if coordinates and isinstance(coordinates, list) and len(coordinates) >= 2:
            # Check if it's a Point [lon, lat] or Polygon coordinates
            if isinstance(coordinates[0], (int, float)):
                # Point: [lon, lat]
                logger.info(f"Extracted Point coordinates (legacy) for parcel {parcel_id}: {coordinates[:2]}")
                return tuple(coordinates[:2])
            elif isinstance(coordinates[0], list):
                # Polygon: [[[lon, lat], ...]]
                # Try to extract first point or calculate centroid
                try:
                    polygon_geom = {
                        'type': 'Polygon',
                        'coordinates': coordinates
                    }
                    centroid = calculate_centroid(polygon_geom)
                    if centroid:
                        logger.info(f"Extracted centroid from Polygon coordinates (legacy) for parcel {parcel_id}: {centroid}")
                        return centroid
                except Exception as e:
                    logger.warning(f"Error calculating centroid from legacy coordinates: {e}")
    
    # Log detailed structure for debugging
    logger.warning(f"Could not extract location from parcel entity {parcel_id}. Location structure: {location_attr}")
    logger.debug(f"Full parcel entity keys: {list(parcel_entity.keys())}")
    return None


def validate_geometry(geometry: Dict[str, Any]) -> bool:
    """
    Validate that a GeoJSON geometry is valid.
    
    Args:
        geometry: GeoJSON geometry object
        
    Returns:
        True if valid, False otherwise
    """
    if not geometry:
        return False
    
    try:
        shapely_geom = shape(geometry)
        return shapely_geom.is_valid
    except (GEOSException, ValueError, KeyError, TypeError):
        return False




























