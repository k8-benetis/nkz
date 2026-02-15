// =============================================================================
// useTelemetry Hook - SDK 2.0
// =============================================================================
// Hook for fetching and managing telemetry data from devices/sensors.
// Supports real-time polling, historical data, and statistics.

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface TelemetryValue {
  observed_at: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TelemetryStats {
  min?: number;
  max?: number;
  avg?: number;
  count?: number;
  first_observed?: string;
  last_observed?: string;
}

export interface UseTelemetryOptions {
  /** Device/Sensor ID */
  deviceId: string;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Enable real-time polling (default: false) */
  enablePolling?: boolean;
  /** Polling interval in milliseconds (default: 5000) */
  pollingInterval?: number;
  /** Maximum data points to keep in memory for latest telemetry */
  maxDataPoints?: number;
  /** Time range for historical data */
  timeRange?: {
    start_time?: string;
    end_time?: string;
  };
  /** Limit for historical data queries */
  limit?: number;
}

export interface UseTelemetryReturn {
  // Latest telemetry
  latestTelemetry: TelemetryValue | null;
  latestTelemetryHistory: TelemetryValue[];
  
  // Historical telemetry
  historicalTelemetry: TelemetryValue[];
  
  // Statistics
  stats: TelemetryStats | null;
  
  // Loading states
  isLoadingLatest: boolean;
  isLoadingHistorical: boolean;
  isLoadingStats: boolean;
  
  // Error states
  error: string | null;
  
  // Connection state
  isConnected: boolean;
  
  // Actions
  refreshLatest: () => Promise<void>;
  fetchHistorical: (timeRange: { start_time?: string; end_time?: string; limit?: number }) => Promise<void>;
  fetchStats: (timeRange?: { start_time?: string; end_time?: string }) => Promise<void>;
  getMeasurementValue: (key: string) => number | null;
  getMeasurementUnit: (key: string) => string;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing device telemetry data
 * 
 * @example
 * ```tsx
 * const { latestTelemetry, isLoadingLatest, refreshLatest } = useTelemetry({
 *   deviceId: 'sensor-123',
 *   enablePolling: true,
 *   pollingInterval: 5000
 * });
 * ```
 */
export function useTelemetry(options: UseTelemetryOptions): UseTelemetryReturn {
  const {
    deviceId,
    autoFetch = true,
    enablePolling = false,
    pollingInterval = 5000,
    maxDataPoints = 50,
    timeRange,
    limit = 500,
  } = options;

  // State
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryValue | null>(null);
  const [latestTelemetryHistory, setLatestTelemetryHistory] = useState<TelemetryValue[]>([]);
  const [historicalTelemetry, setHistoricalTelemetry] = useState<TelemetryValue[]>([]);
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  
  const [isLoadingLatest, setIsLoadingLatest] = useState(autoFetch);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================================================
  // Fetch Latest Telemetry
  // ==========================================================================
  
  const refreshLatest = useCallback(async () => {
    if (!deviceId) {
      setError('Device ID is required');
      return;
    }

    setIsLoadingLatest(true);
    setError(null);

    try {
      const data = await api.getDeviceLatestTelemetry(deviceId);
      
      if (data && data.observed_at) {
        const telemetry: TelemetryValue = {
          observed_at: data.observed_at,
          payload: data.payload || {},
          metadata: data.metadata,
        };

        setLatestTelemetry(telemetry);
        setIsConnected(true);

        // Update history (FIFO queue)
        setLatestTelemetryHistory(prev => [
          telemetry,
          ...prev.slice(0, maxDataPoints - 1)
        ]);
      } else {
        setIsConnected(false);
      }
    } catch (err: any) {
      console.error('[useTelemetry] Error fetching latest telemetry:', err);
      setIsConnected(false);
      setError(err.response?.data?.error || err.message || 'Error loading telemetry');
    } finally {
      setIsLoadingLatest(false);
    }
  }, [deviceId, maxDataPoints]);

  // ==========================================================================
  // Fetch Historical Telemetry
  // ==========================================================================
  
  const fetchHistorical = useCallback(async (range?: { start_time?: string; end_time?: string; limit?: number }) => {
    if (!deviceId) {
      setError('Device ID is required');
      return;
    }

    setIsLoadingHistorical(true);
    setError(null);

    try {
      const params = {
        start_time: range?.start_time || timeRange?.start_time,
        end_time: range?.end_time || timeRange?.end_time,
        limit: range?.limit || limit,
      };

      const data = await api.getDeviceTelemetry(deviceId, params);
      
      if (data && data.telemetry && Array.isArray(data.telemetry)) {
        setHistoricalTelemetry(data.telemetry);
      } else {
        setHistoricalTelemetry([]);
      }
    } catch (err: any) {
      console.error('[useTelemetry] Error fetching historical telemetry:', err);
      setError(err.response?.data?.error || err.message || 'Error loading historical telemetry');
      setHistoricalTelemetry([]);
    } finally {
      setIsLoadingHistorical(false);
    }
  }, [deviceId, timeRange, limit]);

  // ==========================================================================
  // Fetch Statistics
  // ==========================================================================
  
  const fetchStats = useCallback(async (range?: { start_time?: string; end_time?: string }) => {
    if (!deviceId) {
      setError('Device ID is required');
      return;
    }

    setIsLoadingStats(true);
    setError(null);

    try {
      const params = {
        start_time: range?.start_time || timeRange?.start_time,
        end_time: range?.end_time || timeRange?.end_time,
      };

      const data = await api.getDeviceTelemetryStats(deviceId, params);
      setStats(data || null);
    } catch (err: any) {
      console.error('[useTelemetry] Error fetching telemetry stats:', err);
      setError(err.response?.data?.error || err.message || 'Error loading statistics');
      setStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  }, [deviceId, timeRange]);

  // ==========================================================================
  // Helper Functions
  // ==========================================================================
  
  const getMeasurementValue = useCallback((key: string): number | null => {
    if (!latestTelemetry?.payload) return null;
    
    // Try different key formats
    const value = latestTelemetry.payload[key] || 
                  latestTelemetry.payload[key.toLowerCase()] ||
                  latestTelemetry.payload[key.toUpperCase()];
    
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value !== null && 'value' in value) {
      return typeof value.value === 'number' ? value.value : null;
    }
    return null;
  }, [latestTelemetry]);

  const getMeasurementUnit = useCallback((key: string): string => {
    if (!latestTelemetry?.payload) return '';
    
    const value = latestTelemetry.payload[key] || 
                  latestTelemetry.payload[key.toLowerCase()] ||
                  latestTelemetry.payload[key.toUpperCase()];
    
    if (typeof value === 'object' && value !== null) {
      return value.unitCode || value.unit || '';
    }
    return '';
  }, [latestTelemetry]);

  // ==========================================================================
  // Effects
  // ==========================================================================
  
  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      refreshLatest();
    }
  }, [autoFetch]); // Only run on mount/unmount

  // Polling
  useEffect(() => {
    if (!enablePolling || pollingInterval <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      refreshLatest();
    }, pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enablePolling, pollingInterval, refreshLatest]);

  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    latestTelemetry,
    latestTelemetryHistory,
    historicalTelemetry,
    stats,
    isLoadingLatest,
    isLoadingHistorical,
    isLoadingStats,
    error,
    isConnected,
    refreshLatest,
    fetchHistorical,
    fetchStats,
    getMeasurementValue,
    getMeasurementUnit,
  };
}

