// =============================================================================
// Module Loader - Intelligent Lazy Loading
// =============================================================================
// Implements on-demand loading of modules to improve initial load time.
// Modules are only loaded when they're actually needed (active and visible).

import type { ModuleDefinition } from '@/context/ModuleContext';

// =============================================================================
// Module Loading Cache
// =============================================================================
// Cache for loaded modules to avoid re-loading

const moduleCache = new Map<string, Promise<ModuleDefinition>>();

// =============================================================================
// Preload Strategy
// =============================================================================
// Preload modules that are likely to be needed soon

interface PreloadOptions {
    /** Priority: 'high' = preload immediately, 'low' = preload when idle */
    priority?: 'high' | 'low';
    /** Only preload if module is enabled for tenant */
    checkEnabled?: boolean;
}

/**
 * Preload a module in the background
 * Uses requestIdleCallback for low-priority preloads
 */
export const preloadModule = async (
    moduleId: string,
    options: PreloadOptions = {}
): Promise<void> => {
    const { priority = 'low', checkEnabled = true } = options;

    // Skip if already cached
    if (moduleCache.has(moduleId)) {
        return;
    }

    // For high priority, load immediately
    if (priority === 'high') {
        await loadModule(moduleId, checkEnabled);
        return;
    }

    // For low priority, use requestIdleCallback
    if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
            await loadModule(moduleId, checkEnabled);
        });
    } else {
        // Fallback: use setTimeout for browsers without requestIdleCallback
        setTimeout(async () => {
            await loadModule(moduleId, checkEnabled);
        }, 2000);
}
};

/**
 * Load a module on-demand
 * Returns cached promise if already loading
 */
export const loadModule = async (
    moduleId: string,
    checkEnabled: boolean = true
): Promise<ModuleDefinition | null> => {
    // Return cached promise if already loading
    if (moduleCache.has(moduleId)) {
        return moduleCache.get(moduleId)!;
}

    // Create loading promise
    const loadPromise = (async (): Promise<ModuleDefinition | null> => {
        try {
            // For remote modules, load via Module Federation
            // Note: Actual module loading happens in ModuleContext.tsx via loadRemoteViewerSlots
            // This loader is for on-demand preloading and can be safely skipped
            console.debug(`[ModuleLoader] Skipping preload for remote module: ${moduleId}`);
            return null;
        } catch (error) {
            console.error(`[ModuleLoader] Failed to load module ${moduleId}:`, error);
            moduleCache.delete(moduleId); // Remove from cache on error
            return null;
        }
    })();

    // Cache the promise
    moduleCache.set(moduleId, loadPromise);
    return loadPromise;
};

/**
 * Preload all active modules
 * Called when modules list is available
 */
export const preloadActiveModules = async (
    activeModuleIds: string[],
    options: PreloadOptions = {}
): Promise<void> => {
    const preloadPromises = activeModuleIds
        .filter(moduleId => moduleId !== 'core') // Core is always loaded
        .map(moduleId => preloadModule(moduleId, options));

    await Promise.allSettled(preloadPromises);
};

/**
 * Clear module cache (useful for testing or hot-reload)
 */
export const clearModuleCache = (moduleId?: string): void => {
    if (moduleId) {
        moduleCache.delete(moduleId);
    } else {
        moduleCache.clear();
}
};

/**
 * Get loading status of a module
 */
export const isModuleLoading = (moduleId: string): boolean => {
    return moduleCache.has(moduleId);
};
