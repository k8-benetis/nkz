// =============================================================================
// Cesium Map Component - GeoServer Integration
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Layers,
  Map as MapIcon,
  Mountain
} from 'lucide-react';
import { Robot, Sensor, Parcel, AgriculturalMachine, LivestockAnimal, WeatherStation, AgriCrop, AgriBuilding, Device } from '@/types';
import { getIndexColor, type IndexType } from '@/utils/ndviColors';
import { useViewerOptional } from '@/context/ViewerContext';
import { SlotRenderer } from '@/components/SlotRenderer';
import { CesiumStampRenderer } from '@/components/CesiumStampRenderer';
import { useTerrainProvider } from '@/hooks/cesium/useTerrainProvider';
import { use3DTiles } from '@/hooks/cesium/use3DTiles';
import { useNdviLayer } from '@/hooks/cesium/useNdviLayer';
import { useEntitySelection } from '@/hooks/cesium/useEntitySelection';
import { useFlyToEntity } from '@/hooks/cesium/useFlyToEntity';
import { useModelPreview } from '@/hooks/cesium/useModelPreview';
import { logger } from '@/utils/logger';
import { normalizeAssetUrl } from '@/utils/urlNormalizer';
// Removed hardcoded vegetation layer import - modules should use slot system

// Import Cesium CSS
import 'cesium/Build/Cesium/Widgets/widgets.css';

interface ParcelIndexData {
  [parcelId: string]: {
    mean: number;
    date: string;
  };
}

interface CesiumMapProps {
  title?: string;
  height?: string | number;
  showControls?: boolean;
  robots?: Robot[];
  sensors?: Sensor[];
  parcels?: Parcel[];
  machines?: AgriculturalMachine[];
  livestock?: LivestockAnimal[];
  weatherStations?: WeatherStation[];
  crops?: AgriCrop[];
  buildings?: AgriBuilding[];
  trees?: any[]; // OliveTree, AgriTree, FruitTree, Vine - generic SDM entities with 3D models
  devices?: Device[];
  enable3DTerrain?: boolean; // Enable 3D terrain
  terrainProvider?: 'idena' | 'ign' | 'auto' | string; // Terrain provider: 'idena' (Navarra), 'ign' (España), 'auto' (detect by location), or custom URL
  enable3DTiles?: boolean; // Enable 3D Tiles layer (buildings, terrain)
  tilesetUrl?: string; // Optional: specific 3D Tiles tileset URL (default: Navarra)
  ndviOverlayUrl?: string; // Optional: NDVI raster overlay URL (will be clamped to terrain) - DEPRECATED: use ndviWmsLayer instead
  ndviWmsLayer?: {
    workspace: string; // GeoServer workspace (e.g., 'nekazari')
    layer: string; // Layer name (e.g., 'ndvi_parcel_123' or 'ndvi_tenant_abc')
    date?: string; // Optional: date filter for time-based layers (ISO format)
    opacity?: number; // Optional: layer opacity (0-1, default: 0.8)
  };
  selectedEntity?: any; // Selected entity to zoom to
  mode?: 'view' | 'picker'; // Map mode: 'view' (default) or 'picker' (for selecting location)
  onMapClick?: (lat: number, lon: number) => void; // Callback for map clicks in picker mode
  onEntitySelect?: (entity: { id: string; type: string }) => void; // Callback when an entity is clicked
  parcelIndexData?: ParcelIndexData; // Optional: Index data for parcel coloring (NDVI, EVI, etc.)
  indexType?: 'ndvi' | 'evi' | 'savi' | 'gndvi' | 'ndre'; // Type of index for coloring (default: 'ndvi')
  // Module layer configurations (extensible for future modules)
  // Removed vegetationLayerConfig - modules should register layers via slot system
}

// Map icon keys to SVG data URIs for Cesium billboards
// These are simplified versions of Lucide icons optimized for map display
const ICON_KEY_TO_SVG: Record<string, string> = {
  // Sensors
  'thermometer': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>`,
  'gauge': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>`,
  'activity': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'radio': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`,
  'wifi': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>`,
  'camera': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  // Agriculture  
  'leaf': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  'sprout': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`,
  'trees': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>`,
  // Weather
  'sun': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  'wind': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
  'cloudrain': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`,
  // Infrastructure
  'building': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
  'warehouse': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg>`,
  // Fleet
  'bot': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  'tractor': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h9l1 7"/><path d="M4 11V4"/><path d="M8 10V4"/><path d="M18 5c-.6 0-1 .4-1 1v5.6"/><path d="m10 11 11 .9c.6 0 .9.5.8 1.1l-.8 5h-1"/><circle cx="7" cy="15" r="3"/><circle cx="17" cy="18" r="3"/></svg>`,
  // Energy
  'zap': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  // Water
  'droplets': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>`,
  // Generic
  'circledot': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>`,
  'mappin': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
};

// Convert icon key (like 'icon:thermometer') to data URI
const getIconDataUri = (iconKeyOrUrl: string): string | null => {
  if (!iconKeyOrUrl) return null;

  // If it's already a valid URL, return as-is
  if (iconKeyOrUrl.startsWith('http') || iconKeyOrUrl.startsWith('data:') || iconKeyOrUrl.startsWith('/')) {
    return iconKeyOrUrl;
  }

  // Handle icon key format (e.g., 'icon:thermometer')
  if (iconKeyOrUrl.startsWith('icon:')) {
    const key = iconKeyOrUrl.replace('icon:', '');
    const svg = ICON_KEY_TO_SVG[key];
    if (svg) {
      // Convert SVG to data URI with colored background circle
      const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#0891b2"/><g transform="translate(4,4)">${svg.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g></svg>`;
      return `data:image/svg+xml;base64,${btoa(wrappedSvg)}`;
    }
  }

  return null;
};

// Helper to safely extract coordinates handling both Normalized and Simplified NGSI-LD formats
const getEntityCoordinates = (entity: any): any[] | undefined => {
  if (!entity) return undefined;
  // Standard GeoJSON at root (typical for Parcel objects in app)
  if (entity.geometry?.coordinates) return entity.geometry.coordinates;
  // Normalized NGSI-LD
  if (entity.location?.value?.coordinates) return entity.location.value.coordinates;
  // Simplified NGSI-LD (KeyValues)
  if (entity.location?.coordinates) return entity.location.coordinates;
  return undefined;
};

