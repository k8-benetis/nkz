// =============================================================================
// Cesium Polygon Drawer - Manual Parcel Cropping Tool
// =============================================================================

import React, { useEffect, useRef, useState, useImperativeHandle } from 'react';
import { Compass, Eraser, MousePointer2, CheckCircle2, Expand, Minimize, Layers, Mountain, Loader2 } from 'lucide-react';
import type { GeoPolygon } from '@/types';
import { calculatePolygonAreaHectares, toGeoPolygon } from '@/utils/geo';
import { useI18n } from '@/context/I18nContext';
import { detectTerrainProviderFromParcels, getTerrainProviderUrl, getTerrainProviderName, type TerrainProviderType } from '@/utils/terrain';
import { getNDVIColor } from '@/utils/ndviColors';
// api y getConfig ya no son necesarios - terrain usa providers externos directamente

interface CadastralParcel {
  id: string;
  cadastral_reference?: string;
  municipality?: string;
  province?: string;
  area_hectares?: number;
  geometry?: GeoPolygon;
}

interface ParcelNDVIData {
  [parcelId: string]: {
    ndviMean: number;
    date: string;
  };
}

export interface CesiumPolygonDrawerRef {
  resetDrawing: () => void;
  clearDrawing: () => void;
  centerOnParcel?: (parcelId: string) => void;
  centerOnCoordinates?: (longitude: number, latitude: number) => void;
  showPreviewPolygon?: (geometry: GeoPolygon) => void;
  clearPreviewPolygon?: () => void;
}

interface CesiumPolygonDrawerProps {
  onComplete: (geometry: GeoPolygon, areaHectares: number | null) => void;
  onCancel?: () => void;
  height?: string | number;
  className?: string;
  disabled?: boolean;
  // New props for parcel selection
  cadastralParcels?: CadastralParcel[];
  onParcelClick?: (parcel: CadastralParcel) => void;
  mode?: 'draw' | 'select' | 'edit' | 'view'; // Extended modes for new components
  // Context menu callback for drawn polygons
  onContextMenu?: (geometry: GeoPolygon, areaHectares: number | null, position: { x: number; y: number }) => void;
  // Initial geometry for edit/view modes
  initialGeometry?: GeoPolygon;
  // NDVI data for parcel coloring
  parcelNDVIData?: ParcelNDVIData;
  // Callback when clicking on empty space in select mode (to query cadastral services)
  onEmptySpaceClick?: (longitude: number, latitude: number) => void;
}

