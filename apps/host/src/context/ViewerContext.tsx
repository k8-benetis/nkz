// =============================================================================
// Viewer Context - Unified Command Center State
// =============================================================================
// Provides global state for the unified viewer, enabling coordination between
// map layers, entity selection, timeline, and module panels.

import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react';

// Types for viewer state
export type LayerType =
    | 'parcels'
    | 'robots'
    | 'sensors'
    | 'machines'
    | 'livestock'
    | 'weather'
    | 'ndvi'
    | 'crops'
    | 'buildings'
    | 'trees'        // Individual trees (olives, vines, fruit trees)
    | 'waterSources' // Wells, irrigation outlets, springs, ponds
    | 'vegetation'   // Generic vegetation layer type (modules can register via slot system)
    | 'zoning';      // VRA Management Zones layer (used by vegetation module for round-trip navigation)

// Map interaction modes - mutually exclusive states
export type MapMode =
    | 'VIEW'              // Default: navigation, selection, context menu
    | 'DRAW_PARCEL'       // Drawing new parcel polygon (manual cropping)
    | 'SELECT_CADASTRAL'  // Click on map to query cadastral service
    | 'EDIT_GEOMETRY'     // Editing existing parcel geometry (vertices)
    | 'PICK_LOCATION'     // Picking coordinates on map
    | 'DRAW_GEOMETRY'     // Generic geometry drawing (Point, Polygon, LineString)
    | 'PREVIEW_MODEL'     // Preview single 3D model placement
    | 'STAMP_INSTANCES'   // Brush painting multiple model instances
    | 'ZONING';           // VRA Management Zones (vegetation module)

// 3D Model placement state for preview and stamp modes
export interface ModelPlacementState {
    modelUrl: string;
    scale: number;
    rotation: [number, number, number]; // [heading, pitch, roll] in degrees
    position?: { lat: number; lon: number; height?: number };
}

// Instance data for stamp mode
export interface StampInstance {
    lat: number;
    lon: number;
    height: number;
    scale: number;
    rotation: number; // heading in degrees
}

// Options for stamp mode
export interface StampOptions {
    density: number;      // 0-1, chance per mouse move
    brushSize: number;    // meters
    randomScale: [number, number]; // [min, max] scale range
    randomRotation: boolean;
}

export interface ViewerState {
    // Entity selection
    selectedEntityId: string | null;
    selectedEntityType: string | null;

    // Temporal state
    currentDate: Date;
    isTimelinePlaying: boolean;

    // Layer visibility
    activeLayers: Set<LayerType>;

    // Panel states
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    isBottomPanelOpen: boolean;

    // Active module context (NDVI controls, Sensor details, etc.)
    activeContextModule: string | null;

    // Map interaction mode (mutually exclusive states)
    mapMode: MapMode;
}

interface ViewerContextType extends ViewerState {
    // Entity selection
    selectEntity: (id: string | null, type?: string | null) => void;
    clearSelection: () => void;

    // Temporal control
    setCurrentDate: (date: Date) => void;
    toggleTimelinePlayback: () => void;

    // Layer control
    toggleLayer: (layer: LayerType) => void;
    setLayerActive: (layer: LayerType, active: boolean) => void;
    isLayerActive: (layer: LayerType) => boolean;

    // Panel control
    toggleLeftPanel: () => void;
    toggleRightPanel: () => void;
    toggleBottomPanel: () => void;
    setLeftPanelOpen: (open: boolean) => void;
    setRightPanelOpen: (open: boolean) => void;

    // Context module (what to show in right panel)
    setActiveContextModule: (module: string | null) => void;

    // Map mode control (state machine for interaction modes)
    setMapMode: (mode: MapMode) => void;
    resetMapMode: () => void; // Reset to VIEW mode

    // Location Picking State
    pickLocation: (callback: (lat: number, lon: number) => void) => void;
    cancelPicking: () => void;
    pickingCallback: ((lat: number, lon: number) => void) | null;

