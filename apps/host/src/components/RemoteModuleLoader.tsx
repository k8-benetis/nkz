// =============================================================================
// Module Loader - Hybrid Local/Remote Module Loading
// =============================================================================
// Loads addon modules using a two-tier strategy:
// 1. LOCAL: Checks localAddonRegistry for bundled modules (lazy routes)
// 2. REMOTE: Falls back to IIFE modules registered via window.__NKZ__
//
// Module Federation was removed (2026-02-17). All remote modules are now IIFE
// bundles that self-register via window.__NKZ__.register(). The <script> tags
// are injected by ModuleContext via moduleLoader.ts — by the time this component
// renders, the module should already be registered in the runtime.

import React, { Suspense, ComponentType, ErrorInfo } from 'react';
import { ModuleDefinition } from '@/context/ModuleContext';
import { isLocalAddon, getLocalAddon } from '@/config/localAddons';

interface RemoteModuleLoaderProps {
  module: ModuleDefinition;
  fallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
}

// =============================================================================
// Error Boundary
// =============================================================================

class RemoteModuleErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: (error: Error) => React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RemoteModuleLoader] Module render error:', error.message, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-800 font-semibold">Error loading module</h3>
          <p className="text-red-600 text-sm mt-1">
            {this.state.error.message || 'Failed to load remote module'}
          </p>
          <details className="mt-2">
            <summary className="text-xs text-gray-600 cursor-pointer">Stack trace</summary>
            <pre className="text-xs text-gray-500 mt-1 overflow-auto max-h-40">
              {this.state.error.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Loading Fallback
// =============================================================================

const DefaultLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading module...</p>
    </div>
  </div>
);

// =============================================================================
// IIFE Module Loading
// =============================================================================

/**
 * Load a remote container from the NKZ runtime registry.
 * IIFE modules register via window.__NKZ__.register() when their <script>
 * tag executes (handled by moduleLoader.ts). This function provides a
 * container-compatible interface for retrieving registered modules.
 *
 * Exported for SlotRenderer compatibility.
 */
export const loadRemoteContainer = async (remoteEntryUrl: string): Promise<any> => {
  // Ensure window globals are available
  if (!window.React || !window.ReactDOM) {
    const missing = [];
    if (!window.React) missing.push('React');
    if (!window.ReactDOM) missing.push('ReactDOM');
    throw new Error(`[RemoteModuleLoader] window.${missing.join(', window.')} not available. Ensure main.tsx exposes globals.`);
  }

  return {
    get: (moduleName: string) => {
      return Promise.resolve(() => {
        const id = moduleName.startsWith('./') ? moduleName.substring(2) : moduleName;
        const registered = window.__NKZ__?.getRegistered(id) || window.__NKZ__?.getRegistered(moduleName);

        if (!registered) {
          console.error(`[RemoteModuleLoader] Module "${id}" not found in registry. Available:`, window.__NKZ__?.getRegisteredIds());
          return undefined;
        }
        return registered;
      });
    },
    init: () => { /* no-op for IIFE modules */ }
  };
};

/**
 * Load a module component from the NKZ runtime registry.
 * Exported for SlotRenderer compatibility.
 */
export const loadRemoteModule = async (
  moduleName: string,
  _remoteEntryUrl: string
): Promise<any> => {
  // Direct registry lookup by ID (preferred for IIFE)
  // moduleName is often "./App" (legacy) or the module ID
  const possibleIds = [
    moduleName,
    moduleName.replace('./', ''),
    // If we can't find it by name, we might need to rely on the module ID passed in props
  ];

  let registered: any = undefined;
  for (const id of possibleIds) {
    if (window.__NKZ__?.getRegistered(id)) {
      registered = window.__NKZ__.getRegistered(id);
      break;
    }
  }

  // If found in registry
  if (registered) {
    // If the module has a 'main' component registered, use it
    if (registered.main) {
      return registered.main;
    }

    // If it's a valid module but has no main component (e.g. only slots),
    // return a placeholder instead of crashing
    console.warn(`[RemoteModuleLoader] Module "${registered.id}" found but has no 'main' component. Returning fallback.`);
    return () => (
      <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Module Active: {registered.id}</h3>
        <p className="text-gray-500">This module is active and has registered its widgets.</p>
        <p className="text-gray-400 text-sm mt-2">No main view component provided.</p>
      </div>
    );
  }

  // Fallback to legacy container loading (rarely used now)
  const container = await loadRemoteContainer(_remoteEntryUrl);
  const factory = await container.get(moduleName);

  if (!factory) {
    // Last ditch effort: check registry one more time in case script loaded
    // and registered with an ID we didn't guess
    const ids = window.__NKZ__?.getRegisteredIds() || [];
    // Try to find a loose match
    const match = ids.find(id => _remoteEntryUrl.includes(id) || moduleName.includes(id));
    if (match) {
      const reg = window.__NKZ__?.getRegistered(match);
      if (reg?.main) return reg.main;
    }

    throw new Error(`Module "${moduleName}" not found in remote entry or registry.`);
  }

  const module = typeof factory === 'function' ? factory() : factory;

  if (!module) {
    throw new Error(`Factory returned null for module "${moduleName}"`);
  }

  // Handle different export formats
  if (module.default) return module.default;
  if (typeof module === 'function') return module;

  if (module && typeof module === 'object' && !Array.isArray(module)) {
    const keys = Object.keys(module);
    const componentKey = keys.find(key => typeof module[key] === 'function');
    if (componentKey) return module[componentKey];
    if (keys.length > 0) return module[keys[0]];
  }

  return module;
};

