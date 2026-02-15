// =============================================================================
// Module Context - Dynamic Module Federation Registry
// =============================================================================
// Manages loading and state of remote modules for the tenant.
// Fetches module list from backend and provides hooks for components to access.

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { NekazariClient } from '@nekazari/sdk';
import { useAuth } from '@/context/KeycloakAuthContext';
import { getConfig } from '@/config/environment';

// =============================================================================
// Slot System Types
// =============================================================================

/** Available slot types in the Unified Viewer and Dashboard */
export type SlotType =
  | 'entity-tree'       // Left panel: entity tree, filters
  | 'map-layer'         // Map overlays, markers, layers
  | 'context-panel'     // Right panel: entity details, controls
  | 'bottom-panel'      // Bottom panel: timeline, charts
  | 'layer-toggle'      // Layer manager toggles
  | 'dashboard-widget'; // Dashboard: module-contributed cards

/** Definition of a widget that can be rendered in a slot */
export interface SlotWidgetDefinition {
  /** Unique identifier for this widget */
  id: string;
  /** 
   * Module ID that owns this widget. Used by SlotRenderer to:
   * - Group widgets from the same module
   * - Apply the module's shared provider (for React Context)
   * - Handle errors per-module
   * 
   * REQUIRED for remote modules. If not provided, SlotRenderer will
   * attempt to infer it from the widget ID (legacy fallback).
   */
  moduleId?: string;
  /** Component name exported by the module (for remote loading) */
  component: string;
  /** Render priority (lower = rendered first) */
  priority: number;
  /** Optional: Only show when conditions are met */
  showWhen?: {
    /** Show only when selected entity is one of these types */
    entityType?: string[];
    /** Show only when one of these layers is active */
    layerActive?: string[];
  };
  /** Default props passed to the widget */
  defaultProps?: Record<string, any>;
  /** For local (bundled) widgets: the actual React component */
  localComponent?: React.ComponentType<any>;
}

/** Slots configuration for a module */
export interface ModuleViewerSlots {
  'entity-tree'?: SlotWidgetDefinition[];
  'map-layer'?: SlotWidgetDefinition[];
  'context-panel'?: SlotWidgetDefinition[];
  'bottom-panel'?: SlotWidgetDefinition[];
  'layer-toggle'?: SlotWidgetDefinition[];
  'dashboard-widget'?: SlotWidgetDefinition[];
  /** Optional module provider for remote modules that use React Context.
   * When multiple widgets from the same module are rendered, they will share
   * a single instance of this provider. Local modules don't need this as they're
   * already in the host bundle. */
  moduleProvider?: React.ComponentType<{ children: React.ReactNode }>;
}

// =============================================================================
// Module Definition
// =============================================================================

export interface ModuleDefinition {
  id: string;
  name: string;
  displayName: string;
  version: string;
  routePath: string;
  label: string;
  // Local modules (bundled) - these fields are optional
  isLocal?: boolean;
  // Remote modules - required if isLocal is false
  remoteEntry?: string;
  scope?: string;
  module?: string;
  // Optional metadata
  icon?: string;
  metadata?: Record<string, any>;
  tenantConfig?: Record<string, any>;
  navigationItems?: Array<{
    path: string;
    label: string;
    icon?: string;
    roles?: string[];
    adminOnly?: boolean;
  }>;
  // Slot system: widgets that this module contributes to the unified viewer
  viewerSlots?: ModuleViewerSlots;
}

/**
 * Validates and sanitizes a module definition to prevent sidebar crashes.
 * Returns null if the module is invalid.
 */
