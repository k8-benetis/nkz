// =============================================================================
// Advanced Cesium Map Component with Layer Selection and NDVI Visualization
// =============================================================================
// Features:
// - Multiple selectable layers (Catastro, NDVI, IGN 3D, PNOA, CNIG, Robots, Sensors)
// - Date range selector for NDVI
// - Cadastral parcels visualization
// - NDVI color mapping
// - Extensible layer system for easy addition of new layers

import React, { useEffect, useRef, useState } from 'react';
import { Layers, Calendar, MapPin, Loader2, Eye, EyeOff, Expand, Minimize } from 'lucide-react';
import api from '@/services/api';
import { parcelApi } from '@/services/parcelApi';
import { useAuth } from '@/context/KeycloakAuthContext';
import { DEFAULT_LAYER_CONFIGS, LayerType, LayerConfig, EntityData } from './cesium/CesiumLayerConfig';
import { LAYER_RENDERERS } from './cesium/CesiumLayerRenderers';

// Import Cesium CSS
import 'cesium/Build/Cesium/Widgets/widgets.css';

interface CadastralParcel {
  id: string;
  cadastral_reference: string;
  municipality: string;
  province: string;
  crop_type: string;
  area_hectares: number;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  ndvi_enabled: boolean;
}

interface NDVIData {
  parcel_id: string;
  date: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndvi_stddev: number;
}

interface CesiumMapAdvancedProps {
  title?: string;
  height?: string | number;
  showControls?: boolean;
  robots?: any[]; // Optional: pass robots data
  sensors?: any[]; // Optional: pass sensors data
  entities?: any[]; // Optional: pass other entities
}

