// =============================================================================
// Slot Renderer - Dynamic Widget Rendering
// =============================================================================
// Renders widgets registered for a specific slot in the Unified Viewer.
// Supports both local (bundled) and remote (Module Federation) widgets.
// Includes error boundaries for module isolation and lazy loading optimization.

import React, { Suspense, useMemo, useState, useEffect } from 'react';
import { useSlotRegistryOptional } from '@/context/SlotRegistry';
import { SlotType, SlotWidgetDefinition, useModules, ModuleDefinition } from '@/context/ModuleContext';
import { Loader2 } from 'lucide-react';
import { ModuleErrorBoundary } from './ModuleErrorBoundary';
import { loadRemoteModule } from './RemoteModuleLoader';

interface SlotRendererProps {
    /** Which slot to render */
    slot: SlotType;
    /** Optional className for the container */
    className?: string;
    /** If true, renders widgets inline without a wrapper */
    inline?: boolean;
    /** Additional props passed to all widgets */
    additionalProps?: Record<string, any>;
    /** Optional keys to trigger error boundary reset */
    resetKeys?: any[];
}

/** Loading fallback for lazy-loaded widgets */
const WidgetLoadingFallback: React.FC = () => (
    <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
    </div>
);

// Error boundary moved to ModuleErrorBoundary.tsx for better isolation

/** 
 * Get module ID from a widget definition.
 * 
 * Priority:
 * 1. Use widget.moduleId if explicitly set (recommended for all modules)
 * 2. Fallback: Infer from widget ID pattern (legacy support)
 * 
 * The fallback uses these rules:
 * - Known single-word modules (core, weather, etc): use first segment
 * - Compound modules (vegetation-prime): use first two segments
 */
const getModuleIdFromWidget = (widget: SlotWidgetDefinition): string => {
    // Prefer explicit moduleId (professional approach)
    if (widget.moduleId) {
        return widget.moduleId;
    }

    // Legacy fallback: infer from widget ID
    const widgetId = widget.id;
    const parts = widgetId.split('-');
    if (parts.length >= 2) {
        // Known single-word module prefixes (local/bundled modules and external single-word modules)
        const singleWordModules = ['core', 'weather', 'risk', 'parcels', 'intelligence', 'ornito', 'lidar'];
        if (singleWordModules.includes(parts[0])) {
            return parts[0];
        }
        // For external modules, use compound ID (first two parts)
        // e.g., 'vegetation-prime-config' -> 'vegetation-prime'
        if (parts.length >= 3) {
            const compoundId = `${parts[0]}-${parts[1]}`;
            console.log(`[SlotRenderer] Inferred compound moduleId: ${compoundId} from widget: ${widgetId} (consider adding explicit moduleId)`);
            return compoundId;
        }
        // Fallback to first part
        return parts[0];
    }
    return 'unknown';
};

/** Get module display name from widget */
const getModuleNameFromWidget = (widget: SlotWidgetDefinition): string => {
    const moduleId = getModuleIdFromWidget(widget);
    const moduleNames: Record<string, string> = {
        'core': 'Core',
    };
    return moduleNames[moduleId] || moduleId;
};

/**
 * Loads a single slot component from a remote module by name (e.g. 'LidarLayer')
 * and renders it. Used when viewerSlots were loaded from the remote but
 * localComponent references were not preserved across the federation boundary.
 */
const RemoteSlotWidget: React.FC<{
    module: ModuleDefinition;
    widget: SlotWidgetDefinition;
    widgetProps: Record<string, any>;
    moduleId: string;
    moduleName: string;
    resetKeys?: any[];
}> = ({ module, widget, widgetProps, moduleId, moduleName, resetKeys }) => {
    const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;
        const remoteEntryUrl = module.remoteEntry!.startsWith('http')
            ? module.remoteEntry!
            : `${window.location.origin}${module.remoteEntry!}`;
        const componentPath = widget.component.startsWith('./') ? widget.component : `./${widget.component}`;

        loadRemoteModule(componentPath, remoteEntryUrl)
            .then((Comp) => {
                if (!cancelled && Comp) setComponent(() => Comp);
            })
            .catch((err) => {
                if (!cancelled) setError(err);
            });
        return () => { cancelled = true; };
    }, [module.remoteEntry, widget.component]);

    if (error) {
        return (
            <ModuleErrorBoundary moduleId={moduleId} moduleName={moduleName}>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    Failed to load {widget.component}: {error.message}
                </div>
            </ModuleErrorBoundary>
        );
    }
    if (!Component) {
        return <WidgetLoadingFallback />;
    }
    return (
        <ModuleErrorBoundary
            moduleId={moduleId}
            moduleName={moduleName}
            resetKeys={resetKeys}
            onError={(e, info) => console.error(`[SlotRenderer] Remote widget ${widget.id} failed:`, e, info)}
        >
            <Suspense fallback={<WidgetLoadingFallback />}>
                <Component {...widgetProps} />
            </Suspense>
        </ModuleErrorBoundary>
    );
};

