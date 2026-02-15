// =============================================================================
// Module Registry - Single Source of Truth for All Modules
// =============================================================================
// Centralized registry for both local (bundled) and remote modules.
// This eliminates duplication between SlotRegistry and ModuleContext.

import type { ModuleDefinition, ModuleViewerSlots } from '@/context/ModuleContext';

// =============================================================================
// Local Module Registry
// =============================================================================
// All bundled modules must be registered here.
// This is the ONLY place where local modules are defined.

export const LOCAL_MODULE_REGISTRY: Record<string, ModuleDefinition> = {
    // Add future local modules here:
    // 'weather-module': WeatherModule,
    // 'predictions-module': PredictionsModule,
};

// =============================================================================
// Module Slot Registry
// =============================================================================
// Extract slots from local modules for SlotRegistry
// This replaces the hardcoded LOCAL_MODULES in SlotRegistry.tsx

export const getLocalModuleSlots = (): Record<string, ModuleViewerSlots> => {
    const slots: Record<string, ModuleViewerSlots> = {};
    
    Object.entries(LOCAL_MODULE_REGISTRY).forEach(([moduleId, module]) => {
        if (module.viewerSlots) {
            slots[moduleId] = module.viewerSlots;
        }
    });
    
    return slots;
};

// =============================================================================
// Module Discovery
// =============================================================================
// Helper functions to discover and validate modules

export const getLocalModule = (moduleId: string): ModuleDefinition | undefined => {
    return LOCAL_MODULE_REGISTRY[moduleId];
};

export const isLocalModule = (moduleId: string): boolean => {
    return moduleId in LOCAL_MODULE_REGISTRY;
};

export const getAllLocalModuleIds = (): string[] => {
    return Object.keys(LOCAL_MODULE_REGISTRY);
};

// =============================================================================
// Module Validation
// =============================================================================
// Validate that a module definition is complete

export const validateModuleDefinition = (module: ModuleDefinition): {
    valid: boolean;
    errors: string[];
} => {
    const errors: string[] = [];
    
    if (!module.id) errors.push('Module ID is required');
    if (!module.displayName) errors.push('Module displayName is required');
    if (!module.version) errors.push('Module version is required');
    if (!module.routePath) errors.push('Module routePath is required');
    
    // Validate slots if present
    if (module.viewerSlots) {
        Object.entries(module.viewerSlots).forEach(([slotType, widgets]) => {
            if (!Array.isArray(widgets)) {
                errors.push(`Slot ${slotType} must be an array`);
                return;
            }
            
            widgets.forEach((widget, index) => {
                if (!widget.id) {
                    errors.push(`Widget at ${slotType}[${index}] missing id`);
                }
                if (!widget.component && !widget.localComponent) {
                    errors.push(`Widget ${widget.id} must have component or localComponent`);
                }
            });
        });
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
};

// =============================================================================
// Module Metadata Helper
// =============================================================================
// Extract metadata for display/configuration

export const getModuleMetadata = (moduleId: string): {
    id: string;
    displayName: string;
    version: string;
    isLocal: boolean;
    hasSlots: boolean;
    slotTypes: string[];
} | null => {
    const module = LOCAL_MODULE_REGISTRY[moduleId];
    if (!module) return null;
    
    const slotTypes = module.viewerSlots ? Object.keys(module.viewerSlots) : [];
    
    return {
        id: module.id,
        displayName: module.displayName,
        version: module.version,
        isLocal: true,
        hasSlots: slotTypes.length > 0,
        slotTypes,
    };
};

