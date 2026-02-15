import { useEffect } from 'react';

/**
 * Manages 3D Tiles tileset primitives on the Cesium viewer.
 * Extracted from CesiumMap.tsx 3D tiles useEffect.
 */
export function use3DTiles(
  viewerRef: React.MutableRefObject<any>,
  enable3DTiles: boolean,
  tilesetUrl: string
) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    // Remove existing tilesets
    viewer.scene.primitives.removeAll();

    if (enable3DTiles && tilesetUrl) {
      try {
        if (viewer.isDestroyed()) return;

        console.log('[CesiumMap] Adding 3D Tiles from:', tilesetUrl);
        const tileset = viewer.scene.primitives.add(
          new Cesium.Cesium3DTileset({
            url: tilesetUrl,
          })
        );

        if (tileset.readyPromise) {
          tileset.readyPromise.then(() => {
            if (!viewer.isDestroyed()) {
              console.log('[CesiumMap] 3D Tiles loaded successfully');
            }
          }).catch((error: any) => {
            console.error('[CesiumMap] Error loading 3D Tiles:', error);
          });
        }
      } catch (error: any) {
        console.error('[CesiumMap] Error adding 3D Tiles:', error);
      }
    }
  }, [enable3DTiles, tilesetUrl]);
}
