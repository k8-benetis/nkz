# Module Layer Integration Guide

## Overview

This document describes how to integrate custom map layers from modules into the unified viewer's CesiumMap component. The system is designed to be extensible, allowing any module to add its own imagery layers to the 3D map.

## Architecture

The layer integration system consists of three main components:

1. **Hook for Cesium ImageryProvider Creation** (`useVegetationCesiumLayer`)
   - Converts module tile services into Cesium-compatible imagery providers
   - Handles tile URL templates and provider configuration

2. **Layer Data Hook** (`useVegetationLayerData`)
   - Reads layer configuration data from modules
   - Supports multiple data sources (global window object, custom events, context)

3. **CesiumMap Extension**
   - Accepts module layer configurations as props
   - Manages layer lifecycle (add/remove/update)
   - Handles cleanup and error handling

## Integration Steps

### Step 1: Add Layer Type to ViewerContext

First, add your layer type to the `LayerType` union in `ViewerContext.tsx`:

```typescript
// apps/host/src/context/ViewerContext.tsx
export type LayerType =
    | 'parcels'
    | 'robots'
    // ... existing types
    | 'vegetation'  // Your new layer type
    | 'your-module-layer';  // Add your layer type here
```

### Step 2: Add Layer Toggle to CoreLayerToggles

Add your layer to the layer toggle UI in `CoreLayerToggles.tsx`:

```typescript
// apps/host/src/components/viewer/CoreLayerToggles.tsx
import { YourIcon } from 'lucide-react';

const LAYER_DEFINITIONS: LayerDefinition[] = [
    // ... existing layers
    {
        id: 'your-module-layer',
        label: 'Your Layer',
        icon: <YourIcon className="w-4 h-4" />,
        color: 'text-purple-600',
    },
];
```

### Step 3: Create Cesium Layer Hook

Create a hook to convert your module's tile service into a Cesium ImageryProvider:

```typescript
// apps/host/src/hooks/useYourModuleCesiumLayer.ts
import { useMemo } from 'react';

export interface YourModuleLayerConfig {
    // Your module-specific configuration
    sceneId?: string | null;
    dataType?: string;
    enabled?: boolean;
    opacity?: number;
}

export function useYourModuleCesiumLayer(
    config: YourModuleLayerConfig
): { imageryProvider: any | null; isReady: boolean; error: string | null } {
    const { sceneId, dataType = 'default', enabled = true, opacity = 0.8 } = config;

    return useMemo(() => {
        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium) {
            return { imageryProvider: null, isReady: false, error: 'Cesium not available' };
        }

        if (!enabled || !sceneId) {
            return { imageryProvider: null, isReady: false, error: null };
        }

        try {
            // Build your tile URL template
            // Your module should serve tiles at: /api/your-module/tiles/{z}/{x}/{y}.png
            const tileUrlTemplate = `/api/your-module/tiles/{z}/{x}/{y}.png?scene_id=${sceneId}&data_type=${dataType}`;

            const imageryProvider = new Cesium.UrlTemplateImageryProvider({
                url: tileUrlTemplate,
                minimumLevel: 0,
                maximumLevel: 18,
                hasAlphaChannel: true,
                credit: undefined,
            });

            return { imageryProvider, isReady: true, error: null };
        } catch (error) {
            return {
                imageryProvider: null,
                isReady: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }, [sceneId, dataType, enabled, opacity]);
}
```

**Alternative: Use the Generic Hook Factory**

You can also use the generic hook factory provided in `useVegetationCesiumLayer.ts`:

```typescript
import { createCesiumLayerHook } from '@/hooks/useVegetationCesiumLayer';

export const useYourModuleCesiumLayer = createCesiumLayerHook({
    baseUrl: '/api/your-module/tiles',
    buildUrl: (z, x, y, params) => {
        const { sceneId, dataType } = params;
        return `${baseUrl}/${z}/${x}/${y}.png?scene_id=${sceneId}&data_type=${dataType}`;
    },
});
```

### Step 4: Create Layer Data Hook

Create a hook to read layer configuration from your module:

