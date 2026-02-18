// =============================================================================
// Map Drawing Overlay - Generic Drawing Tool for Unified Viewer
// =============================================================================
// Overlay component that adds generic drawing capabilities to an existing CesiumMap.
// Uses the viewer from ViewerContext instead of creating its own.

import React, { useEffect, useRef, useCallback } from 'react';
import { useViewer } from '@/context/ViewerContext';
import type { Point } from 'geojson';
import { calculatePolygonAreaHectares } from '@/utils/geo';

interface MapDrawingOverlayProps {
    /** Callback when drawing is complete */
    onComplete: (geometry: any, areaHectares: number | null) => void;
    /** Callback when drawing is cancelled */
    onCancel?: () => void;
    /** Whether drawing is enabled */
    enabled: boolean;
    /** Type of geometry to draw */
    drawingType?: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString';
}

export const MapDrawingOverlay: React.FC<MapDrawingOverlayProps> = ({
    onComplete,
    onCancel: _onCancel,
    enabled,
    drawingType = 'Polygon', // Default to Polygon for backward compatibility
}) => {
    const { cesiumViewer } = useViewer();
    const handlerRef = useRef<any>(null);
    const drawingEntityRef = useRef<any>(null);
    const dynamicHierarchyRef = useRef<any>(null); // For Polygons
    const dynamicPositionsRef = useRef<any>(null); // For Lines
    const dynamicPointRef = useRef<any>(null);
    const pointEntitiesRef = useRef<any[]>([]);
    const cartesianPositionsRef = useRef<any[]>([]);
    const isDrawingRef = useRef(false);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (handlerRef.current) {
            handlerRef.current.destroy();
            handlerRef.current = null;
        }
        if (drawingEntityRef.current && cesiumViewer) {
            cesiumViewer.entities.remove(drawingEntityRef.current);
            drawingEntityRef.current = null;
        }
        if (dynamicHierarchyRef.current) {
            dynamicHierarchyRef.current = null;
        }
        if (dynamicPositionsRef.current) {
            dynamicPositionsRef.current = null;
        }
        if (dynamicPointRef.current && cesiumViewer) {
            cesiumViewer.entities.remove(dynamicPointRef.current);
            dynamicPointRef.current = null;
        }
        pointEntitiesRef.current.forEach(point => {
            if (cesiumViewer) {
                cesiumViewer.entities.remove(point);
            }
        });
        pointEntitiesRef.current = [];
        cartesianPositionsRef.current = [];
        isDrawingRef.current = false;
    }, [cesiumViewer]);

    // Setup drawing handler
    useEffect(() => {
        console.log('[MapDrawingOverlay] useEffect triggered', { enabled, hasCesiumViewer: !!cesiumViewer, drawingType });
        if (!enabled || !cesiumViewer) {
            console.log('[MapDrawingOverlay] Early return - enabled:', enabled, 'cesiumViewer:', !!cesiumViewer);
            cleanup();
            return;
        }
        console.log('[MapDrawingOverlay] Setting up drawing handler for', drawingType);


        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium || cesiumViewer.isDestroyed()) {
            return;
        }

        const viewer = cesiumViewer;
        isDrawingRef.current = true;

        // Clean up any existing handler first
        if (handlerRef.current) {
            handlerRef.current.destroy();
        }

        // Create handler for drawing
        handlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // Left click: Add point
        handlerRef.current.setInputAction((click: any) => {
            if (!isDrawingRef.current) return;

            // Try pickPosition first (accounts for terrain/3D), fallback to pickEllipsoid
            let cartesian = viewer.scene.pickPosition(click.position);
            if (!cartesian) {
                cartesian = viewer.camera.pickEllipsoid(click.position);
                if (!cartesian) return;
            }

            cartesianPositionsRef.current.push(cartesian);

            // Add point marker
            const pointEntity = viewer.entities.add({
                position: cartesian,
                point: {
                    pixelSize: 10,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                },
            });
            pointEntitiesRef.current.push(pointEntity);

            // Handle Point type: Single click finishes
            if (drawingType === 'Point') {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const lon = Cesium.Math.toDegrees(cartographic.longitude);
                const lat = Cesium.Math.toDegrees(cartographic.latitude);

                const geometry: Point = {
                    type: 'Point',
                    coordinates: [lon, lat]
                };

                cleanup();
                onComplete(geometry, null);
                return;
            }

            // Update drawing entity (Polygon or Line)
            const minPoints = drawingType === 'Polygon' ? 2 : 2;

            if (cartesianPositionsRef.current.length >= minPoints) {
                if (!drawingEntityRef.current) {
                    if (drawingType === 'Polygon') {
                        dynamicHierarchyRef.current = new Cesium.CallbackProperty(() => {
                            return new Cesium.PolygonHierarchy(cartesianPositionsRef.current);
                        }, false);

                        drawingEntityRef.current = viewer.entities.add({
                            polygon: {
                                hierarchy: dynamicHierarchyRef.current,
                                material: Cesium.Color.YELLOW.withAlpha(0.3),
                                outline: true,
                                outlineColor: Cesium.Color.YELLOW,
                                outlineWidth: 2,
                                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                                classificationType: Cesium.ClassificationType.TERRAIN,
                            },
                        });
                    } else { // LineString or MultiLineString
                        dynamicPositionsRef.current = new Cesium.CallbackProperty(() => {
                            return cartesianPositionsRef.current;
                        }, false);

                        drawingEntityRef.current = viewer.entities.add({
                            polyline: {
                                positions: dynamicPositionsRef.current,
                                width: 3,
                                material: Cesium.Color.YELLOW,
                                clampToGround: true,
                            }
                        });
                    }
                }
                // No else needed, CallbackProperty handles updates automatically
            }

            viewer.scene.requestRender();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Right click: Complete drawing (Polygon/Line)
        if (drawingType !== 'Point') {
            handlerRef.current.setInputAction(() => {
                if (!isDrawingRef.current) return;

                const minPoints = drawingType === 'Polygon' ? 3 : 2;
                if (cartesianPositionsRef.current.length < minPoints) return;

                // Convert points to coordinates
                const coordinates = cartesianPositionsRef.current.map(cartesian => {
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                    return [
                        Cesium.Math.toDegrees(cartographic.longitude),
                        Cesium.Math.toDegrees(cartographic.latitude)
                    ];
                });

                let geometry: any;
                let areaHectares: number | null = null;

                if (drawingType === 'Polygon') {
                    // Close polygon
                    if (coordinates.length > 0) {
                        const first = coordinates[0];
                        const last = coordinates[coordinates.length - 1];
                        if (first[0] !== last[0] || first[1] !== last[1]) {
                            coordinates.push([first[0], first[1]]);
                        }
                    }
                    geometry = {
                        type: 'Polygon',
                        coordinates: [coordinates],
                    };
                    areaHectares = calculatePolygonAreaHectares(geometry);
                } else if (drawingType === 'LineString') {
                    geometry = {
                        type: 'LineString',
                        coordinates: coordinates,
                    };
                } else if (drawingType === 'MultiLineString') {
                    geometry = {
                        type: 'MultiLineString',
                        coordinates: [coordinates],
                    };
                }

                cleanup();
                onComplete(geometry, areaHectares);
            }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

            // Mouse move: Preview
            handlerRef.current.setInputAction((movement: any) => {
                if (!isDrawingRef.current || cartesianPositionsRef.current.length === 0) return;

                // Pick position
                let cartesian = viewer.scene.pickPosition(movement.endPosition);
                if (!cartesian) {
                    cartesian = viewer.camera.pickEllipsoid(movement.endPosition);
                }
                if (!cartesian) return;

                // Show dynamic point
                if (!dynamicPointRef.current) {
                    dynamicPointRef.current = viewer.entities.add({
                        position: cartesian,
                        point: {
                            pixelSize: 8,
                            color: Cesium.Color.CYAN,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 1,
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        },
                    });
                } else {
                    dynamicPointRef.current.position = cartesian;
                }

                // Update preview shape
                if (cartesianPositionsRef.current.length >= 1 && drawingEntityRef.current) {
                    // The CallbackProperty normally handles this validation, but we can force update
                    // or augment the array being returned by the callback if we want "rubber banding"
                    // For simplicity, we just rely on existing points, avoiding complexity of temporary points in array
                    // To show rubber band line to cursor:
                    // We would need to pass a different array to callback that includes the cursor position
                    // For now, simple point preview is sufficient as implemented above
                }

                viewer.scene.requestRender();
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        }

        return cleanup;
    }, [enabled, cesiumViewer, onComplete, cleanup, drawingType]);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Render instructions
    if (!enabled) return null;

    const getInstructions = () => {
        switch (drawingType) {
            case 'Point': return 'Click to pick a location';
            case 'Polygon': return 'Left click to add points. Right click to finish.';
            case 'LineString': return 'Left click to add points. Right click to finish.';
            case 'MultiLineString': return 'Left click to add points. Right click to finish current line.';
            default: return 'Click map to draw';
        }
    };

    return (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg z-50 pointer-events-none">
            <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                {getInstructions()}
            </p>
            <p className="text-xs text-gray-500 mt-1 text-center">
                Drawing: {drawingType}
            </p>
        </div>
    );
};
