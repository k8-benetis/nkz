// =============================================================================
// Slot Registry - Unified Viewer Widget Management
// =============================================================================
// Centralized system for managing which widgets are rendered in each slot
// of the Unified Command Center. Supports both local and remote modules.

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { useModules, SlotType, SlotWidgetDefinition, ModuleViewerSlots } from './ModuleContext';
import { useViewer } from './ViewerContext';
import { getLocalModuleSlots, isLocalModule } from '@/modules/registry';
import { preloadActiveModules } from '@/utils/moduleLoader';

// =============================================================================
// Core Widgets - Built-in widgets that are always available
// =============================================================================

// Lazy imports for core widgets
const CoreEntityTree = React.lazy(() => import('@/components/viewer/CoreEntityTree'));
const CoreContextPanel = React.lazy(() => import('@/components/viewer/CoreContextPanel'));
const CoreLayerToggles = React.lazy(() => import('@/components/viewer/CoreLayerToggles'));

/** Core module definition with built-in widgets */
const CORE_MODULE_SLOTS: ModuleViewerSlots = {
    'entity-tree': [{
        id: 'core-entity-tree',
        component: 'CoreEntityTree',
        priority: 0,
        localComponent: CoreEntityTree,
    }],
    'context-panel': [{
        id: 'core-context-panel',
        component: 'CoreContextPanel',
        priority: 0,
        localComponent: CoreContextPanel,
    }],
    'layer-toggle': [{
        id: 'core-layer-toggles',
        component: 'CoreLayerToggles',
        priority: 0,
        localComponent: CoreLayerToggles,
    }],
};

/** All bundled local modules with their slots - Now using centralized registry */
const LOCAL_MODULES: Record<string, ModuleViewerSlots> = {
    'core': CORE_MODULE_SLOTS,
    // Local modules are now loaded from the centralized registry
    ...getLocalModuleSlots(),
};

// =============================================================================
// Slot Registry Context
// =============================================================================

interface SlotRegistryContextType {
    /** Get all widgets for a specific slot (from all active modules) */
    getWidgetsForSlot: (slot: SlotType) => SlotWidgetDefinition[];

    /** Get visible widgets based on current viewer state */
    getVisibleWidgets: (slot: SlotType) => SlotWidgetDefinition[];

    /** IDs of modules currently active in the viewer */
    activeModuleIds: Set<string>;

    /** Toggle a module's visibility in the viewer */
    toggleModule: (moduleId: string) => void;

    /** Activate a module */
    activateModule: (moduleId: string) => void;

    /** Deactivate a module */
    deactivateModule: (moduleId: string) => void;

    /** Check if a module is active */
    isModuleActive: (moduleId: string) => boolean;
}

const SlotRegistryContext = createContext<SlotRegistryContextType | undefined>(undefined);

interface SlotRegistryProviderProps {
    children: ReactNode;
}

