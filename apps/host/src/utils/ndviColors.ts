// =============================================================================
// NDVI Color Utilities
// =============================================================================
// Utility functions for mapping NDVI values to colors for visualization

export type IndexType = 'ndvi' | 'evi' | 'savi' | 'gndvi' | 'ndre';

interface IndexThresholds {
  high: number;
  medium: number;
  low: number;
  veryLow: number;
}

const INDEX_THRESHOLDS: Record<IndexType, IndexThresholds> = {
  ndvi: { high: 0.7, medium: 0.5, low: 0.3, veryLow: 0.2 },
  evi: { high: 0.6, medium: 0.4, low: 0.2, veryLow: 0.1 },
  savi: { high: 0.6, medium: 0.4, low: 0.2, veryLow: 0.1 },
  gndvi: { high: 0.6, medium: 0.4, low: 0.2, veryLow: 0.1 },
  ndre: { high: 0.5, medium: 0.35, low: 0.2, veryLow: 0.1 },
};

/**
 * Maps NDVI value to a color
 * NDVI ranges: -1 to 1
 * - < 0: No vegetation (brown/red)
 * - 0-0.2: Sparse vegetation (red/orange)
 * - 0.2-0.5: Moderate vegetation (yellow/orange)
 * - 0.5-0.7: Dense vegetation (light green)
 * - > 0.7: Very dense vegetation (dark green)
 */
export function getNDVIColor(ndviValue: number | null | undefined): string {
  return getIndexColor('ndvi', ndviValue);
}

/**
 * Generic function to get color for any vegetation index
 */
export function getIndexColor(indexType: IndexType, value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '#9ca3af'; // Gray for no data
  }

  const thresholds = INDEX_THRESHOLDS[indexType] || INDEX_THRESHOLDS.ndvi;

  if (value < 0) {
    return '#8B4513'; // Brown - No vegetation
  } else if (value >= thresholds.high) {
    return '#228B22'; // Dark green - Very dense vegetation
  } else if (value >= thresholds.medium) {
    return '#9ACD32'; // Light green - Dense vegetation
  } else if (value >= thresholds.low) {
    return '#FFA500'; // Orange - Moderate vegetation
  } else if (value >= thresholds.veryLow) {
    return '#FF6347'; // Red - Sparse vegetation
  } else {
    return '#8B4513'; // Brown - No vegetation
  }
}

/**
 * Gets the latest NDVI result for each parcel from results array
 */
export function getLatestNDVIByParcel(
  results: Array<{ parcelId?: string | null; date?: string | null; ndviMean?: number | null }>
): Record<string, { ndviMean: number; date: string }> {
  const parcelNDVI: Record<string, { ndviMean: number; date: string }> = {};

  results.forEach((result) => {
    if (!result.parcelId || result.ndviMean === null || result.ndviMean === undefined) {
      return;
    }

    const existing = parcelNDVI[result.parcelId];
    if (!existing || !result.date) {
      parcelNDVI[result.parcelId] = {
        ndviMean: result.ndviMean,
        date: result.date || '',
      };
    } else if (result.date && result.date > existing.date) {
      // Update if this result is more recent
      parcelNDVI[result.parcelId] = {
        ndviMean: result.ndviMean,
        date: result.date,
      };
    }
  });

  return parcelNDVI;
}

/**
 * Gets the latest index result for each parcel from results array
 * Supports all vegetation indices (NDVI, EVI, SAVI, GNDVI, NDRE)
 */
export function getLatestIndexByParcel(
  results: Array<{
    parcelId?: string | null;
    date?: string | null;
    ndviMean?: number | null;
    indicesData?: Record<string, any> | null;
  }>,
  indexType: IndexType = 'ndvi'
): Record<string, { mean: number; date: string }> {
  const parcelIndex: Record<string, { mean: number; date: string }> = {};

  results.forEach((result) => {
    if (!result.parcelId) return;

    let mean: number | null = null;

    // Try to get from indicesData first (multi-index format)
    if (result.indicesData && result.indicesData[indexType]) {
      mean = result.indicesData[indexType].mean;
    } else if (indexType === 'ndvi' && result.ndviMean !== null && result.ndviMean !== undefined) {
      // Fallback to legacy NDVI field
      mean = result.ndviMean;
    }

    if (mean === null || mean === undefined) {
      return;
    }

    const existing = parcelIndex[result.parcelId];
    if (!existing || !result.date) {
      parcelIndex[result.parcelId] = {
        mean,
        date: result.date || '',
      };
    } else if (result.date && result.date > existing.date) {
      // Update if this result is more recent
      parcelIndex[result.parcelId] = {
        mean,
        date: result.date,
      };
    }
  });

  return parcelIndex;
}