// =============================================================================
// Module Loader Component
// =============================================================================

/**
 * Hybrid loader supporting both local (bundled) and remote IIFE modules:
 * 1. First checks localAddonRegistry for bundled modules (fast, no network)
 * 2. Falls back to IIFE modules registered in window.__NKZ__
 */
export const RemoteModuleLoader: React.FC<RemoteModuleLoaderProps> = ({
  module,
  fallback = <DefaultLoadingFallback />,
  errorFallback,
}) => {
  const [Component, setComponent] = React.useState<ComponentType<any> | React.LazyExoticComponent<ComponentType<any>> | null>(null);
  const [loadError, setLoadError] = React.useState<Error | null>(null);
  const [isLocal, setIsLocal] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;

    const loadModule = async () => {
      try {
        // STRATEGY 1: Check local registry (bundled modules)
        const shouldLoadLocal = module.isLocal || isLocalAddon(module.id);

        if (shouldLoadLocal && isLocalAddon(module.id)) {
          const localAddon = getLocalAddon(module.id);

          if (localAddon && isMounted) {
            setIsLocal(true);
            setComponent(() => localAddon.component);
            return;
          }
        }

        // STRATEGY 2: Remote IIFE module (registered via window.__NKZ__)
        if (!module.remoteEntry) {
          throw new Error(`Module ${module.id} not found in local registry and has no remote entry URL. ` +
            `Ensure it's registered in localAddons.ts or has a valid remote_entry_url in the database.`);
        }

        const remoteEntryUrl = module.remoteEntry.startsWith('http')
          ? module.remoteEntry
          : `${window.location.origin}${module.remoteEntry}`;

        const remoteModule = await loadRemoteModule(
          module.id || module.module || './App', // Prefer ID for IIFE lookup
          remoteEntryUrl
        );

        if (isMounted) {
          let RemoteComponent = null;

          if (typeof remoteModule === 'function') {
            RemoteComponent = remoteModule;
          } else if (remoteModule?.default) {
            RemoteComponent = remoteModule.default;
          } else if (remoteModule && typeof remoteModule === 'object') {
            const moduleName = module.module?.replace('./', '') || 'App';
            if (remoteModule[moduleName]) {
              RemoteComponent = remoteModule[moduleName];
            } else {
              const keys = Object.keys(remoteModule);
              const firstComponent = keys.find(key => typeof remoteModule[key] === 'function');
              RemoteComponent = firstComponent ? remoteModule[firstComponent] : remoteModule;
            }
          }

          if (!RemoteComponent || typeof RemoteComponent !== 'function') {
            throw new Error(`Module ${module.module || module.id} does not export a valid React component. Got: ${typeof remoteModule}`);
          }

          setComponent(() => RemoteComponent);
        }
      } catch (error) {
        console.error(`[RemoteModuleLoader] Failed to load module ${module.id}:`, error);
        if (isMounted) {
          setLoadError(error instanceof Error ? error : new Error('Unknown error loading module'));
        }
      }
    };

    loadModule();

    return () => {
      isMounted = false;
    };
  }, [module]);

  if (loadError) {
    if (errorFallback) {
      return <>{errorFallback(loadError)}</>;
    }
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <h3 className="text-red-800 font-semibold">Error loading module: {module.displayName}</h3>
        <p className="text-red-600 text-sm mt-1">{loadError.message}</p>
        {!isLocal && module.remoteEntry && (
          <p className="text-gray-500 text-xs mt-2">
            Remote Entry: {module.remoteEntry}
          </p>
        )}
        <details className="mt-2">
          <summary className="text-xs text-gray-600 cursor-pointer">Stack trace</summary>
          <pre className="text-xs text-gray-500 mt-1 overflow-auto max-h-40">
            {loadError.stack || 'No stack trace available'}
          </pre>
        </details>
      </div>
    );
  }

  if (!Component) {
    return <>{fallback}</>;
  }

  return (
    <div
      className="remote-module-container"
      data-module-id={module.id}
      style={{
        isolation: 'isolate',
        contain: 'layout style paint',
        position: 'relative',
        display: 'block',
      }}
    >
      <RemoteModuleErrorBoundary fallback={errorFallback}>
        <Suspense fallback={fallback}>
          <Component />
        </Suspense>
      </RemoteModuleErrorBoundary>
    </div>
  );
};
