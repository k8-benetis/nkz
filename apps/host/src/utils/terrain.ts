// =============================================================================
// Terrain Provider Utilities
// =============================================================================
// Utilities for detecting and selecting terrain providers based on location

export type TerrainProviderType = 'idena' | 'ign' | 'auto';

// Terrain provider URLs
export const TERRAIN_PROVIDERS = {
  idena: 'https://idena.navarra.es/cesiumTerrain/2017/epsg4326/5m/layer.json',
  ign: 'https://qm-mdt.idee.es/1.0.0/terrain/layer.json',
} as const;

// Navarra bounding box (approximate)
// Longitude: -2.5° to -1.0° (West to East)
// Latitude: 42.0° to 43.5° (South to North)
const NAVARRA_BOUNDS = {
  minLon: -2.5,
  maxLon: -1.0,
  minLat: 42.0,
  maxLat: 43.5,
};

/**
 * Check if coordinates are within Navarra bounds
 */
export function isInNavarra(longitude: number, latitude: number): boolean {
  return (
    longitude >= NAVARRA_BOUNDS.minLon &&
    longitude <= NAVARRA_BOUNDS.maxLon &&
    latitude >= NAVARRA_BOUNDS.minLat &&
    latitude <= NAVARRA_BOUNDS.maxLat
  );
}

/**
 * Detect terrain provider based on coordinates
 * @param longitude Longitude in degrees
 * @param latitude Latitude in degrees
 * @returns 'idena' if in Navarra, 'ign' otherwise
 */
export function detectTerrainProvider(
  longitude: number,
  latitude: number
): 'idena' | 'ign' {
  return isInNavarra(longitude, latitude) ? 'idena' : 'ign';
}

/**
 * Detect terrain provider from parcel geometry or viewer camera position
 * @param parcels Array of parcels with geometry (supports both Parcel type and simple geometry objects)
 * @param cameraPosition Optional camera position [longitude, latitude]
 * @returns Detected terrain provider
 */
export function detectTerrainProviderFromParcels(
  parcels: Array<{ geometry?: { coordinates?: number[][][] } | any }>,
  cameraPosition?: [number, number]
): 'idena' | 'ign' {
  // If camera position provided, use it
  if (cameraPosition) {
    return detectTerrainProvider(cameraPosition[0], cameraPosition[1]);
  }

  // Otherwise, check parcels
  if (parcels && parcels.length > 0) {
    for (const parcel of parcels) {
      // Handle both Parcel type (with geometry.value) and simple geometry objects
      const geometry = parcel.geometry?.value || parcel.geometry;
      
      if (geometry?.coordinates?.[0]) {
        // Get first coordinate (centroid approximation)
        const coords = geometry.coordinates[0];
        if (coords.length > 0) {
          const [lon, lat] = coords[0];
          return detectTerrainProvider(lon, lat);
        }
      }
    }
  }

  // Default to IGN (covers all of Spain)
  return 'ign';
}

/**
 * Get terrain provider URL
 */
export function getTerrainProviderUrl(provider: TerrainProviderType | string): string {
  if (provider === 'idena') {
    return TERRAIN_PROVIDERS.idena;
  } else if (provider === 'ign') {
    return TERRAIN_PROVIDERS.ign;
  } else if (provider.startsWith('http')) {
    return provider;
  }
  // Default to IGN
  return TERRAIN_PROVIDERS.ign;
}

/**
 * Get terrain provider display name
 */
export function getTerrainProviderName(provider: 'idena' | 'ign'): string {
  return provider === 'idena' ? 'IDENA (Navarra)' : 'IGN (España)';
}

/**
 * Get terrain provider description
 */
export function getTerrainProviderDescription(provider: 'idena' | 'ign'): string {
  return provider === 'idena'
    ? 'Modelo Digital de Terreno de Navarra (5m resolución)'
    : 'Modelo Digital de Terreno del IGN (España completa)';
}

