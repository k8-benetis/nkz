// =============================================================================
// Unified Viewer - Command Center Layout
// =============================================================================
// Full-screen viewer with persistent CesiumMap and collapsible overlay panels.
// Uses the Slot System to render widgets from modules dynamically.

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { CesiumMap } from '@/components/CesiumMap';
import { EntityWizard } from '@/components/EntityWizard';
import { PlacementToolbar } from '@/components/EntityWizard/PlacementToolbar';
import { ViewerHeader } from '@/components/viewer/ViewerHeader';
import { SlotRenderer } from '@/components/SlotRenderer';
import { MapToolbar } from '@/components/viewer/MapToolbar';
import { MapDrawingOverlay } from '@/components/viewer/MapDrawingOverlay';
import { ParcelForm } from '@/components/parcels/ParcelForm';
import { useViewer } from '@/context/ViewerContext';
import { useSlotRegistry, SlotRegistryProvider } from '@/context/SlotRegistry';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useModules } from '@/context/ModuleContext';
import api from '@/services/api';
import { parcelApi } from '@/services/parcelApi';
import { cadastralApi } from '@/services/cadastralApi';
// Removed hardcoded vegetation layer data import - modules should use slot system
import { calculatePolygonAreaHectares } from '@/utils/geo';
import type { Robot, Sensor, Parcel, AgriculturalMachine, LivestockAnimal, WeatherStation, GeoPolygon } from '@/types';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Layers,
    X,
    Loader2,
    Maximize2,
    Minimize2,
} from 'lucide-react';

// Styles for glassmorphism panels
const glassPanel = {
    base: 'bg-white/90 backdrop-blur-md border border-white/20 shadow-xl',
    header: 'bg-gradient-to-r from-slate-50/80 to-white/80 backdrop-blur-sm',
};

// Loading fallback for lazy-loaded content
const PanelLoadingFallback: React.FC = () => (
    <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
);

// 3-state Sidebar Logic
type SidebarState = 'closed' | 'compact' | 'expanded';

interface LeftPanelProps {
    state: SidebarState;
    onCycleState: () => void;
    onAddEntity: () => void;
    compactWidth: number;
    expandedWidth: number;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
    state,
    onCycleState,
    onAddEntity,
    compactWidth,
    expandedWidth
}) => {
    const currentWidth = state === 'expanded' ? expandedWidth : state === 'compact' ? compactWidth : 0;
    const isOpen = state !== 'closed';

    // Button config based on CURRENT state (what happens when clicked)
    const getButtonConfig = () => {
        switch (state) {
            case 'closed':
                return { icon: <ChevronRight className="w-5 h-5" />, title: 'Abrir panel', next: 'Compacto' };
            case 'compact':
                return { icon: <Maximize2 className="w-4 h-4" />, title: 'Expandir panel', next: 'Expandido' };
            case 'expanded':
                return { icon: <ChevronLeft className="w-5 h-5" />, title: 'Cerrar panel', next: 'Cerrado' };
        }
    };

    const btnConfig = getButtonConfig();

    return (
        <div
            className={`absolute top-16 left-0 bottom-4 z-30 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isOpen ? '' : 'w-0'
                }`}
            style={{ width: isOpen ? `${currentWidth}px` : '0px' }}
        >
            <div className="h-full ml-4 relative">
                {/* Content Container - Fixed width to prevent squashing */}
                <div
                    className={`h-full rounded-xl ${glassPanel.base} overflow-hidden relative transition-all duration-500`}
                    style={{
                        width: isOpen ? `${currentWidth - 16}px` : '0px',
                        opacity: isOpen ? 1 : 0,
                        transform: isOpen ? 'translateX(0)' : 'translateX(-20px)'
                    }}
                >
                    {/* Inner wrapper with min-width ensures content never wraps awkwardly */}
                    <div style={{ minWidth: `${compactWidth - 16}px`, height: '100%' }}>
                        {isOpen && (
                            <Suspense fallback={<PanelLoadingFallback />}>
                                <SlotRenderer
                                    slot="entity-tree"
                                    className="flex-1 flex flex-col h-full"
                                    additionalProps={{ onAddEntity }}
                                />
                            </Suspense>
                        )}
                    </div>
                </div>

                {/* Single Toggle Button */}
                <button
                    onClick={onCycleState}
                    className={`absolute top-1/2 -translate-y-1/2 z-40 p-2 rounded-full ${glassPanel.base}
                        hover:bg-white hover:scale-110 active:scale-95 transition-all duration-300 shadow-lg group
                        flex items-center justify-center border-slate-200/50 text-slate-600 hover:text-blue-600`}
                    style={{
                        left: isOpen ? `${currentWidth - 8}px` : '4px',
                        // Rotate icon for expanded state closing action if desired, but changing icon is enough
                    }}
                    title={btnConfig.title}
                >
                    {btnConfig.icon}

                    {/* Tooltip on hover */}
                    <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {btnConfig.next}
                    </span>
                </button>
            </div>
        </div>
    );
};

