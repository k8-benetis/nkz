// =============================================================================
// Geospatial Utilities
// =============================================================================

import type { GeoPolygon } from '@/types';

const EARTH_RADIUS_METERS = 6_378_137.0;

export const ensureClosedPolygon = (coordinates: number[][]): number[][] => {
  if (coordinates.length === 0) return coordinates;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coordinates, first];
  }
  return coordinates;
};

export const calculatePolygonAreaHectares = (polygon: GeoPolygon | null | undefined): number | null => {
  if (!polygon || polygon.type !== 'Polygon' || !polygon.coordinates?.[0]) {
    return null;
  }

  const ring = ensureClosedPolygon(polygon.coordinates[0]);
  if (ring.length < 4) {
    return null;
  }

  const coords = ring.slice(0, -1); // remove duplicate closing point for calculations
  if (coords.length < 3) {
    return null;
  }

  const lat0 = coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length;
  const lat0Rad = (lat0 * Math.PI) / 180;

  const projected = coords.map(([lon, lat]) => {
    const x = ((lon * Math.PI) / 180) * EARTH_RADIUS_METERS * Math.cos(lat0Rad);
    const y = ((lat * Math.PI) / 180) * EARTH_RADIUS_METERS;
    return [x, y] as [number, number];
  });

  let area = 0;
  for (let i = 0; i < projected.length; i += 1) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % projected.length];
    area += x1 * y2 - x2 * y1;
  }

  const areaSqMeters = Math.abs(area) / 2;
  return Number((areaSqMeters / 10_000).toFixed(4));
};

export const toGeoPolygon = (coordinates: number[][]): GeoPolygon | null => {
  if (!coordinates || coordinates.length < 3) {
    return null;
  }
  const sanitized = ensureClosedPolygon(coordinates);
  if (sanitized.length < 4) {
    return null;
  }
  return {
    type: 'Polygon',
    coordinates: [sanitized],
  };
};