export const CesiumMapAdvanced: React.FC<CesiumMapAdvancedProps> = ({
  title = 'Mapa 3D - Parcelas Catastrales',
  height = 'h-[600px]',
  showControls = true,
  robots: externalRobots,
  sensors: externalSensors,
  entities: externalEntities,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<Map<string, any>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // State
  const [parcels, setParcels] = useState<CadastralParcel[]>([]);
  const [ndviData, setNdviData] = useState<Map<string, NDVIData[]>>(new Map());
  const [robots, setRobots] = useState<any[]>(externalRobots || []);
  const [sensors, setSensors] = useState<any[]>(externalSensors || []);
  const [entities, setEntities] = useState<any[]>(externalEntities || []);

  // Initialize selected layers from config (only enabled ones)
  const initialLayers = new Set<LayerType>(
    DEFAULT_LAYER_CONFIGS.filter(config => config.enabled).map(config => config.id)
  );
  const [selectedLayers, setSelectedLayers] = useState<Set<LayerType>>(initialLayers);

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    end: new Date().toISOString().split('T')[0], // Today
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(true);

  // Get layer configs sorted by order
  const layerConfigs = DEFAULT_LAYER_CONFIGS.filter(config => !config.hidden).sort((a, b) => a.order - b.order);

  // Initialize Cesium
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    console.log('[CesiumMapAdvanced] Initializing Cesium viewer');

    try {
      // @ts-ignore - Cesium types
      const Cesium = window.Cesium;

      if (!Cesium) {
        console.warn('[CesiumMapAdvanced] Cesium not available');
        return;
      }

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        vrButton: false,
        geocoder: true,
        homeButton: showControls,
        sceneModePicker: showControls,
        navigationHelpButton: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        infoBox: true,
        selectionIndicator: true,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(), // Will be updated dynamically if terrain is available
      });

      viewerRef.current = viewer;

      try {
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0f172a');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1f2937');
        viewer.scene.skyBox = undefined;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
      } catch (sceneError) {
        console.warn('[CesiumMapAdvanced] Unable to adjust scene appearance', sceneError);
      }

      // Set initial camera to Spain center
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-3.0, 40.0, 1000000),
      });

      console.log('[CesiumMapAdvanced] Viewer initialized');
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error initializing:', error);
    }

    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
          viewerRef.current = null;
        } catch (error) {
          console.error('[CesiumMapAdvanced] Error destroying viewer:', error);
        }
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const element = document.fullscreenElement;
      const active = element === wrapperRef.current;
      setIsFullscreen(active);
      if (viewerRef.current?.resize) {
        viewerRef.current.resize();
      } else {
        viewerRef.current?.scene?.requestRender?.();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const element = wrapperRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) {
      document.exitFullscreen?.().catch((err) => console.warn('[CesiumMapAdvanced] exitFullscreen failed', err));
    } else {
      element.requestFullscreen?.().catch((err) => console.warn('[CesiumMapAdvanced] requestFullscreen failed', err));
    }
  };

  // Load cadastral parcels
  const loadParcels = async () => {
    try {
      setIsLoading(true);
      const parcelsData = await parcelApi.getParcels();
      // Convert to CadastralParcel format - filter only Polygon geometries
      const convertedParcels = parcelsData
        .filter(p => p.geometry?.type === 'Polygon')
        .map(p => ({
          id: p.id,
          cadastral_reference: p.cadastralReference || '',
          municipality: p.municipality || '',
          province: p.province || '',
          crop_type: p.cropType || '',
          area_hectares: p.area || 0,
          geometry: p.geometry as { type: 'Polygon'; coordinates: number[][][]; },
          ndvi_enabled: p.ndviEnabled !== false,
        }));
      setParcels(convertedParcels);
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error loading parcels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load robots if not provided externally
  const loadRobots = async () => {
    if (externalRobots) {
      setRobots(externalRobots);
      return;
    }

    try {
      const robotsData = await api.getRobots();
      setRobots(robotsData);
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error loading robots:', error);
    }
  };

  // Load sensors if not provided externally
  const loadSensors = async () => {
    if (externalSensors) {
      setSensors(externalSensors);
      return;
    }

    try {
      const sensorsData = await api.getSensors();
      setSensors(sensorsData);
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error loading sensors:', error);
    }
  };

  // Load entities if not provided externally
  const loadEntities = async () => {
    if (externalEntities) {
      setEntities(externalEntities);
      return;
    }

    // Load other NGSI-LD entities if needed
    // This can be extended to load specific entity types
    try {
      // Example: Load all entities of type 'AgriDevice'
      // const response = await api.get('/ngsi-ld/v1/entities', {
      //   params: { type: 'AgriDevice' },
      // });
      // setEntities(response.data);
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error loading entities:', error);
    }
  };

  // Load NDVI data for date range
  const loadNDVIData = async () => {
    if (!selectedLayers.has('ndvi')) return;

    try {
      setIsLoading(true);
      const token = getToken() || sessionStorage.getItem('auth_token') || '';

      // Load NDVI for each parcel
      const ndviMap = new Map<string, NDVIData[]>();

      for (const parcel of parcels) {
        if (!parcel.ndvi_enabled) continue;

        try {
          // TODO: Implement NDVI API endpoint with date range
          // const response = await api.get(`/api/ndvi/parcels/${parcel.id}/time-series`, {
          //   params: {
          //     start_date: dateRange.start,
          //     end_date: dateRange.end,
          //   },
          //   headers: { Authorization: `Bearer ${token}` },
          // });
          // ndviMap.set(parcel.id, response.data);

          // Mock data for now
          const mockData: NDVIData[] = [
            {
              parcel_id: parcel.id,
              date: dateRange.start,
              ndvi_mean: 0.5 + Math.random() * 0.3,
              ndvi_min: 0.3,
              ndvi_max: 0.8,
              ndvi_stddev: 0.1,
            },
            {
              parcel_id: parcel.id,
              date: dateRange.end,
              ndvi_mean: 0.6 + Math.random() * 0.2,
              ndvi_min: 0.4,
              ndvi_max: 0.85,
              ndvi_stddev: 0.08,
            },
          ];
          ndviMap.set(parcel.id, mockData);
        } catch (err) {
          console.warn(`[CesiumMapAdvanced] Error loading NDVI for parcel ${parcel.id}:`, err);
        }
      }

      setNdviData(ndviMap);
    } catch (error) {
      console.error('[CesiumMapAdvanced] Error loading NDVI data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadParcels();
    // Load robots and sensors if their layers are enabled
    if (selectedLayers.has('robots')) {
      loadRobots();
    }
    if (selectedLayers.has('sensors')) {
      loadSensors();
    }
    if (selectedLayers.has('entities')) {
      loadEntities();
    }
  }, []);

  // Update robots/sensors/entities when external props change
  useEffect(() => {
    if (externalRobots) setRobots(externalRobots);
  }, [externalRobots]);

  useEffect(() => {
    if (externalSensors) setSensors(externalSensors);
  }, [externalSensors]);

  useEffect(() => {
    if (externalEntities) setEntities(externalEntities);
  }, [externalEntities]);

  // Load NDVI when date range or parcels change
  useEffect(() => {
    if (parcels.length > 0 && selectedLayers.has('ndvi')) {
      loadNDVIData();
    }
  }, [dateRange, parcels, selectedLayers]);

  // Configure imagery layers
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    // Remove all imagery layers
    viewer.imageryLayers.removeAll();

    // Add base layer (OSM)
    if (selectedLayers.has('osm')) {
      const osmProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
      });
      viewer.imageryLayers.addImageryProvider(osmProvider);
    }

    // Add PNOA layer (Ortofotografía)
    if (selectedLayers.has('pnoa')) {
      try {
        const pnoaProvider = new Cesium.WebMapServiceImageryProvider({
          url: 'https://www.ign.es/wms-inspire/pnoa-ma',
          layers: 'OI.OrthoimageCoverage',
          parameters: {
            format: 'image/png',
            transparent: true,
            srs: 'EPSG:3857',
          },
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
          maximumLevel: 19,
        });
        viewer.imageryLayers.addImageryProvider(pnoaProvider);
      } catch (error) {
        console.error('[CesiumMapAdvanced] Error adding PNOA layer:', error);
      }
    }

    // Add CNIG layer (Relieve)
    if (selectedLayers.has('cnig')) {
      try {
        const cnigProvider = new Cesium.WebMapServiceImageryProvider({
          url: 'https://www.ign.es/wms-inspire/pnoa-ma',
          layers: 'EL.GridCoverage',
          parameters: {
            format: 'image/png',
            transparent: true,
            srs: 'EPSG:3857',
          },
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
          maximumLevel: 15,
        });
        viewer.imageryLayers.addImageryProvider(cnigProvider);
      } catch (error) {
        console.error('[CesiumMapAdvanced] Error adding CNIG layer:', error);
      }
    }

    // Add IGN 3D terrain (if available)
    if (selectedLayers.has('ign-3d')) {
      // Use IGN WMS for terrain visualization
      try {
        const ignProvider = new Cesium.WebMapServiceImageryProvider({
          url: 'https://www.ign.es/wms-inspire/ign-base',
          layers: 'IGNBaseOrto',
          parameters: {
            format: 'image/png',
            transparent: true,
            srs: 'EPSG:3857',
          },
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
          maximumLevel: 18,
        });
        viewer.imageryLayers.addImageryProvider(ignProvider);
      } catch (error) {
        console.error('[CesiumMapAdvanced] Error adding IGN 3D layer:', error);
      }
    }
  }, [selectedLayers]);

  // Render all layers (parcels, NDVI, robots, sensors, entities)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    // Clear existing entities
    entitiesRef.current.forEach((entity) => {
      viewer.entities.remove(entity);
    });
    entitiesRef.current.clear();

    // Prepare entity data
    const entityData: EntityData = {
      robots: selectedLayers.has('robots') ? robots : undefined,
      sensors: selectedLayers.has('sensors') ? sensors : undefined,
      parcels: selectedLayers.has('catastro') || selectedLayers.has('ndvi') ? parcels : undefined,
      ndviData: selectedLayers.has('ndvi') ? ndviData : undefined,
      entities: selectedLayers.has('entities') ? entities : undefined,
    };

    // Render entity layers using registered renderers
    selectedLayers.forEach((layerType) => {
      const renderer = LAYER_RENDERERS.get(layerType);
      if (renderer) {
        const config = layerConfigs.find(c => c.id === layerType);
        if (config) {
          renderer.render(viewer, Cesium, entityData, config);
        }
      }
    });

    // Render parcels and NDVI (custom logic)
    if (selectedLayers.has('catastro') || selectedLayers.has('ndvi')) {

      parcels.forEach((parcel) => {
        if (!parcel.geometry || parcel.geometry.type !== 'Polygon') return;

        const coordinates = parcel.geometry.coordinates[0];
        const positions = coordinates.map((coord) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0)
        );

        // Get NDVI color if available
        let color = Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.4);
        let outlineColor = Cesium.Color.fromCssColorString('#4ade80');
        let height = 0;

        if (selectedLayers.has('ndvi')) {
          const parcelNdvi = ndviData.get(parcel.id);
          if (parcelNdvi && parcelNdvi.length > 0) {
            // Use most recent NDVI value
            const latestNdvi = parcelNdvi[parcelNdvi.length - 1];
            const ndviValue = latestNdvi.ndvi_mean;

            // Color mapping based on NDVI value
            if (ndviValue < 0) {
              color = Cesium.Color.fromCssColorString('#8B4513').withAlpha(0.5); // Brown
            } else if (ndviValue < 0.2) {
              color = Cesium.Color.fromCssColorString('#FF6347').withAlpha(0.5); // Red
            } else if (ndviValue < 0.5) {
              color = Cesium.Color.fromCssColorString('#FFA500').withAlpha(0.5); // Orange
            } else if (ndviValue < 0.7) {
              color = Cesium.Color.fromCssColorString('#9ACD32').withAlpha(0.5); // Light green
            } else {
              color = Cesium.Color.fromCssColorString('#228B22').withAlpha(0.5); // Dark green
            }

            outlineColor = color.withAlpha(1.0);
            height = ndviValue * 100; // Extrusion based on NDVI
          }
        }

        const entity = viewer.entities.add({
          id: `parcel-${parcel.id}`,
          name: `${parcel.cadastral_reference} - ${parcel.municipality}`,
          polygon: {
            hierarchy: positions,
            material: color,
            outline: !selectedLayers.has('ign-3d'),
            outlineColor: outlineColor,
            height: height,
            extrudedHeight: height > 0 ? height + 10 : undefined,
          },
          description: `
          <table>
            <tr><td><b>Referencia Catastral:</b></td><td>${parcel.cadastral_reference}</td></tr>
            <tr><td><b>Municipio:</b></td><td>${parcel.municipality}</td></tr>
            <tr><td><b>Provincia:</b></td><td>${parcel.province}</td></tr>
            <tr><td><b>Cultivo:</b></td><td>${parcel.crop_type}</td></tr>
            <tr><td><b>Área:</b></td><td>${parcel.area_hectares?.toFixed(2) || 'N/A'} ha</td></tr>
            ${selectedLayers.has('ndvi') && ndviData.has(parcel.id) ? `
              <tr><td><b>NDVI (último):</b></td><td>${ndviData.get(parcel.id)![ndviData.get(parcel.id)!.length - 1].ndvi_mean.toFixed(2)}</td></tr>
            ` : ''}
          </table>
        `,
        });

        entitiesRef.current.set(parcel.id, entity);
      });
    }

    // Store other entities in ref
    [...robots, ...sensors, ...entities].forEach((item) => {
      const entity = viewer.entities.getById(`${item.type || 'entity'}-${item.id}`);
      if (entity) {
        entitiesRef.current.set(item.id, entity);
      }
    });

    // Zoom to entities if available
    if (viewer.entities.values.length > 0) {
      viewer.zoomTo(viewer.entities);
    }
  }, [parcels, ndviData, robots, sensors, entities, selectedLayers]);

  const toggleLayer = (layer: LayerType) => {
    const newLayers = new Set(selectedLayers);
    if (newLayers.has(layer)) {
      newLayers.delete(layer);
    } else {
      newLayers.add(layer);
      // Ensure base layer is always present
      if (!newLayers.has('osm')) {
        newLayers.add('osm');
      }
    }
    setSelectedLayers(newLayers);
  };

  const heightClass = typeof height === 'string' ? height : '';
  const heightStyle = typeof height === 'number' ? { minHeight: `${height}px` } : undefined;

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full rounded-lg overflow-hidden bg-slate-900 ${heightClass || 'min-h-[600px]'}`}
      style={heightStyle}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-gray-900">Cargando datos...</span>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="absolute top-4 left-4 z-10 bg-black/60 text-white px-3 py-2 rounded-lg">
        <h3 className="font-semibold">{title}</h3>
      </div>

      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2 items-end">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center justify-center rounded-full bg-black/60 text-white p-2 hover:bg-black/70 transition"
          aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
        </button>
      </div>

      {/* Layer Panel */}
      {showLayerPanel && (
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-lg p-4 w-80 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-gray-600" />
              <h4 className="font-semibold text-gray-900">Capas</h4>
            </div>
            <button
              onClick={() => setShowLayerPanel(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>

          {/* Layer toggles - grouped by category */}
          <div className="space-y-4 mb-4">
            {['base', 'terrain', 'data', 'entities'].map((category) => {
              const categoryLayers = layerConfigs.filter(c => c.category === category);
              if (categoryLayers.length === 0) return null;

              const categoryNames: Record<string, string> = {
                base: 'Mapas Base',
                terrain: 'Terreno',
                data: 'Datos',
                entities: 'Entidades',
              };

              return (
                <div key={category}>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    {categoryNames[category]}
                  </div>
                  <div className="space-y-1">
                    {categoryLayers.map((config) => (
                      <label
                        key={config.id}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLayers.has(config.id)}
                          onChange={() => toggleLayer(config.id)}
                          disabled={config.requiresData &&
                            (config.id === 'catastro' && parcels.length === 0) ||
                            (config.id === 'ndvi' && parcels.length === 0) ||
                            (config.id === 'robots' && robots.length === 0) ||
                            (config.id === 'sensors' && sensors.length === 0) ||
                            (config.id === 'entities' && entities.length === 0)
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{config.name}</div>
                          <div className="text-xs text-gray-500">{config.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Date range selector for NDVI */}
          {selectedLayers.has('ndvi') && (
            <div className="border-t pt-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <h4 className="font-semibold text-gray-900 text-sm">Rango de Fechas NDVI</h4>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Desde</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Data counts */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4" />
              <span>{parcels.length} parcelas</span>
            </div>
            {selectedLayers.has('robots') && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>🤖</span>
                <span>{robots.length} robots</span>
              </div>
            )}
            {selectedLayers.has('sensors') && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>📡</span>
                <span>{sensors.length} sensores</span>
              </div>
            )}
            {selectedLayers.has('entities') && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>📦</span>
                <span>{entities.length} entidades</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show panel button */}
      {!showLayerPanel && (
        <button
          onClick={() => setShowLayerPanel(true)}
          className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-lg p-2 hover:bg-gray-50"
        >
          <Eye className="w-5 h-5 text-gray-600" />
        </button>
      )}

      {/* Cesium container */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default CesiumMapAdvanced;

