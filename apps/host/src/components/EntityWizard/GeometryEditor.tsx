/**
 * GeometryEditor - Professional Cesium-based geometry drawing component
 * 
 * Supports:
 * - Point: Single click
 * - Polygon: Multiple clicks, auto-close
 * - LineString: Multiple clicks
 * - MultiLineString: Multiple lines
 * - Parent geometry visualization (for hierarchy validation)
 * - Real-time validation feedback
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser, RotateCcw, CheckCircle2, AlertCircle, MapPin, PenTool } from 'lucide-react';
import type { Geometry, Polygon, Point, LineString, MultiLineString } from 'geojson';
import { useViewer } from '@/context/ViewerContext';
import { validateGeometryWithinParent } from '@/utils/geometryValidation';
import { calculatePolygonAreaHectares } from '@/utils/geo';
// NOTE: CesiumMap import removed - all geometry types now use global viewer via startDrawing

interface ParentGeometry {
  id: string;
  name: string;
  geometry: Polygon;
}

interface GeometryEditorProps {
  geometryType: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString';
  parentGeometry?: ParentGeometry | null;
  initialGeometry?: Geometry | null;
  onGeometryChange: (geometry: Geometry | null) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  height?: string;
  disabled?: boolean;
}

export const GeometryEditor: React.FC<GeometryEditorProps> = ({
  geometryType,
  parentGeometry,
  initialGeometry,
  onGeometryChange,
  onValidationChange,
  height = 'h-96',
  disabled = false
}) => {
  const { cesiumViewer, startDrawing } = useViewer(); // Use generic viewer context
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const handlerRef = useRef<any>(null);
  const pointsRef = useRef<any[]>([]);
  const currentEntityRef = useRef<any>(null);
  const parentEntityRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentGeometry, setCurrentGeometry] = useState<Geometry | null>(initialGeometry || null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [area, setArea] = useState<number | null>(null);

  // Initialize Cesium viewer ONLY if no global viewer or explicitly disabled global usage
  // For now, we prefer global viewer if available
  useEffect(() => {
    if (cesiumViewer) return; // Skip local viewer if global exists

    if (!containerRef.current || viewerRef.current || disabled) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) {
      console.warn('[GeometryEditor] Cesium not available');
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
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      selectionIndicator: false,
      infoBox: false,
    });

    // Hide credits
    if (viewer.cesiumWidget?.creditContainer) {
      viewer.cesiumWidget.creditContainer.style.display = 'none';
    }

    // Configure scene
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0f172a');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1f2937');
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Set up imagery (OSM)
    viewer.imageryLayers.removeAll();
    const osmProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maximumLevel: 19,
    });
    viewer.imageryLayers.addImageryProvider(osmProvider);

    // Set initial view (Spain)
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-3.7, 40.41, 600_000),
    });

    viewerRef.current = viewer;

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
  }, [disabled]);

  // Draw parent geometry if provided
  useEffect(() => {
    if (!viewerRef.current || !parentGeometry) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    if (viewer.isDestroyed()) return;

    // Remove previous parent entity
    if (parentEntityRef.current) {
      viewer.entities.remove(parentEntityRef.current);
    }

    // Draw parent polygon
    const coordinates = parentGeometry.geometry.coordinates[0];
    const positions = coordinates.map((coord: number[]) =>
      Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
    );

    parentEntityRef.current = viewer.entities.add({
      id: 'parent-geometry',
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.GRAY.withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.GRAY,
        outlineWidth: 2,
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
      label: {
        text: parentGeometry.name,
        font: '14px sans-serif',
        fillColor: Cesium.Color.GRAY,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
      }
    });

    // Zoom to parent if no current geometry
    if (!currentGeometry) {
      viewer.zoomTo(parentEntityRef.current);
    }
  }, [parentGeometry]); // Removed currentGeometry to prevent re-render loop

  // Draw initial geometry if provided
  useEffect(() => {
    if (!viewerRef.current || !initialGeometry || currentGeometry) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    if (viewer.isDestroyed()) return;

    drawGeometry(initialGeometry);
    setCurrentGeometry(initialGeometry);
  }, [initialGeometry]);

  // Drawing logic
  const drawGeometry = (geometry: Geometry) => {
    if (!viewerRef.current) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    if (viewer.isDestroyed()) return;

    // Remove previous geometry
    if (currentEntityRef.current) {
      viewer.entities.remove(currentEntityRef.current);
    }
    pointsRef.current.forEach(point => viewer.entities.remove(point));
    pointsRef.current = [];

    let entity: any = null;

    switch (geometry.type) {
      case 'Point': {
        const point = geometry as Point;
        entity = viewer.entities.add({
          id: 'current-geometry',
          position: Cesium.Cartesian3.fromDegrees(point.coordinates[0], point.coordinates[1]),
          point: {
            pixelSize: 10,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          }
        });
        break;
      }
      case 'Polygon': {
        const polygon = geometry as Polygon;
        const polyCoords = polygon.coordinates[0];
        const polyPositions = polyCoords.map((coord: number[]) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
        );

        // Add point markers
        polyPositions.forEach((pos, _index) => {
          const pointEntity = viewer.entities.add({
            position: pos,
            point: {
              pixelSize: 8,
              color: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            }
          });
          pointsRef.current.push(pointEntity);
        });

        entity = viewer.entities.add({
          id: 'current-geometry',
          polygon: {
            hierarchy: polyPositions,
            material: validationError
              ? Cesium.Color.RED.withAlpha(0.3)
              : Cesium.Color.GREEN.withAlpha(0.3),
            outline: true,
            outlineColor: validationError ? Cesium.Color.RED : Cesium.Color.GREEN,
            outlineWidth: 3,
            classificationType: Cesium.ClassificationType.TERRAIN,
          }
        });

        // Calculate area
        const areaHectares = calculatePolygonAreaHectares(polygon);
        setArea(areaHectares);
        break;
      }
      case 'LineString': {
        const lineString = geometry as LineString;
        const linePositions = lineString.coordinates.map((coord: number[]) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
        );

        // Add point markers
        linePositions.forEach((pos) => {
          const pointEntity = viewer.entities.add({
            position: pos,
            point: {
              pixelSize: 8,
              color: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            }
          });
          pointsRef.current.push(pointEntity);
        });

        entity = viewer.entities.add({
          id: 'current-geometry',
          polyline: {
            positions: linePositions,
            width: 3,
            material: validationError
              ? Cesium.Color.RED
              : Cesium.Color.GREEN,
            clampToGround: true,
          }
        });
        break;
      }
      case 'MultiLineString': {
        const multiLine = geometry as MultiLineString;
        multiLine.coordinates.forEach((lineCoords, lineIndex) => {
          const linePositions = lineCoords.map((coord: number[]) =>
            Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
          );

          // Add point markers
          linePositions.forEach((pos) => {
            const pointEntity = viewer.entities.add({
              position: pos,
              point: {
                pixelSize: 8,
                color: Cesium.Color.CYAN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              }
            });
            pointsRef.current.push(pointEntity);
          });

          const lineEntity = viewer.entities.add({
            polyline: {
              positions: linePositions,
              width: 3,
              material: validationError
                ? Cesium.Color.RED
                : Cesium.Color.GREEN,
              clampToGround: true,
            }
          });

          if (lineIndex === 0) {
            entity = lineEntity; // Use first line as main entity for zoom
          }
        });
        break;
      }
    }

    if (entity) {
      currentEntityRef.current = entity;
      viewer.zoomTo(entity);
    }
  };

  // NOTE: Removed embedded CesiumMap for Point mode.
  // ALL geometry types now use the global viewer via startDrawing for unified UX.

  // Validate geometry against parent
  const validateGeometry = useCallback((geometry: Geometry) => {
    if (!parentGeometry || !geometry) {
      setValidationError(null);
      onValidationChange?.(true);
      return;
    }

    const validation = validateGeometryWithinParent(geometry, parentGeometry.geometry);

    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid geometry');
      onValidationChange?.(false, validation.error);

      // Update entity color to red
      if (currentEntityRef.current && viewerRef.current) {
        // @ts-ignore
        const Cesium = window.Cesium;
        if (geometry.type === 'Polygon') {
          currentEntityRef.current.polygon.material = Cesium.Color.RED.withAlpha(0.3);
          currentEntityRef.current.polygon.outlineColor = Cesium.Color.RED;
        } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
          currentEntityRef.current.polyline.material = Cesium.Color.RED;
        }
      }
    } else {
      setValidationError(null);
      onValidationChange?.(true);

      // Update entity color to green
      if (currentEntityRef.current && viewerRef.current) {
        // @ts-ignore
        const Cesium = window.Cesium;
        if (geometry.type === 'Polygon') {
          currentEntityRef.current.polygon.material = Cesium.Color.GREEN.withAlpha(0.3);
          currentEntityRef.current.polygon.outlineColor = Cesium.Color.GREEN;
        } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
          currentEntityRef.current.polyline.material = Cesium.Color.GREEN;
        }
      }
    }
  }, [parentGeometry, onValidationChange]);

  // Setup drawing handler for Polygon/LineString/MultiLineString
  useEffect(() => {
    if (!viewerRef.current || disabled) {
      return;
    }

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    if (viewer.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    const positions: any[] = [];
    let isDrawing = false;

    const startDrawing = () => {
      if (disabled) return;
      positions.length = 0;
      isDrawing = true;
      setIsDrawing(true);

      // Clear previous geometry
      if (currentEntityRef.current) {
        viewer.entities.remove(currentEntityRef.current);
      }
      pointsRef.current.forEach(point => viewer.entities.remove(point));
      pointsRef.current = [];
    };

    const finishDrawing = (finalPositions: any[]) => {
      if (finalPositions.length < (geometryType === 'Polygon' ? 3 : 2)) return;

      // Convert to GeoJSON
      const coordinates = finalPositions.map(pos => {
        const cartographic = Cesium.Cartographic.fromCartesian(pos);
        return [
          Cesium.Math.toDegrees(cartographic.longitude),
          Cesium.Math.toDegrees(cartographic.latitude)
        ];
      });

      let geometry: Geometry;

      if (geometryType === 'Polygon') {
        // Close polygon
        coordinates.push(coordinates[0]);
        geometry = {
          type: 'Polygon',
          coordinates: [coordinates]
        };
      } else if (geometryType === 'LineString') {
        geometry = {
          type: 'LineString',
          coordinates: coordinates
        };
      } else {
        // MultiLineString - for now, single line
        geometry = {
          type: 'MultiLineString',
          coordinates: [coordinates]
        };
      }

      setCurrentGeometry(geometry);
      onGeometryChange(geometry);
      validateGeometry(geometry);
      isDrawing = false;
      setIsDrawing(false);
    };

    handler.setInputAction((click: any) => {
      if (disabled) return;

      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);

      if (!isDrawing) {
        startDrawing();
      }

      positions.push(Cesium.Cartesian3.fromDegrees(lon, lat));

      // Add point marker
      const pointEntity = viewer.entities.add({
        position: positions[positions.length - 1],
        point: {
          pixelSize: 8,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        }
      });
      pointsRef.current.push(pointEntity);

      // Update preview
      if (geometryType === 'Polygon' && positions.length >= 3) {
        // Draw polygon preview
        if (currentEntityRef.current) {
          viewer.entities.remove(currentEntityRef.current);
        }

        currentEntityRef.current = viewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: Cesium.Color.YELLOW.withAlpha(0.3),
            outline: true,
            outlineColor: Cesium.Color.YELLOW,
            outlineWidth: 2,
            classificationType: Cesium.ClassificationType.TERRAIN,
          }
        });
      } else if ((geometryType === 'LineString' || geometryType === 'MultiLineString') && positions.length >= 2) {
        // Draw line preview
        if (currentEntityRef.current) {
          viewer.entities.remove(currentEntityRef.current);
        }

        currentEntityRef.current = viewer.entities.add({
          polyline: {
            positions: positions,
            width: 3,
            material: Cesium.Color.YELLOW,
            clampToGround: true,
          }
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Double-click to finish polygon
    if (geometryType === 'Polygon') {
      handler.setInputAction(() => {
        if (positions.length >= 3) {
          finishDrawing(positions);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    // Right-click to finish line
    if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
      handler.setInputAction(() => {
        if (positions.length >= 2) {
          finishDrawing(positions);
        }
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    return () => {
      handler.destroy();
      handlerRef.current = null;
    };
  }, [geometryType, disabled, parentGeometry, validateGeometry]);

  // Re-validate when parent changes
  useEffect(() => {
    if (currentGeometry && parentGeometry) {
      validateGeometry(currentGeometry);
    }
  }, [parentGeometry, currentGeometry, validateGeometry]);

  const handleClear = () => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    if (currentEntityRef.current) {
      viewer.entities.remove(currentEntityRef.current);
      currentEntityRef.current = null;
    }
    pointsRef.current.forEach(point => viewer.entities.remove(point));
    pointsRef.current = [];

    setCurrentGeometry(null);
    setValidationError(null);
    setArea(null);
    onGeometryChange(null);
    onValidationChange?.(true);
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (!viewerRef.current || pointsRef.current.length === 0) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    const lastPoint = pointsRef.current.pop();
    if (lastPoint) {
      viewer.entities.remove(lastPoint);
    }

    // Rebuild geometry without last point
    if (pointsRef.current.length > 0) {
      const positions = pointsRef.current.map((point: any) => point.position._value);

      if (currentEntityRef.current) {
        viewer.entities.remove(currentEntityRef.current);
      }

      if (geometryType === 'Polygon' && positions.length >= 3) {
        currentEntityRef.current = viewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: Cesium.Color.YELLOW.withAlpha(0.3),
            outline: true,
            outlineColor: Cesium.Color.YELLOW,
            outlineWidth: 2,
          }
        });
      } else if ((geometryType === 'LineString' || geometryType === 'MultiLineString') && positions.length >= 2) {
        currentEntityRef.current = viewer.entities.add({
          polyline: {
            positions: positions,
            width: 3,
            material: Cesium.Color.YELLOW,
            clampToGround: true,
          }
        });
      }
    } else {
      if (currentEntityRef.current) {
        viewer.entities.remove(currentEntityRef.current);
        currentEntityRef.current = null;
      }
      setCurrentGeometry(null);
      onGeometryChange(null);
    }
  };

  const getInstructions = (): string => {
    // Instructions for all geometry types
    switch (geometryType) {
      case 'Point':
        return 'Click on the map to select a location.';
      case 'Polygon':
        return 'Click to add points. Double-click or right-click to finish. Minimum 3 points required.';
      case 'LineString':
        return 'Click to add points. Right-click to finish. Minimum 2 points required.';
      case 'MultiLineString':
        return 'Click to add points for each line. Right-click to finish current line.';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3">
      <div className={`${height} rounded-lg overflow-hidden border border-gray-300 bg-gray-100 relative`}>
        {cesiumViewer ? (
          // Global Viewer Mode UI
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
            <div className="mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                {geometryType === 'Point' ? (
                  <MapPin className="w-8 h-8 text-blue-600" />
                ) : (
                  <PenTool className="w-8 h-8 text-blue-600" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {geometryType === 'Point' ? 'Seleccionar Ubicación' : 'Interactive Map Mode'}
              </h3>
              <p className="text-gray-500 max-w-sm mx-auto mt-1">
                {geometryType === 'Point'
                  ? 'Haz clic en el mapa para seleccionar la ubicación. El wizard se ocultará mientras seleccionas.'
                  : `Use the main map to draw the ${geometryType}. The wizard will hide temporarily while you draw.`}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  startDrawing(geometryType, (geom) => {
                    setCurrentGeometry(geom);
                    onGeometryChange(geom);
                    // Calculate area if polygon
                    if (geom.type === 'Polygon') {
                      setArea(calculatePolygonAreaHectares(geom as Polygon));
                    }
                    // Validate
                    if (parentGeometry) {
                      const val = validateGeometryWithinParent(geom, parentGeometry.geometry);
                      setValidationError(val.valid ? null : val.error || 'Invalid');
                      onValidationChange?.(val.valid, val.error);
                    } else {
                      setValidationError(null);
                      onValidationChange?.(true);
                    }
                  });
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition shadow-sm"
              >
                {geometryType === 'Point' ? (
                  <>
                    <MapPin className="w-4 h-4" />
                    {currentGeometry ? 'Cambiar Ubicación' : 'Seleccionar en Mapa'}
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    {currentGeometry ? 'Redraw Geometry' : 'Start Drawing'}
                  </>
                )}
              </button>

              {currentGeometry && (
                <button
                  onClick={() => {
                    setCurrentGeometry(null);
                    onGeometryChange(null);
                    setArea(null);
                    setValidationError(null);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition shadow-sm"
                >
                  <Eraser className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {currentGeometry && (
              <div className="mt-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left w-full max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">Selected Geometry</span>
                  {validationError ? (
                    <span className="text-xs text-red-600 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" /> {validationError}
                    </span>
                  ) : (
                    <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Valid
                    </span>
                  )}
                </div>
                <div className="text-xs text-mono bg-gray-50 p-2 rounded border border-gray-100 overflow-hidden text-ellipsis whitespace-nowrap">
                  {currentGeometry.type === 'Point' ? (
                    <>
                      📍 Lat: {(currentGeometry as Point).coordinates[1].toFixed(6)}, Lon: {(currentGeometry as Point).coordinates[0].toFixed(6)}
                    </>
                  ) : (
                    <>
                      Type: {currentGeometry.type} •
                      {area ? ` Area: ${area.toFixed(2)} ha` : ' Coordinates captured'}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Local Viewer Mode (Fallback)
          <div ref={containerRef} className="w-full h-full" />
        )}

        {/* Instructions overlay */}
        {!currentGeometry && !isDrawing && (
          <div className="absolute top-4 left-4 bg-white/90 px-3 py-2 rounded shadow text-sm z-10 max-w-xs">
            <p className="font-medium text-gray-800">{getInstructions()}</p>
          </div>
        )}

        {/* Status overlay */}
        {currentGeometry && (
          <div className="absolute bottom-4 left-4 bg-white/90 px-3 py-2 rounded shadow text-sm z-10">
            {validationError ? (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>{validationError}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>Geometry valid</span>
              </div>
            )}
            {area !== null && (
              <div className="text-xs text-gray-600 mt-1">
                Area: {area.toFixed(2)} ha
              </div>
            )}
          </div>
        )}

        {/* Tools */}
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          {isDrawing && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={disabled || pointsRef.current.length === 0}
              className="px-3 py-2 bg-white rounded shadow hover:bg-gray-50 transition disabled:opacity-50"
              title="Undo last point"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {currentGeometry && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="px-3 py-2 bg-white rounded shadow hover:bg-gray-50 transition disabled:opacity-50"
              title="Clear geometry"
            >
              <Eraser className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {parentGeometry && (
        <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          <strong>Parent:</strong> {parentGeometry.name} (shown in gray)
        </div>
      )}
    </div>
  );
};
