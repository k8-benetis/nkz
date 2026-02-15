import { useEffect } from 'react';
import { detectTerrainProviderFromParcels, TERRAIN_PROVIDERS } from '@/utils/terrain';
import type { Parcel } from '@/types';

/**
 * Manages Cesium terrain provider switching (IDENA/IGN/ellipsoid).
 * Extracted from CesiumMap.tsx terrain update useEffect.
 */
export function useTerrainProvider(
  viewerRef: React.MutableRefObject<any>,
  enable3DTerrain: boolean,
  currentTerrainProvider: string,
  parcels: Parcel[]
) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !enable3DTerrain) {
      if (viewer && !enable3DTerrain) {
        // @ts-ignore
        const Cesium = window.Cesium;
        if (Cesium) viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    try {
      let terrainUrlToUse: string | null = null;
      let providerName = 'custom';

      if (currentTerrainProvider === 'idena') {
        terrainUrlToUse = TERRAIN_PROVIDERS.idena;
        providerName = 'IDENA';
      } else if (currentTerrainProvider === 'ign') {
        terrainUrlToUse = TERRAIN_PROVIDERS.ign;
        providerName = 'IGN';
      } else if (currentTerrainProvider === 'auto') {
        const parcelsForDetection = parcels.map(p => ({
          geometry: p.location?.value || undefined
        }));
        const detected = detectTerrainProviderFromParcels(parcelsForDetection);
        terrainUrlToUse = TERRAIN_PROVIDERS[detected];
        providerName = detected.toUpperCase();
        console.log('[CesiumMap] Auto-detected terrain provider:', detected);
      } else if (currentTerrainProvider && currentTerrainProvider.startsWith('http')) {
        terrainUrlToUse = currentTerrainProvider;
      } else {
        terrainUrlToUse = TERRAIN_PROVIDERS.ign;
        providerName = 'IGN';
      }

      if (terrainUrlToUse) {
        console.log('[CesiumMap] Activating terrain provider:', providerName);
        const baseUrl = terrainUrlToUse.replace('/layer.json', '');

        Cesium.CesiumTerrainProvider.fromUrl(baseUrl, {
          requestWaterMask: false,
          requestVertexNormals: true,
        })
          .then((terrainProviderInstance: any) => {
            if (viewer.isDestroyed()) return;

            if (!viewer.isDestroyed()) {
              terrainProviderInstance.errorEvent.addEventListener((error: any) => {
                console.warn('[CesiumMap] Terrain provider error:', providerName, error);
                if (!viewer.isDestroyed()) viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
              });
              viewer.terrainProvider = terrainProviderInstance;
              console.log('[CesiumMap] Terrain provider activated:', providerName);
            }
          })
          .catch((error: any) => {
            console.error('[CesiumMap] Failed to load terrain provider:', providerName, error);
            if (!viewer.isDestroyed()) viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
          });
      }
    } catch (e) {
      console.warn('[CesiumMap] Failed to configure terrain, using ellipsoid:', e);
      if (viewer && !viewer.isDestroyed()) viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
  }, [enable3DTerrain, currentTerrainProvider, parcels]);
}