    // Generic Geometry Drawing State
    startDrawing: (type: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString', callback: (geometry: any) => void) => void;
    cancelDrawing: () => void;
    drawingType: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString' | null;
    drawingCallback: ((geometry: any) => void) | null;

    // Cesium viewer access (for map-layer components)
    cesiumViewer: any | null;
    setCesiumViewer: (viewer: any | null) => void;

    // ==========================================================================
    // 3D Model Placement State (PREVIEW_MODEL and STAMP_INSTANCES modes)
    // ==========================================================================

    // Model preview mode (single model with scale/rotation adjustment)
    modelPlacement: ModelPlacementState | null;
    startModelPreview: (modelUrl: string, position: { lat: number; lon: number }, options?: Partial<ModelPlacementState>) => void;
    updateModelPlacement: (updates: Partial<ModelPlacementState>) => void;
    confirmModelPlacement: () => ModelPlacementState | null;
    cancelModelPlacement: () => void;

    // Stamp mode (brush painting multiple instances)
    stampOptions: StampOptions;
    stampInstances: StampInstance[];
    stampModelUrl: string | null;
    startStampMode: (modelUrl: string, options?: Partial<StampOptions>) => void;
    updateStampOptions: (options: Partial<StampOptions>) => void;
    addStampInstance: (instance: StampInstance) => void;
    confirmStampMode: () => StampInstance[];
    cancelStampMode: () => void;
}

const ViewerContext = createContext<ViewerContextType | undefined>(undefined);

// Expose the context itself globally so remote modules can use useContext directly
if (typeof window !== 'undefined') {
    (window as any).__nekazariViewerContextInstance = ViewerContext;
}

interface ViewerProviderProps {
    children: ReactNode;
}

// Default layers to show
const DEFAULT_LAYERS: Set<LayerType> = new Set(['parcels', 'robots', 'sensors']);

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
    // Entity selection
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
    const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);

    // Temporal state - default to 90 days ago for satellite data availability
    const [currentDate, setCurrentDateState] = useState<Date>(() => {
        const date = new Date();
        date.setDate(date.getDate() - 90);
        return date;
    });
    const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);

    // Layer visibility
    const [activeLayers, setActiveLayers] = useState<Set<LayerType>>(DEFAULT_LAYERS);

    // Panel states
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);

    // Active context module
    const [activeContextModule, setActiveContextModuleState] = useState<string | null>(null);

    // Map interaction mode (state machine)
    const [mapMode, setMapModeState] = useState<MapMode>('VIEW');
    const [pickingCallback, setPickingCallback] = useState<((lat: number, lon: number) => void) | null>(null);

    // Cesium viewer reference (exposed for map-layer components)
    const [cesiumViewer, setCesiumViewerState] = useState<any | null>(null);

    // ==========================================================================
    // URL Deep Link Support (Round-trip Navigation from Module Pages)
    // ==========================================================================
    // Reads ?selectedEntity=xxx&activeLayers=vegetation,zoning from URL on mount
    // This enables round-trip navigation from module pages to the viewer.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const searchParams = new URLSearchParams(window.location.search);
        
        // Read selectedEntity param
        const selectedEntity = searchParams.get('selectedEntity');
        if (selectedEntity) {
            console.log('[ViewerContext] Deep link: selecting entity', selectedEntity);
            setSelectedEntityId(selectedEntity);
            // Auto-open right panel when entity is selected via URL
            setIsRightPanelOpen(true);
        }

        // Read activeLayers param (comma-separated list)
        const activeLayersParam = searchParams.get('activeLayers');
        if (activeLayersParam) {
            const layersToActivate = activeLayersParam.split(',').map(l => l.trim()) as LayerType[];
            console.log('[ViewerContext] Deep link: activating layers', layersToActivate);
            
            // Set the layers from the URL (merge with defaults or replace)
            setActiveLayers(prev => {
                const next = new Set(prev);
                layersToActivate.forEach(layer => {
                    // Validate layer type
                    const validLayers: LayerType[] = ['parcels', 'robots', 'sensors', 'machines', 'livestock', 
                        'weather', 'ndvi', 'crops', 'buildings', 'trees', 'waterSources', 'vegetation', 'zoning'];
                    if (validLayers.includes(layer)) {
                        next.add(layer);
                    }
                });
                return next;
            });
        }

        // Clean up URL params after reading (optional - prevents re-triggering on refresh)
        // Uncomment if you want to clear the URL after applying:
        // const url = new URL(window.location.href);
        // url.searchParams.delete('selectedEntity');
        // url.searchParams.delete('activeLayers');
        // window.history.replaceState({}, '', url.toString());
    }, []); // Run only on mount

    // Entity selection handlers
    const selectEntity = useCallback((id: string | null, type?: string | null) => {
        setSelectedEntityId(id);
        setSelectedEntityType(type ?? null);
        // Auto-open right panel when entity selected
        if (id) {
            setIsRightPanelOpen(true);
        }
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedEntityId(null);
        setSelectedEntityType(null);
    }, []);

    // Temporal control handlers
    const setCurrentDate = useCallback((date: Date) => {
        setCurrentDateState(date);
    }, []);

    const toggleTimelinePlayback = useCallback(() => {
        setIsTimelinePlaying(prev => !prev);
    }, []);

    // Layer control handlers
    const toggleLayer = useCallback((layer: LayerType) => {
        setActiveLayers(prev => {
            const next = new Set(prev);
            if (next.has(layer)) {
                next.delete(layer);
            } else {
                next.add(layer);
            }
            return next;
        });
    }, []);

    const setLayerActive = useCallback((layer: LayerType, active: boolean) => {
        setActiveLayers(prev => {
            const next = new Set(prev);
            if (active) {
                next.add(layer);
            } else {
                next.delete(layer);
            }
            return next;
        });
    }, []);

    const isLayerActive = useCallback((layer: LayerType) => {
        return activeLayers.has(layer);
    }, [activeLayers]);

    // Panel control handlers
    const toggleLeftPanel = useCallback(() => {
        setIsLeftPanelOpen(prev => !prev);
    }, []);

    const toggleRightPanel = useCallback(() => {
        setIsRightPanelOpen(prev => !prev);
    }, []);

    const toggleBottomPanel = useCallback(() => {
        setIsBottomPanelOpen(prev => !prev);
    }, []);

    const setLeftPanelOpen = useCallback((open: boolean) => {
        setIsLeftPanelOpen(open);
    }, []);

    const setRightPanelOpen = useCallback((open: boolean) => {
        setIsRightPanelOpen(open);
    }, []);

    // Context module handler
    const setActiveContextModule = useCallback((module: string | null) => {
        setActiveContextModuleState(module);
        if (module) {
            setIsRightPanelOpen(true);
        }
    }, []);

    // Cesium viewer handler
    const setCesiumViewer = useCallback((viewer: any | null) => {
        setCesiumViewerState(viewer);
    }, []);

    // Map mode handlers
    const setMapMode = useCallback((mode: MapMode) => {
        setMapModeState(mode);
        // Auto-open right panel when entering drawing/editing modes
        if (mode !== 'VIEW') {
            setIsRightPanelOpen(true);
        }
    }, []);

    const resetMapMode = useCallback(() => {
        setMapModeState('VIEW');
        setPickingCallback(null); // Clear picking callback when resetting map mode
    }, []);

    // Location picking handlers
    const pickLocation = useCallback((callback: (lat: number, lon: number) => void) => {
        setPickingCallback(() => callback); // Store the callback
        setMapModeState('PICK_LOCATION'); // Enter picking mode
    }, []);

    const cancelPicking = useCallback(() => {
        setPickingCallback(null); // Clear the callback
        setMapModeState('VIEW'); // Return to view mode
    }, []);

    // Generic drawing handlers
    const [drawingType, setDrawingType] = useState<'Point' | 'Polygon' | 'LineString' | 'MultiLineString' | null>(null);
    const [drawingCallback, setDrawingCallback] = useState<((geometry: any) => void) | null>(null);

    const startDrawing = useCallback((type: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString', callback: (geometry: any) => void) => {
        setDrawingType(type);
        setDrawingCallback(() => callback);
        setMapModeState('DRAW_GEOMETRY');
    }, []);

    const cancelDrawing = useCallback(() => {
        setDrawingType(null);
        setDrawingCallback(null);
        setMapModeState('VIEW');
    }, []);

    // ==========================================================================
    // 3D Model Placement State and Handlers
    // ==========================================================================

    // Model preview state (single model)
    const [modelPlacement, setModelPlacement] = useState<ModelPlacementState | null>(null);

    // Stamp mode state (multiple instances)
    const DEFAULT_STAMP_OPTIONS: StampOptions = {
        density: 0.5,
        brushSize: 5,
        randomScale: [0.8, 1.2],
        randomRotation: true,
    };
    const [stampOptions, setStampOptionsState] = useState<StampOptions>(DEFAULT_STAMP_OPTIONS);
    const [stampInstances, setStampInstances] = useState<StampInstance[]>([]);
    const [stampModelUrl, setStampModelUrl] = useState<string | null>(null);

    // Model preview handlers
    const startModelPreview = useCallback((
        modelUrl: string,
        position: { lat: number; lon: number },
        options?: Partial<ModelPlacementState>
    ) => {
        setModelPlacement({
            modelUrl,
            scale: options?.scale ?? 1,
            rotation: options?.rotation ?? [0, 0, 0],
            position,
        });
        setMapModeState('PREVIEW_MODEL');
    }, []);

    const updateModelPlancement = useCallback((updates: Partial<ModelPlacementState>) => {
        setModelPlacement(prev => prev ? { ...prev, ...updates } : null);
    }, []);

    const confirmModelPlacement = useCallback((): ModelPlacementState | null => {
        const result = modelPlacement;
        setModelPlacement(null);
        setMapModeState('VIEW');
        return result;
    }, [modelPlacement]);

    const cancelModelPlacement = useCallback(() => {
        setModelPlacement(null);
        setMapModeState('VIEW');
    }, []);

    // Stamp mode handlers
    const startStampMode = useCallback((modelUrl: string, options?: Partial<StampOptions>) => {
        setStampModelUrl(modelUrl);
        setStampOptionsState(prev => ({ ...prev, ...options }));
        setStampInstances([]);
        setMapModeState('STAMP_INSTANCES');
    }, []);

    const updateStampOptions = useCallback((options: Partial<StampOptions>) => {
        setStampOptionsState(prev => ({ ...prev, ...options }));
    }, []);

    const addStampInstance = useCallback((instance: StampInstance) => {
        setStampInstances(prev => [...prev, instance]);
    }, []);

    const confirmStampMode = useCallback((): StampInstance[] => {
        const result = [...stampInstances];
        setStampInstances([]);
        setStampModelUrl(null);
        setMapModeState('VIEW');
        return result;
    }, [stampInstances]);

    const cancelStampMode = useCallback(() => {
        setStampInstances([]);
        setStampModelUrl(null);
        setMapModeState('VIEW');
    }, []);

    const value = useMemo<ViewerContextType>(() => ({
        // State
        selectedEntityId,
        selectedEntityType,
        currentDate,
        isTimelinePlaying,
        activeLayers,
        isLeftPanelOpen,
        isRightPanelOpen,
        isBottomPanelOpen,
        activeContextModule,
        mapMode,
        pickingCallback, // Expose pickingCallback state
        drawingType,
        drawingCallback,
        cesiumViewer,

        // 3D Model Placement State
        modelPlacement,
        stampOptions,
        stampInstances,
        stampModelUrl,

        // Handlers
        selectEntity,
        clearSelection,
        setCurrentDate,
        toggleTimelinePlayback,
        toggleLayer,
        setLayerActive,
        isLayerActive,
        toggleLeftPanel,
        toggleRightPanel,
        toggleBottomPanel,
        setLeftPanelOpen,
        setRightPanelOpen,
        setActiveContextModule,
        setMapMode,
        resetMapMode,
        setCesiumViewer,
        pickLocation,
        cancelPicking,
        startDrawing,
        cancelDrawing,

        // 3D Model Placement Handlers
        startModelPreview,
        updateModelPlacement: updateModelPlancement, // Fix typo in function name
        confirmModelPlacement,
        cancelModelPlacement,
        startStampMode,
        updateStampOptions,
        addStampInstance,
        confirmStampMode,
        cancelStampMode,
    }), [
        selectedEntityId,
        selectedEntityType,
        currentDate,
        isTimelinePlaying,
        activeLayers,
        isLeftPanelOpen,
        isRightPanelOpen,
        isBottomPanelOpen,
        activeContextModule,
        mapMode,
        cesiumViewer,
        drawingType,
        modelPlacement,
        stampOptions,
        stampInstances,
        selectEntity,
        clearSelection,
        setCurrentDate,
        toggleTimelinePlayback,
        toggleLayer,
        setLayerActive,
        isLayerActive,
        toggleLeftPanel,
        toggleRightPanel,
        toggleBottomPanel,
        setLeftPanelOpen,
        setRightPanelOpen,
        setActiveContextModule,
        setMapMode,
        resetMapMode,
        setCesiumViewer,
        pickLocation,
        cancelPicking,
        startDrawing,
        cancelDrawing,
        startModelPreview,
        updateModelPlancement,
        confirmModelPlacement,
        cancelModelPlacement,
        startStampMode,
        updateStampOptions,
        addStampInstance,
        confirmStampMode,
        cancelStampMode,
    ]);

    return (
        <ViewerContext.Provider value={value}>
            {children}
        </ViewerContext.Provider>
    );
};

export const useViewer = (): ViewerContextType => {
    const context = useContext(ViewerContext);
    if (context === undefined) {
        throw new Error('useViewer must be used within a ViewerProvider');
    }
    return context;
};

// Optional hook for components that may be outside the provider
export const useViewerOptional = (): ViewerContextType | null => {
    return useContext(ViewerContext) ?? null;
};

// NOTE: Do NOT expose hook functions on window.
// Hooks called outside React's render cycle (e.g. in callbacks, effects cleanup, module init)
// cause React error #300 ("Hooks can only be called inside a function component").
// External modules must use window.__nekazariViewerContextInstance with useContext() inside
// their own React component render functions:
//   const ctx = React.useContext(window.__nekazariViewerContextInstance);
// The @nekazari/sdk useViewer() hook wraps this correctly.
