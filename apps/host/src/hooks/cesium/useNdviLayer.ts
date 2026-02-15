import { useEffect } from 'react';
import { getConfig } from '@/config/environment';
import type { Parcel } from '@/types';

interface NdviWmsLayerConfig {
  workspace: string;
  layer: string;
  date?: string;
  opacity?: number;
}

/**
 * Manages the NDVI WMS layer with PNG fallback on the Cesium viewer.
 * Extracted from CesiumMap.tsx NDVI layer useEffect.
 */
export function useNdviLayer(
  viewerRef: React.MutableRefObject<any>,
  ndviWmsLayer: NdviWmsLayerConfig | undefined,
  ndviOverlayUrl: string | undefined,
  parcels: Parcel[]
) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const config = getConfig();

    // Remove existing WMS layers (assuming index 1 is reserved for WMS/NDVI)
    if (viewer.imageryLayers.length > 1) {
      viewer.imageryLayers.remove(viewer.imageryLayers.get(1));
    }

    if (ndviWmsLayer && config.external.geoserverUrl) {
      try {
        const geoserverUrl = `${config.external.geoserverUrl}/wms?`;
        const layerName = `${ndviWmsLayer.workspace}:${ndviWmsLayer.layer}`;

        const wmsParameters: any = {
          layers: layerName,
          format: 'image/png',
          transparent: true,
          version: '1.1.0',
        };

        if (ndviWmsLayer.date) {
          wmsParameters.time = ndviWmsLayer.date;
        }

        const ndviWmsProvider = new Cesium.WebMapServiceImageryProvider({
          url: geoserverUrl,
          layers: layerName,
          parameters: wmsParameters,
        });

        const imageryLayer = viewer.imageryLayers.addImageryProvider(ndviWmsProvider, 1);
        imageryLayer.alpha = ndviWmsLayer.opacity !== undefined ? ndviWmsLayer.opacity : 0.8;

        console.log('[CesiumMap] NDVI WMS layer added:', layerName);
      } catch (error) {
        console.error('[CesiumMap] Error adding NDVI WMS layer:', error);
      }
    } else if (ndviOverlayUrl && parcels.length > 0) {
      // Fallback: Use preview PNG as overlay if WMS is not available
      try {
        const parcel = parcels[0];
        if (parcel.location?.value?.coordinates) {
          const coords = parcel.location.value.coordinates[0] as any[];
          const lons = coords.map((c: any) => c[0]);
          const lats = coords.map((c: any) => c[1]);
          const west = Math.min(...lons);
          const east = Math.max(...lons);
          const south = Math.min(...lats);
          const north = Math.max(...lats);

          const singleTileProvider = new Cesium.SingleTileImageryProvider({
            url: ndviOverlayUrl,
            rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
          });

          const imageryLayer = viewer.imageryLayers.addImageryProvider(singleTileProvider, 1);
          imageryLayer.alpha = 0.8;

          console.log('[CesiumMap] NDVI preview overlay added:', ndviOverlayUrl);
        }
      } catch (error) {
        console.error('[CesiumMap] Error adding NDVI preview overlay:', error);
      }
    }
  }, [ndviWmsLayer, ndviOverlayUrl, parcels]);
}