export const SlotRegistryProvider: React.FC<SlotRegistryProviderProps> = ({ children }) => {
    const { modules } = useModules();
    // SlotRegistryProvider is always used within ViewerProvider (in UnifiedViewer)
    // So we can safely use useViewer() here
    const viewerContext = useViewer();

    // Track which modules are active (their widgets should be rendered)
    // Initialize based on modules from ModuleContext (already filtered by backend to only include enabled ones)
    const [activeModuleIds, setActiveModuleIds] = useState<Set<string>>(() => {
        const active = new Set<string>(['core']); // Core is always active
        return active;
    });

    // Sync active modules when modules list changes
    // Modules from ModuleContext are already filtered by backend (is_enabled = true)
    useEffect(() => {
        console.log(`[SlotRegistry] useEffect triggered. Processing ${modules.length} modules...`);
        const active = new Set<string>(['core']); // Core is always active

        // Add modules that are in the modules list (they're already filtered by backend to only include enabled ones)
        modules.forEach(module => {
            const isLocal = isLocalModule(module.id);
            const isInLocalModules = !!LOCAL_MODULES[module.id];
            const hasViewerSlots = !!module.viewerSlots;
            const slotKeys = module.viewerSlots ? Object.keys(module.viewerSlots) : [];

            console.log(`[SlotRegistry] Checking module: ${module.id}`, {
                isLocal,
                isInLocalModules,
                hasViewerSlots,
                slotKeys,
                remoteEntry: module.remoteEntry || 'N/A'
            });

            // For local bundled modules, check if they're in the modules list
            // If a module is in the modules list, it means it's enabled for this tenant
            // Use centralized registry to check if it's a local module
            // Also activate remote modules that have viewerSlots defined
            if (isLocal || isInLocalModules || hasViewerSlots) {
                active.add(module.id);
                console.log(`[SlotRegistry] ✅ Activated module: ${module.id}`);
            } else {
                console.log(`[SlotRegistry] ⏳ Module ${module.id} NOT activated (no viewerSlots yet)`);
            }
        });

        console.log(`[SlotRegistry] Active modules:`, Array.from(active));
        console.log(`[SlotRegistry] LOCAL_MODULES keys:`, Object.keys(LOCAL_MODULES));
        setActiveModuleIds(active);

        // Preload active modules in background (low priority)
        // This improves perceived performance without blocking initial load
        const activeArray = Array.from(active);
        preloadActiveModules(activeArray, { priority: 'low', checkEnabled: false })
            .catch(error => {
                console.warn('[SlotRegistry] Error preloading modules:', error);
            });
    }, [modules]);

    // Toggle module activation
    const toggleModule = useCallback((moduleId: string) => {
        setActiveModuleIds(prev => {
            const next = new Set(prev);
            if (next.has(moduleId)) {
                // Don't allow deactivating core module
                if (moduleId !== 'core') {
                    next.delete(moduleId);
                }
            } else {
                next.add(moduleId);
            }
            return next;
        });
    }, []);

    const activateModule = useCallback((moduleId: string) => {
        setActiveModuleIds(prev => new Set([...prev, moduleId]));
    }, []);

    const deactivateModule = useCallback((moduleId: string) => {
        if (moduleId === 'core') return; // Can't deactivate core
        setActiveModuleIds(prev => {
            const next = new Set(prev);
            next.delete(moduleId);
            return next;
        });
    }, []);

    const isModuleActive = useCallback((moduleId: string) => {
        return activeModuleIds.has(moduleId);
    }, [activeModuleIds]);

    // Get all widgets for a slot from active modules
    const getWidgetsForSlot = useCallback((slot: SlotType): SlotWidgetDefinition[] => {
        const widgets: SlotWidgetDefinition[] = [];
        const processedModuleIds = new Set<string>();

        // Add widgets from local bundled modules (core, etc.)
        // These take precedence because they have the actual React components
        Object.entries(LOCAL_MODULES).forEach(([moduleId, moduleSlots]) => {
            if (activeModuleIds.has(moduleId) && moduleSlots[slot]) {
                const slotWidgets = moduleSlots[slot]!;
                console.log(`[SlotRegistry] Adding ${slotWidgets.length} widgets from LOCAL_MODULES[${moduleId}].${slot}`);
                widgets.push(...slotWidgets);
                processedModuleIds.add(moduleId); // Mark as processed to avoid duplication
            }
        });

        // Add widgets from remote modules loaded via ModuleContext
        // Skip modules that are already in LOCAL_MODULES to avoid duplication
        modules.forEach(module => {
            // Skip if this module is already processed from LOCAL_MODULES
            if (processedModuleIds.has(module.id)) {
                return;
            }

            if (activeModuleIds.has(module.id) && module.viewerSlots?.[slot]) {
                const slotWidgets = module.viewerSlots[slot]!;
                console.log(`[SlotRegistry] Adding ${slotWidgets.length} widgets from module ${module.id}.viewerSlots.${slot}`);
                widgets.push(...slotWidgets);
            }
        });

        // Sort by priority (lower = first)
        const sorted = widgets.sort((a, b) => a.priority - b.priority);
        if (sorted.length > 0) {
            console.log(`[SlotRegistry] getWidgetsForSlot(${slot}) returning ${sorted.length} widgets:`, sorted.map(w => w.id));
        }
        return sorted;
    }, [modules, activeModuleIds]);

    // Get visible widgets based on current viewer state
    const getVisibleWidgets = useCallback((slot: SlotType): SlotWidgetDefinition[] => {
        const allWidgets = getWidgetsForSlot(slot);
        console.log(`[SlotRegistry] getVisibleWidgets(${slot}) - allWidgets from getWidgetsForSlot:`, allWidgets.length, allWidgets.map(w => w.id));

        // Filter based on showWhen conditions
        const visible = allWidgets.filter(widget => {
            if (!widget.showWhen) {
                console.log(`[SlotRegistry] Widget ${widget.id} has no showWhen, including`);
                return true;
            }

            const { entityType, layerActive } = widget.showWhen;
            console.log(`[SlotRegistry] Widget ${widget.id} showWhen:`, { entityType, layerActive });

            // Check entity type condition
            if (entityType && entityType.length > 0) {
                if (!viewerContext.selectedEntityType) {
                    console.log(`[SlotRegistry] Widget ${widget.id} filtered out: no selectedEntityType`);
                    return false;
                }
                if (!entityType.includes(viewerContext.selectedEntityType)) {
                    console.log(`[SlotRegistry] Widget ${widget.id} filtered out: entityType mismatch`);
                    return false;
                }
            }

            // Check layer active condition
            if (layerActive && layerActive.length > 0) {
                const hasActiveLayer = layerActive.some(layer =>
                    viewerContext.activeLayers.has(layer as any)
                );
                if (!hasActiveLayer) {
                    console.log(`[SlotRegistry] Widget ${widget.id} filtered out: no active layer`);
                    return false;
                }
            }

            return true;
        });

        console.log(`[SlotRegistry] getVisibleWidgets(${slot}) returning ${visible.length} widgets`);
        return visible;
    }, [getWidgetsForSlot, viewerContext.selectedEntityType, viewerContext.activeLayers]);

    const value = useMemo<SlotRegistryContextType>(() => ({
        getWidgetsForSlot,
        getVisibleWidgets,
        activeModuleIds,
        toggleModule,
        activateModule,
        deactivateModule,
        isModuleActive,
    }), [
        getWidgetsForSlot,
        getVisibleWidgets,
        activeModuleIds,
        toggleModule,
        activateModule,
        deactivateModule,
        isModuleActive,
    ]);

    return (
        <SlotRegistryContext.Provider value={value}>
            {children}
        </SlotRegistryContext.Provider>
    );
};

export const useSlotRegistry = (): SlotRegistryContextType => {
    const context = useContext(SlotRegistryContext);
    if (context === undefined) {
        throw new Error('useSlotRegistry must be used within a SlotRegistryProvider');
    }
    return context;
};

// Optional hook for components that may be outside the provider
export const useSlotRegistryOptional = (): SlotRegistryContextType | null => {
    return useContext(SlotRegistryContext) ?? null;
};
