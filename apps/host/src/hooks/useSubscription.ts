// =============================================================================
// useSubscription Hook - SDK 2.0
// =============================================================================
// Hook for managing NGSI-LD subscriptions to entities.
// Enables real-time updates via WebSocket or HTTP notifications.

import { useState, useEffect, useCallback, useRef } from 'react';
import api, { clearApiCache, invalidateEntityCache } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface NGSISubscription {
  id: string;
  type: string;
  description?: string;
  entities?: Array<{
    id?: string;
    idPattern?: string;
    type: string;
  }>;
  watchedAttributes?: string[];
  q?: string; // Query expression
  geoQ?: any; // Geo-query
  notification: {
    attributes?: string[];
    format?: 'normalized' | 'keyValues' | 'values';
    endpoint: {
      uri: string;
      accept?: string;
      receiverInfo?: Array<{
        key: string;
        value: string;
      }>;
    };
  };
  expires?: string;
  throttling?: number;
  timeInterval?: number;
  status?: 'active' | 'paused' | 'expired' | 'failed';
  [key: string]: any;
}

export interface UseSubscriptionOptions {
  /** Entity type to subscribe to (e.g., 'AgriSensor', 'AgriculturalRobot') */
  entityType?: string;
  /** Specific entity ID (optional, if provided, only this entity is watched) */
  entityId?: string;
  /** Entity ID pattern (e.g., 'urn:ngsi-ld:AgriSensor:.*') */
  entityIdPattern?: string;
  /** Attributes to watch (if empty, all attributes) */
  watchedAttributes?: string[];
  /** Query expression (FIWARE query syntax) */
  query?: string;
  /** Notification endpoint URL */
  notificationEndpoint: string;
  /** Notification format (default: 'normalized') */
  notificationFormat?: 'normalized' | 'keyValues' | 'values';
  /** Auto-create subscription on mount (default: true) */
  autoSubscribe?: boolean;
  /** Callback for received notifications */
  onNotification?: (notification: any) => void;
  /** Expiration time in ISO 8601 format */
  expires?: string;
  /** Throttling in seconds (min time between notifications) */
  throttling?: number;
  /** Time interval in seconds (notification frequency) */
  timeInterval?: number;
}

