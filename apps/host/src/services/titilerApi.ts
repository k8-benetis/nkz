/**
 * TiTiler API Service
 * 
 * Client for TiTiler COG tile server. Provides dynamic colormap rendering
 * for vegetation indices without server-side style configuration.
 */

import { getConfig } from '@/config/environment';

const config = getConfig();
const TITILER_BASE_URL = config.external.titilerUrl || import.meta.env.VITE_TITILER_URL || 'http://localhost:8000';
const MINIO_S3_PREFIX = import.meta.env.VITE_MINIO_S3_PREFIX || 's3://ndvi-rasters';

export interface COGMetadata {
    bounds: [number, number, number, number];
    minzoom: number;
    maxzoom: number;
    band_metadata: Array<{ band: number; min: number; max: number }>;
    dtype: string;
}

export interface COGStatistics {
    min: number;
    max: number;
    mean: number;
    count: number;
    sum: number;
    std: number;
    median: number;
    percentile_2: number;
    percentile_98: number;
}

// Colormap options for vegetation indices
export type ColormapName =
    | 'rdylgn'      // Red-Yellow-Green (default for NDVI)
    | 'viridis'     // Perceptually uniform
    | 'plasma'      // Purple-orange-yellow
    | 'magma'       // Purple-pink-yellow
    | 'inferno'     // Black-red-yellow
    | 'greens'      // Greens gradient
    | 'reds'        // Reds gradient
    | 'spectral'    // Rainbow spectral
    | 'coolwarm';   // Blue to red diverging

export const titilerApi = {
    /**
     * Get tile URL template for Cesium/Leaflet
     */
    getTileUrl: (cogUrl: string, options?: {
        colormap?: ColormapName;
        rescale?: [number, number];
        bidx?: number;
    }): string => {
        const { colormap = 'rdylgn', rescale = [-1, 1], bidx = 1 } = options || {};
        const params = new URLSearchParams({
            url: cogUrl,
            colormap_name: colormap,
            rescale: rescale.join(','),
            bidx: bidx.toString(),
        });
        return `${TITILER_BASE_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?${params}`;
    },

    /**
     * Get COG metadata (bounds, zoom levels)
     */
    getMetadata: async (cogUrl: string): Promise<COGMetadata> => {
        const response = await fetch(
            `${TITILER_BASE_URL}/cog/info?url=${encodeURIComponent(cogUrl)}`
        );
        if (!response.ok) throw new Error(`Failed to get COG info: ${response.status}`);
        return response.json();
    },

    /**
     * Get COG statistics
     */
    getStatistics: async (cogUrl: string): Promise<COGStatistics> => {
        const response = await fetch(
            `${TITILER_BASE_URL}/cog/statistics?url=${encodeURIComponent(cogUrl)}`
        );
        if (!response.ok) throw new Error(`Failed to get COG statistics: ${response.status}`);
        const data = await response.json();
        return data['b1'] || data;
    },

    /**
     * Get preview image URL
     */
    getPreviewUrl: (cogUrl: string, options?: {
        colormap?: ColormapName;
        maxSize?: number;
    }): string => {
        const { colormap = 'rdylgn', maxSize = 256 } = options || {};
        const params = new URLSearchParams({
            url: cogUrl,
            colormap_name: colormap,
            max_size: maxSize.toString(),
            rescale: '-1,1',
        });
        return `${TITILER_BASE_URL}/cog/preview?${params}`;
    },

    /**
     * Get point value at coordinates
     */
    getPointValue: async (cogUrl: string, lon: number, lat: number): Promise<number[]> => {
        const response = await fetch(
            `${TITILER_BASE_URL}/cog/point/${lon},${lat}?url=${encodeURIComponent(cogUrl)}`
        );
        if (!response.ok) throw new Error(`Failed to get point value: ${response.status}`);
        const data = await response.json();
        return data.values;
    },

    /**
     * Build S3 URL for a parcel's index COG
     */
    buildCogUrl: (tenantId: string, parcelId: string, indexType: string, date: string): string => {
        return `${MINIO_S3_PREFIX}/${tenantId}/${parcelId}/${indexType}/${date}.tif`;
    },

    /**
     * Check if COG exists and is accessible
     */
    checkCogExists: async (cogUrl: string): Promise<boolean> => {
        try {
            await titilerApi.getMetadata(cogUrl);
            return true;
        } catch {
            return false;
        }
    },
};

export default titilerApi;
