// =============================================================================
// useAssets Hook - Unified Asset Management
// =============================================================================
// Provides centralized state management for all assets in the platform.

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/services/api';
import { parcelApi } from '@/services/parcelApi';
import {
  UnifiedAsset,
  AssetFilters,
  SortConfig,
  AssetCategory,
  normalizeToAsset,
  filterAssets,
  sortAssets,
  DEFAULT_FILTERS,
} from '@/types/assets';

// =============================================================================
// Types
// =============================================================================

export interface UseAssetsOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Polling interval in ms (0 = disabled) */
  pollingInterval?: number;
  /** Initial filters */
  initialFilters?: Partial<AssetFilters>;
  /** Initial sort */
  initialSort?: SortConfig;
}

export interface UseAssetsReturn {
  // Data
  assets: UnifiedAsset[];
  filteredAssets: UnifiedAsset[];
  selectedAssets: Set<string>;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  
  // Counts by category/type
  countsByCategory: Record<AssetCategory, number>;
  countsByType: Record<string, number>;
  totalCount: number;
  filteredCount: number;
  
  // Filters
  filters: AssetFilters;
  setFilters: (filters: Partial<AssetFilters>) => void;
  resetFilters: () => void;
  
  // Sorting
  sort: SortConfig;
  setSort: (sort: SortConfig) => void;
  
  // Selection
  selectAsset: (id: string) => void;
  deselectAsset: (id: string) => void;
  toggleAsset: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
  
  // Actions
  refresh: () => Promise<void>;
  deleteAssets: (ids: string[]) => Promise<void>;
  exportAssets: (ids: string[], format: 'json' | 'csv') => void;
  
