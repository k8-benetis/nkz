// =============================================================================
// Local Addons Registry - Build-time Lazy Routes
// =============================================================================
// This registry maps addon IDs to their lazy-loaded components.
// Modules registered here are loaded at build-time (bundled with host).
//
// For EXTERNAL modules (future): RemoteModuleLoader will fall back to
// loading via remote_entry_url if the addon is not found here.
//
// HOW TO ADD A NEW LOCAL ADDON:
// 1. Create the addon in apps/ or packages/addons/
// 2. Add workspace dependency to apps/host/package.json (if external package)
// 3. Add lazy import entry below
// 4. Register in database with is_local = true

import { lazy, ComponentType } from 'react';

export interface LocalAddonEntry {
  component: React.LazyExoticComponent<ComponentType<any>>;
  // Optional: fallback component while loading
  fallback?: React.ReactNode;
}

/**
 * Registry of locally-bundled addons.
 * Key = module.id from database (marketplace_modules.id)
 */
export const localAddonRegistry: Record<string, LocalAddonEntry> = {
  // ==========================================================================
  // INTERNAL ADDON PAGES (from host/src/pages/)
  // These are platform features that can be enabled/disabled per tenant
  // Note: Using .then() to convert named exports to default exports
  //
  // NOTE: External addons (remote modules) are loaded remotely via
  // RemoteModuleLoader and should NOT be registered here. They are served
  // from the modules-server and loaded via Module Federation.
  // ==========================================================================

  // Weather - Real-time and forecast weather data
  'weather': {
    component: lazy(() =>
      import('@/pages/Weather').then(module => {
        if (!module || !module.Weather) {
          throw new Error('Weather component not found in module');
        }
        return { default: module.Weather };
      })
    ),
  },

  // NDVI module removed - replaced by external vegetation-prime module
  // 'ndvi': {
  //   component: lazy(() => import('@/pages/NDVI')),
  // },

  // Risks - Agricultural risk assessment
  'risks': {
    component: lazy(() =>
      import('@/pages/Risks').then(module => {
        if (!module || !module.Risks) {
          throw new Error('Risks component not found in module');
        }
        return { default: module.Risks };
      })
    ),
  },



  // Sensors - IoT sensor management
  'sensors': {
    component: lazy(() =>
      import('@/pages/Sensors').then(module => {
        if (!module || !module.Sensors) {
          throw new Error('Sensors component not found in module');
        }
        return { default: module.Sensors };
      })
    ),
  },

  // Robots (core) removed — replaced entirely by nkz-module-robotics (Zenoh/ROS2)
  // External module handles /robotics route. No internal addon registered.

  // Predictions - AI-powered predictions
  'predictions': {
    component: lazy(() =>
      import('@/pages/PredictionsPage').then(module => {
        if (!module || !module.PredictionsPage) {
          throw new Error('PredictionsPage component not found in module');
        }
        return { default: module.PredictionsPage };
      })
    ),
  },

  // Analytics - Advanced analytics dashboard (has default export)
  'analytics': {
    component: lazy(() => import('@/pages/GrafanaEmbedded')),
  },

};

/**
 * Check if an addon is available locally (bundled)
 */
export const isLocalAddon = (moduleId: string): boolean => {
  return moduleId in localAddonRegistry;
};

/**
 * Get a local addon component by ID
 */
export const getLocalAddon = (moduleId: string): LocalAddonEntry | null => {
  return localAddonRegistry[moduleId] || null;
};