const validateAndSanitizeModule = (module: any): ModuleDefinition | null => {
  // Must be an object
  if (!module || typeof module !== 'object') {
    console.warn('[ModuleContext] Invalid module: not an object', module);
    return null;
  }

  // Required fields must be strings
  const id = typeof module.id === 'string' ? module.id.trim() : '';
  const routePath = typeof module.routePath === 'string' ? module.routePath.trim() : '';

  if (!id) {
    console.warn('[ModuleContext] Invalid module: missing id', module);
    return null;
  }

  if (!routePath) {
    console.warn('[ModuleContext] Invalid module: missing routePath for module', id);
    return null;
  }

  // Sanitize and provide defaults for optional fields
  return {
    id,
    routePath,
    name: typeof module.name === 'string' ? module.name : id,
    displayName: typeof module.displayName === 'string' ? module.displayName : (module.name || id),
    version: typeof module.version === 'string' ? module.version : '1.0.0',
    label: typeof module.label === 'string' ? module.label : (module.displayName || module.name || id),
    isLocal: Boolean(module.isLocal),
    remoteEntry: typeof module.remoteEntry === 'string' ? module.remoteEntry : undefined,
    scope: typeof module.scope === 'string' ? module.scope : undefined,
    module: typeof module.module === 'string' ? module.module : undefined,
    icon: typeof module.icon === 'string' ? module.icon : undefined,
    metadata: module.metadata && typeof module.metadata === 'object' ? module.metadata : undefined,
    tenantConfig: module.tenantConfig && typeof module.tenantConfig === 'object' ? module.tenantConfig : undefined,
    navigationItems: Array.isArray(module.navigationItems) ? module.navigationItems : undefined,
    viewerSlots: module.viewerSlots && typeof module.viewerSlots === 'object' ? module.viewerSlots : undefined,
  };
};