// Right Panel Component with 3-state sidebar (mirrors LeftPanel but positioned on right)
interface RightPanelProps {
    state: SidebarState;
    onCycleState: () => void;
    compactWidth: number;
    expandedWidth: number;
    children: React.ReactNode;
}

const RightPanel: React.FC<RightPanelProps> = ({
    state,
    onCycleState,
    compactWidth,
    expandedWidth,
    children
}) => {
    const currentWidth = state === 'expanded' ? expandedWidth : state === 'compact' ? compactWidth : 0;
    const isOpen = state !== 'closed';

    // Button config based on CURRENT state (what happens when clicked)
    const getButtonConfig = () => {
        switch (state) {
            case 'closed':
                return { icon: <ChevronLeft className="w-5 h-5" />, title: 'Abrir panel', next: 'Compacto' };
            case 'compact':
                return { icon: <Maximize2 className="w-4 h-4" />, title: 'Expandir panel', next: 'Expandido' };
            case 'expanded':
                return { icon: <ChevronRight className="w-5 h-5" />, title: 'Cerrar panel', next: 'Cerrado' };
        }
    };

    const btnConfig = getButtonConfig();

    return (
        <div
            className={`absolute top-16 right-0 bottom-4 z-30 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isOpen ? '' : 'w-0'
                }`}
            style={{ width: isOpen ? `${currentWidth}px` : '0px' }}
        >
            <div className="h-full mr-4 relative">
                {/* Content Container - Fixed width to prevent squashing */}
                <div
                    className={`h-full rounded-xl ${glassPanel.base} overflow-hidden relative transition-all duration-500 ml-auto`}
                    style={{
                        width: isOpen ? `${currentWidth - 16}px` : '0px',
                        opacity: isOpen ? 1 : 0,
                        transform: isOpen ? 'translateX(0)' : 'translateX(20px)'
                    }}
                >
                    {/* Inner wrapper with min-width ensures content never wraps awkwardly */}
                    <div style={{ minWidth: `${compactWidth - 16}px`, height: '100%' }} className="flex flex-col">
                        {isOpen && children}
                    </div>
                </div>

                {/* Single Toggle Button */}
                <button
                    onClick={onCycleState}
                    className={`absolute top-1/2 -translate-y-1/2 z-40 p-2 rounded-full ${glassPanel.base}
                        hover:bg-white hover:scale-110 active:scale-95 transition-all duration-300 shadow-lg group
                        flex items-center justify-center border-slate-200/50 text-slate-600 hover:text-blue-600`}
                    style={{
                        right: isOpen ? `${currentWidth - 8}px` : '4px',
                    }}
                    title={btnConfig.title}
                >
                    {btnConfig.icon}

                    {/* Tooltip on hover */}
                    <span className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {btnConfig.next}
                    </span>
                </button>
            </div>
        </div>
    );
};