export const CesiumPolygonDrawer = React.forwardRef<CesiumPolygonDrawerRef, CesiumPolygonDrawerProps>(({
  onComplete,
  onCancel,
  height = 'min-h-[480px]',
  className = '',
  disabled = false,
  cadastralParcels = [],
  onParcelClick,
  mode = 'draw',
  onContextMenu,
  initialGeometry,
  parcelNDVIData = {},
  onEmptySpaceClick,
}, ref) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const handlerRef = useRef<any>(null);
  const polygonEntityRef = useRef<any>(null);
  const dynamicHierarchyRef = useRef<any>(null);
  const dynamicPointRef = useRef<any>(null);
  const pointEntitiesRef = useRef<any[]>([]);
  const cartesianPositionsRef = useRef<any[]>([]);
  const previewPolygonEntityRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentGeometry, setCurrentGeometry] = useState<GeoPolygon | null>(null);
  const [currentArea, setCurrentArea] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [baseLayer, setBaseLayer] = useState<'osm' | 'pnoa' | 'cnig'>('pnoa');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [enable3D, setEnable3D] = useState(true); // Enable 3D terrain by default
  const [terrainProvider, setTerrainProvider] = useState<TerrainProviderType>('auto'); // Auto-detect terrain provider
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  // Terrain ahora usa providers externos (IGN/IDENA) directamente, no servicio bajo demanda

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[CesiumPolygonDrawer] Cesium not available on window');
      return;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      skyBox: false,
      skyAtmosphere: false,
      homeButton: true,
      navigationHelpButton: false,
      baseLayerPicker: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(), // Start with ellipsoid, will be updated by useEffect
      selectionIndicator: false,
      infoBox: false,
    });

    // Hide Cesium ION credits completely
    if (viewer.cesiumWidget?.creditContainer) {
      viewer.cesiumWidget.creditContainer.style.display = 'none';
    }
    // Also hide credit container in the bottom-right
    const creditContainer = document.querySelector('.cesium-widget-credits');
    if (creditContainer) {
      (creditContainer as HTMLElement).style.display = 'none';
    }

    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0f172a');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1f2937');
    viewer.scene.globe.depthTestAgainstTerrain = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;

    // Configure imagery provider IMMEDIATELY after creating viewer
    // Remove default imagery layer and add PNOA as default (no Cesium ION)
    try {
      viewer.imageryLayers.removeAll();
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
        credit: 'PNOA - IGN España',
      });
      viewer.imageryLayers.addImageryProvider(pnoaProvider);
      console.log('[CesiumPolygonDrawer] Initial imagery provider (PNOA) configured');
      viewer.scene.requestRender?.();
    } catch (error) {
      console.error('[CesiumPolygonDrawer] Error configuring initial imagery provider:', error);
    }

    viewerRef.current = viewer;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-3.7, 40.41, 600_000),
    });

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Update base layer when baseLayer state changes
  useEffect(() => {
    if (!viewerRef.current) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;

    // Wait a bit to ensure viewer is fully initialized
    const timeoutId = setTimeout(() => {
      try {
        if (viewer.isDestroyed()) return;

        // Verify viewer is ready
        if (!viewer.imageryLayers) {
          console.warn('[CesiumPolygonDrawer] Viewer imageryLayers not ready yet');
          return;
        }

        viewer.imageryLayers.removeAll();

        if (baseLayer === 'osm') {
          const osmProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
          });
          viewer.imageryLayers.addImageryProvider(osmProvider);
          console.log('[CesiumPolygonDrawer] OSM layer added');
        } else if (baseLayer === 'pnoa') {
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
          console.log('[CesiumPolygonDrawer] PNOA layer added');
        } else if (baseLayer === 'cnig') {
          const cnigProvider = new Cesium.WebMapServiceImageryProvider({
            url: 'https://www.ign.es/wms-inspire/pnoa-ma',
            layers: 'EL.GridCoverage',
            parameters: {
              format: 'image/png',
              transparent: true,
              srs: 'EPSG:3857',
            },
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 19,
          });
          viewer.imageryLayers.addImageryProvider(cnigProvider);
          console.log('[CesiumPolygonDrawer] CNIG layer added');
        }

        if (!viewer.isDestroyed()) viewer.scene.requestRender?.();
        console.log(`[CesiumPolygonDrawer] Base layer updated to: ${baseLayer}`);
      } catch (error) {
        console.error('[CesiumPolygonDrawer] Error updating base layer:', error);
      }
    }, 100); // Small delay to ensure viewer is ready

    return () => {
      clearTimeout(timeoutId);
    };
  }, [baseLayer]);

  // Handle initialGeometry
  useEffect(() => {
    if (!viewerRef.current || !initialGeometry) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    if (viewer.isDestroyed()) return;

    try {
      // Clear previous initial geometry if any
      viewer.entities.removeById('initial-geometry');

      if (initialGeometry.coordinates && initialGeometry.coordinates[0]) {
        const positions = initialGeometry.coordinates[0].map((coord: number[]) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
        );

        const entity = viewer.entities.add({
          id: 'initial-geometry',
          polygon: {
            hierarchy: positions,
            material: Cesium.Color.YELLOW.withAlpha(0.3),
            outline: true,
            outlineColor: Cesium.Color.YELLOW,
            outlineWidth: 2,
            classificationType: Cesium.ClassificationType.TERRAIN,
          }
        });

        viewer.zoomTo(entity);
      }
    } catch (error) {
      console.error('[CesiumPolygonDrawer] Error handling initialGeometry:', error);
    }
  }, [initialGeometry]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const element = document.fullscreenElement;
      setIsFullscreen(element === wrapperRef.current);
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

  // Close layer picker when clicking outside
  useEffect(() => {
    if (!showLayerPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.layer-picker-container')) {
        setShowLayerPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLayerPicker]);

  // Detect terrain provider from parcels when 'auto' is selected
  useEffect(() => {
    if (terrainProvider === 'auto' && cadastralParcels.length > 0) {
      const detected = detectTerrainProviderFromParcels(cadastralParcels);
      console.log(`[CesiumPolygonDrawer] 🗺️ Auto-detected terrain provider: ${detected} (based on parcels)`);
      // Note: We don't change terrainProvider state here, just log it
      // The actual provider will be determined when updating terrain
    }
  }, [terrainProvider, cadastralParcels]);

  // Update terrain provider when 3D mode or terrain provider selection changes
  // Usa providers externos (IGN/IDENA) - sistema moderno
  useEffect(() => {
    if (!viewerRef.current) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;

    try {
      if (enable3D) {
        // Determine which provider to use
        let providerToUse: 'idena' | 'ign' = 'ign';

        if (terrainProvider === 'idena') {
          providerToUse = 'idena';
        } else if (terrainProvider === 'ign') {
          providerToUse = 'ign';
        } else if (terrainProvider === 'auto') {
          // Auto-detect based on parcels or camera position
          if (cadastralParcels.length > 0) {
            providerToUse = detectTerrainProviderFromParcels(cadastralParcels);
          } else {
            // Try to get camera position
            try {
              const camera = viewer.camera;
              const cartographic = camera.positionCartographic;
              const lon = Cesium.Math.toDegrees(cartographic.longitude);
              const lat = Cesium.Math.toDegrees(cartographic.latitude);
              providerToUse = detectTerrainProviderFromParcels([], [lon, lat]);
            } catch {
              // Default to IGN if can't detect
              providerToUse = 'ign';
            }
          }
        }

        const terrainUrl = getTerrainProviderUrl(providerToUse);
        const providerName = getTerrainProviderName(providerToUse);

        console.log(`[CesiumPolygonDrawer] 🌍 Activating ${providerName} terrain provider...`);
        console.log(`[CesiumPolygonDrawer] URL: ${terrainUrl}`);

        // Remove /layer.json if present for CesiumTerrainProvider
        const baseUrl = terrainUrl.replace('/layer.json', '');

        // Use fromUrl for better compatibility with recent CesiumJS versions
        Cesium.CesiumTerrainProvider.fromUrl(baseUrl, {
          requestWaterMask: false,
          requestVertexNormals: true,
        })
          .then((terrainProviderInstance: any) => {
            if (viewer.isDestroyed()) return;

            // Handle terrain provider errors gracefully
            terrainProviderInstance.errorEvent.addEventListener((error: any) => {
              if (viewer.isDestroyed()) return;
              console.error(`[CesiumPolygonDrawer] ⚠️ ${providerName} terrain provider error:`, error);
              console.warn('[CesiumPolygonDrawer] Falling back to ellipsoid terrain');
              try {
                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                viewer.scene.globe.depthTestAgainstTerrain = false;
                viewer.scene.requestRender?.();
              } catch (e) {
                console.error('[CesiumPolygonDrawer] Error setting fallback terrain:', e);
              }
            });

            // Set terrain provider
            viewer.terrainProvider = terrainProviderInstance;
            viewer.scene.globe.depthTestAgainstTerrain = true;
            console.log(`[CesiumPolygonDrawer] ✅ ${providerName} terrain provider activated`);

            // Force scene update
            viewer.scene.requestRender?.();
          })
          .catch((error: any) => {
            if (viewer.isDestroyed()) return;
            console.error(`[CesiumPolygonDrawer] ❌ Failed to load ${providerName} terrain provider:`, error);
            console.warn('[CesiumPolygonDrawer] Falling back to ellipsoid terrain');
            try {
              viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
              viewer.scene.globe.depthTestAgainstTerrain = false;
              viewer.scene.requestRender?.();
            } catch (e) {
              console.error('[CesiumPolygonDrawer] Error setting fallback terrain:', e);
            }
          });
      } else {
        // Use ellipsoid when 3D is disabled
        console.log('[CesiumPolygonDrawer] Using ellipsoid terrain (3D disabled)');
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.requestRender?.();
      }
    } catch (error) {
      console.error('[CesiumPolygonDrawer] ❌ Error updating terrain provider:', error);
      // Fallback to ellipsoid on error
      try {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.requestRender?.();
      } catch (fallbackError) {
        console.error('[CesiumPolygonDrawer] ❌ Failed to set fallback terrain:', fallbackError);
      }
    }
  }, [enable3D, terrainProvider, cadastralParcels]);

  // Load cadastral parcels as entities - Always show them, not just in select mode
  useEffect(() => {
    if (!viewerRef.current) return;

    console.log('[CesiumPolygonDrawer] Loading cadastral parcels:', cadastralParcels.length);

    if (!cadastralParcels.length) {
      console.log('[CesiumPolygonDrawer] No cadastral parcels to display');
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[CesiumPolygonDrawer] Cesium not available');
      return;
    }

    const viewer = viewerRef.current;
    const parcelEntities: any[] = [];
    let clickHandler: any = null;

    // Determine height reference based on terrain availability
    const heightReference = enable3D
      ? Cesium.HeightReference.CLAMP_TO_GROUND
      : Cesium.HeightReference.NONE;

    cadastralParcels.forEach((parcel) => {
      if (!parcel.geometry) {
        console.warn(`[CesiumPolygonDrawer] Parcel ${parcel.id} has no geometry`);
        return;
      }

      const coordinates = parcel.geometry.coordinates?.[0];
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
        console.warn(`[CesiumPolygonDrawer] Parcel ${parcel.id} has invalid geometry:`, parcel.geometry);
        return;
      }

      console.log(`[CesiumPolygonDrawer] Adding parcel ${parcel.id} with ${coordinates.length} points`);

      const positions = coordinates.map((coord: number[]) =>
        Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0)
      );

      // Get NDVI color for this parcel if available
      const ndviInfo = parcelNDVIData[parcel.id];
      
      // Check if this is a grid preview cell (starts with "grid-preview-")
      const isGridPreview = parcel.id && parcel.id.startsWith('grid-preview-');
      
      let parcelColor: any;
      let material: any;
      let outlineColor: any;
      let outlineWidth: number;
      
      if (isGridPreview) {
        // Grid preview: yellow/orange outline, no fill
        parcelColor = Cesium.Color.YELLOW;
        material = Cesium.Color.YELLOW.withAlpha(0.1); // Very transparent fill
        outlineColor = Cesium.Color.ORANGE;
        outlineWidth = 2;
      } else {
        // Regular parcel: use NDVI color or default green
        const ndviColor = ndviInfo ? getNDVIColor(ndviInfo.ndviMean) : '#4ade80';
        parcelColor = Cesium.Color.fromCssColorString(ndviColor);
        material = parcelColor.withAlpha(0.4);
        outlineColor = parcelColor;
        outlineWidth = 2;
      }

      const entity = viewer.entities.add({
        id: `parcel-${parcel.id}`,
        name: parcel.cadastral_reference || parcel.id,
        polygon: {
          hierarchy: positions,
          material: material,
          outline: true, // Always show outline for grid preview
          outlineColor: outlineColor,
          outlineWidth: outlineWidth,
          classificationType: enable3D ? Cesium.ClassificationType.TERRAIN : undefined,
          // Store original colors for reset
          _originalMaterial: isGridPreview ? material : parcelColor.withAlpha(0.4),
          _originalOutlineColor: isGridPreview ? outlineColor : parcelColor,
          _originalOutlineWidth: outlineWidth,
        },
        label: isGridPreview ? undefined : {
          text: ndviInfo 
            ? `${parcel.cadastral_reference || `Parcela ${parcel.id}`} (NDVI: ${ndviInfo.ndviMean.toFixed(3)})`
            : (parcel.cadastral_reference || `Parcela ${parcel.id}`),
          font: '12pt sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: enable3D ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE,
          disableDepthTestDistance: enable3D ? Number.POSITIVE_INFINITY : undefined, // Ensure label is always visible
        },
      });

      parcelEntities.push(entity);
    });

    console.log(`[CesiumPolygonDrawer] Added ${parcelEntities.length} parcel entities to map`);

    // Set up click handler for parcel selection (only in select mode)
    if (mode === 'select' && (onParcelClick || onEmptySpaceClick)) {
      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((click: any) => {
        const pickedObject = viewer.scene.pick(click.position);
        
        // Check if clicked on an existing parcel
        if (pickedObject && pickedObject.id) {
          const entityId = pickedObject.id.id;
          if (entityId && entityId.startsWith('parcel-')) {
            const parcelId = entityId.replace('parcel-', '');
            const parcel = cadastralParcels.find((p) => p.id === parcelId);
            if (parcel && onParcelClick) {
              onParcelClick(parcel);
              return; // Handled, exit early
            }
          }
        }
        
        // If no parcel was clicked and we have onEmptySpaceClick callback,
        // query cadastral service for coordinates
        if (onEmptySpaceClick) {
          // Get coordinates from click position
          // Try to get position from terrain first, then fallback to ellipsoid
          let cartesian = viewer.scene.pickPosition(click.position);
          if (!cartesian) {
            cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
          }
          
          if (cartesian) {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const longitude = Cesium.Math.toDegrees(cartographic.longitude);
            const latitude = Cesium.Math.toDegrees(cartographic.latitude);
            console.log(`[CesiumPolygonDrawer] Empty space clicked at (${longitude}, ${latitude}), querying cadastral service`);
            onEmptySpaceClick(longitude, latitude);
          } else {
            console.warn('[CesiumPolygonDrawer] Could not determine coordinates from click position');
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    return () => {
      if (clickHandler) {
        clickHandler.destroy();
      }
      if (viewer && !viewer.isDestroyed()) {
        parcelEntities.forEach((entity) => viewer.entities.remove(entity));
      }
    };
  }, [cadastralParcels, mode, onParcelClick, onEmptySpaceClick, enable3D, parcelNDVIData]);

  const toggleFullscreen = () => {
    const element = wrapperRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) {
      document.exitFullscreen?.().catch((err) => console.warn('[CesiumPolygonDrawer] exitFullscreen failed', err));
    } else {
      element.requestFullscreen?.().catch((err) => console.warn('[CesiumPolygonDrawer] requestFullscreen failed', err));
    }
  };

  const clearDrawingEntities = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (polygonEntityRef.current) {
      viewer.entities.remove(polygonEntityRef.current);
      polygonEntityRef.current = null;
    }
    if (dynamicPointRef.current) {
      viewer.entities.remove(dynamicPointRef.current);
      dynamicPointRef.current = null;
    }
    pointEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    pointEntitiesRef.current = [];
    cartesianPositionsRef.current = [];
    dynamicHierarchyRef.current = null;
  };

  const teardownHandler = () => {
    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }
  };

  const finishDrawing = () => {
    if (cartesianPositionsRef.current.length < 3) {
      teardownHandler();
      setIsDrawing(false);
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const coordinates: number[][] = cartesianPositionsRef.current.map((cartesian) => {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
    });

    const polygon = toGeoPolygon(coordinates);
    if (!polygon) {
      teardownHandler();
      setIsDrawing(false);
      return;
    }

    const area = calculatePolygonAreaHectares(polygon);
    setCurrentGeometry(polygon);
    setCurrentArea(area);
    onComplete(polygon, area);

    if (dynamicPointRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(dynamicPointRef.current);
      dynamicPointRef.current = null;
    }
    teardownHandler();
    setIsDrawing(false);
  };

  const startDrawing = () => {
    // @ts-ignore
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) {
      console.warn('[CesiumPolygonDrawer] Cannot start drawing, Cesium or viewer not ready');
      return;
    }

    clearDrawingEntities();
    setCurrentGeometry(null);
    setCurrentArea(null);
    setIsDrawing(true);

    const positions: any[] = [];
    cartesianPositionsRef.current = positions;

    polygonEntityRef.current = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.CallbackProperty(() => {
          if (positions.length === 0) {
            return undefined;
          }
          return new Cesium.PolygonHierarchy(
            dynamicHierarchyRef.current ? dynamicHierarchyRef.current : positions
          );
        }, false),
        material: Cesium.Color.LIME.withAlpha(0.35),
        outline: false,
        outlineColor: Cesium.Color.LIME,
        outlineWidth: 2,
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
    });

    handlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handlerRef.current.setInputAction((event: any) => {
      const earthPosition = viewer.scene.pickPosition(event.position);
      if (!earthPosition) {
        const cartesian = viewer.camera.pickEllipsoid(event.position);
        if (!cartesian) {
          return;
        }
        positions.push(cartesian);
        dynamicHierarchyRef.current = null;
        const pointEntity = viewer.entities.add({
          position: cartesian,
          point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.DEEPSKYBLUE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
          },
        });
        pointEntitiesRef.current.push(pointEntity);
        return;
      }

      positions.push(earthPosition);
      dynamicHierarchyRef.current = null;

      const pointEntity = viewer.entities.add({
        position: earthPosition,
        point: {
          pixelSize: 8,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.DEEPSKYBLUE,
          outlineWidth: 2,
        },
      });
      pointEntitiesRef.current.push(pointEntity);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handlerRef.current.setInputAction((event: any) => {
      if (positions.length === 0) return;
      const newPosition = viewer.scene.pickPosition(event.endPosition);
      if (!newPosition) return;
      dynamicHierarchyRef.current = positions.concat([newPosition]);
      if (!dynamicPointRef.current) {
        dynamicPointRef.current = viewer.entities.add({
          position: new Cesium.CallbackProperty(() => newPosition, false),
          point: {
            pixelSize: 6,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
          },
        });
      } else {
        dynamicPointRef.current.position = new Cesium.CallbackProperty(() => newPosition, false);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handlerRef.current.setInputAction((event: any) => {
      // If polygon is complete (has at least 3 points), show context menu
      if (positions.length >= 3 && onContextMenu) {
        console.log('[CesiumPolygonDrawer] Right click detected, showing context menu');
        const coordinates: number[][] = positions.map((cartesian) => {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
        });

        const polygon = toGeoPolygon(coordinates);
        if (polygon && event.position) {
          const area = calculatePolygonAreaHectares(polygon);
          // Get click position in screen coordinates
          const position = {
            x: event.position.x,
            y: event.position.y,
          };
          onContextMenu(polygon, area, position);
        }
      } else {
        // If polygon is not complete, finish drawing normally
        finishDrawing();
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  };

  const resetDrawing = () => {
    clearDrawingEntities();
    teardownHandler();
    setIsDrawing(false);
    setCurrentGeometry(null);
    setCurrentArea(null);
    if (onCancel) {
      onCancel();
    }
  };

  const clearDrawing = () => {
    clearDrawingEntities();
    setIsDrawing(false);
    setCurrentGeometry(null);
    setCurrentArea(null);
  };

  const showPreviewPolygon = (geometry: GeoPolygon) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    // Clear any existing preview
    clearPreviewPolygon();

    const coordinates = geometry.coordinates?.[0];
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      console.warn('[CesiumPolygonDrawer] Invalid geometry for preview');
      return;
    }

    const positions = coordinates.map((coord: number[]) =>
      Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0)
    );

    const heightReference = enable3D
      ? Cesium.HeightReference.CLAMP_TO_GROUND
      : Cesium.HeightReference.NONE;

    previewPolygonEntityRef.current = viewer.entities.add({
      id: 'preview-cadastral-polygon',
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.YELLOW.withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 3,
        classificationType: enable3D ? Cesium.ClassificationType.TERRAIN : undefined,
        heightReference: heightReference,
      },
    });

    // Fly to the polygon
    const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
    if (boundingSphere) {
      viewer.camera.flyTo({
        destination: boundingSphere.center,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 1.5,
        complete: () => {
          if (!viewer.isDestroyed()) {
            viewer.camera.moveBackward(boundingSphere.radius * 2.5);
          }
        },
      });
    }
  };

  const clearPreviewPolygon = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (previewPolygonEntityRef.current) {
      viewer.entities.remove(previewPolygonEntityRef.current);
      previewPolygonEntityRef.current = null;
    }
  };

  const centerOnCoordinates = (longitude: number, latitude: number) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      console.warn('[CesiumPolygonDrawer] Viewer not available for centerOnCoordinates');
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[CesiumPolygonDrawer] Cesium not available');
      return;
    }

    console.log(`[CesiumPolygonDrawer] Centering on coordinates: (${longitude}, ${latitude})`);
    
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 500), // 500m altitude
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0,
      },
      duration: 1.0,
    });
  };

  const centerOnParcel = (parcelId: string) => {
    console.log(`[CesiumPolygonDrawer] centerOnParcel called for: ${parcelId}`);
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      console.warn('[CesiumPolygonDrawer] Viewer not available for centerOnParcel');
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[CesiumPolygonDrawer] Cesium not available');
      return;
    }

    // Always try to find parcel in cadastralParcels first (most reliable)
    const parcel = cadastralParcels.find(p => p.id === parcelId);
    console.log(`[CesiumPolygonDrawer] Parcel lookup: found=${!!parcel}, hasGeometry=${!!parcel?.geometry}, cadastralParcels.length=${cadastralParcels.length}`);

    let positions: any[] | null = null;
    let entity: any = null;

    // Strategy 1: Try to get from existing entity in map
    const entityId = `parcel-${parcelId}`;
    entity = viewer.entities.getById(entityId);
    
    if (entity && entity.polygon) {
      console.log(`[CesiumPolygonDrawer] Found existing entity in map`);
      try {
        const hierarchy = entity.polygon.hierarchy.getValue();
        if (hierarchy && hierarchy.length > 0) {
          positions = hierarchy;
        }
      } catch (e) {
        console.warn(`[CesiumPolygonDrawer] Error getting hierarchy from entity:`, e);
      }
    }

    // Strategy 2: If not found in map, use parcel geometry from cadastralParcels
    if (!positions && parcel && parcel.geometry) {
      console.log(`[CesiumPolygonDrawer] Using geometry from cadastralParcels`);
      const coordinates = parcel.geometry.coordinates?.[0];
      
      if (coordinates && Array.isArray(coordinates) && coordinates.length >= 3) {
        positions = coordinates.map((coord: number[]) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0)
        );
        
        // If entity doesn't exist, create it
        if (!entity) {
          console.log(`[CesiumPolygonDrawer] Creating new entity for parcel`);
          const ndviInfo = parcelNDVIData[parcel.id];
          const ndviColor = ndviInfo ? getNDVIColor(ndviInfo.ndviMean) : '#4ade80';
          const parcelColor = Cesium.Color.fromCssColorString(ndviColor);
          
          entity = viewer.entities.add({
            id: entityId,
            name: parcel.cadastral_reference || parcel.id,
            polygon: {
              hierarchy: positions,
              material: Cesium.Color.CYAN.withAlpha(0.6),
              outline: true,
              outlineColor: Cesium.Color.CYAN,
              outlineWidth: 3,
              classificationType: enable3D ? Cesium.ClassificationType.TERRAIN : undefined,
              _originalMaterial: parcelColor.withAlpha(0.4),
              _originalOutlineColor: parcelColor,
              _originalOutlineWidth: 2,
            },
          });
        } else {
          // Update existing entity to highlight it
          entity.polygon.material = Cesium.Color.CYAN.withAlpha(0.6);
          entity.polygon.outlineColor = Cesium.Color.CYAN;
          entity.polygon.outlineWidth = 3;
        }
      }
    }

    // Reset all other parcel colors
    viewer.entities.values.forEach((e: any) => {
      if (e.id && e.id.startsWith('parcel-') && e.id !== entityId && e.polygon) {
        e.polygon.material = e.polygon._originalMaterial || Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.4);
        e.polygon.outlineColor = e.polygon._originalOutlineColor || Cesium.Color.fromCssColorString('#4ade80');
        e.polygon.outlineWidth = e.polygon._originalOutlineWidth || 2;
      }
    });

    // Fly to parcel if we have positions
    if (positions && positions.length >= 3) {
      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      if (boundingSphere) {
        // Increase distance multiplier for better view (more padding around parcel)
        const optimalDistance = boundingSphere.radius * 3.5;
        console.log(`[CesiumPolygonDrawer] Flying to parcel, radius: ${boundingSphere.radius.toFixed(0)}, distance: ${optimalDistance.toFixed(0)}`);
        
        viewer.camera.flyTo({
          destination: boundingSphere.center,
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0,
          },
          duration: 1.5,
          offset: new Cesium.HeadingPitchRange(
            0, // heading
            Cesium.Math.toRadians(-45), // pitch
            optimalDistance // range (distance from center)
          ),
        });
      } else {
        console.error(`[CesiumPolygonDrawer] Could not calculate bounding sphere from ${positions.length} positions`);
      }
    } else {
      console.error(`[CesiumPolygonDrawer] No valid positions found for parcel ${parcelId}. Positions:`, positions?.length || 0);
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    resetDrawing,
    clearDrawing,
    centerOnParcel,
    centerOnCoordinates,
    showPreviewPolygon,
    clearPreviewPolygon,
  }));

  const heightClass = typeof height === 'string' ? height : '';
  const heightStyle = typeof height === 'number' ? { minHeight: `${height}px` } : undefined;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startDrawing}
          disabled={isDrawing || disabled}
          className="inline-flex items-center px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <Compass className="w-4 h-4 mr-2" />
          {isDrawing ? t('common.drawing') : disabled ? t('common.read_only') : t('common.start_drawing')}
        </button>
        <button
          type="button"
          onClick={resetDrawing}
          className="inline-flex items-center px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition-colors"
        >
          <Eraser className="w-4 h-4 mr-2" />
          {t('common.clear')}
        </button>
        {isDrawing && (
          <span className="inline-flex items-center text-sm text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
            <MousePointer2 className="w-4 h-4 mr-2" />
            {t('common.drawing_instructions')}
          </span>
        )}
      </div>

      <div
        ref={wrapperRef}
        className={`relative w-full rounded-xl border border-gray-200 shadow-inner bg-slate-900 overflow-hidden ${heightClass || 'min-h-[480px]'}`}
        style={heightStyle}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          {/* 3D Toggle */}
          <button
            type="button"
            onClick={() => setEnable3D(!enable3D)}
            className={`inline-flex items-center justify-center rounded-full p-2 transition ${enable3D
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-black/60 text-white hover:bg-black/70'
              }`}
            aria-label={enable3D ? 'Desactivar vista 3D' : 'Activar vista 3D'}
            title={enable3D ? 'Desactivar vista 3D' : 'Activar vista 3D'}
          >
            <Mountain className="w-4 h-4" />
          </button>
          {/* Terrain Provider Picker */}
          {enable3D && (
            <div className="relative terrain-picker-container">
              <button
                type="button"
                onClick={() => setShowTerrainPicker(!showTerrainPicker)}
                className="inline-flex items-center justify-center rounded-full bg-black/60 text-white p-2 hover:bg-black/70 transition"
                aria-label="Seleccionar modelo de elevación"
                title={`Modelo actual: ${terrainProvider === 'auto' ? 'Auto' : getTerrainProviderName(terrainProvider as 'idena' | 'ign')}`}
              >
                <Layers className="w-4 h-4" />
              </button>
              {showTerrainPicker && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[200px] overflow-hidden z-30">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-700">Modelo de Elevación</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTerrainProvider('auto');
                      setShowTerrainPicker(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${terrainProvider === 'auto' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                      }`}
                  >
                    <div className="font-medium">Auto</div>
                    <div className="text-xs text-gray-500 mt-0.5">Detectar según ubicación</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerrainProvider('idena');
                      setShowTerrainPicker(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${terrainProvider === 'idena' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                      }`}
                  >
                    <div className="font-medium">IDENA</div>
                    <div className="text-xs text-gray-500 mt-0.5">Navarra (5m resolución)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerrainProvider('ign');
                      setShowTerrainPicker(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${terrainProvider === 'ign' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                      }`}
                  >
                    <div className="font-medium">IGN</div>
                    <div className="text-xs text-gray-500 mt-0.5">España completa</div>
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Layer Picker */}
          <div className="relative layer-picker-container">
            <button
              type="button"
              onClick={() => setShowLayerPicker(!showLayerPicker)}
              className="inline-flex items-center justify-center rounded-full bg-black/60 text-white p-2 hover:bg-black/70 transition"
              aria-label="Seleccionar capa base"
            >
              <Layers className="w-4 h-4" />
            </button>
            {showLayerPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[180px] overflow-hidden z-30">
                <button
                  type="button"
                  onClick={() => {
                    setBaseLayer('osm');
                    setShowLayerPicker(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${baseLayer === 'osm' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                    }`}
                >
                  OpenStreetMap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBaseLayer('pnoa');
                    setShowLayerPicker(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${baseLayer === 'pnoa' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                    }`}
                >
                  PNOA (Ortofoto)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBaseLayer('cnig');
                    setShowLayerPicker(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${baseLayer === 'cnig' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                    }`}
                >
                  CNIG (Relieve)
                </button>
              </div>
            )}
          </div>
          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center justify-center rounded-full bg-black/60 text-white p-2 hover:bg-black/70 transition"
            aria-label={isFullscreen ? t('common.exit_fullscreen') : t('common.fullscreen')}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        </div>
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {currentGeometry && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-1" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              Recorte listo para NDVI
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              {(currentGeometry?.coordinates && currentGeometry.coordinates[0]
                ? Math.max(currentGeometry.coordinates[0].length - 1, 0)
                : 0)} vértices •{' '}
              {currentArea !== null ? `${currentArea.toFixed(2)} ha (aprox.)` : 'Área sin calcular'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

