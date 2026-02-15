
import React, { useEffect, useRef, useState } from 'react';
import { useViewerOptional } from '@/context/ViewerContext';

export const CesiumStampRenderer: React.FC = () => {
    const {
        cesiumViewer: viewer,
        mapMode,
        stampOptions,
        stampInstances,
        startStampMode,
        addStampInstance,
        stampModelUrl
    } = useViewerOptional() || {};

    const collectionRef = useRef<any>(null);
    const handlerRef = useRef<any>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Ghost cursor (brush preview)
    const ghostEntityRef = useRef<any>(null);

    // 1. Render Stamp Instances
    useEffect(() => {
        if (!viewer || !stampModelUrl) {
            // Cleanup if mode ends or model cleared
            if (collectionRef.current && viewer && !viewer.isDestroyed()) {
                viewer.scene.primitives.remove(collectionRef.current);
                collectionRef.current = null;
            }
            return;
        }

        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium) return;

        // Cleanup old
        if (collectionRef.current) {
            viewer.scene.primitives.remove(collectionRef.current);
            collectionRef.current = null;
        }

        if (stampInstances && stampInstances.length > 0) {
            try {
                // Filter and map valid instances only
                const instances = stampInstances
                    .filter(inst => {
                        return !isNaN(Number(inst.lat)) &&
                            !isNaN(Number(inst.lon)) &&
                            !isNaN(Number(inst.scale)) &&
                            Number(inst.scale) > 0;
                    })
                    .map(inst => {
                        const lat = Number(inst.lat);
                        const lon = Number(inst.lon);
                        const height = Number(inst.height) || 0;
                        const scale = Number(inst.scale) || 1;
                        const rotation = Number(inst.rotation) || 0;

                        const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
                        const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(rotation), 0, 0);
                        const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
                        const scaleMatrix = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(scale, scale, scale));
                        Cesium.Matrix4.multiply(modelMatrix, scaleMatrix, modelMatrix);

                        return { modelMatrix };
                    });

                if (instances.length === 0) return;

                const collection = new Cesium.ModelInstanceCollection({
                    url: stampModelUrl,
                    instances: instances,
                    lightColor: new Cesium.Cartesian3(1, 1, 1),
                    shadows: Cesium.ShadowMode.ENABLED
                });

                collectionRef.current = viewer.scene.primitives.add(collection);
            } catch (e) {
                console.error("[CesiumStampRenderer] Failed to render collection:", e);
            }
        }

        // Cleanup on unmount or change
        return () => {
            // We don't remove on unmount necessarily if we want persistence? 
            // actually current design assumes this component lives in CesiumMap, 
            // so if CesiumMap unmounts, we should cleanup.
            // If stampInstances change, we re-render.
        };
    }, [viewer, stampModelUrl, stampInstances]);

    // Cleanup logic for collection when component unmounts
    useEffect(() => {
        return () => {
            if (collectionRef.current && viewer && !viewer.isDestroyed()) {
                viewer.scene.primitives.remove(collectionRef.current);
                collectionRef.current = null;
            }
        };
    }, [viewer]);


    // 2. Input Handling (Brush)
    useEffect(() => {
        if (!viewer || mapMode !== 'STAMP_INSTANCES' || !stampOptions) {
            // Cleanup handler if mode changes
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

        // Ghost cursor logic
        const updateGhost = (position: any) => {
            if (!ghostEntityRef.current) {
                ghostEntityRef.current = viewer.entities.add({
                    position: position,
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

            // Randomize
            const scale = stampOptions.randomScale
                ? stampOptions.randomScale[0] + Math.random() * (stampOptions.randomScale[1] - stampOptions.randomScale[0])
                : 1;

            const rotation = stampOptions.randomRotation
                ? Math.random() * 360
                : 0;

            addStampInstance({
                lat,
                lon,
                height: 0, // clamped to terrain usually
                scale,
                rotation
            });
        };

        // Inputs
        handler.setInputAction((movement: any) => {
            const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                updateGhost(cartesian);

                if (isDrawing) {
                    // Density check could go here
                    if (Math.random() < (stampOptions.density || 0.5)) {
                        placeInstance(cartesian);
                    }
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
