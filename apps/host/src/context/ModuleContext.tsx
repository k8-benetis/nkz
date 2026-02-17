// =============================================================================
// Module Context — Runtime Module Registry (IIFE Script Injection)
// =============================================================================
// Manages loading and state of modules for the tenant.
// Remote modules are loaded via <script> tags (IIFE bundles) that self-register
// through window.__NKZ__.register(). See utils/nkzRuntime.ts.

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
          if (contentType && contentType.includes('application/json')) {
            const manifest = await manifestResponse.json();
            localModules = (manifest.modules || []).map((m: any) => ({
              ...m,
              isLocal: true,
            }));
          }
        }
      } catch {
        // Manifest is optional — modules come from backend
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
      } catch (remoteError) {
        console.warn('[ModuleContext] Failed to load remote modules:', remoteError);
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
      } catch {
        // Local module registry not available
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

      // =============================================================================
      // Load IIFE bundles for remote modules
      // =============================================================================
      // Instead of Module Federation dynamic imports, we inject <script> tags.
      // Each script is an IIFE that calls window.__NKZ__.register({ id, viewerSlots }).
      // We subscribe to registration events to update module state reactively.

      // Subscribe to runtime registrations BEFORE loading scripts
      // so we catch modules that register synchronously on script load.
      // Unsubscribe is intentionally not called — listener stays active for
      // the entire lifecycle so late-registering modules work.
      window.__NKZ__?.onRegister((registeredId, registration) => {
        const existingModule = moduleMap.get(registeredId);
        if (existingModule) {
          if (registration.viewerSlots) {
            existingModule.viewerSlots = registration.viewerSlots;
          }
          setModules(prevModules =>
            prevModules.map(m =>
              m.id === registeredId
                ? { ...m, viewerSlots: registration.viewerSlots || m.viewerSlots }
                : m
            )
          );
        }
      });

      // Load scripts for remote modules that have a bundle URL
      const { loadModuleScripts } = await import('@/utils/moduleLoader');
      const modulesToLoad = remoteModules
        .filter(m => m.remoteEntry && !m.isLocal)
        .map(m => ({ id: m.id, bundleUrl: m.remoteEntry! }));

      if (modulesToLoad.length > 0) {
        const results = await loadModuleScripts(modulesToLoad);
        results.forEach(r => {
          if (!r.success) {
            console.warn(`[ModuleContext] Failed to load module "${r.id}":`, r.error?.message);
          }
        });
      }

      // Also check if any modules were registered before we subscribed
      // (e.g., if scripts were cached and executed instantly)
      if (window.__NKZ__) {
        window.__NKZ__.getRegisteredIds().forEach(registeredId => {
          const reg = window.__NKZ__.getRegistered(registeredId);
          const mod = moduleMap.get(registeredId);
          if (reg && mod && !mod.viewerSlots && reg.viewerSlots) {
            mod.viewerSlots = reg.viewerSlots;
          }
        });
      }

      setModules(Array.from(moduleMap.values()));
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

