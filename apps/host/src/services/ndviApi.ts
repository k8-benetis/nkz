// =============================================================================
// NDVI API Service - Real Implementation
// =============================================================================
// Service for NDVI data retrieval using real database and TiTiler

import axios from 'axios';
import { getConfig } from '@/config/environment';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl;

export interface NDVIDataPoint {
  parcel_id: string;
  date: string;
  index_type: 'ndvi' | 'evi' | 'savi' | 'gndvi' | 'ndre';
  mean: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
  p10: number | null;
  p90: number | null;
  cloud_cover: number | null;
  cog_url?: string;
}

export interface AvailableDate {
  date: string;
  mean: number | null;
  cloudCover: number | null;
  cogUrl: string;
}

// Get auth token
const getAuthToken = (): string => {
  return sessionStorage.getItem('auth_token') ||
    (window as any).__keycloak?.token ||
    '';
};

// Create axios client
const createClient = () => axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`,
  },
});

export const ndviApi = {
  /**
   * Get available NDVI dates for a parcel from ndvi_raster_catalog
   */
  getAvailableDates: async (
    parcelId: string,
    indexType: string = 'ndvi'
  ): Promise<AvailableDate[]> => {
    try {
      const response = await createClient().get(
        `/api/ndvi/catalog/${parcelId}/dates`,
        { params: { index_type: indexType } }
      );
      return response.data || [];
    } catch (error) {
      console.warn('[ndviApi] getAvailableDates failed, falling back to results:', error);
      // Fallback: extract dates from ndvi_results
      return ndviApi.getAvailableDatesFromResults(parcelId);
    }
  },

  /**
   * Fallback: Get available dates from ndvi_results table
   */
  getAvailableDatesFromResults: async (parcelId: string): Promise<AvailableDate[]> => {
    try {
      const response = await createClient().get('/api/ndvi/results');
      const results = response.data || [];

      // Filter by parcel and extract dates
      const parcelResults = results
        .filter((r: any) => r.parcel_id === parcelId || parcelId === 'all')
        .map((r: any) => ({
          date: r.date?.split('T')[0] || '',
          mean: r.ndvi_mean ?? r.ndviMean ?? null,
          cloudCover: r.cloud_cover ?? r.cloudCover ?? null,
          cogUrl: r.raster_url ?? r.rasterUrl ?? '',
        }))
        .filter((d: AvailableDate) => d.date);

      // Remove duplicates and sort
      const uniqueDates = new Map<string, AvailableDate>();
      parcelResults.forEach((d: AvailableDate) => {
        if (!uniqueDates.has(d.date)) {
          uniqueDates.set(d.date, d);
        }
      });

      return Array.from(uniqueDates.values()).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('[ndviApi] getAvailableDatesFromResults failed:', error);
      return [];
    }
  },

  /**
   * Get time series data for a parcel (all dates, one index)
   */
  getTimeSeries: async (
    parcelId: string,
    indexType: string = 'ndvi',
    startDate?: string,
    endDate?: string
  ): Promise<NDVIDataPoint[]> => {
    try {
      const params: any = { index_type: indexType };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await createClient().get(
        `/api/ndvi/catalog/${parcelId}/time-series`,
        { params }
      );
      return response.data || [];
    } catch (error) {
      console.warn('[ndviApi] getTimeSeries from catalog failed, using results:', error);
      // Fallback to ndvi_results
      return ndviApi.getTimeSeriesFromResults(parcelId, startDate, endDate);
    }
  },

  /**
   * Fallback: Get time series from ndvi_results
   */
  getTimeSeriesFromResults: async (
    parcelId: string,
    startDate?: string,
    endDate?: string
  ): Promise<NDVIDataPoint[]> => {
    try {
      const response = await createClient().get('/api/ndvi/results');
      const results = response.data || [];

      return results
        .filter((r: any) => {
          const matchParcel = r.parcel_id === parcelId || parcelId === 'all';
          const date = r.date?.split('T')[0];
          const matchStart = !startDate || date >= startDate;
          const matchEnd = !endDate || date <= endDate;
          return matchParcel && matchStart && matchEnd;
        })
        .map((r: any) => ({
          parcel_id: r.parcel_id,
          date: r.date?.split('T')[0] || '',
          index_type: 'ndvi' as const,
          mean: r.ndvi_mean ?? r.ndviMean ?? null,
          min: r.ndvi_min ?? r.ndviMin ?? null,
          max: r.ndvi_max ?? r.ndviMax ?? null,
          stddev: r.ndvi_stddev ?? r.ndviStddev ?? null,
          p10: r.p10 ?? null,
          p90: r.p90 ?? null,
          cloud_cover: r.cloud_cover ?? r.cloudCover ?? null,
          cog_url: r.raster_url ?? r.rasterUrl ?? undefined,
        }))
        .sort((a: NDVIDataPoint, b: NDVIDataPoint) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('[ndviApi] getTimeSeriesFromResults failed:', error);
      return [];
    }
  },

  /**
   * Get latest NDVI for a parcel
   */
  getLatest: async (parcelId: string): Promise<NDVIDataPoint | null> => {
    const series = await ndviApi.getTimeSeries(parcelId);
    return series.length > 0 ? series[series.length - 1] : null;
  },

  /**
   * Get mean values for each available date (for mini-chart in slider)
   */
  getMeanValuesByDate: async (
    parcelId: string,
    indexType: string = 'ndvi'
  ): Promise<Record<string, number | null>> => {
    const dates = await ndviApi.getAvailableDates(parcelId, indexType);
    const result: Record<string, number | null> = {};
    dates.forEach(d => {
      result[d.date] = d.mean;
    });
    return result;
  },
};

export default ndviApi;