/** Renders a single widget with error boundary and lazy loading */
const WidgetRenderer: React.FC<{
    widget: SlotWidgetDefinition;
    module?: ModuleDefinition | null;
    additionalProps?: Record<string, any>;
    resetKeys?: any[];
}> = ({ widget, module, additionalProps, resetKeys }) => {
    const moduleId = useMemo(() => getModuleIdFromWidget(widget), [widget]);
    const moduleName = useMemo(() => getModuleNameFromWidget(widget), [widget]);

    // Combine props - don't pass viewer context here, let components use useViewer() directly
    // This avoids the issue of SlotRenderer needing ViewerProvider
    const widgetProps = {
        ...widget.defaultProps,
        ...additionalProps,
    };

    // If it's a local component (bundled), render it with error boundary
    if (widget.localComponent) {
        const Component = widget.localComponent;
        return (
            <ModuleErrorBoundary
                moduleId={moduleId}
                moduleName={moduleName}
                resetKeys={resetKeys}
                onError={(error, errorInfo) => {
                    console.error(`[WidgetRenderer] Widget ${widget.id} failed:`, error, errorInfo);
                }}
            >
                <Suspense fallback={<WidgetLoadingFallback />}>
                    <Component {...widgetProps} />
                </Suspense>
            </ModuleErrorBoundary>
        );
    }

    // Remote module: load component by name from remote entry when localComponent was not preserved
    if (module?.remoteEntry && widget.component) {
        return (
            <RemoteSlotWidget
                module={module}
                widget={widget}
                widgetProps={widgetProps}
                moduleId={moduleId}
                moduleName={moduleName}
                resetKeys={resetKeys}
            />
        );
    }

    return (
        <ModuleErrorBoundary moduleId={moduleId} moduleName={moduleName}>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Remote widget: {widget.component} (module or component name missing)
            </div>
        </ModuleErrorBoundary>
    );
};

export const SlotRenderer: React.FC<SlotRendererProps> = ({
    slot,
    className,
    inline = false,
    additionalProps,
    resetKeys,
}) => {
    const slotRegistry = useSlotRegistryOptional();
    const { modules } = useModules();

    // If SlotRegistryProvider is not available, return null silently
    // This allows SlotRenderer to be used in components that may or may not be within the provider
    if (!slotRegistry) {
        console.debug(`[SlotRenderer] SlotRegistryProvider not available for slot "${slot}", returning null`);
        return null;
    }

    const { getVisibleWidgets } = slotRegistry;
    const widgets = getVisibleWidgets(slot);

    console.log(`[SlotRenderer] Rendering slot "${slot}" with ${widgets.length} widgets:`, widgets.map(w => w.id));

    if (widgets.length === 0) {
        console.log(`[SlotRenderer] No widgets for slot "${slot}", returning null`);
        return null;
    }

    // Group widgets by module to share providers when multiple widgets from same module
    const widgetsByModule = useMemo(() => {
        const grouped = new Map<string, {
            widgets: SlotWidgetDefinition[];
            moduleId: string;
            module?: ModuleDefinition | null;
            moduleProvider?: React.ComponentType<{ children: React.ReactNode }>;
        }>();

        widgets.forEach(widget => {
            const moduleId = getModuleIdFromWidget(widget);
            const module = modules.find(m => m.id === moduleId);
            const moduleProvider = module && !module.isLocal && module.remoteEntry
                ? module.viewerSlots?.moduleProvider
                : undefined;

            if (!grouped.has(moduleId)) {
                grouped.set(moduleId, {
                    widgets: [],
                    moduleId,
                    module,
                    moduleProvider,
                });
            }

            grouped.get(moduleId)!.widgets.push(widget);
        });

        return Array.from(grouped.values());
    }, [widgets, modules]);

    // Render widgets grouped by module, with shared provider when needed
    const content = widgetsByModule.map(({ widgets: moduleWidgets, moduleId, module, moduleProvider }) => {
        const widgetsContent = moduleWidgets.map(widget => (
            <WidgetRenderer
                key={widget.id}
                widget={widget}
                module={module}
                additionalProps={additionalProps}
                resetKeys={resetKeys}
            />
        ));

        // If module has a provider (remote modules), wrap all widgets from that module
        // with a SINGLE instance of the provider to avoid state synchronization issues
        if (moduleProvider) {
            const ModuleProvider = moduleProvider;
            console.log(`[SlotRenderer] Wrapping ${moduleWidgets.length} widgets from module ${moduleId} with shared provider`);
            return (
                <ModuleProvider key={moduleId}>
                    {widgetsContent}
                </ModuleProvider>
            );
        }

        // Local modules don't need providers (they're in the bundle)
        // Render widgets directly
        return <React.Fragment key={moduleId}>{widgetsContent}</React.Fragment>;
    });

    if (inline) {
        return <>{content}</>;
    }

    return (
        <div className={className}>
            {content}
        </div>
    );
};

export default SlotRenderer;