```typescript
// apps/host/src/hooks/useYourModuleLayerData.ts
import { useState, useEffect } from 'react';
import { useViewer } from '@/context/ViewerContext';

export interface YourModuleLayerData {
    sceneId: string | null;
    dataType: string;
    isReady: boolean;
}

export function useYourModuleLayerData(): YourModuleLayerData {
    const { isLayerActive } = useViewer();
    const [data, setData] = useState<YourModuleLayerData>({
        sceneId: null,
        dataType: 'default',
        isReady: false,
    });

    const isActive = isLayerActive('your-module-layer');

    useEffect(() => {
        if (!isActive) {
            setData(prev => ({ ...prev, isReady: false }));
            return;
        }

        const checkForData = () => {
            // Option 1: Read from global window object
            // @ts-ignore
            const moduleData = window.__nekazariModuleData?.yourModule;
            
            if (moduleData) {
                setData({
                    sceneId: moduleData.sceneId || null,
                    dataType: moduleData.dataType || 'default',
                    isReady: !!(moduleData.sceneId),
                });
            }
        };

        checkForData();
        const interval = setInterval(checkForData, 500);

        // Option 2: Listen for custom events
        const handleUpdate = (event: CustomEvent) => {
            const { sceneId, dataType } = event.detail || {};
            setData({
                sceneId: sceneId || null,
                dataType: dataType || 'default',
                isReady: !!(sceneId),
            });
        };

        window.addEventListener('nekazari:your-module:update', handleUpdate as EventListener);

        return () => {
            clearInterval(interval);
            window.removeEventListener('nekazari:your-module:update', handleUpdate as EventListener);
        };
    }, [isActive]);

    return data;
}
```

### Step 5: Expose Data from Your Module

In your module's component (e.g., `YourModuleLayerControl.tsx`), expose the layer data:

```typescript
// In your module component
import { useEffect } from 'react';
import { useYourModuleContext } from '../context/yourModuleContext';

export const YourModuleLayerControl: React.FC = () => {
    const { selectedSceneId, selectedDataType } = useYourModuleContext();

    useEffect(() => {
        // Option 1: Expose via global window object
        if (!window.__nekazariModuleData) {
            window.__nekazariModuleData = {};
        }
        window.__nekazariModuleData.yourModule = {
            sceneId: selectedSceneId,
            dataType: selectedDataType,
        };

        // Option 2: Dispatch custom event
        window.dispatchEvent(new CustomEvent('nekazari:your-module:update', {
            detail: {
                sceneId: selectedSceneId,
                dataType: selectedDataType,
            },
        }));
    }, [selectedSceneId, selectedDataType]);

    // ... rest of your component
};
```

### Step 6: Extend CesiumMap Props

Add your layer configuration to `CesiumMap.tsx`:

```typescript
// apps/host/src/components/CesiumMap.tsx
import { useYourModuleCesiumLayer, YourModuleLayerConfig } from '@/hooks/useYourModuleCesiumLayer';

interface CesiumMapProps {
    // ... existing props
    yourModuleLayerConfig?: YourModuleLayerConfig;
}

export const CesiumMap: React.FC<CesiumMapProps> = ({
    // ... existing props
    yourModuleLayerConfig,
}) => {
    // ... existing code

    // Add your layer hook
    const { imageryProvider, isReady, error } = useYourModuleCesiumLayer(
        yourModuleLayerConfig || { enabled: false }
    );

    // Add useEffect to manage your layer
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // @ts-ignore
        const Cesium = window.Cesium;
        if (!Cesium) return;

        let layerInstance: any = null;

        // Remove existing layer
        for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
            const layer = viewer.imageryLayers.get(i);
            const provider = layer.imageryProvider;
            if (provider && provider.url && typeof provider.url === 'string' && 
                provider.url.includes('/api/your-module/tiles')) {
                viewer.imageryLayers.remove(layer);
            }
        }

        // Add new layer
        if (isReady && imageryProvider) {
            try {
                layerInstance = viewer.imageryLayers.addImageryProvider(imageryProvider, 1);
                layerInstance.alpha = yourModuleLayerConfig?.opacity || 0.8;
            } catch (error) {
                console.error('[CesiumMap] Error adding your module layer:', error);
            }
        }

        return () => {
            if (layerInstance && !viewer.isDestroyed()) {
                try {
                    viewer.imageryLayers.remove(layerInstance);
                } catch (error) {
                    console.warn('[CesiumMap] Error removing your module layer:', error);
                }
            }
        };
    }, [isReady, imageryProvider, yourModuleLayerConfig]);

    // ... rest of component
};
```

### Step 7: Integrate in UnifiedViewer

Add your layer to `UnifiedViewer.tsx`:

```typescript
// apps/host/src/components/UnifiedViewer.tsx
import { useYourModuleLayerData } from '@/hooks/useYourModuleLayerData';

const UnifiedViewerInner: React.FC = () => {
    // ... existing code
    const yourModuleData = useYourModuleLayerData();

    return (
        // ... existing JSX
        <CesiumMap
            // ... existing props
            yourModuleLayerConfig={{
                sceneId: yourModuleData.sceneId,
                dataType: yourModuleData.dataType,
                enabled: isLayerActive('your-module-layer') && yourModuleData.isReady,
                opacity: 0.8,
            }}
        />
    );
};
```

## Best Practices

### 1. Layer Identification

Always identify your layer uniquely when removing it:

