// =============================================================================
// Assets Digitization Page - Digitalización de Activos
// =============================================================================
// Main page for digitizing agricultural assets on the 3D map

import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/Layout';
import { AssetLibrary } from '@/components/AssetLibrary';
import { CesiumAssetDrawer } from '@/components/CesiumAssetDrawer';
import { AssetPropertiesDialog } from '@/components/AssetPropertiesDialog';
import api from '@/services/api';
import type { AssetType, AssetCreationPayload, GeoPolygon } from '@/types';
import { Layers, AlertCircle, CheckCircle2, Expand, Minimize } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export const Assets: React.FC = () => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [drawingGeometry, setDrawingGeometry] = useState<any>(null);
  const [showPropertiesDialog, setShowPropertiesDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[Assets] Cesium not available');
      return;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      vrButton: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: true,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    viewerRef.current = viewer;

    // Configure scene
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0f172a');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1f2937');
    viewer.scene.skyBox = undefined;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;

    // Set initial camera to Spain center
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-3.0, 40.0, 500000),
    });

    // Configure imagery
    const osmProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maximumLevel: 19,
    });
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(osmProvider);

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const element = document.fullscreenElement;
      setIsFullscreen(element === wrapperRef.current);
      if (viewerRef.current?.resize) {
        viewerRef.current.resize();
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
      document.exitFullscreen?.().catch((err) => console.warn('[Assets] exitFullscreen failed', err));
    } else {
      element.requestFullscreen?.().catch((err) => console.warn('[Assets] requestFullscreen failed', err));
    }
  };

  const handleAssetSelect = (assetType: AssetType) => {
    setSelectedAssetType(assetType);
    setDrawingGeometry(null);
    setShowPropertiesDialog(false);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleDrawingComplete = (geometry: GeoPolygon | { type: 'Point' | 'LineString'; coordinates: number[] | number[][] }) => {
    setDrawingGeometry(geometry);
    setShowPropertiesDialog(true);
  };

  const handleSaveAsset = async (name: string, properties: any) => {
    if (!selectedAssetType || !drawingGeometry) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const payload: AssetCreationPayload = {
        assetType: selectedAssetType.id,
        name: name || undefined, // Will be auto-generated if empty
        geometry: drawingGeometry,
        properties: {
          scale: properties.scale || selectedAssetType.defaultScale || 1.0,
          rotation: properties.rotation || 0,
          model3d: properties.model3d || selectedAssetType.model3d,
        },
      };

      const result = await api.createAsset(payload);
      
      setSaveSuccess(true);
      setShowPropertiesDialog(false);
      
      // Reset state after a delay
      setTimeout(() => {
        setSelectedAssetType(null);
        setDrawingGeometry(null);
        setSaveSuccess(false);
      }, 2000);

    } catch (error: any) {
      console.error('[Assets] Error creating asset:', error);
      setSaveError(error.response?.data?.error || error.message || 'Error al guardar el activo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelDrawing = () => {
    setSelectedAssetType(null);
    setDrawingGeometry(null);
    setShowPropertiesDialog(false);
    setSaveError(null);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <Layers className="h-6 w-6 text-blue-600 mr-2" />
            <h1 className="text-3xl font-bold text-gray-900">Digitalización de Activos</h1>
          </div>
          <p className="text-gray-600">
            Crea y posiciona activos agrícolas en el mapa 3D. Selecciona un tipo de activo y dibújalo en el mapa.
          </p>
        </div>

        {/* Success/Error Messages */}
        {saveSuccess && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-900">
              Activo creado exitosamente
            </p>
          </div>
        )}

        {saveError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm font-medium text-red-900">{saveError}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Asset Library */}
          <div className="lg:col-span-1">
            <AssetLibrary
              onSelectAsset={handleAssetSelect}
              selectedAssetType={selectedAssetType}
            />
          </div>

          {/* Right Side - Map */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div
                ref={wrapperRef}
                className="relative bg-slate-900"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
              >
                {/* Title */}
                <div className="absolute top-4 left-4 z-10 bg-black/60 text-white px-3 py-2 rounded-lg">
                  <h3 className="font-semibold">Mapa 3D - Digitalización</h3>
                </div>

                {/* Fullscreen Button */}
                <div className="absolute top-4 right-4 z-10">
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="inline-flex items-center justify-center rounded-full bg-black/60 text-white p-2 hover:bg-black/70 transition"
                    aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                  </button>
                </div>

                {/* Cesium Container */}
                <div ref={containerRef} className="w-full h-full" />
                
                {/* Asset Drawer Overlay */}
                {selectedAssetType && viewerRef.current && (
                  <CesiumAssetDrawer
                    assetType={selectedAssetType}
                    viewer={viewerRef.current}
                    onComplete={handleDrawingComplete}
                    onCancel={handleCancelDrawing}
                    enabled={!showPropertiesDialog}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Properties Dialog */}
        {showPropertiesDialog && selectedAssetType && drawingGeometry && (
          <AssetPropertiesDialog
            isOpen={showPropertiesDialog}
            assetType={selectedAssetType}
            geometry={drawingGeometry}
            onSave={handleSaveAsset}
            onCancel={() => {
              setShowPropertiesDialog(false);
              setDrawingGeometry(null);
            }}
            suggestedName={undefined} // Will be generated by backend
          />
        )}
      </div>
    </Layout>
  );
};