const getEntityGeometryType = (entity: any): string | undefined => {
  if (!entity) return undefined;
  // GeoJSON/Parcel
  if (entity.geometry?.type) return entity.geometry.type;
  // Normalized NGSI-LD
  if (entity.location?.value?.type) return entity.location.value.type;
  // Simplified NGSI-LD
  if (entity.location?.type && entity.location.type !== 'GeoProperty') return entity.location.type;
  return undefined;
};

// Detect WebGL support once at module level (avoids re-checking on every render)
const detectWebGL = (): { supported: boolean; version: number } => {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      const ext = gl2.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      return { supported: true, version: 2 };
    }
    const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl1) {
      const ext = (gl1 as WebGLRenderingContext).getExtension('WEBGL_lose_context');
      ext?.loseContext();
      return { supported: true, version: 1 };
    }
  } catch (_) { /* ignore */ }
  return { supported: false, version: 0 };
};

const webglStatus = detectWebGL();

/** Fallback UI shown when the browser cannot create a WebGL context */
const WebGLFallback: React.FC = () => {
  const isFirefox = navigator.userAgent.includes('Firefox');
  const isChrome = navigator.userAgent.includes('Chrome');

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-slate-300 p-8 gap-4">
      <MapIcon className="w-16 h-16 text-slate-500" />
      <h3 className="text-lg font-semibold text-white">Mapa 3D no disponible</h3>
      <p className="text-sm text-center max-w-md text-slate-400">
        Tu navegador no tiene WebGL activado, que es necesario para el visor 3D.
      </p>

      <div className="bg-slate-800 rounded-lg p-4 text-sm max-w-md w-full space-y-3 border border-slate-700">
        {isFirefox && (
          <>
            <p className="font-medium text-amber-400">Firefox — pasos para activar WebGL:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Escribe <code className="bg-slate-700 px-1 rounded">about:config</code> en la barra de direcciones</li>
              <li>Busca <code className="bg-slate-700 px-1 rounded">webgl.disabled</code> y ponlo a <strong>false</strong></li>
              <li>Busca <code className="bg-slate-700 px-1 rounded">webgl.enable-webgl2</code> y ponlo a <strong>true</strong></li>
              <li>Reinicia Firefox</li>
            </ol>
          </>
        )}
        {isChrome && (
          <>
            <p className="font-medium text-amber-400">Chrome — pasos para activar WebGL:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Escribe <code className="bg-slate-700 px-1 rounded">chrome://flags</code> en la barra de direcciones</li>
              <li>Busca &quot;WebGL&quot; y activa las opciones</li>
              <li>Reinicia Chrome</li>
            </ol>
          </>
        )}
        {!isFirefox && !isChrome && (
          <p className="text-slate-300">Prueba con un navegador diferente (Chrome, Edge) o comprueba la configuración de aceleración por hardware de tu navegador.</p>
        )}

        <p className="text-xs text-slate-500 pt-2 border-t border-slate-700">
          Tambien puedes comprobar tu GPU en{' '}
          {isFirefox
            ? <code className="bg-slate-700 px-1 rounded">about:support</code>
            : <code className="bg-slate-700 px-1 rounded">chrome://gpu</code>
          }
          {' '}→ Graphics
        </p>
      </div>
    </div>
  );
};

