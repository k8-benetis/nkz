// =============================================================================
// useTimeseries Hook - SDK 2.0
// =============================================================================
// Hook for fetching historical timeseries data from TimescaleDB Reader Service.
// Integrates with ViewerContext for temporal synchronization.

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface TimeseriesPoint {
  timestamp: string;
  [attribute: string]: string | number;
}

export interface TimeseriesStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
  first_observed: string | null;
  last_observed: string | null;
}

export interface UseTimeseriesOptions {
  /** Entity ID (required) */
  entityId: string;
  /** Auto-fetch on mount (default: false) */
  autoFetch?: boolean;
  /** Initial time range */
  timeRange?: {
    start_time: string; // ISO 8601
    end_time?: string;  // ISO 8601 (default: now)
  };
  /** Aggregation level */
  aggregation?: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** Specific attribute to query (optional, returns all if not specified) */
  attribute?: string;
  /** Max data points (default: 1000) */
  limit?: number;
}

export interface UseTimeseriesReturn {
  // Data
  data: TimeseriesPoint[];
  stats: Record<string, TimeseriesStats> | null;
  
  // Current query state
  timeRange: { start_time: string; end_time: string } | null;
  aggregation: string;
  attribute: string | null;
  
  // Loading states
  isLoading: boolean;
  isLoadingStats: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  fetchData: (options?: Partial<UseTimeseriesOptions>) => Promise<void>;
  fetchStats: (timeRange?: { start_time: string; end_time?: string }) => Promise<void>;
  setTimeRange: (start: string, end?: string) => void;
  setAggregation: (agg: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly') => void;
  setAttribute: (attr: string | null) => void;
  
  // Helpers
  getValuesForAttribute: (attr: string) => Array<{ timestamp: string; value: number }>;
  getAttributeStats: (attr: string) => TimeseriesStats | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate automatic aggregation based on time range
 */
function getAutoAggregation(startTime: string, endTime: string): 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' {
  const start = new Date(startTime);
  const end = new Date(endTime || new Date().toISOString());
  const hoursDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff <= 24) return 'none';    // Raw data for short ranges
  if (hoursDiff <= 168) return 'hourly'; // 7 days
  if (hoursDiff <= 720) return 'daily';  // 30 days
  if (hoursDiff <= 2160) return 'daily'; // 90 days
  return 'daily';                         // Default for longer ranges
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing historical timeseries data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, fetchData } = useTimeseries({
 *   entityId: 'sensor-123',
 *   timeRange: {
 *     start_time: '2024-01-01T00:00:00Z',
 *     end_time: '2024-01-02T00:00:00Z'
 *   }
 * });
 * ```
 */
export function useTimeseries(options: UseTimeseriesOptions): UseTimeseriesReturn {
  const {
    entityId,
    autoFetch = false,
    timeRange: initialTimeRange,
    aggregation: initialAggregation,
    attribute: initialAttribute,
    limit = 1000,
  } = options;

  // State
  const [data, setData] = useState<TimeseriesPoint[]>([]);
  const [stats, setStats] = useState<Record<string, TimeseriesStats> | null>(null);
  
  const [timeRange, setTimeRangeState] = useState<{ start_time: string; end_time: string } | null>(
    initialTimeRange ? {
      start_time: initialTimeRange.start_time,
      end_time: initialTimeRange.end_time || new Date().toISOString(),
    } : null
  );
  
  const [aggregation, setAggregationState] = useState<'none' | 'hourly' | 'daily' | 'weekly' | 'monthly'>(
    initialAggregation || (timeRange ? getAutoAggregation(timeRange.start_time, timeRange.end_time || new Date().toISOString()) : 'hourly')
  );
  
  const [attribute, setAttributeState] = useState<string | null>(initialAttribute || null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==========================================================================
  // Fetch Data
  // ==========================================================================
  
  const fetchData = useCallback(async (overrideOptions?: Partial<UseTimeseriesOptions>) => {
    if (!entityId) {
      setError('Entity ID is required');
      return;
    }

    const effectiveTimeRange = overrideOptions?.timeRange || timeRange;
    if (!effectiveTimeRange) {
      setError('Time range is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const effectiveAggregation = overrideOptions?.aggregation || aggregation;
      const effectiveAttribute = overrideOptions?.attribute !== undefined ? overrideOptions.attribute : attribute;
      
      const response = await api.getTimeseriesData(entityId, {
        start_time: effectiveTimeRange.start_time,
        end_time: effectiveTimeRange.end_time || new Date().toISOString(),
        aggregation: effectiveAggregation,
        attribute: effectiveAttribute || undefined,
        limit,
      });

      setData(response.data || []);
      
      // Update state if override options provided
      if (overrideOptions?.timeRange) {
        setTimeRangeState({
          start_time: overrideOptions.timeRange.start_time,
          end_time: overrideOptions.timeRange.end_time || new Date().toISOString(),
        });
      }
      if (overrideOptions?.aggregation) {
        setAggregationState(overrideOptions.aggregation);
      }
      if (overrideOptions?.attribute !== undefined) {
        setAttributeState(overrideOptions.attribute || null);
      }
    } catch (err: any) {
      console.error('[useTimeseries] Error fetching data:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch timeseries data');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [entityId, timeRange, aggregation, attribute, limit]);

  // ==========================================================================
  // Fetch Stats
  // ==========================================================================
  
  const fetchStats = useCallback(async (statsTimeRange?: { start_time: string; end_time?: string }) => {
    if (!entityId) {
      setError('Entity ID is required');
      return;
    }

    const effectiveTimeRange = statsTimeRange || timeRange;
    if (!effectiveTimeRange) {
      setError('Time range is required');
      return;
    }

    setIsLoadingStats(true);
    setError(null);

    try {
      const response = await api.getTimeseriesStats(entityId, {
        start_time: effectiveTimeRange.start_time,
        end_time: effectiveTimeRange.end_time || new Date().toISOString(),
        attribute: attribute || undefined,
      });

      setStats(response.stats || null);
    } catch (err: any) {
      console.error('[useTimeseries] Error fetching stats:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch statistics');
      setStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  }, [entityId, timeRange, attribute]);

  // ==========================================================================
  // Setters
  // ==========================================================================
  
  const setTimeRange = useCallback((start: string, end?: string) => {
    const newRange = {
      start_time: start,
      end_time: end || new Date().toISOString(),
    };
    setTimeRangeState(newRange);
    // Auto-adjust aggregation based on new range
    const autoAgg = getAutoAggregation(start, newRange.end_time);
    setAggregationState(autoAgg);
    // Trigger fetch with new range
    fetchData({ timeRange: newRange, aggregation: autoAgg });
  }, [fetchData]);

  const setAggregation = useCallback((agg: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly') => {
    setAggregationState(agg);
    if (timeRange) {
      fetchData({ aggregation: agg });
    }
  }, [timeRange, fetchData]);

  const setAttribute = useCallback((attr: string | null) => {
    setAttributeState(attr);
    if (timeRange) {
      fetchData({ attribute: attr || undefined });
    }
  }, [timeRange, fetchData]);

  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  const getValuesForAttribute = useCallback((attr: string): Array<{ timestamp: string; value: number }> => {
    return data
      .filter(point => point[attr] !== undefined && point[attr] !== null)
      .map(point => ({
        timestamp: point.timestamp,
        value: typeof point[attr] === 'number' ? point[attr] : parseFloat(String(point[attr])) || 0,
      }));
  }, [data]);

  const getAttributeStats = useCallback((attr: string): TimeseriesStats | null => {
    if (!stats || !stats[attr]) return null;
    return stats[attr];
  }, [stats]);

  // ==========================================================================
  // Effects
  // ==========================================================================
  
  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && timeRange) {
      fetchData();
    }
  }, [autoFetch]); // Only run on mount

  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    data,
    stats,
    timeRange,
    aggregation,
    attribute,
    isLoading,
    isLoadingStats,
    error,
    fetchData,
    fetchStats,
    setTimeRange,
    setAggregation,
    setAttribute,
    getValuesForAttribute,
    getAttributeStats,
  };
}

