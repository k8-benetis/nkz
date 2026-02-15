/**
 * Generic Cesium Layer Hooks
 * 
 * Provides generic hooks for creating Cesium ImageryProviders from tile services.
 * Modules can use these hooks to add custom imagery layers to the map.
 * 
 * NOTE: Modules should register their layers through the slot system ('map-layer' slot)
 * rather than using these hooks directly in the host. These hooks are provided as
 * utilities that modules can use internally.
 */

import { useMemo } from 'react';

export interface CesiumLayerResult {
  /** Cesium ImageryProvider instance (null if not ready) */
  imageryProvider: any | null;
  /** Whether the provider is ready to be added to the map */
  isReady: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Generic hook factory for creating Cesium imagery providers from tile services.
 * 
 * This is an extensible pattern that other modules can use to add their own
 * imagery layers to the map.
 * 
 * @example
 * ```tsx
 * const useCustomModuleLayer = createCesiumLayerHook({
 *   baseUrl: '/api/custom-module/tiles',
 *   buildUrl: (z, x, y, params) => 
 *     `${baseUrl}/${z}/${x}/${y}.png?${new URLSearchParams(params).toString()}`,
 * });
 * ```
 */
/**
 * Generic hook factory for creating Cesium imagery providers from tile services.
 * 
 * This is an extensible pattern that modules can use to add their own
 * imagery layers to the map. Modules should use this in their own components
 * and register the layer through the slot system.
 * 
 * @example
 * ```tsx
 * // In a module component
 * const useMyModuleLayer = createCesiumLayerHook({
 *   baseUrl: '/api/my-module/tiles',
 *   buildUrl: (z, x, y, params) => 
 *     `${baseUrl}/${z}/${x}/${y}.png?${new URLSearchParams(params).toString()}`,
 * });
 * 
 * const MyLayerComponent = () => {
 *   const { imageryProvider, isReady } = useMyModuleLayer({
 *     sceneId: 'scene-123',
 *     enabled: true,
 *   });
 *   
 *   // Register layer with Cesium viewer via slot system
 *   // ...
 * };
 * ```
 */
export function createCesiumLayerHook<T extends Record<string, any>>(config: {
  baseUrl: string;
  buildUrl: (z: number, x: number, y: number, params: T) => string;
  defaultParams?: Partial<T>;
}) {
  return function useCustomCesiumLayer(
    params: T & { enabled?: boolean; opacity?: number }
  ): CesiumLayerResult {
    const { enabled = true, opacity = 0.8, ...layerParams } = params;

    return useMemo<CesiumLayerResult>(() => {
      // @ts-ignore
      const Cesium = window.Cesium;
      if (!Cesium) {
        return {
          imageryProvider: null,
          isReady: false,
          error: 'Cesium not available',
        };
      }

      if (!enabled) {
        return {
          imageryProvider: null,
          isReady: false,
          error: null,
        };
      }

      try {
        // Build URL template function
        // Cesium will call this with z, x, y for each tile
        const urlTemplate = (z: number, x: number, y: number) => {
          const mergedParams = { ...config.defaultParams, ...layerParams };
          return config.buildUrl(z, x, y, mergedParams as T);
        };

        const imageryProvider = new Cesium.UrlTemplateImageryProvider({
          url: urlTemplate,
          minimumLevel: 0,
          maximumLevel: 18,
          hasAlphaChannel: true,
          credit: undefined,
        });

        return {
          imageryProvider,
          isReady: true,
          error: null,
        };
      } catch (error) {
        console.error('[createCesiumLayerHook] Error creating imagery provider:', error);
        return {
          imageryProvider: null,
          isReady: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }, [enabled, opacity, JSON.stringify(layerParams)]);
  };
}

// Export types for modules to use
export type { CesiumLayerResult };