export const CesiumMap = React.memo<CesiumMapProps>(({
  showControls = true,
  robots = [],
  sensors = [],
  parcels = [],
  machines = [],
  livestock = [],
  weatherStations = [],
  crops = [],
  buildings = [],
  trees = [],
  devices = [],
  enable3DTerrain = true, // Enable by default
  terrainProvider = 'auto', // Auto-detect based on location
  enable3DTiles = true, // Enable by default for Navarra tileset
  tilesetUrl = 'https://idena.navarra.es/3dtiles/Pamplona2025/tileset.json', // Default: Navarra 3D Tiles
  ndviOverlayUrl, // DEPRECATED: use ndviWmsLayer instead
  ndviWmsLayer,
  selectedEntity,
  mode = 'view',
  onMapClick,
  onEntitySelect,
  parcelIndexData = {},
  indexType = 'ndvi',
  // vegetationLayerConfig removed - modules use slot system
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(!webglStatus.supported);
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [currentTerrainProvider, setCurrentTerrainProvider] = useState<string>(terrainProvider);
  const [baseLayer, setBaseLayer] = useState<'pnoa' | 'osm' | 'esri' | 'cesium'>('osm');
  const osmLayerRef = useRef<any>(null);
  const pnoaLayerRef = useRef<any>(null);
  const esriLayerRef = useRef<any>(null);
  const cesiumLayerRef = useRef<any>(null);
  const viewerContext = useViewerOptional();
  const setCesiumViewer = viewerContext?.setCesiumViewer;

  // Update local state if prop changes
  useEffect(() => {
    setCurrentTerrainProvider(terrainProvider);
  }, [terrainProvider]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current || webglFailed) return;

    logger.debug('[CesiumMap] Initializing Cesium viewer');

    try {
      // @ts-ignore - Cesium types
      const Cesium = window.Cesium;

      if (!Cesium) {
        logger.warn('[CesiumMap] Cesium not available, skipping initialization');
        return;
      }

      logger.debug('[CesiumMap] WebGL status:', webglStatus);
      logger.debug('[CesiumMap] Creating Cesium viewer');

      // Initialize Cesium Viewer with error handling
      let viewer: any;
      try {
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          vrButton: false,
          geocoder: false,
          homeButton: showControls,
          sceneModePicker: showControls,
          navigationHelpButton: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          imageryProvider: false, // No default ION imagery — we add OSM manually below
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          orderIndependentTranslucency: false,
          shadows: false,
          contextOptions: {
            requestWebgl1: true,
            webgl: {
              failIfMajorPerformanceCaveat: false,
            },
          },
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
        // Remove default imagery layer and add OSM as default (no Cesium ION)
        try {
          viewer.imageryLayers.removeAll();

          // Add OSM (OpenStreetMap)
          const osmProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
            credit: 'OpenStreetMap Contributors',
          });
          const osmLayer = viewer.imageryLayers.addImageryProvider(osmProvider, 0); // Bottom
          osmLayerRef.current = osmLayer;
          logger.debug('[CesiumMap] Initial imagery provider (OSM) configured');

          // Add PNOA (Plan Nacional de Ortofotografía Aérea) as base layer option
          try {
            const pnoaProvider = new Cesium.WebMapServiceImageryProvider({
              url: 'https://www.ign.es/wms-inspire/pnoa-ma',
              layers: 'OI.OrthoimageCoverage',
              parameters: {
                transparent: false,
                format: 'image/jpeg',
              },
              credit: 'PNOA - IGN España',
            });
            const pnoaLayer = viewer.imageryLayers.addImageryProvider(pnoaProvider, 0); // Add at bottom
            pnoaLayerRef.current = pnoaLayer;
          } catch (pnoaError) {
            logger.warn('[CesiumMap] Could not add PNOA layer:', pnoaError);
          }

          // Add Esri World Imagery (Global Satellite)
          try {
            Cesium.ArcGisMapServerImageryProvider.fromUrl(
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
              enablePickFeatures: false
            }
            ).then((esriProvider: any) => {
              if (viewer.isDestroyed()) return;
              const esriLayer = viewer.imageryLayers.addImageryProvider(esriProvider, 0);
              esriLayerRef.current = esriLayer;
              esriLayer.show = baseLayer === 'esri';
              viewer.scene.requestRender?.();
            }).catch((esriError: any) => {
              logger.warn('[CesiumMap] Could not fetch Esri layer metadata:', esriError);
            });
          } catch (esriInitError) {
            logger.warn('[CesiumMap] Could not initialize Esri provider:', esriInitError);
          }

          // Add Cesium Ion default imagery (if token is available)
          try {
            if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
              Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
              // Bing Maps Aerial (Asset ID 2)
              Cesium.IonImageryProvider.fromAssetId(2)
                .then((provider: any) => {
                  if (viewer.isDestroyed()) return;
                  const cesiumLayer = viewer.imageryLayers.addImageryProvider(provider, 0);
                  cesiumLayerRef.current = cesiumLayer;
                  cesiumLayer.show = baseLayer === 'cesium';
                  viewer.scene.requestRender?.();
                })
                .catch((e: Error) => logger.warn('[CesiumMap] Error loading Ion Imagery', e));
            }
          } catch (cesiumError) {
            logger.warn('[CesiumMap] Could not set up Cesium Ion:', cesiumError);
          }

          // Apply initial visibility
          if (osmLayer) osmLayer.show = baseLayer === 'osm'; // Default
          if (pnoaLayerRef.current) pnoaLayerRef.current.show = baseLayer === 'pnoa'; // Hidden by default
          if (esriLayerRef.current) esriLayerRef.current.show = baseLayer === 'esri';
          viewer.scene.requestRender?.();
        } catch (error) {
          logger.error('[CesiumMap] Error configuring initial imagery provider:', error);
        }

        viewerRef.current = viewer;
        setIsViewerReady(true); // Signal that viewer is ready
        // Expose viewer to context for map-layer components (only if ViewerProvider is available)
        if (setCesiumViewer) {
          setCesiumViewer(viewer);
        }

        // Set initial camera position (Spain center)
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(-3.0, 40.0, 500000),
        });

      } catch (error) {
        logger.error('[CesiumMap] Error creating viewer:', error);
        // If viewer creation fails (likely WebGL), show the fallback
        setWebglFailed(true);
        return;
      }

      // Terrain, 3D Tiles, and WMS logic moved to separate useEffects

    } catch (error) {
      logger.error('[CesiumMap] Critical error during initialization:', error);
      viewerRef.current = null;
      setWebglFailed(true);
    }

    // Cleanup
    return () => {
      logger.debug('[CesiumMap] Cleanup function called. ViewerRef:', !!viewerRef.current);
      if (viewerRef.current) {
        try {
          logger.debug('[CesiumMap] Destroying viewer');
          console.trace('[CesiumMap] Destroy stack trace');
          viewerRef.current.destroy();
        } catch (error) {
          logger.error('[CesiumMap] Error destroying viewer:', error);
        }
        viewerRef.current = null;
        setIsViewerReady(false);
        // Clear viewer from context (only if ViewerProvider is available)
        if (setCesiumViewer) {
          setCesiumViewer(null);
        }
      }
    };
  }, []); // Initialize only once

  // Log mount/unmount
  useEffect(() => {
    logger.debug('[CesiumMap] Component Mounted');
    return () => logger.debug('[CesiumMap] Component Unmounted');
  }, []);

  // Log to confirm refactor is active
  useEffect(() => {
    logger.debug('[CesiumMap] Viewer initialized (Refactored v3 - isViewerReady)');
  }, []);

  // Handle Terrain Updates (extracted hook)
  useTerrainProvider(viewerRef, enable3DTerrain, currentTerrainProvider, parcels);

  // Handle Base Layer Updates
  useEffect(() => {
    if (!isViewerReady) return;

    if (osmLayerRef.current) {
      osmLayerRef.current.show = baseLayer === 'osm';
    }

    if (pnoaLayerRef.current) {
      pnoaLayerRef.current.show = baseLayer === 'pnoa';
    }

    if (esriLayerRef.current) {
      esriLayerRef.current.show = baseLayer === 'esri';
    }

    if (cesiumLayerRef.current) {
      cesiumLayerRef.current.show = baseLayer === 'cesium';
    }

    viewerRef.current?.scene?.requestRender?.();
  }, [baseLayer, isViewerReady]);

  // Handle 3D Tiles Updates (extracted hook)
  use3DTiles(viewerRef, enable3DTiles, tilesetUrl);

  // Handle NDVI WMS Layer Updates (extracted hook)
  useNdviLayer(viewerRef, ndviWmsLayer, ndviOverlayUrl, parcels);

  // NOTE: Module-specific Cesium layers should be registered through the slot system
  // External modules should expose their layers via the 'map-layer' slot
  // This hardcoded vegetation layer integration has been removed to maintain core independence
  // Modules must implement their own layer integration through the slot system

  // Duplicate preview logic removed. Moved to optimized block at bottom of file.

  // Handle Map Clicks (Picker Mode)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || mode !== 'picker' || !onMapClick) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      // Improved picking logic: try surface first (terrain/tiles), then ellipsoid
      let cartesian = viewer.scene.pickPosition(click.position);

      if (!cartesian) {
        // Fallback to ellipsoid picking (e.g. clicking on base globe without terrain)
        cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      }

      if (cartesian) {
        // ... existing picker logic ...
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);


        // Add marker for visual feedback
        const markerId = 'picker-marker';
        viewer.entities.removeById(markerId);

        viewer.entities.add({
          id: markerId,
          position: cartesian,
          point: {
            pixelSize: 15,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            font: '14pt sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });

        onMapClick(lat, lon);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!viewer.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [mode, onMapClick]);

  // Handle Map Clicks (View Mode - Entity Selection) (extracted hook)
  useEntitySelection(viewerRef, mode, onEntitySelect);

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
      document.exitFullscreen?.().catch((err) => logger.warn('[CesiumMap] exitFullscreen failed', err));
    } else {
      element.requestFullscreen?.().catch((err) => logger.warn('[CesiumMap] requestFullscreen failed', err));
    }
  };

  // Fly to selected entity (extracted hook)
  useFlyToEntity(viewerRef, selectedEntity);

  // Update entities when props change

  // Update entities when props change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    try {
      // Clear existing entities
      viewer.entities.removeAll();

      // Get color based on robot status
      const getRobotColor = (status?: string): any => {
        switch (status) {
          case 'working':
            return Cesium.Color.GREEN;
          case 'idle':
            return Cesium.Color.YELLOW;
          case 'charging':
            return Cesium.Color.BLUE;
          case 'error':
            return Cesium.Color.RED;
          case 'maintenance':
            return Cesium.Color.ORANGE;
          default:
            return Cesium.Color.WHITE;
        }
      };

      // Determine height reference - CLAMP to terrain if enabled
      const heightReference = enable3DTerrain
        ? Cesium.HeightReference.CLAMP_TO_GROUND
        : Cesium.HeightReference.NONE;

      // Helper function to get icon URL, handling both direct URLs and icon keys
      const getEntityIconUrl = (entity: any, defaultIcon: string): string | null => {
        // Check for icon2d in various NGSI-LD formats
        let iconValue = null;
        if (entity.icon2d?.value) {
          iconValue = entity.icon2d.value;
        } else if (typeof entity.icon2d === 'string') {
          iconValue = entity.icon2d;
        }

        if (iconValue) {
          // Convert icon key to data URI
          const dataUri = getIconDataUri(iconValue);
          if (dataUri) return dataUri;
        }

        // Fallback to default icon if it exists
        return getIconDataUri(defaultIcon);
      };

      // Helper function to get default 3D model URL or use custom model
      // Supports multiple formats: ref3DModel (NGSI-LD), model3d (simplified), model3DUrl
      const getEntityModel = (entity: any, defaultModel?: string): string | undefined => {
        // NGSI-LD normalized format
        if (entity.ref3DModel?.value) return entity.ref3DModel.value;
        // NGSI-LD simplified/keyValues
        if (entity.ref3DModel && typeof entity.ref3DModel === 'string') return entity.ref3DModel;
        // Alternate property names
        if (entity.model3d) return entity.model3d;
        if (entity.model3DUrl) return entity.model3DUrl;
        // Default
        return defaultModel;
      };

      // Add robots - NGSI-LD format
      robots.forEach((robot) => {
        try {
          const coordinates = getEntityCoordinates(robot);
          if (!coordinates) return;
          const [lon, lat] = coordinates;

          const robotName = typeof robot.name === 'string' ? robot.name : robot.name.value;
          const robotStatus = typeof robot.status === 'string' ? robot.status : robot.status?.value;

          viewer.entities.add({
            id: `robot-${robot.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: robotName,
            point: {
              pixelSize: 15,
              color: getRobotColor(robotStatus),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: heightReference,
            },
            label: {
              text: robotName,
              font: '14px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -40),
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              heightReference: heightReference,
            },
          });
        } catch (e) {
          logger.warn('[CesiumMap] Error adding robot:', robot, e);
        }
      });

      // Add sensors - NGSI-LD format
      logger.debug('[CesiumMap] Processing sensors:', sensors.length);
      sensors.forEach((sensor) => {
        try {
          const coordinates = getEntityCoordinates(sensor);
          logger.debug('[CesiumMap] Sensor', sensor.id, 'coordinates:', coordinates, 'location:', sensor.location);
          if (!coordinates) return;
          const [lon, lat] = coordinates;

          // Handle NGSI-LD namespaced name property
          let sensorName = 'Unknown Sensor';
          const nameProp = sensor.name;
          if (typeof nameProp === 'string') {
            sensorName = nameProp;
          } else if (nameProp && typeof nameProp === 'object' && 'value' in nameProp && typeof (nameProp as { value: string }).value === 'string') {
            sensorName = (nameProp as { value: string }).value;
          } else {
            const namespacedName = sensor['https://smartdatamodels.org/name'];
            if (namespacedName && typeof namespacedName === 'object' && 'value' in namespacedName && typeof (namespacedName as { value: string }).value === 'string') {
              sensorName = (namespacedName as { value: string }).value;
            } else if (typeof namespacedName === 'string') {
              sensorName = namespacedName;
            }
          }

          const modelUrl = getEntityModel(sensor);
          const iconUrl = getEntityIconUrl(sensor, '/assets/icons/sensor-default.png'); // Default fallback

          // Common entity properties
          const entityOptions: any = {
            id: `sensor-${sensor.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: sensorName,
            label: {
              text: sensorName,
              font: '12px sans-serif',
              fillColor: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -30),
              heightReference: heightReference,
            },
          };

          if (modelUrl) {
            // Normalize legacy domain (artotxiki -> robotika)
            const fixedModelUrl = normalizeAssetUrl(modelUrl);
            // Render 3D Model
            entityOptions.model = {
              uri: fixedModelUrl,
              minimumPixelSize: 64,
              maximumScale: 20000,
              scale: (sensor.modelScale?.value || 1.0),
              heightReference: heightReference,
            };

            // Apply rotation if present
            if (sensor.modelRotation?.value) {
              const [rX, rY, rZ] = sensor.modelRotation.value;
              const hpr = new Cesium.HeadingPitchRoll(
                Cesium.Math.toRadians(rZ), // Heading (Z)
                Cesium.Math.toRadians(rX), // Pitch (X)
                Cesium.Math.toRadians(rY)  // Roll (Y)
              );
              const orientation = Cesium.Transforms.headingPitchRollQuaternion(
                Cesium.Cartesian3.fromDegrees(lon, lat, 0),
                hpr
              );
              entityOptions.orientation = orientation;
            }
          } else if (iconUrl && iconUrl !== '/assets/icons/sensor-default.png') {
            // Render 2D Icon if custom icon exists (and is not just the fallback string checking)
            // Resolve relative URLs to absolute if needed
            let processedIconUrl = iconUrl;
            if (iconUrl.startsWith('/') && !iconUrl.startsWith('//')) {
              processedIconUrl = `${window.location.origin}${iconUrl}`;
            }

            // DEBUG: Log icon URL
            logger.debug(`[CesiumMapDebug] Sensor ${sensor.id} using icon: ${processedIconUrl} (Original: ${iconUrl})`);

            // Check if it's a real URL or key
            const validIcon = processedIconUrl.startsWith('http') || processedIconUrl.startsWith('data:');

            if (validIcon) {
              const fixedIconUrl = normalizeAssetUrl(processedIconUrl);
              entityOptions.billboard = {
                image: fixedIconUrl,
                width: 32,
                height: 32,
                heightReference: heightReference,
                disableDepthTestDistance: Number.POSITIVE_INFINITY, // Prevent occlusion
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM
              };
            } else {
              // Fallback to Point
              entityOptions.point = {
                pixelSize: 10,
                color: Cesium.Color.CYAN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
                heightReference: heightReference,
              };
            }
          } else {
            // Default Point
            entityOptions.point = {
              pixelSize: 10,
              color: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: heightReference,
            };
          }

          viewer.entities.add(entityOptions);
        } catch (e) {
          logger.warn('[CesiumMap] Error adding sensor:', sensor, e);
        }
      });



      // Helper function to get machine color based on operation type
      const getMachineColor = (operationType?: string): any => {
        switch (operationType) {
          case 'seeding':
            return Cesium.Color.GREEN;
          case 'fertilization':
            return Cesium.Color.BLUE;
          case 'spraying':
            return Cesium.Color.ORANGE;
          case 'harvesting':
            return Cesium.Color.YELLOW;
          case 'tillage':
            return Cesium.Color.BROWN;
          case 'irrigation':
            return Cesium.Color.AQUA;
          default:
            return Cesium.Color.GRAY;
        }
      };

      // Helper function to get livestock color based on activity
      const getLivestockColor = (activity?: string): any => {
        switch (activity) {
          case 'grazing':
            return Cesium.Color.GREEN;
          case 'resting':
            return Cesium.Color.BLUE;
          case 'moving':
            return Cesium.Color.ORANGE;
          case 'feeding':
            return Cesium.Color.YELLOW;
          default:
            return Cesium.Color.WHITE;
        }
      };

      // Add agricultural machines (ISOBUS tractors, etc.)
      machines.forEach((machine) => {
        try {
          const coordinates = getEntityCoordinates(machine);
          if (!coordinates) return;
          const [lon, lat] = coordinates;

          const machineName = typeof machine.name === 'string' ? machine.name : machine.name.value;
          const operationType = typeof machine.operationType === 'string'
            ? machine.operationType
            : machine.operationType?.value;
          const entityOptions: any = {
            id: `machine-${machine.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: machineName,
            point: {
              pixelSize: 18,
              color: getMachineColor(operationType),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: machineName,
              font: '14px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -40),
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            },
          };

          // Use custom 3D model if available
          const modelUrl = getEntityModel(machine, '/icons/machines/tractor.glb');
          if (modelUrl) {
            entityOptions.model = {
              uri: normalizeAssetUrl(modelUrl),
              minimumPixelSize: 64,
              maximumScale: 20000,
              heightReference: heightReference,
            };
          }

          // Use custom 2D icon if no 3D model
          if (!modelUrl) {
            const iconUrl = getEntityIconUrl(machine, '/icons/machines/tractor.png');
            if (iconUrl) {
              entityOptions.billboard = {
                image: normalizeAssetUrl(iconUrl),
                width: 48,
                height: 48,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              };
              delete entityOptions.point;
            }
          }

          viewer.entities.add(entityOptions);
        } catch (e) {
          logger.warn('[CesiumMap] Error adding machine:', machine, e);
        }
      });

      // Add livestock animals
      livestock.forEach((animal) => {
        try {
          const coordinates = getEntityCoordinates(animal);
          if (!coordinates) return;
          const [lon, lat] = coordinates;

          const animalName = typeof animal.name === 'string' ? animal.name : animal.name.value;
          const activity = typeof animal.activity === 'string' ? animal.activity : animal.activity?.value;
          const species = typeof animal.species === 'string' ? animal.species : animal.species?.value;

          const entityOptions: any = {
            id: `livestock-${animal.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: animalName,
            point: {
              pixelSize: 12,
              color: getLivestockColor(activity),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: heightReference,
            },
            label: {
              text: animalName,
              font: '12px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -30),
              heightReference: heightReference,
            },
          };

          // Use custom 3D model if available
          const modelUrl = getEntityModel(animal, species === 'Bos taurus' ? '/icons/livestock/cow.glb' : '/icons/livestock/animal.glb');
          if (modelUrl) {
            entityOptions.model = {
              uri: normalizeAssetUrl(modelUrl),
              minimumPixelSize: 32,
              maximumScale: 20000,
              heightReference: heightReference,
            };
          }

          // Use custom 2D icon if no 3D model
          if (!modelUrl) {
            const iconUrl = getEntityIconUrl(animal, species === 'Bos taurus' ? '/icons/livestock/cow.png' : '/icons/livestock/animal.png');
            if (iconUrl) {
              entityOptions.billboard = {
                image: normalizeAssetUrl(iconUrl),
                width: 32,
                height: 32,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              };
              delete entityOptions.point;
            }
          }

          viewer.entities.add(entityOptions);
        } catch (e) {
          logger.warn('[CesiumMap] Error adding livestock:', animal, e);
        }
      });

      // Add weather stations
      weatherStations.forEach((station) => {
        try {
          const coordinates = getEntityCoordinates(station);
          if (!coordinates) return;
          const [lon, lat] = coordinates;

          const stationName = typeof station.name === 'string' ? station.name : station.name.value;

          const entityOptions: any = {
            id: `weather-${station.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: stationName,
            point: {
              pixelSize: 14,
              color: Cesium.Color.SKYBLUE,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: heightReference,
            },
            label: {
              text: stationName,
              font: '12px sans-serif',
              fillColor: Cesium.Color.SKYBLUE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -30),
              heightReference: heightReference,
            },
          };

          // Use custom 3D model if available
          const modelUrl = getEntityModel(station, '/icons/weather/station.glb');
          if (modelUrl) {
            entityOptions.model = {
              uri: normalizeAssetUrl(modelUrl),
              minimumPixelSize: 48,
              maximumScale: 20000,
              heightReference: heightReference,
            };
          }

          // Use custom 2D icon if no 3D model
          if (!modelUrl) {
            const iconUrl = getEntityIconUrl(station, '/icons/weather/station.png');
            if (iconUrl) {
              entityOptions.billboard = {
                image: normalizeAssetUrl(iconUrl),
                width: 40,
                height: 40,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              };
              delete entityOptions.point;
            }
          }

          viewer.entities.add(entityOptions);
        } catch (e) {
          logger.warn('[CesiumMap] Error adding weather station:', station, e);
        }
      });

      // Add crops (AgriCrop)
      crops.forEach((crop) => {
        try {
          const cropName = typeof crop.name === 'string' ? crop.name : crop.name?.value || 'Unknown Crop';
          const cropType = typeof crop.agroVocConcept === 'string' ? crop.agroVocConcept : crop.agroVocConcept?.value;

          const geomType = getEntityGeometryType(crop);
          const coordinates = getEntityCoordinates(crop);

          if (!coordinates) return;

          // If it's a polygon
          if (geomType === 'Polygon') {
            const coords = coordinates[0]; // Outer ring
            const hierarchy = (coords as any[]).map((c: any) => Cesium.Cartesian3.fromDegrees(c[0], c[1]));

            viewer.entities.add({
              id: `crop-${crop.id}`,
              name: cropName,
              polygon: {
                hierarchy: hierarchy,
                material: Cesium.Color.GREEN.withAlpha(0.4),
                outline: true,
                outlineColor: Cesium.Color.DARKGREEN,
                heightReference: heightReference,
              },
              description: `Type: ${cropType}`
            });
          } else {
            // Point
            const [lon, lat] = coordinates as [number, number];
            viewer.entities.add({
              id: `crop-${crop.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
              name: cropName,
              point: {
                pixelSize: 10,
                color: Cesium.Color.GREEN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
                heightReference: heightReference,
              },
              label: {
                text: cropName,
                font: '12px sans-serif',
                fillColor: Cesium.Color.GREEN,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                heightReference: heightReference,
              }
            });
          }
        } catch (e) {
          logger.warn('[CesiumMap] Error adding crop:', crop, e);
        }
      });

      // Add buildings (AgriBuilding)
      buildings.forEach((building) => {
        try {
          const coordinates = getEntityCoordinates(building);
          if (!coordinates) return;

          const buildingName = typeof building.name === 'string' ? building.name : building.name?.value || 'Unknown Building';
          const category = typeof building.category === 'string' ? building.category : building.category?.value;
          const geomType = getEntityGeometryType(building);

          // If it's a polygon (footprint)
          if (geomType === 'Polygon') {
            const coords = coordinates[0];
            const hierarchy = (coords as any[]).map((c: any) => Cesium.Cartesian3.fromDegrees(c[0], c[1]));

            viewer.entities.add({
              id: `building-${building.id}`,
              name: buildingName,
              polygon: {
                hierarchy: hierarchy,
                material: Cesium.Color.GRAY.withAlpha(0.9),
                extrudedHeight: 5, // Extrude 5 meters
                outline: true,
                outlineColor: Cesium.Color.BLACK,
                heightReference: heightReference,
              },
              description: `Category: ${category}`
            });
          } else {
            // Point
            const [lon, lat] = coordinates as [number, number];

            viewer.entities.add({
              id: `building-${building.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
              name: buildingName,
              model: {
                uri: '/icons/infrastructure/building.glb', // Placeholder
                minimumPixelSize: 64,
                heightReference: heightReference,
              },
              label: {
                text: buildingName,
                font: '12px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, -40),
                heightReference: heightReference,
              }
            });
          }
        } catch (e) {
          logger.warn('[CesiumMap] Error adding building:', building, e);
        }
      });

      // Add devices (Device)
      devices.forEach((device) => {
        try {
          const coordinates = getEntityCoordinates(device);
          if (!coordinates) return;

          const [lon, lat] = coordinates;
          const deviceName = typeof device.name === 'string' ? device.name : device.name?.value || 'Unknown Device';
          const category = typeof device.category === 'string' ? device.category : device.category?.value;

          viewer.entities.add({
            id: `device-${device.id}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            name: deviceName,
            point: {
              pixelSize: 8,
              color: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: heightReference,
            },
            label: {
              text: deviceName,
              font: '10px sans-serif',
              fillColor: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cesium.Cartesian2(0, -20),
              heightReference: heightReference,
            },
            description: `Category: ${category}`
          });
        } catch (e) {
          logger.warn('[CesiumMap] Error adding device:', device, e);
        }
      });

      // Add trees (OliveTree, AgriTree, FruitTree, Vine) - with 3D model support
      if (trees.length > 0) {
        logger.debug('[CesiumMap] Rendering trees:', trees.length);
      }
      trees.forEach((tree) => {
        try {
          const coordinates = getEntityCoordinates(tree);
          if (!coordinates) {
            logger.warn('[CesiumMap] Tree without coordinates:', tree.id);
            return;
          }

          const [lon, lat] = coordinates;
          const treeName = typeof tree.name === 'string' ? tree.name : tree.name?.value || 'Unknown Tree';
          const treeType = tree.type || 'AgriTree';
          const modelUrl = getEntityModel(tree, undefined);
          const modelScale = tree.modelScale?.value || tree.modelScale || 1;

          if (modelUrl) {
            // Render with 3D model
            logger.debug('[CesiumMap] Adding tree with model:', tree.id, modelUrl);

            // Get rotation from entity
            const modelRotation = tree.modelRotation?.value || tree.modelRotation || [0, 0, 0];
            const heading = Cesium.Math.toRadians(modelRotation[0] || 0);
            const pitch = Cesium.Math.toRadians(modelRotation[1] || 0);
            const roll = Cesium.Math.toRadians(modelRotation[2] || 0);

            const position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
            const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
            const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

            viewer.entities.add({
              id: `tree-${tree.id}`,
              position: position,
              orientation: orientation,
              name: treeName,
              model: {
                uri: normalizeAssetUrl(modelUrl),
                scale: modelScale,
                minimumPixelSize: 32,
                maximumScale: 20000,
                heightReference: heightReference,
              },
              label: {
                text: treeName,
                font: '12px sans-serif',
                fillColor: Cesium.Color.GREEN,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, -40),
                heightReference: heightReference,
                show: false, // Hide label by default to avoid clutter
              },
              description: `Type: ${treeType}`,
            });
          } else {
            // Fallback: render as point (no 3D model)
            viewer.entities.add({
              id: `tree-${tree.id}`,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
              name: treeName,
              billboard: {
                image: '/icons/trees/olive-tree.svg', // Default tree icon
                width: 24,
                height: 24,
                heightReference: heightReference,
              },
              label: {
                text: treeName,
                font: '11px sans-serif',
                fillColor: Cesium.Color.FORESTGREEN,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                heightReference: heightReference,
              },
              description: `Type: ${treeType}`,
            });
          }
        } catch (e) {
          logger.warn('[CesiumMap] Error adding tree:', tree, e);
        }
      });

      // Calculate center of parcels for camera positioning
      let parcelCenter: { lon: number; lat: number } | null = null;
      if (parcels.length > 0) {
        let totalLon = 0;
        let totalLat = 0;
        let count = 0;

        parcels.forEach((parcel) => {
          try {
            const coordinates = getEntityCoordinates(parcel);
            if (!coordinates) return;

            const type = getEntityGeometryType(parcel);

            if (type === 'Polygon' && Array.isArray(coordinates[0])) {
              // Polygon: coords[0] is the outer ring
              const outerRing = coordinates[0] as unknown as number[][];
              outerRing.forEach((coord: number[]) => {
                if (Array.isArray(coord) && coord.length >= 2) {
                  const lon = Number(coord[0]);
                  const lat = Number(coord[1]);
                  if (!isNaN(lon) && !isNaN(lat)) {
                    totalLon += lon;
                    totalLat += lat;
                    count++;
                  }
                }
              });
            } else if (type === 'Point') {
              // Point: coordinates is [lon, lat]
              if (Array.isArray(coordinates) && coordinates.length >= 2) {
                const lon = Number(coordinates[0]);
                const lat = Number(coordinates[1]);
                if (!isNaN(lon) && !isNaN(lat)) {
                  totalLon += lon;
                  totalLat += lat;
                  count++;
                }
              }
            }
          } catch (e) {
            logger.warn('[CesiumMap] Error calculating center for parcel:', parcel.id, e);
          }
        });

        if (count > 0) {
          parcelCenter = {
            lon: totalLon / count,
            lat: totalLat / count,
          };
        }
      }

      // Center camera on parcels if available, otherwise use default Spain center
      if (parcelCenter && viewer.camera) {
        try {
          if (!isNaN(parcelCenter.lon) && !isNaN(parcelCenter.lat)) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(parcelCenter.lon, parcelCenter.lat, 10000),
              duration: 2.0,
            });
          }
        } catch (error) {
          logger.warn('[CesiumMap] Error centering on parcels:', error);
        }
      }

      // Add parcels as polygons
      parcels.forEach((parcel, _index) => {
        try {
          // if (index === 0) logger.debug('[CesiumMap] Processing first parcel:', parcel);

          const coordinates = getEntityCoordinates(parcel);
          if (!coordinates) return;

          const type = getEntityGeometryType(parcel);

          // Convert GeoJSON Polygon to Cesium positions
          const positions: any[] = [];

          // Handle Polygon format: [[[lon, lat], [lon, lat], ...]]
          if (type === 'Polygon' && Array.isArray(coordinates[0])) {
            coordinates[0].forEach((coord: any) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                const lon = Number(coord[0]);
                const lat = Number(coord[1]);
                if (!isNaN(lon) && !isNaN(lat)) {
                  // Use height 0 for now, will be clamped to terrain if 3D terrain is enabled
                  positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, enable3DTerrain ? 0 : 0));
                }
              }
            });
          }

          // Validate positions before adding
          if (positions.length < 3) {
            logger.warn(`[CesiumMap] Skipping parcel ${parcel.id}: Invalid geometry (less than 3 points)`);
            return;
          }

          const parcelName = parcel.name || parcel.id;

          const isSelected = selectedEntity?.id === parcel.id;

          // Get color from index data if available, otherwise use default
          let fillColor: any;
          let outlineColor: any;

          if (parcelIndexData && parcelIndexData[parcel.id]) {
            // Use index-based coloring
            const indexValue = parcelIndexData[parcel.id].mean;
            const cssColor = getIndexColor(indexType as IndexType, indexValue);
            fillColor = Cesium.Color.fromCssColorString(cssColor).withAlpha(0.6);
            outlineColor = Cesium.Color.fromCssColorString(cssColor).withAlpha(0.9);
          } else {
            // Default colors
            fillColor = Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.4); // Friendly Green
            outlineColor = Cesium.Color.fromCssColorString('#4ade80');
          }

          // Override with selection highlight if selected
          if (isSelected) {
            fillColor = Cesium.Color.CYAN.withAlpha(0.08);
            outlineColor = Cesium.Color.CYAN;
          }

          const currentColor = fillColor;
          const currentOutlineColor = outlineColor;

          viewer.entities.add({
            id: `parcel-${parcel.id}`,
            name: parcelName,
            polygon: {
              hierarchy: positions,
              material: currentColor,
              outline: !enable3DTerrain,
              outlineColor: currentOutlineColor,
              classificationType: enable3DTiles ? Cesium.ClassificationType.BOTH : Cesium.ClassificationType.TERRAIN,
              arcType: Cesium.ArcType.GEODESIC,
            },
            label: {
              text: parcelName,
              font: isSelected ? '14px sans-serif' : '12px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000), // Only show when close
              show: isSelected || true, // Always show label, but maybe highlight if selected?
            },
            description: (() => {
              const indexInfo = parcelIndexData && parcelIndexData[parcel.id];
              const indexValue = indexInfo ? indexInfo.mean.toFixed(3) : 'N/A';
              const indexDate = indexInfo ? new Date(indexInfo.date).toLocaleDateString() : 'N/A';
              return `
                <div class="p-2">
                  <h3 class="font-bold">${parcelName}</h3>
                  <p>Area: ${parcel.area || 'N/A'} ha</p>
                  <p>Crop: ${parcel.cropType || 'None'}</p>
                  ${indexInfo ? `
                    <p><strong>${indexType.toUpperCase()}:</strong> ${indexValue}</p>
                    <p><strong>Fecha:</strong> ${indexDate}</p>
                  ` : '<p class="text-gray-500">Sin datos de índice</p>'}
                </div>
              `;
            })()
          });

        } catch (e) {
          logger.warn('[CesiumMap] Error adding parcel:', parcel.id, e);
        }
      });

      // Force a render
      viewer.scene.requestRender();
    } catch (error) {
      logger.error('[CesiumMap] Critical error updating entities:', error);
    }
  }, [
    isViewerReady, // Critical dependency: wait for viewer to be ready
    robots,
    sensors,
    machines,
    parcelIndexData,
    indexType,
    livestock,
    weatherStations,
    crops,
    buildings,
    devices,
    trees,
    parcels,
    enable3DTerrain,
    enable3DTiles,
    selectedEntity,
    // Add context dependencies for preview
    viewerContext?.mapMode,
    viewerContext?.modelPlacement
  ]);

  // Handle 3D Model Preview (PREVIEW_MODEL mode) (extracted hook)
  useModelPreview(viewerRef, isViewerReady, viewerContext);

  // Show fallback if WebGL is not available
  if (webglFailed) {
    return (
      <div
        ref={wrapperRef}
        className="relative w-full h-full rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-slate-900"
      >
        <WebGLFallback />
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-slate-900 group ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading Overlay */}
      {!isViewerReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm font-medium">Cargando mapa 3D...</p>
          </div>
        </div>
      )}

      {/* Controls */}
      {showControls && isViewerReady && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg shadow-lg backdrop-blur-sm transition-all border border-slate-600"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>

          {/* 3D Terrain Toggle */}
          <button
            type="button"
            onClick={() => {
              // Toggle logic would go here if we had a setEnable3DTerrain prop or state
              // For now, just a visual toggle if we can't change the prop from here
              logger.debug('Toggle 3D Terrain clicked');
            }}
            className={`p-2 rounded-lg shadow-lg backdrop-blur-sm transition-all border border-slate-600 ${enable3DTerrain ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white' : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300'}`}
            title={enable3DTerrain ? 'Desactivar relieve 3D' : 'Activar relieve 3D'}
          >
            <Mountain size={20} />
          </button>

          {/* Layer Picker (Base Map & Terrain) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTerrainPicker(!showTerrainPicker)}
              className="p-2 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg shadow-lg backdrop-blur-sm transition-all border border-slate-600"
              title="Seleccionar capas"
            >
              <Layers size={20} />
            </button>

            {showTerrainPicker && (
              <div className="absolute right-full top-0 mr-2 bg-slate-800 rounded-lg shadow-xl border border-slate-600 min-w-[220px] overflow-hidden z-20">
                {/* Base Map Section */}
                <div className="px-3 py-2 bg-slate-900/50 border-b border-slate-700">
                  <p className="text-xs font-semibold text-slate-300">Mapa Base</p>
                </div>
                <div className="p-1 border-b border-slate-700">
                  <button
                    onClick={() => setBaseLayer('osm')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${baseLayer === 'osm' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}`}
                  >
                    <div className="font-medium">Callejero (OSM)</div>
                    <div className="text-xs text-slate-500">OpenStreetMap global</div>
                  </button>
                  <button
                    onClick={() => setBaseLayer('pnoa')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${baseLayer === 'pnoa' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}`}
                  >
                    <div className="font-medium">Ortofoto (PNOA)</div>
                    <div className="text-xs text-slate-500">Alta resolución (España)</div>
                  </button>
                  <button
                    onClick={() => setBaseLayer('esri')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${baseLayer === 'esri' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}`}
                  >
                    <div className="font-medium">Satélite (Esri)</div>
                    <div className="text-xs text-slate-500">Imágenes satelitales globales</div>
                  </button>
                  {import.meta.env.VITE_CESIUM_ION_TOKEN && (
                    <button
                      onClick={() => setBaseLayer('cesium')}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${baseLayer === 'cesium' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}`}
                    >
                      <div className="font-medium">Satélite (Cesium Ion)</div>
                      <div className="text-xs text-slate-500">Bing Maps Aerial (Premium)</div>
                    </button>
                  )}
                </div>

                {/* Terrain Section */}
                {enable3DTerrain && (
                  <>
                    <div className="px-3 py-2 bg-slate-900/50 border-b border-slate-700">
                      <p className="text-xs font-semibold text-slate-300">Modelo de Elevación</p>
                    </div>
                    <div className="p-1">
                      {[
                        { id: 'auto', name: 'Automático (Detectar)', desc: 'Selecciona según ubicación' },
                        { id: 'idena', name: 'IDENA (Navarra)', desc: 'Alta precisión (MDT05)' },
                        { id: 'ign', name: 'IGN (España)', desc: 'Cobertura nacional (MDT25)' }
                      ].map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => {
                            setCurrentTerrainProvider(provider.id);
                            setShowTerrainPicker(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${currentTerrainProvider === provider.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                          <div className="font-medium">{provider.name}</div>
                          <div className="text-xs text-slate-500">{provider.desc}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logic Components */}
      <CesiumStampRenderer />

      {/* Map Layer Slot - Render map layer components (e.g., VegetationMapLayer) - Only if ViewerProvider is available */}
      {viewerContext && isViewerReady && viewerRef.current && (
        <SlotRenderer
          slot="map-layer"
          inline
          additionalProps={{ viewer: viewerRef.current }}
        />
      )}

      {/* Legend/Info Overlay could go here */}
    </div>
  );
});

export default CesiumMap;