
import React, { useEffect, useRef, useState } from 'react';
import { useViewerOptional } from '@/context/ViewerContext';

export const CesiumStampRenderer: React.FC = () => {
    const {
        cesiumViewer: viewer,
        mapMode,
        stampOptions,
        stampInstances,
        addStampInstance,
        stampModelUrl
    } = useViewerOptional() || {};

    const modelsRef = useRef<any[]>([]);
    const fallbackEntitiesRef = useRef<any[]>([]);
    const handlerRef = useRef<any>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const ghostEntityRef = useRef<any>(null);

    // 1. Render Stamp Instances — try 3D models, fall back to point markers
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium) return;

        const cleanup = () => {
            for (const m of modelsRef.current) {
                try { viewer.scene.primitives.remove(m); } catch { /* already removed */ }
            }
            modelsRef.current = [];
            for (const e of fallbackEntitiesRef.current) {
                try { viewer.entities.remove(e); } catch { /* ok */ }
            }
            fallbackEntitiesRef.current = [];
        };

        if (!stampInstances || stampInstances.length === 0) {
            cleanup();
            return;
        }

        cleanup();

        const validInstances = stampInstances.filter(inst =>
            !isNaN(Number(inst.lat)) && !isNaN(Number(inst.lon)) &&
            !isNaN(Number(inst.scale)) && Number(inst.scale) > 0
        );

        if (validInstances.length === 0) return;

        let cancelled = false;

        // Add fallback point markers immediately (visible while 3D models load or if they fail)
        for (const inst of validInstances) {
            if (cancelled) break;
            const lat = Number(inst.lat);
            const lon = Number(inst.lon);
            const height = Number(inst.height) || 0;

            const entity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
                point: {
                    pixelSize: 10,
                    color: Cesium.Color.LIME.withAlpha(0.8),
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
            fallbackEntitiesRef.current.push(entity);
        }

        // Try to load 3D models on top of the markers
        if (stampModelUrl) {
            let modelLoadedCount = 0;
            (async () => {
                for (const inst of validInstances) {
                    if (cancelled) break;
                    try {
                        const lat = Number(inst.lat);
                        const lon = Number(inst.lon);
                        const height = Number(inst.height) || 0;
                        const scale = Number(inst.scale) || 1;
                        const rotation = Number(inst.rotation) || 0;

                        const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
                        const hpr = new Cesium.HeadingPitchRoll(
                            Cesium.Math.toRadians(rotation), 0, 0
                        );
                        const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
                        const scaleMatrix = Cesium.Matrix4.fromScale(
                            new Cesium.Cartesian3(scale, scale, scale)
                        );
                        Cesium.Matrix4.multiply(modelMatrix, scaleMatrix, modelMatrix);

                        const model = await Cesium.Model.fromGltfAsync({
                            url: stampModelUrl,
                            modelMatrix,
                            scale: 1,
                            shadows: Cesium.ShadowMode.ENABLED,
                            silhouetteColor: Cesium.Color.LIME,
                            silhouetteSize: 0,
                        });

                        if (!cancelled && !viewer.isDestroyed()) {
                            viewer.scene.primitives.add(model);
                            modelsRef.current.push(model);
                            modelLoadedCount++;
                        }
                    } catch (e) {
                        console.warn('[CesiumStampRenderer] Model load failed, using point marker fallback:', e);
                    }
                }

                // If all models loaded successfully, remove fallback markers
                if (!cancelled && modelLoadedCount === validInstances.length) {
                    for (const e of fallbackEntitiesRef.current) {
                        try { viewer.entities.remove(e); } catch { /* ok */ }
                    }
                    fallbackEntitiesRef.current = [];
                }
            })();
        }

        return () => {
            cancelled = true;
        };
    }, [viewer, stampModelUrl, stampInstances]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (viewer && !viewer.isDestroyed()) {
                for (const m of modelsRef.current) {
                    try { viewer.scene.primitives.remove(m); } catch { /* ok */ }
                }
                modelsRef.current = [];
                for (const e of fallbackEntitiesRef.current) {
                    try { viewer.entities.remove(e); } catch { /* ok */ }
                }
                fallbackEntitiesRef.current = [];
            }
        };
    }, [viewer]);

    // 2. Input Handling (Brush) — only active in STAMP_INSTANCES mode
    useEffect(() => {
        if (!viewer || mapMode !== 'STAMP_INSTANCES' || !stampOptions) {
            if (handlerRef.current) {
                handlerRef.current.destroy();
                handlerRef.current = null;
            }
            if (ghostEntityRef.current) {
                viewer?.entities.remove(ghostEntityRef.current);
                ghostEntityRef.current = null;
            }
            return;
        }

        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium) return;

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handlerRef.current = handler;

        const updateGhost = (position: any) => {
            if (!ghostEntityRef.current) {
                ghostEntityRef.current = viewer.entities.add({
                    position,
                    ellipse: {
                        semiMinorAxis: stampOptions.brushSize,
                        semiMajorAxis: stampOptions.brushSize,
                        material: Cesium.Color.GREEN.withAlpha(0.3),
                        outline: true,
                        outlineColor: Cesium.Color.GREEN,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                    }
                });
            } else {
                ghostEntityRef.current.position = position;
                ghostEntityRef.current.ellipse.semiMinorAxis = stampOptions.brushSize;
                ghostEntityRef.current.ellipse.semiMajorAxis = stampOptions.brushSize;
            }
        };

        const placeInstance = (cartesian: any) => {
            if (!addStampInstance) return;
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            const scale = stampOptions.randomScale
                ? stampOptions.randomScale[0] + Math.random() * (stampOptions.randomScale[1] - stampOptions.randomScale[0])
                : 1;
            const rotation = stampOptions.randomRotation ? Math.random() * 360 : 0;
            addStampInstance({ lat, lon, height: 0, scale, rotation });
        };

        handler.setInputAction((movement: any) => {
            const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                updateGhost(cartesian);
                if (isDrawing && Math.random() < (stampOptions.density || 0.5)) {
                    placeInstance(cartesian);
                }
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((click: any) => {
            const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                placeInstance(cartesian);
                setIsDrawing(true);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

        handler.setInputAction(() => {
            setIsDrawing(false);
        }, Cesium.ScreenSpaceEventType.LEFT_UP);

        return () => {
            handler.destroy();
            handlerRef.current = null;
            if (ghostEntityRef.current) {
                viewer.entities.remove(ghostEntityRef.current);
                ghostEntityRef.current = null;
            }
        };
    }, [viewer, mapMode, stampOptions, isDrawing, addStampInstance]);

    return null;
};