interface ModuleContextType {
  modules: ModuleDefinition[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  getModuleById: (id: string) => ModuleDefinition | undefined;
  getModuleByRoute: (path: string) => ModuleDefinition | undefined;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

interface ModuleProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

export const ModuleProvider: React.FC<ModuleProviderProps> = ({
  children,
  apiBaseUrl
}) => {
  // Use config API base URL if not explicitly provided
  const effectiveApiBaseUrl = apiBaseUrl || getConfig().api.baseUrl || '/api';
  const { isAuthenticated, getToken, tenantId } = useAuth();
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadModules = useCallback(async () => {
    if (!isAuthenticated || !tenantId) {
      setModules([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load local modules from manifest first
      // NOTE: This file may not exist in production (modules come from backend)
      // If it fails, we silently continue - remote modules will be loaded from backend
      let localModules: ModuleDefinition[] = [];
      try {
        const manifestResponse = await fetch('/modules-manifest.json', {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        if (manifestResponse.ok) {
          const contentType = manifestResponse.headers.get('content-type');
          // Verify we're getting JSON, not HTML (SPA fallback)
          if (contentType && contentType.includes('application/json')) {
            const manifest = await manifestResponse.json();
            localModules = (manifest.modules || []).map((m: any) => ({
              ...m,
              isLocal: true,
            }));
            console.log('[ModuleContext] Loaded local modules from manifest:', localModules.length);
          } else {
            // Server returned HTML (SPA fallback) - manifest doesn't exist, skip silently
            console.debug('[ModuleContext] Manifest not found (returned HTML), skipping local manifest');
          }
        } else if (manifestResponse.status === 404) {
          // Manifest doesn't exist - this is normal in production
          console.debug('[ModuleContext] Manifest not found (404), skipping local manifest');
        } else {
          console.warn('[ModuleContext] Manifest request failed:', manifestResponse.status, manifestResponse.statusText);
        }
      } catch (manifestError) {
        // Silently ignore - manifest is optional, modules come from backend
        console.debug('[ModuleContext] Could not load local manifest (this is normal):', manifestError);
      }

      // Load remote modules from backend
      let remoteModules: ModuleDefinition[] = [];
      try {
        const client = new NekazariClient({
          baseUrl: effectiveApiBaseUrl,
          getToken: getToken,
          getTenantId: () => tenantId,
        });
        const data = await client.get<ModuleDefinition[]>('/api/modules/me');
        remoteModules = Array.isArray(data) ? data : [];
        console.log('[ModuleContext] Loaded remote modules:', remoteModules.length);
      } catch (remoteError) {
        console.warn('[ModuleContext] Could not load remote modules:', remoteError);
      }

      // Merge modules - for local modules, use local definition (which has viewerSlots)
      // Remote modules override local only if they're not local modules
      const moduleMap = new Map<string, ModuleDefinition>();

      // First add local modules from registry (these have viewerSlots)
      try {
        const { LOCAL_MODULE_REGISTRY } = await import('@/modules/registry');
        Object.values(LOCAL_MODULE_REGISTRY).forEach(m => {
          moduleMap.set(m.id, m);
        });
        console.log('[ModuleContext] Loaded local modules from registry:', Object.keys(LOCAL_MODULE_REGISTRY).length);
      } catch (e) {
        console.warn('[ModuleContext] Could not load local modules from registry:', e);
      }

      // Then add local modules from manifest (if any)
      localModules.forEach(m => {
        // Only add if not already in map (registry takes precedence)
        if (!moduleMap.has(m.id)) {
          moduleMap.set(m.id, m);
        }
      });

      // Finally add remote modules (but don't override local modules that have viewerSlots)
      // Validate each module before adding to prevent sidebar crashes
      remoteModules.forEach(rawModule => {
        // Validate and sanitize the module
        const m = validateAndSanitizeModule(rawModule);
        if (!m) {
          console.warn('[ModuleContext] Skipping invalid remote module:', rawModule);
          return; // Skip invalid modules
        }

        const existing = moduleMap.get(m.id);
        // If it's a local module with viewerSlots, keep the local version
        if (existing?.isLocal && existing?.viewerSlots) {
          // Merge remote metadata but keep local viewerSlots
          moduleMap.set(m.id, {
            ...existing,
            ...m,
            viewerSlots: existing.viewerSlots, // Keep local viewerSlots
          });
        } else {
          // For remote modules or local modules without slots, use remote version
          moduleMap.set(m.id, m);
        }
      });

      // Load viewerSlots from remote modules asynchronously
      const loadRemoteViewerSlots = async (module: ModuleDefinition) => {
        if (!module.remoteEntry || module.viewerSlots) {
          return; // Skip if no remoteEntry or already has viewerSlots
        }

        try {
          const remoteEntryUrl = module.remoteEntry.startsWith('http')
            ? module.remoteEntry
            : `${window.location.origin}${module.remoteEntry}`;

          console.log(`[ModuleContext] Loading viewerSlots from ${module.id} at ${remoteEntryUrl}`);

          // Load remote container
          const container = await import(/* @vite-ignore */ remoteEntryUrl);

          if (!container || !container.get) {
            console.warn(`[ModuleContext] Remote entry for ${module.id} does not export 'get' function`);
            return;
          }

          // Get viewerSlots export - container.get() may return a function OR a Promise
          let result: any = container.get('./viewerSlots');
          if (!result) {
            console.warn(`[ModuleContext] Module ${module.id} does not expose './viewerSlots'`);
            return;
          }

          console.log(`[ModuleContext] Step 0 - container.get for ${module.id}:`, typeof result);

          // Unwrap the factory/promise chain fully
          // Pattern can be: function → Promise → function → module
          // Or: Promise → function → module
          // Keep unwrapping until we get an object (the actual module)
          let iterations = 0;
          const maxIterations = 5; // Safety limit

          while (iterations < maxIterations) {
            iterations++;

            // If it's a function, call it
            if (typeof result === 'function') {
              result = result();
              console.log(`[ModuleContext] Step ${iterations}a - Called function for ${module.id}:`, typeof result);
            }

            // If it's a Promise, await it
            if (result && typeof result.then === 'function') {
              result = await result;
              console.log(`[ModuleContext] Step ${iterations}b - Awaited promise for ${module.id}:`, typeof result);
            }

            // If result is now an object (not a function or promise), we're done
            if (typeof result === 'object' && result !== null && typeof result.then !== 'function') {
              break;
            }
          }

          let viewerSlots = result;
          console.log(`[ModuleContext] Final result for ${module.id}:`, typeof viewerSlots, viewerSlots ? Object.keys(viewerSlots) : 'null');

          // Extract viewerSlots from result - handle both { viewerSlots: {...} } and direct export
          if (viewerSlots?.viewerSlots) {
            console.log(`[ModuleContext] Extracting nested viewerSlots for ${module.id}`);
            viewerSlots = viewerSlots.viewerSlots;
          } else if (viewerSlots?.default?.viewerSlots) {
            console.log(`[ModuleContext] Extracting from default.viewerSlots for ${module.id}`);
            viewerSlots = viewerSlots.default.viewerSlots;
          } else if (viewerSlots?.default && typeof viewerSlots.default === 'object') {
            console.log(`[ModuleContext] Extracting from default for ${module.id}`);
            viewerSlots = viewerSlots.default;
          }

          if (viewerSlots && typeof viewerSlots === 'object') {
            // Update module with viewerSlots
            const updatedModule = moduleMap.get(module.id);
            if (updatedModule) {
              updatedModule.viewerSlots = viewerSlots as ModuleViewerSlots;
              // Use functional update to avoid unnecessary re-renders
              setModules(prevModules => {
                const updated = prevModules.map(m =>
                  m.id === module.id ? { ...m, viewerSlots: viewerSlots as ModuleViewerSlots } : m
                );
                return updated;
              });
              console.log(`[ModuleContext] ✅ Loaded viewerSlots for ${module.id}:`, Object.keys(viewerSlots));
            }
          } else {
            console.warn(`[ModuleContext] Invalid viewerSlots format for ${module.id}:`, viewerSlots);
          }
        } catch (err) {
          console.warn(`[ModuleContext] Could not load viewerSlots from ${module.id}:`, err);
        }
      };

      // Load viewerSlots for all remote modules in parallel (non-blocking)
      remoteModules
        .filter(m => m.remoteEntry && !m.viewerSlots)
        .forEach(m => {
          loadRemoteViewerSlots(m).catch(err => {
            console.error(`[ModuleContext] Error loading viewerSlots for ${m.id}:`, err);
          });
        });

      const allModules = Array.from(moduleMap.values());
      console.log('[ModuleContext] Total modules:', allModules.length);
      // Log all modules for debugging
      allModules.forEach(m => {
        console.log(`[ModuleContext] Module loaded: ${m.id}, routePath: ${m.routePath}, remoteEntry: ${m.remoteEntry || 'N/A'}, isLocal: ${m.isLocal}`);
        if (m.viewerSlots) {
          console.log(`[ModuleContext] Module ${m.id} has slots:`, Object.keys(m.viewerSlots));
        }
      });
      setModules(allModules);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load modules');
      console.error('[ModuleContext] Error loading modules:', error);
      setError(error);
      setModules([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, tenantId, getToken, effectiveApiBaseUrl]);

  // Load modules when authenticated or tenant changes
  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const getModuleById = useCallback((id: string): ModuleDefinition | undefined => {
    return modules.find(m => m.id === id);
  }, [modules]);

  const getModuleByRoute = useCallback((path: string): ModuleDefinition | undefined => {
    return modules.find(m => m.routePath === path || path.startsWith(m.routePath));
  }, [modules]);

  const value: ModuleContextType = {
    modules,
    isLoading,
    error,
    refresh: loadModules,
    getModuleById,
    getModuleByRoute,
  };

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
};

export const useModules = (): ModuleContextType => {
  const context = useContext(ModuleContext);
  if (context === undefined) {
    throw new Error('useModules must be used within a ModuleProvider');
  }
  return context;
};