export interface UseSubscriptionReturn {
  /** Subscription object */
  subscription: NGSISubscription | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Whether subscription is active */
  isActive: boolean;
  /** Create subscription */
  subscribe: () => Promise<void>;
  /** Update subscription */
  update: (updates: Partial<NGSISubscription>) => Promise<void>;
  /** Delete subscription */
  unsubscribe: () => Promise<void>;
  /** Refresh subscription status */
  refresh: () => Promise<void>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get subscriptions for entities
 */
async function getSubscriptions(
  entityType?: string,
  entityId?: string
): Promise<NGSISubscription[]> {
  return api.getSubscriptions({
    ...(entityType && { type: entityType }),
    ...(entityId && { id: entityId }),
  });
}

/**
 * Create a new NGSI-LD subscription
 */
async function createSubscription(subscription: Partial<NGSISubscription>): Promise<NGSISubscription> {
  return api.createSubscription(subscription);
}

/**
 * Update an existing subscription
 */
async function updateSubscription(
  subscriptionId: string,
  updates: Partial<NGSISubscription>
): Promise<void> {
  await api.updateSubscription(subscriptionId, updates);
}

/**
 * Delete a subscription
 */
async function deleteSubscription(subscriptionId: string): Promise<void> {
  await api.deleteSubscription(subscriptionId);
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing NGSI-LD subscriptions
 * 
 * @example
 * ```tsx
 * const { subscription, isActive, subscribe, unsubscribe } = useSubscription({
 *   entityType: 'AgriSensor',
 *   notificationEndpoint: '/api/webhooks/subscription',
 *   onNotification: (data) => {
 *     console.log('Received update:', data);
 *   }
 * });
 * ```
 */
export function useSubscription(options: UseSubscriptionOptions): UseSubscriptionReturn {
  const {
    entityType,
    entityId,
    entityIdPattern,
    watchedAttributes,
    query,
    notificationEndpoint,
    notificationFormat = 'normalized',
    autoSubscribe = true,
    onNotification,
    expires,
    throttling,
    timeInterval,
  } = options;

  const [subscription, setSubscription] = useState<NGSISubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  
  const notificationHandlerRef = useRef(onNotification);

  // Update notification handler ref when it changes
  useEffect(() => {
    notificationHandlerRef.current = onNotification;
  }, [onNotification]);

  // ==========================================================================
  // Subscribe
  // ==========================================================================
  
  const subscribe = useCallback(async () => {
    if (!entityType && !entityId && !entityIdPattern) {
      setError('Entity type, ID, or ID pattern is required');
      return;
    }

    if (!notificationEndpoint) {
      setError('Notification endpoint is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const subscriptionPayload: Partial<NGSISubscription> = {
        type: 'Subscription',
        description: `Subscription for ${entityType || entityId || entityIdPattern}`,
        entities: [{
          ...(entityId && { id: entityId }),
          ...(entityIdPattern && { idPattern: entityIdPattern }),
          type: entityType || '*',
        }],
        ...(watchedAttributes && watchedAttributes.length > 0 && {
          watchedAttributes,
        }),
        ...(query && { q: query }),
        notification: {
          ...(watchedAttributes && watchedAttributes.length > 0 && {
            attributes: watchedAttributes,
          }),
          format: notificationFormat,
          endpoint: {
            uri: notificationEndpoint,
            accept: 'application/json',
          },
        },
        ...(expires && { expires }),
        ...(throttling && { throttling }),
        ...(timeInterval && { timeInterval }),
      };

      const created = await createSubscription(subscriptionPayload);
      setSubscription(created);
      setIsActive(created.status === 'active' || !created.status);
    } catch (err: any) {
      console.error('[useSubscription] Error creating subscription:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create subscription';
      setError(errorMessage);
      setSubscription(null);
      setIsActive(false);
    } finally {
      setIsLoading(false);
    }
  }, [
    entityType,
    entityId,
    entityIdPattern,
    watchedAttributes,
    query,
    notificationEndpoint,
    notificationFormat,
    expires,
    throttling,
    timeInterval,
  ]);

  // ==========================================================================
  // Update
  // ==========================================================================
  
  const update = useCallback(async (updates: Partial<NGSISubscription>) => {
    if (!subscription?.id) {
      setError('No active subscription to update');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateSubscription(subscription.id, updates);
      setSubscription(prev => prev ? { ...prev, ...updates } : null);
    } catch (err: any) {
      console.error('[useSubscription] Error updating subscription:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update subscription';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [subscription]);

  // ==========================================================================
  // Unsubscribe
  // ==========================================================================
  
  const unsubscribe = useCallback(async () => {
    if (!subscription?.id) {
      setError('No active subscription to delete');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deleteSubscription(subscription.id);
      setSubscription(null);
      setIsActive(false);
    } catch (err: any) {
      console.error('[useSubscription] Error deleting subscription:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete subscription';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [subscription]);

  // ==========================================================================
  // Refresh
  // ==========================================================================
  
  const refresh = useCallback(async () => {
    if (!subscription?.id) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const subscriptions = await getSubscriptions(entityType, entityId);
      const found = subscriptions.find(s => s.id === subscription.id);
      
      if (found) {
        setSubscription(found);
        setIsActive(found.status === 'active' || !found.status);
      } else {
        // Subscription may have been deleted externally
        setSubscription(null);
        setIsActive(false);
      }
    } catch (err: any) {
      console.error('[useSubscription] Error refreshing subscription:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to refresh subscription';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [subscription, entityType, entityId]);

  // ==========================================================================
  // Effects
  // ==========================================================================
  
  // Auto-subscribe on mount
  useEffect(() => {
    if (autoSubscribe) {
      subscribe();
    }

    // Cleanup on unmount
    return () => {
      // Optionally auto-unsubscribe on unmount (commented out to preserve subscription)
      // if (subscription?.id) {
      //   unsubscribe();
      // }
    };
  }, [autoSubscribe]); // Only run on mount/unmount

  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    subscription,
    isLoading,
    error,
    isActive,
    subscribe,
    update,
    unsubscribe,
    refresh,
  };
}

