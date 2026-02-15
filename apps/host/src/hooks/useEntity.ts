// =============================================================================
// useEntity Hook - SDK 2.0
// =============================================================================
// Hook for fetching and managing a single entity by ID and type.
// Provides loading, error, and refresh capabilities.

import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

export interface UseEntityOptions {
  /** Entity type (e.g., 'AgriSensor', 'AgriculturalRobot') */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Refresh interval in milliseconds (0 = no polling) */
  pollingInterval?: number;
  /** Enable automatic refresh */
  enablePolling?: boolean;
}

export interface UseEntityReturn {
  /** Entity data */
  entity: any | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Refresh function */
  refresh: () => Promise<void>;
  /** Update entity function */
  update: (updates: any) => Promise<void>;
  /** Delete entity function */
  remove: () => Promise<void>;
}

/**
 * Hook for managing a single entity
 * 
 * @example
 * ```tsx
 * const { entity, isLoading, error, refresh, update } = useEntity({
 *   entityType: 'AgriSensor',
 *   entityId: 'urn:ngsi-ld:AgriSensor:sensor1'
 * });
 * ```
 */
export function useEntity(options: UseEntityOptions): UseEntityReturn {
  const {
    entityType,
    entityId,
    autoFetch = true,
    pollingInterval = 0,
    enablePolling = false,
  } = options;

  const [entity, setEntity] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const fetchEntity = useCallback(async () => {
    if (!entityType || !entityId) {
      setError('Entity type and ID are required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getSDMEntityInstance(entityType, entityId);
      setEntity(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch entity';
      setError(errorMessage);
      setEntity(null);
      console.error('[useEntity] Error fetching entity:', err);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  const updateEntity = useCallback(async (updates: any) => {
    if (!entityType || !entityId) {
      throw new Error('Entity type and ID are required');
    }

    try {
      await api.updateSDMEntity(entityType, entityId, updates);
      // Refresh entity after update
      await fetchEntity();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update entity';
      throw new Error(errorMessage);
    }
  }, [entityType, entityId, fetchEntity]);

  const deleteEntity = useCallback(async () => {
    if (!entityType || !entityId) {
      throw new Error('Entity type and ID are required');
    }

    try {
      await api.deleteSDMEntity(entityType, entityId);
      setEntity(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete entity';
      throw new Error(errorMessage);
    }
  }, [entityType, entityId]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchEntity();
    }
  }, [autoFetch, fetchEntity]);

  // Polling
  useEffect(() => {
    if (!enablePolling || pollingInterval <= 0) return;

    const interval = setInterval(() => {
      fetchEntity();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [enablePolling, pollingInterval, fetchEntity]);

  return {
    entity,
    isLoading,
    error,
    refresh: fetchEntity,
    update: updateEntity,
    remove: deleteEntity,
  };
}



