// =============================================================================
// Cesium Asset Drawer - Draw Assets on Cesium Map
// =============================================================================
// Component for drawing assets (Point, LineString, Polygon) on Cesium map

import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, X } from 'lucide-react';
import type { AssetType, GeoPolygon } from '@/types';
import { toGeoPolygon } from '@/utils/geo';

interface CesiumAssetDrawerProps {
  assetType: AssetType | null;
  viewer: any; // Cesium Viewer instance
  onComplete: (geometry: GeoPolygon | { type: 'Point' | 'LineString'; coordinates: number[] | number[][] }) => void;
  onCancel?: () => void;
  enabled?: boolean;
}

export const CesiumAssetDrawer: React.FC<CesiumAssetDrawerProps> = ({
  assetType,
  viewer,
  onComplete,
  onCancel,
  enabled = true,
}) => {
  const handlerRef = useRef<any>(null);
  const tempEntityRef = useRef<any>(null);
  const pointEntitiesRef = useRef<any[]>([]);
  const linePositionsRef = useRef<any[]>([]);
  const [, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Handle asset type changes
  useEffect(() => {
    if (!assetType || !enabled || !viewer) {
      cleanup();
      setIsDrawing(false);
      return;
    }

    // Start drawing mode for the selected asset type
    startDrawingMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType?.id, enabled, viewer]);

  const cleanup = () => {
    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }

    if (viewer && !viewer.isDestroyed()) {
      if (tempEntityRef.current) {
        viewer.entities.remove(tempEntityRef.current);
        tempEntityRef.current = null;
      }
      pointEntitiesRef.current.forEach(entity => {
        viewer.entities.remove(entity);
      });
    }

    pointEntitiesRef.current = [];
    linePositionsRef.current = [];
    setCurrentPoints([]);
  };

  const startDrawingMode = () => {
    if (!assetType || !viewer) return;

    cleanup();
    setIsDrawing(true);
    setCurrentPoints([]);

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    handlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    if (assetType.geometryType === 'Point') {
      // Point: Single click
      handlerRef.current.setInputAction((click: any) => {
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);

          // Create temporary visual entity
          if (tempEntityRef.current) {
            viewer.entities.remove(tempEntityRef.current);
          }

          const entityOptions: any = {
            position: cartesian,
            point: {
              pixelSize: 15,
              color: Cesium.Color.LIME,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
          };

          // Add 3D model if available
          if (assetType.model3d) {
            entityOptions.model = {
              uri: assetType.model3d,
              minimumPixelSize: 64,
              maximumScale: 20000,
              scale: assetType.defaultScale || 1.0,
            };
          }

          tempEntityRef.current = viewer.entities.add(entityOptions);

          // Complete with Point geometry
          const geometry = {
            type: 'Point' as const,
            coordinates: [lon, lat]
          };

          onComplete(geometry);
          cleanup();
          setIsDrawing(false);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    } else if (assetType.geometryType === 'LineString') {
      // LineString: Multiple clicks, double-click or Enter to finish
      let isFinished = false;

      handlerRef.current.setInputAction((click: any) => {
        if (isFinished) return;

        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);

          linePositionsRef.current.push(cartesian);
          const newPoint = [lon, lat];
          setCurrentPoints(prev => [...prev, newPoint]);

          // Add point marker
          const pointEntity = viewer.entities.add({
            position: cartesian,
            point: {
              pixelSize: 8,
              color: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.DEEPSKYBLUE,
              outlineWidth: 2,
            },
          });
          pointEntitiesRef.current.push(pointEntity);

          // Update line if we have at least 2 points
          if (linePositionsRef.current.length >= 2) {
            if (tempEntityRef.current) {
              viewer.entities.remove(tempEntityRef.current);
            }
            tempEntityRef.current = viewer.entities.add({
              polyline: {
                positions: linePositionsRef.current,
                width: 3,
                material: Cesium.Color.LIME,
                clampToGround: true,
              },
            });
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Double-click to finish
      handlerRef.current.setInputAction(() => {
        if (linePositionsRef.current.length >= 2 && !isFinished) {
          finishLineString();
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      // Enter key to finish
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && linePositionsRef.current.length >= 2 && !isFinished) {
          finishLineString();
        }
      };
      window.addEventListener('keydown', handleKeyPress);

      const finishLineString = () => {
        isFinished = true;
        if (linePositionsRef.current.length >= 2) {
          // Convert cartesian positions to coordinates
          const coordinates = linePositionsRef.current.map((cartesian: any) => {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
          });
          const geometry = {
            type: 'LineString' as const,
            coordinates: coordinates
          };
          onComplete(geometry);
        }
        cleanup();
        setIsDrawing(false);
        window.removeEventListener('keydown', handleKeyPress);
      };

    } else if (assetType.geometryType === 'Polygon') {
      // Polygon: Use similar logic to CesiumPolygonDrawer
      const positions: any[] = [];
      let dynamicHierarchy: any = null;
      let dynamicPoint: any = null;

      // Create polygon entity
      tempEntityRef.current = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            if (positions.length === 0) return undefined;
            return new Cesium.PolygonHierarchy(
              dynamicHierarchy || positions
            );
          }, false),
          material: Cesium.Color.LIME.withAlpha(0.35),
          outline: !viewer.scene.globe.depthTestAgainstTerrain,
          outlineColor: Cesium.Color.LIME,
          outlineWidth: 2,
        },
      });

      handlerRef.current.setInputAction((click: any) => {
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          positions.push(cartesian);
          dynamicHierarchy = null;

          // Add point marker
          const pointEntity = viewer.entities.add({
            position: cartesian,
            point: {
              pixelSize: 8,
              color: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.DEEPSKYBLUE,
              outlineWidth: 2,
            },
          });
          pointEntitiesRef.current.push(pointEntity);

          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          setCurrentPoints(prev => [...prev, [lon, lat]]);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Mouse move for preview
      handlerRef.current.setInputAction((event: any) => {
        if (positions.length === 0) return;
        const newPosition = viewer.camera.pickEllipsoid(event.endPosition, viewer.scene.globe.ellipsoid);
        if (newPosition) {
          dynamicHierarchy = positions.concat([newPosition]);
          if (!dynamicPoint) {
            dynamicPoint = viewer.entities.add({
              position: new Cesium.CallbackProperty(() => newPosition, false),
              point: {
                pixelSize: 6,
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
              },
            });
          } else {
            dynamicPoint.position = new Cesium.CallbackProperty(() => newPosition, false);
          }
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // Right-click to finish
      handlerRef.current.setInputAction(() => {
        if (positions.length >= 3) {
          // Convert cartesian positions to coordinates
          const coordinates = positions.map((cartesian: any) => {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
          });

          // Close polygon (first point = last point)
          if (coordinates.length > 0 &&
            (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
              coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
            coordinates.push([coordinates[0][0], coordinates[0][1]]);
          }

          const polygon = toGeoPolygon(coordinates);
          if (polygon) {
            onComplete(polygon);
          }
        }
        if (dynamicPoint) {
          viewer.entities.remove(dynamicPoint);
          dynamicPoint = null;
        }
        cleanup();
        setIsDrawing(false);
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }
  };

  if (!assetType || !enabled) {
    return null;
  }

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-2">
      <MousePointer2 className="w-4 h-4" />
      <span className="text-sm font-medium">
        {assetType.geometryType === 'Point' && 'Haz clic en el mapa para colocar el activo'}
        {assetType.geometryType === 'LineString' && `Dibuja una línea (${currentPoints.length} puntos). Doble clic o Enter para terminar`}
        {assetType.geometryType === 'Polygon' && `Dibuja un polígono (${currentPoints.length} puntos). Clic derecho para terminar`}
      </span>
      {onCancel && (
        <button
          onClick={() => {
            cleanup();
            setIsDrawing(false);
            if (onCancel) onCancel();
          }}
          className="ml-2 text-white hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