  // Utilities
  getAssetById: (id: string) => UnifiedAsset | undefined;
  getAssetsByType: (type: string) => UnifiedAsset[];
  getAssetsByCategory: (category: AssetCategory) => UnifiedAsset[];
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAssets(options: UseAssetsOptions = {}): UseAssetsReturn {
  const {
    autoFetch = true,
    pollingInterval = 0,
    initialFilters = {},
    initialSort = { field: 'name', direction: 'asc' },
  } = options;
  
  // State
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<AssetFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [sort, setSort] = useState<SortConfig>(initialSort);
  
  // ==========================================================================
  // Fetch Logic
  // ==========================================================================
  
  const fetchAssets = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      // Fetch all entity types in parallel
      // Note: Using SDM (Orion-LD) for sensors to match /sensors page behavior
      const results = await Promise.allSettled([
        parcelApi.getParcels().catch(() => []),
        api.getRobots().catch(() => []),
        api.getSDMEntityInstances('AgriSensor').catch(() => []), // Changed from getSensors() to use SDM like /sensors page
        api.getMachines().catch(() => []),
        api.getLivestock().catch(() => []),
        api.getWeatherStations().catch(() => []),
        api.getSDMEntityInstances('AgriCrop').catch(() => []),
        api.getSDMEntityInstances('AgriBuilding').catch(() => []),
        api.getSDMEntityInstances('Device').catch(() => []),
        api.getSDMEntityInstances('WaterSource').catch(() => []),
        api.getSDMEntityInstances('Well').catch(() => []),
        api.getSDMEntityInstances('OliveTree').catch(() => []),
        api.getSDMEntityInstances('AgriTree').catch(() => []),
        api.getSDMEntityInstances('FruitTree').catch(() => []),
        api.getSDMEntityInstances('Vine').catch(() => []),
      ]);
      
      const [
        parcelsRes, robotsRes, sensorsRes, machinesRes, livestockRes,
        weatherRes, cropsRes, buildingsRes, devicesRes, waterSourcesRes,
        wellsRes, oliveTreesRes, agriTreesRes, fruitTreesRes, vinesRes,
      ] = results;
      
      // Normalize all entities
      const allAssets: UnifiedAsset[] = [];
      
      const addEntities = (result: PromiseSettledResult<any[]>, type: string) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          result.value.forEach(entity => {
            try {
              allAssets.push(normalizeToAsset({ ...entity, type: entity.type || type }));
            } catch (e) {
              console.warn(`[useAssets] Failed to normalize ${type}:`, entity.id, e);
            }
          });
        }
      };
      
      // Add entities with their types
      addEntities(parcelsRes, 'AgriParcel');
      addEntities(robotsRes, 'AgriculturalRobot');
      addEntities(sensorsRes, 'AgriSensor');
      addEntities(machinesRes, 'AgriculturalTractor');
      addEntities(livestockRes, 'LivestockAnimal');
      addEntities(weatherRes, 'WeatherObserved');
      addEntities(cropsRes, 'AgriCrop');
      addEntities(buildingsRes, 'AgriBuilding');
      addEntities(devicesRes, 'Device');
      addEntities(waterSourcesRes, 'WaterSource');
      addEntities(wellsRes, 'Well');
      addEntities(oliveTreesRes, 'OliveTree');
      addEntities(agriTreesRes, 'AgriTree');
      addEntities(fruitTreesRes, 'FruitTree');
      addEntities(vinesRes, 'Vine');
      
      console.log(`[useAssets] Loaded ${allAssets.length} assets`);
      setAssets(allAssets);
      
    } catch (err: any) {
      console.error('[useAssets] Error fetching assets:', err);
      setError(err.message || 'Error al cargar los assets');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);
  
  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchAssets();
    }
  }, [autoFetch, fetchAssets]);
  
  // Polling
  useEffect(() => {
    if (pollingInterval > 0) {
      const interval = setInterval(() => fetchAssets(true), pollingInterval);
      return () => clearInterval(interval);
    }
  }, [pollingInterval, fetchAssets]);
  
  // ==========================================================================
  // Computed Values
  // ==========================================================================
  
  const filteredAssets = useMemo(() => {
    const filtered = filterAssets(assets, filters);
    return sortAssets(filtered, sort);
  }, [assets, filters, sort]);
  
  const countsByCategory = useMemo(() => {
    const counts: Record<AssetCategory, number> = {
      parcels: 0,
      sensors: 0,
      fleet: 0,
      infrastructure: 0,
      vegetation: 0,
      livestock: 0,
      water: 0,
      weather: 0,
    };
    assets.forEach(asset => {
      counts[asset.category]++;
    });
    return counts;
  }, [assets]);
  
  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(asset => {
      counts[asset.type] = (counts[asset.type] || 0) + 1;
    });
    return counts;
  }, [assets]);
  
  // ==========================================================================
  // Filter Actions
  // ==========================================================================
  
  const setFilters = useCallback((newFilters: Partial<AssetFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);
  
  // ==========================================================================
  // Selection Actions
  // ==========================================================================
  
  const selectAsset = useCallback((id: string) => {
    setSelectedAssets(prev => new Set(prev).add(id));
  }, []);
  
  const deselectAsset = useCallback((id: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  
  const toggleAsset = useCallback((id: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedAssets(new Set(filteredAssets.map(a => a.id)));
  }, [filteredAssets]);
  
  const deselectAll = useCallback(() => {
    setSelectedAssets(new Set());
  }, []);
  
  const isSelected = useCallback((id: string) => {
    return selectedAssets.has(id);
  }, [selectedAssets]);
  
  // ==========================================================================
  // Bulk Actions
  // ==========================================================================
  
  const deleteAssets = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    
    // Note: Confirmation is now handled by the component (DeleteConfirmationModal)
    // This function only performs the actual deletion
    
    setIsRefreshing(true);
    
    try {
      // Delete each asset
      const deletePromises = ids.map(async (id) => {
        const asset = assets.find(a => a.id === id);
        if (!asset) return;
        
        // Call appropriate delete API based on type
        if (asset.type === 'AgriParcel' || asset.category === 'parcels') {
          await parcelApi.deleteParcel(id);
        } else {
          await api.deleteSDMEntity(asset.type, id);
        }
      });
      
      await Promise.allSettled(deletePromises);
      
      // Refresh and clear selection
      await fetchAssets(true);
      setSelectedAssets(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      
    } catch (err: any) {
      console.error('[useAssets] Error deleting assets:', err);
      setError(err.message || 'Error al eliminar assets');
      throw err; // Re-throw so caller can handle it
    } finally {
      setIsRefreshing(false);
    }
  }, [assets, fetchAssets]);
  
  const exportAssets = useCallback((ids: string[], format: 'json' | 'csv') => {
    const assetsToExport = ids.length > 0 
      ? assets.filter(a => ids.includes(a.id))
      : filteredAssets;
    
    if (assetsToExport.length === 0) {
      alert('No hay assets para exportar');
      return;
    }
    
    let content: string;
    let filename: string;
    let mimeType: string;
    
    if (format === 'json') {
      content = JSON.stringify(assetsToExport.map(a => a.rawEntity), null, 2);
      filename = `assets_export_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // CSV format
      const headers = ['id', 'type', 'name', 'category', 'status', 'municipality', 'coordinates'];
      const rows = assetsToExport.map(a => [
        a.id,
        a.type,
        `"${a.name.replace(/"/g, '""')}"`,
        a.category,
        a.status,
        a.municipality || '',
        a.coordinates ? `"${a.coordinates.join(', ')}"` : '',
      ]);
      
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      filename = `assets_export_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }
    
    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [assets, filteredAssets]);
  
  // ==========================================================================
  // Utility Functions
  // ==========================================================================
  
  const getAssetById = useCallback((id: string) => {
    return assets.find(a => a.id === id);
  }, [assets]);
  
  const getAssetsByType = useCallback((type: string) => {
    return assets.filter(a => a.type === type);
  }, [assets]);
  
  const getAssetsByCategory = useCallback((category: AssetCategory) => {
    return assets.filter(a => a.category === category);
  }, [assets]);
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // Data
    assets,
    filteredAssets,
    selectedAssets,
    
    // Loading states
    isLoading,
    isRefreshing,
    error,
    
    // Counts
    countsByCategory,
    countsByType,
    totalCount: assets.length,
    filteredCount: filteredAssets.length,
    
    // Filters
    filters,
    setFilters,
    resetFilters,
    
    // Sorting
    sort,
    setSort,
    
    // Selection
    selectAsset,
    deselectAsset,
    toggleAsset,
    selectAll,
    deselectAll,
    isSelected,
    
    // Actions
    refresh: () => fetchAssets(true),
    deleteAssets,
    exportAssets,
    
    // Utilities
    getAssetById,
    getAssetsByType,
    getAssetsByCategory,
  };
}

export default useAssets;

