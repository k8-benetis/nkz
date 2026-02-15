// =============================================================================
// Module Loader - Hybrid Local/Remote Module Loading
// =============================================================================
// Loads addon modules using a two-tier strategy:
// 1. LOCAL: Checks localAddonRegistry for bundled modules (lazy routes)
// 2. REMOTE: Falls back to remote loading via URL (for external modules)
//
// This allows internal addons to be bundled for performance while
// supporting external developers who want to host their own modules.

import React, { Suspense, ComponentType, ErrorInfo } from 'react';
import { ModuleDefinition } from '@/context/ModuleContext';
import { isLocalAddon, getLocalAddon } from '@/config/localAddons';

// Extend window to include federation globals (for remote modules)
declare global {
  interface Window {
    [key: string]: any;
  }
}

interface RemoteModuleLoaderProps {
  module: ModuleDefinition;
  fallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
}

/**
 * Error Boundary for remote modules
 */
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
    console.error('[RemoteModuleLoader] ❌ ERROR IN REMOTE MODULE:', error);
    console.error('[RemoteModuleLoader] Error message:', error.message);
    console.error('[RemoteModuleLoader] Error stack:', error.stack);
    console.error('[RemoteModuleLoader] Error info:', errorInfo);
    console.error('[RemoteModuleLoader] Component stack:', errorInfo.componentStack);
    console.error('[RemoteModuleLoader] Window globals available:', {
      React: typeof window.React,
      ReactDOM: typeof window.ReactDOM,
      ReactRouterDOM: typeof window.ReactRouterDOM,
    });
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
          {this.state.error.stack && (
            <details className="mt-2">
              <summary className="text-xs text-gray-600 cursor-pointer">Stack trace</summary>
              <pre className="text-xs text-gray-500 mt-1 overflow-auto max-h-40">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Default loading fallback
 */
const DefaultLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading module...</p>
    </div>
  </div>
);

// Cache for loaded remote containers (vite-plugin-federation uses ES modules)
const remoteContainerCache: Record<string, Promise<any>> = {};

/**
 * Load a remote container using dynamic ES module import.
 * Exported for SlotRenderer to load remote slot widgets by component name.
 * vite-plugin-federation exports { get, init } from remoteEntry.js
 */
export const loadRemoteContainer = async (remoteEntryUrl: string): Promise<any> => {
  if (remoteContainerCache[remoteEntryUrl]) {
    return remoteContainerCache[remoteEntryUrl];
  }

  remoteContainerCache[remoteEntryUrl] = (async () => {
    console.log(`[RemoteModuleLoader] ⚡ Importing remote entry: ${remoteEntryUrl}`);
    
    // CRITICAL: Populate globalThis.__federation_shared__ BEFORE importing the remote entry
    // This ensures that when the remote module's importShared() is called, the shared modules are already available
    // This is required when remote modules use import: false in their vite.config.ts shared configuration
    
    // Force ensure window globals are available (they should be set in main.tsx before any module loading)
    if (typeof window === 'undefined') {
      throw new Error('[RemoteModuleLoader] window is undefined - cannot load remote modules');
    }
    
    // Wait a tick to ensure window.React is set (if main.tsx hasn't run yet)
    if (!window.React || !window.ReactDOM || !window.ReactRouterDOM) {
      console.warn('[RemoteModuleLoader] ⚠️ window.React/ReactDOM/ReactRouterDOM not immediately available, waiting...');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!window.React || !window.ReactDOM || !window.ReactRouterDOM) {
      const missing = [];
      if (!window.React) missing.push('React');
      if (!window.ReactDOM) missing.push('ReactDOM');
      if (!window.ReactRouterDOM) missing.push('ReactRouterDOM');
      throw new Error(`[RemoteModuleLoader] ❌ Cannot load module: window.${missing.join(', window.')} not available. Ensure main.tsx exposes React globals.`);
    }
    
    console.log('[RemoteModuleLoader] ✅ Window globals available, populating globalThis.__federation_shared__');
    
    // Initialize globalThis.__federation_shared__ structure
    if (!globalThis.__federation_shared__) {
      globalThis.__federation_shared__ = {};
    }
    const scope = 'default';
    if (!globalThis.__federation_shared__[scope]) {
      globalThis.__federation_shared__[scope] = {};
    }
    
    // Store React shared modules in the format expected by vite-plugin-federation
    // Format: globalThis.__federation_shared__[scope][name][version] = { get: () => Promise<() => module> }
    // When importShared('react') is called, it does: await (await versionValue.get())()
    // So get() must return Promise<() => module>, where calling the returned function returns the actual module
    globalThis.__federation_shared__[scope]['react'] = {
      '18.3.1': {
        get: () => {
          console.log('[RemoteModuleLoader] 🔄 get() called for react');
          return Promise.resolve(() => {
            console.log('[RemoteModuleLoader] ✅ Returning window.React');
            return window.React;
          });
        },
      },
    };
    
    globalThis.__federation_shared__[scope]['react-dom'] = {
      '18.3.1': {
        get: () => Promise.resolve(() => window.ReactDOM),
      },
    };
    
    globalThis.__federation_shared__[scope]['react-router-dom'] = {
      '6.26.0': {
        get: () => Promise.resolve(() => window.ReactRouterDOM),
      },
    };
    
    console.log('[RemoteModuleLoader] ✅ Shared modules stored:', Object.keys(globalThis.__federation_shared__[scope]));
    console.log('[RemoteModuleLoader] 🔍 Verification:', {
      react: !!globalThis.__federation_shared__[scope]['react'],
      'react-dom': !!globalThis.__federation_shared__[scope]['react-dom'],
      'react-router-dom': !!globalThis.__federation_shared__[scope]['react-router-dom'],
    });
    
    // Dynamic import of the ES module remoteEntry
    const container = await import(/* @vite-ignore */ remoteEntryUrl);
    
    if (!container || !container.get) {
      throw new Error(`Remote entry does not export 'get' function: ${remoteEntryUrl}`);
    }

    // Also call container.init() if it exists, in case the remote entry expects it
    if (container.init && typeof container.init === 'function') {
      try {
        await container.init({});
        console.log('[RemoteModuleLoader] Container init() called');
      } catch (e: any) {
        // Container might already be initialized, ignore error
        console.warn('[RemoteModuleLoader] Container init() warning:', e.message);
      }
    }

    return container;
  })();

  return remoteContainerCache[remoteEntryUrl];
};

/**
 * Load a module from a remote container.
 * Exported for SlotRenderer to load remote slot widgets by component path.
 * Handles vite-plugin-federation format.
 */
export const loadRemoteModule = async (
  moduleName: string,
  remoteEntryUrl: string
): Promise<any> => {
  const container = await loadRemoteContainer(remoteEntryUrl);
  
  console.log(`[RemoteModuleLoader] Getting module: ${moduleName} from ${remoteEntryUrl}`);
  
  // Get the module factory using vite-plugin-federation's get() function
  const factory = await container.get(moduleName);
  if (!factory) {
    throw new Error(`Module '${moduleName}' not found in remote entry. Available modules: ${Object.keys(container || {})}`);
  }

  console.log(`[RemoteModuleLoader] Factory type:`, typeof factory);
  console.log(`[RemoteModuleLoader] Factory:`, factory);
  
  // vite-plugin-federation can return different formats:
  // 1. Direct component: factory() returns the component
  // 2. Wrapped component: factory() returns { default: Component }
  // 3. Module object: factory() returns { ComponentName: Component }
  // 4. Promise: factory() returns a Promise that resolves to the module
  
  let module = null;
  
  if (typeof factory === 'function') {
    let result = factory();
    
    // Handle Promise if factory returns one
    if (result && typeof result.then === 'function') {
      console.log(`[RemoteModuleLoader] Factory returned a Promise, awaiting...`);
      result = await result;
    }
    
    console.log(`[RemoteModuleLoader] Factory result type:`, typeof result);
    console.log(`[RemoteModuleLoader] Factory result:`, result);
    console.log(`[RemoteModuleLoader] Factory result keys:`, result && typeof result === 'object' && !Array.isArray(result) ? Object.keys(result) : 'N/A');
    
    // Handle different return formats
    if (!result) {
      throw new Error(`Factory returned null or undefined for module '${moduleName}'`);
    }
    
    if (result.default) {
      // Format: { default: Component }
      module = result.default;
      console.log(`[RemoteModuleLoader] Using default export`);
    } else if (typeof result === 'function') {
      // Format: Direct component function
      module = result;
      console.log(`[RemoteModuleLoader] Using direct function export`);
    } else if (result && typeof result === 'object' && !Array.isArray(result)) {
      // Format: { ComponentName: Component } - try to find the component
      const keys = Object.keys(result);
      console.log(`[RemoteModuleLoader] Object with keys:`, keys);
      
      if (keys.length > 0) {
        // Try to find a function/component in the object
        const componentKey = keys.find(key => typeof result[key] === 'function');
        if (componentKey) {
          module = result[componentKey];
          console.log(`[RemoteModuleLoader] Using component from key: ${componentKey}`);
        } else {
          // Use the first value if no function found
          module = result[keys[0]];
          console.log(`[RemoteModuleLoader] Using first value from key: ${keys[0]}`);
        }
      } else {
        throw new Error(`Factory returned empty object for module '${moduleName}'`);
      }
    } else {
      // Last resort: use result directly
      module = result;
      console.log(`[RemoteModuleLoader] Using result directly`);
    }
  } else {
    // Factory is not a function, use it directly
    module = factory;
    console.log(`[RemoteModuleLoader] Factory is not a function, using directly`);
  }
  
  console.log(`[RemoteModuleLoader] Final module type:`, typeof module);
  console.log(`[RemoteModuleLoader] Final module:`, module);
  console.log(`[RemoteModuleLoader] Module is React component:`, module && typeof module === 'function');
  
  if (!module) {
    throw new Error(`Failed to extract component from module '${moduleName}'. Factory returned: ${factory}`);
  }
  
  if (typeof module !== 'function') {
    throw new Error(`Module '${moduleName}' does not export a React component. Got type: ${typeof module}, value: ${module}`);
  }
  
  return module;
};

/**
 * Module Loader Component
 * 
 * Hybrid loader that supports both local (bundled) and remote modules:
 * 1. First checks if module is in localAddonRegistry (fast, no network)
 * 2. Falls back to remote loading via URL (for external modules)
 * 
 * This design allows:
 * - Internal addons: Bundled with host for best performance
 * - External addons: Loaded via URL for third-party developers
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
        console.log(`[ModuleLoader] Loading module: ${module.id}, isLocal: ${module.isLocal}`);

        // STRATEGY 1: Check local registry (bundled modules)
        // Prioritize: module.isLocal from DB, or check localAddonRegistry
        const shouldLoadLocal = module.isLocal || isLocalAddon(module.id);
        
        if (shouldLoadLocal && isLocalAddon(module.id)) {
          console.log(`[ModuleLoader] Loading from local registry: ${module.id}`);
          const localAddon = getLocalAddon(module.id);
          
          if (localAddon && isMounted) {
            setIsLocal(true);
            setComponent(() => localAddon.component);
            console.log(`[ModuleLoader] Local module ready: ${module.id}`);
            return;
          }
        }

        // STRATEGY 2: Remote loading (for external/imported modules)
        if (!module.remoteEntry) {
          throw new Error(`Module ${module.id} not found in local registry and has no remote entry URL. ` +
            `Ensure it's registered in localAddons.ts or has a valid remote_entry_url in the database.`);
        }

        console.log(`[ModuleLoader] Loading remotely: ${module.remoteEntry}`);
        
        const remoteEntryUrl = module.remoteEntry.startsWith('http') 
          ? module.remoteEntry 
          : `${window.location.origin}${module.remoteEntry}`;

        const remoteModule = await loadRemoteModule(
          module.module || './App',
          remoteEntryUrl
        );

        if (isMounted) {
          let RemoteComponent = null;
          
          // Handle different export formats
          if (typeof remoteModule === 'function') {
            // Direct component export
            RemoteComponent = remoteModule;
          } else if (remoteModule?.default) {
            // Default export
            RemoteComponent = remoteModule.default;
          } else if (remoteModule && typeof remoteModule === 'object') {
            // Named export - try to find the component
            const moduleName = module.module?.replace('./', '') || 'App';
            if (remoteModule[moduleName]) {
              RemoteComponent = remoteModule[moduleName];
            } else {
              // Try to get the first function/component from the object
              const keys = Object.keys(remoteModule);
              const firstComponent = keys.find(key => typeof remoteModule[key] === 'function');
              if (firstComponent) {
                RemoteComponent = remoteModule[firstComponent];
                console.log(`[RemoteModuleLoader] Using component from key: ${firstComponent}`);
              } else {
                // Last resort: use the object itself if it's a component
                RemoteComponent = remoteModule;
              }
            }
          }
          
          if (!RemoteComponent || typeof RemoteComponent !== 'function') {
            console.error(`[RemoteModuleLoader] Module structure:`, remoteModule);
            throw new Error(`Module ${module.module || module.id} does not export a valid React component. Got: ${typeof remoteModule}`);
          }

          console.log(`[RemoteModuleLoader] Component loaded successfully: ${module.id}`);
          setComponent(() => RemoteComponent);
        }
      } catch (error) {
        console.error(`[ModuleLoader] Failed to load module ${module.id}:`, error);
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
    console.error(`[RemoteModuleLoader] ❌ Error loading module ${module.id}:`, loadError);
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

  // Verify React is available globally (for remote modules that use window.React)
  if (typeof window.React === 'undefined') {
    console.warn('[RemoteModuleLoader] window.React is not available. Remote modules may fail.');
  }

  // Wrap component in error boundary and suspense
  console.log(`[RemoteModuleLoader] ✅ About to render component for module: ${module.id}`);
  console.log(`[RemoteModuleLoader] Component type:`, typeof Component);
  console.log(`[RemoteModuleLoader] Component name:`, Component?.name || 'anonymous');
  try {
    console.log(`[RemoteModuleLoader] ✅ Rendering RemoteModuleErrorBoundary with Component for: ${module.id}`);
    // CRITICAL: Isolate remote module CSS to prevent it from affecting host layout
    // This uses CSS containment and scoping to prevent global CSS leaks
    return (
      <div 
        className="remote-module-container"
        data-module-id={module.id}
        style={{ 
          isolation: 'isolate',
          contain: 'layout style paint',
          position: 'relative',
          // Prevent remote modules from affecting parent layout
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
  } catch (error) {
    console.error('[RemoteModuleLoader] ❌ SYNCHRONOUS ERROR rendering component:', error);
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <h3 className="text-red-800 font-semibold">Error rendering module: {module.displayName}</h3>
        <p className="text-red-600 text-sm mt-1">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }
};