```typescript
// Good: Check for unique URL pattern
if (provider.url && provider.url.includes('/api/your-module/tiles')) {
    viewer.imageryLayers.remove(layer);
}

// Bad: Don't remove layers by index (unreliable)
viewer.imageryLayers.remove(viewer.imageryLayers.get(1)); // ❌
```

### 2. Error Handling

Always handle errors gracefully:

```typescript
try {
    layerInstance = viewer.imageryLayers.addImageryProvider(imageryProvider, 1);
} catch (error) {
    console.error('[CesiumMap] Error adding layer:', error);
    // Don't crash the app
}
```

### 3. Cleanup

Always clean up layers in useEffect cleanup:

```typescript
useEffect(() => {
    // ... add layer

    return () => {
        if (layerInstance && !viewer.isDestroyed()) {
            viewer.imageryLayers.remove(layerInstance);
        }
    };
}, [dependencies]);
```

### 4. Data Exposure

Use both global window object and custom events for maximum compatibility:

```typescript
// In your module component
useEffect(() => {
    // Method 1: Global object (polling)
    window.__nekazariModuleData = window.__nekazariModuleData || {};
    window.__nekazariModuleData.yourModule = { sceneId, dataType };

    // Method 2: Custom event (reactive)
    window.dispatchEvent(new CustomEvent('nekazari:your-module:update', {
        detail: { sceneId, dataType },
    }));
}, [sceneId, dataType]);
```

### 5. Layer Z-Index

Use appropriate z-index when adding layers:

- Index 0: Base map (OSM, PNOA)
- Index 1: Module layers (vegetation, your module, etc.)
- Index 2+: Overlays (markers, annotations)

```typescript
// Add at index 1 (above base map, below overlays)
viewer.imageryLayers.addImageryProvider(imageryProvider, 1);
```

## Example: Complete Integration

See the vegetation-prime module integration as a complete example:

- **Hook**: `apps/host/src/hooks/useVegetationCesiumLayer.ts`
- **Data Hook**: `apps/host/src/hooks/useVegetationLayerData.ts`
- **CesiumMap Integration**: `apps/host/src/components/CesiumMap.tsx` (lines ~430-470)
- **UnifiedViewer Integration**: `apps/host/src/components/UnifiedViewer.tsx` (lines ~148-164)
- **Layer Type**: `apps/host/src/context/ViewerContext.tsx` (line 21)
- **Layer Toggle**: `apps/host/src/components/viewer/CoreLayerToggles.tsx` (line 42)

## Troubleshooting

### Layer Not Appearing

1. **Check layer is active**: Verify `isLayerActive('your-layer')` returns `true`
2. **Check data is ready**: Verify `isReady` is `true` in your layer data hook
3. **Check tile service**: Verify your tile endpoint is accessible and returns valid tiles
4. **Check Cesium console**: Look for errors in browser console
5. **Check layer z-index**: Ensure your layer isn't hidden behind other layers

### Layer Not Updating

1. **Check data updates**: Verify your module is updating `window.__nekazariModuleData` or dispatching events
2. **Check polling interval**: Increase polling interval if updates are slow
3. **Check dependencies**: Ensure useEffect dependencies include all relevant state

### Performance Issues

1. **Reduce polling frequency**: Increase interval in `useYourModuleLayerData` (e.g., 1000ms instead of 500ms)
2. **Limit tile levels**: Reduce `maximumLevel` in your imagery provider
3. **Cache tiles**: Implement tile caching in your backend service

## Future Enhancements

### Direct Context Integration

A future enhancement could allow modules to directly expose their context:

```typescript
// In module
window.__nekazariModules = window.__nekazariModules || {};
window.__nekazariModules.yourModule = {
    getContext: () => yourModuleContext,
    subscribe: (callback) => {
        // Subscribe to context changes
    },
};

// In host hook
const module = window.__nekazariModules?.yourModule;
const context = module?.getContext?.();
module?.subscribe?.(updateData);
```

### Layer Registry System

A centralized layer registry could manage all module layers:

```typescript
// apps/host/src/context/LayerRegistry.tsx
interface LayerRegistry {
    registerLayer: (id: string, config: LayerConfig) => void;
    getLayerConfig: (id: string) => LayerConfig | null;
    subscribe: (id: string, callback: (config: LayerConfig) => void) => void;
}
```

This would provide a more standardized way for modules to register and expose layer data.

## Summary

The module layer integration system provides a flexible, extensible way for modules to add custom imagery layers to the unified viewer. By following the steps outlined in this guide, any module can integrate its tile service into the CesiumMap component with minimal changes to the host application.

Key points:
- ✅ Extensible architecture supports multiple modules
- ✅ Clean separation of concerns (hook → data → map)
- ✅ Error handling and cleanup built-in
- ✅ Multiple data exposure methods (window object, events, context)
- ✅ Easy to add new layer types

