import { useEffect } from 'react';

/**
 * Handles entity click selection in view mode.
 * Extracted from CesiumMap.tsx entity selection useEffect.
 */
export function useEntitySelection(
  viewerRef: React.MutableRefObject<any>,
  mode: 'view' | 'picker',
  onEntitySelect?: (entity: { id: string; type: string }) => void
) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || mode !== 'view' || !onEntitySelect) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        const entityId: string = entity.id;

        console.log('[CesiumMap] Clicked entity:', entityId);

        if (entityId.startsWith('sensor-')) {
          onEntitySelect({ id: entityId.replace('sensor-', ''), type: 'AgriSensor' });
        } else if (entityId.startsWith('parcel-')) {
          onEntitySelect({ id: entityId.replace('parcel-', ''), type: 'AgriParcel' });
        } else if (entityId.startsWith('robot-')) {
          onEntitySelect({ id: entityId.replace('robot-', ''), type: 'AgriculturalRobot' });
        } else if (entityId.startsWith('machine-')) {
          onEntitySelect({ id: entityId.replace('machine-', ''), type: 'Tractor' });
        } else {
          onEntitySelect({ id: entityId, type: 'Unknown' });
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!viewer.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [mode, onEntitySelect]);
}