/** Inner viewer component that uses SlotRegistry */
const UnifiedViewerInner: React.FC = () => {
    const { hasAnyRole } = useAuth();
    const { modules } = useModules();

    // Combined state logic for sidebar
    const {
        isLayerActive,
        isLeftPanelOpen,
        isRightPanelOpen,
        isBottomPanelOpen,
        toggleLeftPanel,
        toggleRightPanel,
        toggleBottomPanel,
        currentDate,
        selectedEntityId,
        selectedEntityType,
        mapMode,
        setMapMode,
        resetMapMode,
        pickingCallback,
        cancelPicking,
        drawingType,
        drawingCallback,
        selectEntity,
    } = useViewer();

    // Local expanded state for left panel
    const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState(false);
    // Local expanded state for right panel
    const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);

    // Derived current state for left panel
    const sidebarState: SidebarState = !isLeftPanelOpen ? 'closed' : isLeftPanelExpanded ? 'expanded' : 'compact';
    // Derived current state for right panel
    const rightSidebarState: SidebarState = !isRightPanelOpen ? 'closed' : isRightPanelExpanded ? 'expanded' : 'compact';

    // Cycle handler for left panel: Closed -> Compact -> Expanded -> Closed
    const cycleSidebar = useCallback(() => {
        if (!isLeftPanelOpen) {
            // Closed -> Compact
            toggleLeftPanel(); // Opens it
            setIsLeftPanelExpanded(false);
        } else if (!isLeftPanelExpanded) {
            // Compact -> Expanded
            setIsLeftPanelExpanded(true);
        } else {
            // Expanded -> Closed
            toggleLeftPanel(); // Closes it
            setIsLeftPanelExpanded(false); // Reset to compact for next open
        }
    }, [isLeftPanelOpen, isLeftPanelExpanded, toggleLeftPanel]);

    // Cycle handler for right panel: Closed -> Compact -> Expanded -> Closed
    const cycleRightSidebar = useCallback(() => {
        if (!isRightPanelOpen) {
            // Closed -> Compact
            toggleRightPanel(); // Opens it
            setIsRightPanelExpanded(false);
        } else if (!isRightPanelExpanded) {
            // Compact -> Expanded
            setIsRightPanelExpanded(true);
        } else {
            // Expanded -> Closed
            toggleRightPanel(); // Closes it
            setIsRightPanelExpanded(false); // Reset to compact for next open
        }
    }, [isRightPanelOpen, isRightPanelExpanded, toggleRightPanel]);

    // Vegetation layer removed - external modules handle this via slot system

    // Entity data for the map (still needed here for CesiumMap)
    const [robots, setRobots] = useState<Robot[]>([]);
    const [sensors, setSensors] = useState<Sensor[]>([]);
    const [parcels, setParcels] = useState<Parcel[]>([]);
    const [machines, setMachines] = useState<AgriculturalMachine[]>([]);
    const [livestock, setLivestock] = useState<LivestockAnimal[]>([]);
    const [weatherStations, setWeatherStations] = useState<WeatherStation[]>([]);
    const [crops, setCrops] = useState<any[]>([]);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [trees, setTrees] = useState<any[]>([]); // OliveTree, AgriTree, FruitTree, Vine

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [isLayerManagerOpen, setIsLayerManagerOpen] = useState(false);

    // Drawing state (for DRAW_PARCEL mode)
    const [drawnGeometry, setDrawnGeometry] = useState<GeoPolygon | null>(null);
    const [drawnArea, setDrawnArea] = useState<number | null>(null);
    const [cadastralData, setCadastralData] = useState<{
        reference: string;
        municipality?: string;
        province?: string;
        address?: string;
    } | null>(null);

    const canManageDevices = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant', 'Farmer']);

    // Log modules for debugging
    useEffect(() => {
        console.log('[UnifiedViewer] Modules available:', modules?.length || 0);
        if (modules?.length > 0) {
            modules.forEach(m => {
                console.log(`  - ${m.name}: slots=`, m.viewerSlots ? Object.keys(m.viewerSlots) : 'none');
            });
        }
    }, [modules]);

    // Load all entities for the map
    const loadAllEntities = useCallback(async () => {
        setIsLoading(true);
        try {
            const results = await Promise.allSettled([
                api.getRobots().catch(() => []),
                api.getSensors().catch(() => []),
                api.getMachines().catch(() => []),
                api.getLivestock().catch(() => []),
                api.getWeatherStations().catch(() => []),
                parcelApi.getParcels().catch(() => []),
                api.getSDMEntityInstances('AgriCrop').catch(() => []),
                api.getSDMEntityInstances('AgriBuilding').catch(() => []),
                // Fetch tree/plant entities
                api.getSDMEntityInstances('OliveTree').catch(() => []),
                api.getSDMEntityInstances('AgriTree').catch(() => []),
                api.getSDMEntityInstances('FruitTree').catch(() => []),
                api.getSDMEntityInstances('Vine').catch(() => []),
                // Fetch sensors from NGSI-LD (created via EntityWizard)
                api.getSDMEntityInstances('AgriSensor').catch(() => []),
            ]);

            const [robotsRes, sensorsRes, machinesRes, livestockRes, weatherRes, parcelsRes, cropsRes, buildingsRes,
                oliveTreeRes, agriTreeRes, fruitTreeRes, vineRes, agriSensorRes] = results;

            setRobots(robotsRes.status === 'fulfilled' ? robotsRes.value : []);
            // Combine sensors from PostgreSQL API and NGSI-LD (SDM)
            const pgSensors = sensorsRes.status === 'fulfilled' ? sensorsRes.value : [];
            const ngsiSensors = agriSensorRes.status === 'fulfilled' ? agriSensorRes.value : [];
            const allSensors = [...pgSensors, ...ngsiSensors];
            setSensors(allSensors);
            console.log('[UnifiedViewer] Sensors loaded:', allSensors.length, '(PG:', pgSensors.length, 'NGSI:', ngsiSensors.length, ')');
            setMachines(machinesRes.status === 'fulfilled' ? machinesRes.value : []);
            setLivestock(livestockRes.status === 'fulfilled' ? livestockRes.value : []);
            setWeatherStations(weatherRes.status === 'fulfilled' ? weatherRes.value : []);
            setParcels(parcelsRes.status === 'fulfilled' ? parcelsRes.value : []);
            setCrops(cropsRes.status === 'fulfilled' ? cropsRes.value : []);
            setBuildings(buildingsRes.status === 'fulfilled' ? buildingsRes.value : []);


            // Combine all tree types into one array
            const allTrees = [
                ...(oliveTreeRes.status === 'fulfilled' ? oliveTreeRes.value : []),
                ...(agriTreeRes.status === 'fulfilled' ? agriTreeRes.value : []),
                ...(fruitTreeRes.status === 'fulfilled' ? fruitTreeRes.value : []),
                ...(vineRes.status === 'fulfilled' ? vineRes.value : []),
            ];
            setTrees(allTrees);
            console.log('[UnifiedViewer] Trees loaded:', allTrees.length);

            console.log('[UnifiedViewer] Entities loaded for map');
        } catch (error) {
            console.error('[UnifiedViewer] Error loading entities:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAllEntities();
    }, [loadAllEntities]);

    // Get selected entity data for the map
    const getSelectedEntityData = () => {
        if (!selectedEntityId) return undefined;

        // Search in all entity arrays
        const allEntities = [
            ...parcels.map(p => ({ ...p, _type: 'parcel' })),
            ...robots.map(r => ({ ...r, _type: 'robot' })),
            ...sensors.map(s => ({ ...s, _type: 'sensor' })),
            ...machines.map(m => ({ ...m, _type: 'machine' })),
            ...weatherStations.map(w => ({ ...w, _type: 'weather' })),
            ...livestock.map(l => ({ ...l, _type: 'livestock' })),
        ];

        return allEntities.find(e => e.id === selectedEntityId);
    };

    // Handle drawing completion (for DRAW_PARCEL mode)
    const handleDrawingComplete = useCallback((geometry: GeoPolygon, area: number | null) => {
        setDrawnGeometry(geometry);
        setDrawnArea(area);
        // Keep in DRAW_PARCEL mode - user can accept or cancel via toolbar
        // Form will be shown in right panel
    }, []);

    // Handle accept drawing (save parcel)
    const handleAcceptDrawing = useCallback(async () => {
        if (drawnGeometry) {
            // Form submission is handled by ParcelForm component
            // This will be called after form is submitted
            console.log('[UnifiedViewer] Drawing accepted, form will handle save');
        }
    }, [drawnGeometry]);

    // Handle cancel drawing
    const handleCancelDrawing = useCallback(() => {
        setDrawnGeometry(null);
        setDrawnArea(null);
        setCadastralData(null);
        resetMapMode();
    }, [resetMapMode]);

    // Handle map click for SELECT_CADASTRAL mode
    const handleMapClickForCadastral = useCallback(async (lat: number, lon: number) => {
        if (mapMode !== 'SELECT_CADASTRAL') return;

        try {
            console.log('[UnifiedViewer] Querying cadastral service:', { lon, lat });
            const cadastralData = await cadastralApi.queryByCoordinates(lon, lat);

            if (cadastralData.cadastralReference) {
                const hasGeometry = cadastralData.geometry &&
                    cadastralData.geometry.type === 'Polygon' &&
                    cadastralData.geometry.coordinates &&
                    cadastralData.geometry.coordinates.length > 0;

                if (hasGeometry && cadastralData.geometry) {
                    // Calculate area
                    const areaHectares = calculatePolygonAreaHectares(cadastralData.geometry);
                    setDrawnGeometry(cadastralData.geometry);
                    setDrawnArea(areaHectares);
                    setCadastralData({
                        reference: cadastralData.cadastralReference,
                        municipality: cadastralData.municipality,
                        province: cadastralData.province,
                        address: cadastralData.address,
                    });
                    // Switch to DRAW_PARCEL mode to show form
                    setMapMode('DRAW_PARCEL');
                } else {
                    // No geometry: show cadastral data and allow manual drawing
                    setCadastralData({
                        reference: cadastralData.cadastralReference,
                        municipality: cadastralData.municipality,
                        province: cadastralData.province,
                        address: cadastralData.address,
                    });
                    setMapMode('DRAW_PARCEL');
                }
            } else {
                alert('No se encontró información catastral para esta ubicación.');
            }
        } catch (error: any) {
            console.error('[UnifiedViewer] Error querying cadastral:', error);
            const errorMsg = error.response?.data?.error || error.message || 'Error desconocido';
            alert(`Error al consultar el servicio catastral: ${errorMsg}`);
        }
    }, [mapMode, setMapMode]);

    // Handle map click for PICK_LOCATION mode
    const handleMapClickForPicking = useCallback((lat: number, lon: number) => {
        if (mapMode === 'PICK_LOCATION' && pickingCallback) {
            pickingCallback(lat, lon);
            // Reset to view mode (which will show the modal again)
            cancelPicking();
        }
    }, [mapMode, pickingCallback, cancelPicking]);

    // Handle generic drawing completion (for EntityWizard)
    const handleGenericDrawingComplete = useCallback((geometry: any, area: number | null) => {
        if (drawingCallback) {
            drawingCallback(geometry);
        }
        resetMapMode();
    }, [drawingCallback, resetMapMode]);

    // Handle parcel form save
    const handleParcelFormSave = useCallback(async (data: Partial<Parcel>) => {
        if (!drawnGeometry) {
            console.error('[UnifiedViewer] No geometry to save');
            return;
        }

        try {
            const geometry: GeoPolygon = {
                type: 'Polygon',
                coordinates: drawnGeometry.coordinates,
            };

            // Calculate municipality from geometry if not provided
            let municipality = data.municipality || cadastralData?.municipality;
            let province = data.province || cadastralData?.province;

            if (geometry.coordinates && geometry.coordinates[0] && geometry.coordinates[0].length > 0) {
                const ring = geometry.coordinates[0];
                let sumLon = 0;
                let sumLat = 0;
                let count = 0;

                ring.forEach((point: number[]) => {
                    if (point && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number') {
                        sumLon += point[0];
                        sumLat += point[1];
                        count++;
                    }
                });

                if (count > 0 && (!municipality || municipality === 'Abaigar')) {
                    const centroid = { lat: sumLat / count, lon: sumLon / count };
                    try {
                        const municipalityData = await api.getNearestMunicipality(centroid.lat, centroid.lon, 10);
                        if (municipalityData && municipalityData.municipality) {
                            municipality = municipalityData.municipality.name;
                            province = municipalityData.municipality.province || province;
                        }
                    } catch (err) {
                        console.error('[UnifiedViewer] Error calculating municipality:', err);
                    }
                }
            }

            const newParcel: Partial<Parcel> = {
                name: data.name,
                geometry: geometry,
                area: drawnArea || 0,
                cropType: data.cropType,
                municipality: municipality || '',
                province: province || '',
                notes: data.notes,
                cadastralReference: cadastralData?.reference || data.cadastralReference,
                category: 'cadastral',
            };

            await parcelApi.createParcel(newParcel);
            console.log('[UnifiedViewer] Parcel created successfully');

            // Reload parcels
            await loadAllEntities();

            // Reset state
            handleCancelDrawing();
        } catch (error: any) {
            console.error('[UnifiedViewer] Error creating parcel:', error);
            const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message || 'Error al guardar la parcela';
            alert(errorMessage);
            throw error;
        }
    }, [drawnGeometry, drawnArea, cadastralData, loadAllEntities, handleCancelDrawing]);


    // Handle map entity selection
    const handleEntityMapSelect = useCallback((entity: { id: string; type: string }) => {
        console.log('[UnifiedViewer] Map entity selected:', entity);
        selectEntity(entity.id, entity.type);
    }, [selectEntity]);

    return (
        <div className="fixed inset-0 w-full h-full overflow-hidden bg-slate-900">
            {/* Floating Header - Logo with dropdown menu + controls; right strip includes Layers + Theme + Language */}
            <ViewerHeader
                rightContent={
                    <button
                        type="button"
                        onClick={() => setIsLayerManagerOpen(!isLayerManagerOpen)}
                        className={`p-2.5 rounded-xl ${glassPanel.base} hover:bg-white transition-all shadow-lg`}
                        title="Gestionar capas"
                        aria-label="Gestionar capas"
                    >
                        <Layers className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    </button>
                }
            />

            {/* Map Toolbar - Contextual toolbar for drawing/editing modes */}
            {mapMode === 'PICK_LOCATION' && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50">
                    <div className={`${glassPanel.base} px-6 py-3 rounded-full flex items-center gap-4`}>
                        <p className="text-slate-700 font-medium">Haga clic en el mapa para seleccionar ubicación</p>
                        <button
                            onClick={cancelPicking}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-full text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <MapToolbar
                onAccept={mapMode === 'DRAW_PARCEL' ? handleAcceptDrawing : undefined}
                onCancel={handleCancelDrawing}
                onUndo={mapMode === 'DRAW_PARCEL' ? () => console.log('Undo') : undefined}
                onClear={mapMode === 'DRAW_PARCEL' ? () => {
                    setDrawnGeometry(null);
                    setDrawnArea(null);
                } : undefined}
            />

            {/* CesiumMap - Full background (no padding, header floats over) */}
            <div className="absolute inset-0">
                <CesiumMap
                    title=""
                    height="h-full"
                    showControls={true}
                    parcels={isLayerActive('parcels') ? parcels : []}
                    robots={isLayerActive('robots') ? robots : []}
                    sensors={isLayerActive('sensors') ? sensors : []}
                    machines={isLayerActive('machines') ? machines : []}
                    livestock={isLayerActive('livestock') ? livestock : []}
                    weatherStations={isLayerActive('weather') ? weatherStations : []}
                    crops={isLayerActive('crops') ? crops : []}
                    buildings={isLayerActive('buildings') ? buildings : []}
                    trees={trees} // Always show trees (OliveTree, AgriTree, etc.)
                    enable3DTerrain={true}
                    terrainProvider="auto"
                    selectedEntity={getSelectedEntityData()}
                    // vegetationLayerConfig removed - modules use slot system
                    // Disable entity selection when in drawing/editing/placement modes
                    // For SELECT_CADASTRAL and PICK_LOCATION, use picker mode to capture clicks
                    // For PREVIEW_MODEL and STAMP_INSTANCES, use picker mode for model placement
                    mode={mapMode === 'VIEW' ? 'view' : (['SELECT_CADASTRAL', 'PICK_LOCATION', 'PREVIEW_MODEL', 'STAMP_INSTANCES'].includes(mapMode)) ? 'picker' : 'view'}
                    onMapClick={mapMode === 'SELECT_CADASTRAL' ? handleMapClickForCadastral : mapMode === 'PICK_LOCATION' ? handleMapClickForPicking : undefined}
                    onEntitySelect={handleEntityMapSelect}
                />
                {/* Drawing Overlay - Only active in DRAW_PARCEL mode */}
                {mapMode === 'DRAW_PARCEL' && (
                    <MapDrawingOverlay
                        enabled={true}
                        onComplete={handleDrawingComplete}
                        onCancel={handleCancelDrawing}
                    />
                )}
                {/* Generic Drawing Overlay - Active in DRAW_GEOMETRY mode */}
                {mapMode === 'DRAW_GEOMETRY' && (
                    <MapDrawingOverlay
                        enabled={true}
                        drawingType={drawingType || 'Polygon'}
                        onComplete={handleGenericDrawingComplete}
                        onCancel={resetMapMode}
                    />
                )}
            </div>

            {/* Layer Manager Dropdown - below the header right strip */}
            {isLayerManagerOpen && (
                <div className={`absolute top-16 right-4 z-40 w-64 rounded-xl ${glassPanel.base} overflow-hidden`}>
                    <div className={`px-4 py-3 ${glassPanel.header} border-b border-slate-200/50 flex items-center justify-between`}>
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Capas
                        </h3>
                        <button onClick={() => setIsLayerManagerOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-2">
                        <Suspense fallback={<PanelLoadingFallback />}>
                            <SlotRenderer slot="layer-toggle" />
                        </Suspense>
                    </div>
                </div>
            )}

            {/* Left Panel - Entity Tree (uses SlotRenderer) */}
            <LeftPanel
                state={sidebarState}
                onCycleState={cycleSidebar}
                onAddEntity={() => setIsWizardOpen(true)}
                compactWidth={380}
                expandedWidth={650}
            />

            {/* Right Panel - Context/Details (uses SlotRenderer) - 3 state sidebar */}
            <RightPanel
                state={rightSidebarState}
                onCycleState={cycleRightSidebar}
                compactWidth={400}
                expandedWidth={600}
            >
                {/* Show ParcelForm when in DRAW_PARCEL mode with drawn geometry */}
                {mapMode === 'DRAW_PARCEL' && drawnGeometry ? (
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nueva Parcela</h3>
                            {cadastralData && (
                                <p className="text-sm text-slate-600 mb-2">
                                    Datos catastrales: {cadastralData.reference}
                                </p>
                            )}
                            {drawnArea && (
                                <p className="text-sm text-slate-600">
                                    Área: {drawnArea.toFixed(2)} ha
                                </p>
                            )}
                        </div>
                        <ParcelForm
                            initialData={cadastralData ? {
                                id: '',
                                name: cadastralData.reference,
                                cadastralReference: cadastralData.reference,
                                municipality: cadastralData.municipality || '',
                                province: cadastralData.province || '',
                                cropType: '',
                                notes: '',
                                area: drawnArea || 0,
                                geometry: drawnGeometry,
                            } as Parcel : null}
                            geometry={drawnGeometry}
                            onSave={handleParcelFormSave}
                            onCancel={handleCancelDrawing}
                            mode="create"
                        />
                    </div>
                ) : (
                    <Suspense fallback={<PanelLoadingFallback />}>
                        <div className="flex-1 min-h-0 overflow-y-auto p-3">
                            <SlotRenderer
                                slot="context-panel"
                                className="flex flex-col gap-3"
                                additionalProps={{ entityData: getSelectedEntityData() }}
                                resetKeys={selectedEntityId ? [selectedEntityId] : []}
                            />
                        </div>
                    </Suspense>
                )}
            </RightPanel>

            {/* Bottom Panel - Timeline (uses SlotRenderer) */}
            <div
                className="absolute right-4 bottom-0 z-30 transition-all duration-500 ease-in-out"
                style={{
                    left: sidebarState === 'expanded' ? '650px' : sidebarState === 'compact' ? '380px' : '16px',
                    marginRight: rightSidebarState === 'expanded' ? '600px' : rightSidebarState === 'compact' ? '400px' : '0px',
                }}
            >
                <button
                    onClick={toggleBottomPanel}
                    className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-40 px-4 py-1 rounded-t-lg ${glassPanel.base} hover:bg-white transition-all text-xs text-slate-600 flex items-center gap-1`}
                >
                    {isBottomPanelOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    Timeline
                </button>

                {isBottomPanelOpen && (
                    <div className={`h-24 mb-4 rounded-xl ${glassPanel.base} flex items-center justify-center`}>
                        <Suspense fallback={<PanelLoadingFallback />}>
                            <SlotRenderer slot="bottom-panel" />
                        </Suspense>
                        {/* Fallback if no bottom panel widgets */}
                        <div className="text-center">
                            <p className="text-sm text-slate-500">Timeline - Control temporal unificado</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Fecha actual: {currentDate.toLocaleDateString('es-ES')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Entity Wizard Modal */}
            <EntityWizard
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                onSuccess={() => {
                    loadAllEntities();
                    setIsWizardOpen(false);
                }}
            />

            {/* 3D Model Placement Toolbar - Floating action bar */}
            <PlacementToolbar
                onConfirm={() => {
                    // Reload entities after placement
                    loadAllEntities();
                }}
                onCancel={() => {
                    // Nothing extra needed, context handles state reset
                }}
            />
        </div >
    );
};

/** Main UnifiedViewer with SlotRegistryProvider wrapper */
export const UnifiedViewer: React.FC = () => {
    return (
        <SlotRegistryProvider>
            <UnifiedViewerInner />
        </SlotRegistryProvider>
    );
};

export default UnifiedViewer;
