import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Logger for mobile viewer
const logger = {
    info: (msg: string, ...args: any[]) => console.log(`[MobileViewer] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(`[MobileViewer] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => console.error(`[MobileViewer] ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => console.debug(`[MobileViewer] ${msg}`, ...args),
};

// Fix window types for Cesium global
declare global {
    interface Window {
        Cesium: any;
    }
}

// Ensure Cesium is globally available for any inline scripts (though we import it)
if (typeof window !== 'undefined') {
    window.Cesium = Cesium;
}

export const MobileViewer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Initialize Cesium
    useEffect(() => {
        if (!containerRef.current || viewerRef.current) return;

        logger.info('Initializing Cesium Viewer...');

        try {
            // 1. Stripped Down Viewer
            const viewer = new Cesium.Viewer(containerRef.current, {
                animation: false,
                baseLayerPicker: false,
                fullscreenButton: false,
                vrButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                sceneModePicker: false,
                selectionIndicator: false,
                timeline: false,
                navigationHelpButton: false,
                navigationInstructionsInitiallyVisible: false,
                scene3DOnly: true,
                shouldAnimate: false, // Save battery, only render on demand
                requestRenderMode: true, // Optimize rendering loop
                maximumRenderTimeChange: Infinity,
                contextOptions: {
                    webgl: {
                        alpha: false,
                        antialias: true,
                        preserveDrawingBuffer: true,
                        powerPreference: 'high-performance',
                    }
                },
                // Use PNOA (Ortofoto) as default imagery for Agriculture context
                // @ts-ignore
                imageryProvider: false,
                // Use Ellipsoid terrain by default for performance, upgrade via message if needed
                terrainProvider: undefined,
            });

            // Set PNOA as imagery provider
            viewer.imageryLayers.removeAll();
            const pnoaProvider = new Cesium.WebMapServiceImageryProvider({
                url: 'https://www.ign.es/wms-inspire/pnoa-ma',
                layers: 'OI.OrthoimageCoverage',
                parameters: {
                    transparent: 'false',
                    format: 'image/jpeg',
                },
                credit: 'PNOA - IGN España',
            });
            viewer.imageryLayers.addImageryProvider(pnoaProvider);

            // Also add OSM as a base layer if PNOA fails or for streets context (optional)
            // For now, agriculture focus prefers Ortho.

            // Cleanup credits
            const creditContainer = (viewer.cesiumWidget.creditContainer as HTMLElement);
            if (creditContainer) creditContainer.style.display = 'none';

            // 2. Touch Tuning
            const scene = viewer.scene;
            const controller = scene.screenSpaceCameraController;

            // Enable standard interactions
            controller.enableRotate = true;
            controller.enableTranslate = true;
            controller.enableZoom = true;
            controller.enableTilt = true;
            controller.enableLook = false; // Disable look to prevent confusion

            // Tuning inertia for mobile feel
            controller.inertiaSpin = 0.8;
            controller.inertiaTranslate = 0.8;
            controller.inertiaZoom = 0.8;

            // Mobile optimization: native pixel ratio
            viewer.resolutionScale = window.devicePixelRatio || 1.0;

            // Create data source for parcels
            const dataSource = new Cesium.CustomDataSource('parcels');
            viewer.dataSources.add(dataSource);
            dataSourceRef.current = dataSource;

            // Camera sync logic (Handover)
            const onCameraChange = () => {
                const camera = viewer.camera;
                const position = camera.positionCartographic;

                // Send camera state to native app
                // @ts-ignore
                if (window.ReactNativeWebView) {
                    // @ts-ignore
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'CAMERA_UPDATE',
                        payload: {
                            lat: Cesium.Math.toDegrees(position.latitude),
                            lon: Cesium.Math.toDegrees(position.longitude),
                            height: position.height,
                            heading: Cesium.Math.toDegrees(camera.heading),
                            pitch: Cesium.Math.toDegrees(camera.pitch),
                            roll: Cesium.Math.toDegrees(camera.roll),
                        }
                    }));
                }
            };

            viewer.camera.moveEnd.addEventListener(onCameraChange);
            // Optional: moveStart or changed for smoother updates if needed, but moveEnd is safer for performance

            viewerRef.current = viewer;
            setIsReady(true);

            // Force initial render
            viewer.scene.requestRender();

            logger.info('Cesium initialized successfully');

            // Notify parent that we are ready
            // @ts-ignore
            if (window.ReactNativeWebView) {
                // @ts-ignore
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIEWER_READY' }));
            }
        } catch (error) {
            logger.error('Failed to initialize Cesium:', error);
        }

        return () => {
            if (viewerRef.current) {
                logger.info('Destroying viewer');
                viewerRef.current.destroy();
                viewerRef.current = null;
            }
        };
    }, []);

    // Message Handler
    useEffect(() => {
        if (!viewerRef.current) return;

        const handleMessage = async (event: MessageEvent) => {
            try {
                // Parse message
                let data = event.data;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        // Ignore non-JSON messages (maybe webpack HMR)
                        return;
                    }
                }

                const { type, payload } = data;
                const viewer = viewerRef.current;
                if (!viewer) return;

                logger.debug(`Received message: ${type}`);

                switch (type) {
                    case 'SET_TOKEN':
                        if (payload) {
                            Cesium.Ion.defaultAccessToken = payload;
                            logger.info('Cesium Token set');
                        }
                        break;

                    case 'FLY_TO':
                        if (payload) {
                            const { lat, lon, height, duration } = payload;
                            viewer.camera.flyTo({
                                destination: Cesium.Cartesian3.fromDegrees(lon, lat, height || 2000),
                                duration: duration !== undefined ? duration : 1.5,
                            });
                        }
                        break;

                    case 'UPDATE_PARCELS':
                        if (payload && Array.isArray(payload)) {
                            await renderParcelsBatch(payload);
                        }
                        break;

                    case 'CLEAR_PARCELS':
                        dataSourceRef.current?.entities.removeAll();
                        viewer.scene.requestRender();
                        break;
                }
            } catch (error) {
                logger.error('Error processing message:', error);
            }
        };

        // Listen on both for compatibility
        window.addEventListener('message', handleMessage);
        document.addEventListener('message', handleMessage as any);

        return () => {
            window.removeEventListener('message', handleMessage);
            document.removeEventListener('message', handleMessage as any);
        };
    }, [isReady]); // Re-bind if viewer recreates (unlikely but safe)

    // Async Batch Renderer
    const renderParcelsBatch = async (parcels: any[]) => {
        const viewer = viewerRef.current;
        const dataSource = dataSourceRef.current;
        if (!viewer || !dataSource) return;

        logger.info(`Rendering ${parcels.length} parcels...`);

        // Performance: Suspend events
        dataSource.entities.suspendEvents();

        // Chunk processing
        const CHUNK_SIZE = 50; // Balance between UI freeze and render speed

        for (let i = 0; i < parcels.length; i += CHUNK_SIZE) {
            const chunk = parcels.slice(i, i + CHUNK_SIZE);

            chunk.forEach(parcel => {
                // Skip if already exists (unless update logic is added)
                // For now, simpler to rely on CLEAR_PARCELS before UPDATE if full sync is needed
                // Or just upsert based on ID
                if (dataSource.entities.getById(parcel.id)) return;

                // Handle GeoJSON format from WatermelonDB (serialized string or object)
                let coordinates;
                try {
                    const geo = typeof parcel.geometry === 'string'
                        ? JSON.parse(parcel.geometry)
                        : parcel.geometry;

                    if (geo?.type === 'Polygon' && geo.coordinates) {
                        coordinates = geo.coordinates[0];
                    }
                } catch (e) {
                    logger.warn(`Invalid geometry for parcel ${parcel.id}`);
                }

                if (coordinates) {
                    // Flatten coordinates [lon, lat, lon, lat...]
                    const hierarchy = Cesium.Cartesian3.fromDegreesArray(coordinates.flat());

                    dataSource.entities.add({
                        id: parcel.id,
                        name: parcel.name,
                        polygon: {
                            hierarchy: hierarchy,
                            material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.4),
                            outline: true,
                            outlineColor: Cesium.Color.WHITE,
                            outlineWidth: 2,
                            height: 0,
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                        },
                        description: parcel.description // Optional
                    });
                }
            });

            // Yield to main thread to keep UI responsive
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        dataSource.entities.resumeEvents();
        viewer.scene.requestRender();
        logger.info('Finished rendering parcels');
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                touchAction: 'none',
                backgroundColor: '#000'
            }}
        />
    );
};

export default MobileViewer;
