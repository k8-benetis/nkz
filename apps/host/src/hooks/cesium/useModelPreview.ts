import { useEffect } from 'react';

/**
 * Handles the ghost model rendering in PREVIEW_MODEL mode.
 * Extracted from CesiumMap.tsx model preview useEffect.
 */
export function useModelPreview(
  viewerRef: React.MutableRefObject<any>,
  isViewerReady: boolean,
  viewerContext: any
) {
  useEffect(() => {
    if (!isViewerReady || !viewerRef.current || !viewerContext) return;

    const viewer = viewerRef.current;
    viewer.entities.removeById('model-preview-ghost');

    // @ts-ignore
    const Cesium = window.Cesium;

    const { mapMode, modelPlacement } = viewerContext;

    if (mapMode === 'PREVIEW_MODEL' && modelPlacement && modelPlacement.position) {
      const lon = Number(modelPlacement.position.lon);
      const lat = Number(modelPlacement.position.lat);
      const height = Number(modelPlacement.position.height) || 0;
      const scale = Number(modelPlacement.scale) || 1;

      if (isNaN(lon) || isNaN(lat) || isNaN(scale) || scale <= 0) {
        console.warn('[CesiumMap] Invalid 3D preview parameters:', modelPlacement);
        return;
      }

      const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);

      const r0 = Number(modelPlacement.rotation?.[0]) || 0;
      const r1 = Number(modelPlacement.rotation?.[1]) || 0;
      const r2 = Number(modelPlacement.rotation?.[2]) || 0;

      const heading = Cesium.Math.toRadians(r0);
      const pitch = Cesium.Math.toRadians(r1);
      const roll = Cesium.Math.toRadians(r2);
      const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

      try {
        viewer.entities.add({
          id: 'model-preview-ghost',
          position: position,
          orientation: orientation,
          model: {
            uri: modelPlacement.modelUrl,
            scale: scale,
            minimumPixelSize: 64,
            color: Cesium.Color.WHITE.withAlpha(0.7),
            silhouetteColor: Cesium.Color.YELLOW,
            silhouetteSize: 2,
          }
        });
      } catch (e) {
        console.error('[CesiumMap] Error adding preview ghost:', e);
      }
    }
  }, [isViewerReady, viewerContext?.mapMode, viewerContext?.modelPlacement]);
}
