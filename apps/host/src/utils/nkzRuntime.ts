// =============================================================================
// NKZ Runtime — Global Module Registry
// =============================================================================
// Provides window.__NKZ__ for module self-registration at runtime.
// Modules compiled as IIFE bundles call window.__NKZ__.register() on load.
//
// This file MUST be imported early in main.tsx (before any module loading).
// =============================================================================

import type { ModuleViewerSlots } from '@/context/ModuleContext';

// =============================================================================
// Types
// =============================================================================

/** Registration payload a module passes to window.__NKZ__.register() */
export interface NKZModuleRegistration {
    /** Module ID — must match the ID in marketplace_modules DB */
    id: string;
    /** Viewer slot definitions (layer-toggle, context-panel, etc.) */
    viewerSlots?: ModuleViewerSlots;
    /** Optional React provider for module-level context */
    provider?: React.ComponentType<{ children: React.ReactNode }>;
    /** Optional module version */
    version?: string;
}

/** Registration listener callback */
type RegistrationListener = (id: string, registration: NKZModuleRegistration) => void;

/** Shape of the window.__NKZ__ global object */
export interface NKZRuntime {
    /** Runtime version (for compatibility checks) */
    version: string;
    /** Register a module. Called by IIFE bundles on load. */
    register: (registration: NKZModuleRegistration) => void;
    /** Subscribe to module registrations. Returns unsubscribe function. */
    onRegister: (callback: RegistrationListener) => () => void;
    /** Get a registered module by ID */
    getRegistered: (id: string) => NKZModuleRegistration | undefined;
    /** Get all registered module IDs */
    getRegisteredIds: () => string[];
    /** Internal: registered modules map */
    _registered: Map<string, NKZModuleRegistration>;
    /** Internal: event listeners */
    _listeners: Set<RegistrationListener>;
}

// =============================================================================
// Augment Window type
// =============================================================================

declare global {
    interface Window {
        __NKZ__: NKZRuntime;
        __NKZ_SDK__: typeof import('@nekazari/sdk');
        __NKZ_UI__: typeof import('@nekazari/ui-kit');
    }
}

// =============================================================================
// Initialize Runtime
// =============================================================================

/**
 * Initialize the global NKZ runtime. Must be called once, early in the app.
 * Safe to call multiple times (idempotent).
 */
export function initNKZRuntime(): NKZRuntime {
    // Don't reinitialize if already set up
    if (window.__NKZ__?.version) {
        console.debug('[NKZ Runtime] Already initialized, skipping');
        return window.__NKZ__;
    }

    const registered = new Map<string, NKZModuleRegistration>();
    const listeners = new Set<RegistrationListener>();

    const runtime: NKZRuntime = {
        version: '1.0.0',

        register(registration: NKZModuleRegistration) {
            if (!registration?.id) {
                console.error('[NKZ Runtime] register() called without an id:', registration);
                return;
            }

            const { id } = registration;

            if (registered.has(id)) {
                console.warn(`[NKZ Runtime] Module "${id}" is already registered. Overwriting.`);
            }

            registered.set(id, registration);
            console.log(`[NKZ Runtime] ✅ Module "${id}" registered`, {
                slots: registration.viewerSlots ? Object.keys(registration.viewerSlots) : [],
                hasProvider: !!registration.provider,
                version: registration.version || 'unknown',
            });

            // Notify all listeners
            listeners.forEach(listener => {
                try {
                    listener(id, registration);
                } catch (err) {
                    console.error(`[NKZ Runtime] Error in registration listener for "${id}":`, err);
                }
            });
        },

        onRegister(callback: RegistrationListener) {
            listeners.add(callback);

            // Immediately notify about already-registered modules
            registered.forEach((reg, id) => {
                try {
                    callback(id, reg);
                } catch (err) {
                    console.error(`[NKZ Runtime] Error in catch-up notification for "${id}":`, err);
                }
            });

            // Return unsubscribe function
            return () => {
                listeners.delete(callback);
            };
        },

        getRegistered(id: string) {
            return registered.get(id);
        },

        getRegisteredIds() {
            return Array.from(registered.keys());
        },

        // Expose internals for debugging (prefixed with _)
        _registered: registered,
        _listeners: listeners,
    };

    window.__NKZ__ = runtime;
    console.log('[NKZ Runtime] ✅ Initialized (v1.0.0)');

    return runtime;
}
