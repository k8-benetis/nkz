/**
 * Geometry Validation Utilities
 * 
 * Validates geometric relationships, especially for parent-child hierarchies
 * using Turf.js for spatial operations.
 */

import { booleanContains } from '@turf/boolean-contains';
import { Polygon, Point, LineString, MultiPolygon, MultiLineString, Geometry } from 'geojson';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a child geometry is completely within a parent geometry
 * 
 * @param childGeometry - Child geometry (Polygon, Point, LineString, etc.)
 * @param parentGeometry - Parent geometry (must be Polygon or MultiPolygon)
 * @returns Validation result with error message if invalid
 */
export function validateGeometryWithinParent(
  childGeometry: Geometry,
  parentGeometry: Polygon | MultiPolygon
): ValidationResult {
  try {
    // Parent must be Polygon or MultiPolygon
    if (parentGeometry.type !== 'Polygon' && parentGeometry.type !== 'MultiPolygon') {
      return {
        valid: false,
        error: 'Parent geometry must be a Polygon or MultiPolygon'
      };
    }

    // Handle different child geometry types
    switch (childGeometry.type) {
      case 'Point': {
        const point = childGeometry as Point;
        const isPointContained = booleanContains(parentGeometry, point);
        if (!isPointContained) {
          return {
            valid: false,
            error: 'The point location must be within the boundaries of the parent entity'
          };
        }
        break;
      }
      case 'Polygon': {
        const polygon = childGeometry as Polygon;
        const isPolygonContained = booleanContains(parentGeometry, polygon);
        if (!isPolygonContained) {
          return {
            valid: false,
            error: 'The polygon must be completely within the boundaries of the parent entity. Some parts are outside the parent boundaries.'
          };
        }
        break;
      }
      case 'LineString': {
        const lineString = childGeometry as LineString;
        const allPointsIn = lineString.coordinates.every(coord => {
          const point: Point = {
            type: 'Point',
            coordinates: coord
          };
          return booleanContains(parentGeometry, point);
        });
        if (!allPointsIn) {
          return {
            valid: false,
            error: 'The line must be completely within the boundaries of the parent entity'
          };
        }
        break;
      }
      case 'MultiPolygon': {
        const multiPolygon = childGeometry as MultiPolygon;
        const allPolygonsContained = multiPolygon.coordinates.every(polygonCoords => {
          const polygon: Polygon = {
            type: 'Polygon',
            coordinates: polygonCoords
          };
          return booleanContains(parentGeometry, polygon);
        });
        if (!allPolygonsContained) {
          return {
            valid: false,
            error: 'All parts of the multi-polygon must be within the parent boundaries'
          };
        }
        break;
      }
      case 'MultiLineString': {
        const multiLineString = childGeometry as MultiLineString;
        const allLinesIn = multiLineString.coordinates.every(lineCoords => {
          return lineCoords.every(coord => {
            const point: Point = {
              type: 'Point',
              coordinates: coord
            };
            return booleanContains(parentGeometry, point);
          });
        });
        if (!allLinesIn) {
          return {
            valid: false,
            error: 'All parts of the multi-line must be within the parent boundaries'
          };
        }
        break;
      }

      default:
        return {
          valid: false,
          error: `Unsupported geometry type: ${childGeometry.type}`
        };
    }

    return { valid: true };
  } catch (error: any) {
    console.error('Error validating geometry:', error);
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
}

/**
 * Check if a geometry is valid (non-empty, has coordinates)
 */
export function isValidGeometry(geometry: Geometry | null | undefined): boolean {
  if (!geometry) return false;
  
  try {
    switch (geometry.type) {
      case 'Point':
        return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2;
      
      case 'LineString':
        return Array.isArray(geometry.coordinates) && 
               geometry.coordinates.length >= 2 &&
               geometry.coordinates.every(coord => Array.isArray(coord) && coord.length >= 2);
      
      case 'Polygon':
        return Array.isArray(geometry.coordinates) && 
               geometry.coordinates.length > 0 &&
               geometry.coordinates[0].length >= 4; // At least 4 points (closed polygon)
      
      case 'MultiPoint':
      case 'MultiLineString':
      case 'MultiPolygon':
        return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
      
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get geometry bounds (min/max lat/lon)
 */
export function getGeometryBounds(geometry: Geometry): {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} | null {
  try {
    let allCoords: number[][] = [];

    switch (geometry.type) {
      case 'Point':
        allCoords = [geometry.coordinates as number[]];
        break;
      
      case 'LineString':
        allCoords = geometry.coordinates as number[][];
        break;
      
      case 'Polygon':
        allCoords = geometry.coordinates.flat();
        break;
      
      case 'MultiPoint':
        allCoords = geometry.coordinates as number[][];
        break;
      
      case 'MultiLineString':
        allCoords = geometry.coordinates.flat();
        break;
      
      case 'MultiPolygon':
        allCoords = geometry.coordinates.flat(2);
        break;
      
      default:
        return null;
    }

    if (allCoords.length === 0) return null;

    const lons = allCoords.map(coord => coord[0]);
    const lats = allCoords.map(coord => coord[1]);

    return {
      minLon: Math.min(...lons),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lons),
      maxLat: Math.max(...lats)
    };
  } catch {
    return null;
  }
}
