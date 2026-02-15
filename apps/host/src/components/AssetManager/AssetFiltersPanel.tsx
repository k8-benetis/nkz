// =============================================================================
// Asset Filters Panel - Advanced Filtering UI
// =============================================================================

import React, { memo, useMemo } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import {
  AssetFilters,
  AssetStatus,
  ASSET_TYPE_REGISTRY,
} from '@/types/assets';

// =============================================================================
// Props
// =============================================================================

export interface AssetFiltersPanelProps {
  filters: AssetFilters;
  countsByType: Record<string, number>;
  onFiltersChange: (filters: Partial<AssetFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const AssetFiltersPanel: React.FC<AssetFiltersPanelProps> = memo(({
  filters,
  countsByType,
  onFiltersChange,
  onReset,
  onClose,
}) => {
  // Group types by category
  const typesByCategory = useMemo(() => {
    const groups: Record<string, { type: string; label: string; count: number }[]> = {};
    
    Object.entries(ASSET_TYPE_REGISTRY).forEach(([type, info]) => {
      const category = info.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({
        type,
        label: info.label,
        count: countsByType[type] || 0,
      });
    });
    
    // Sort each group by count
    Object.values(groups).forEach(group => {
      group.sort((a, b) => b.count - a.count);
    });
    
    return groups;
  }, [countsByType]);
  
  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.types.length > 0) count += filters.types.length;
    if (filters.statuses.length > 0) count += filters.statuses.length;
    if (filters.hasLocation !== null) count++;
    if (filters.municipality) count++;
    return count;
  }, [filters]);
  
  // Toggle type filter
  const toggleType = (type: string) => {
    const current = filters.types;
    const newTypes = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onFiltersChange({ types: newTypes });
  };
  
  // Toggle status filter
  const toggleStatus = (status: AssetStatus) => {
    const current = filters.statuses;
    const newStatuses = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFiltersChange({ statuses: newStatuses });
  };
  
  // Status options
  const statusOptions: { value: AssetStatus; label: string; color: string }[] = [
    { value: 'active', label: 'Activo', color: 'bg-green-500' },
    { value: 'inactive', label: 'Inactivo', color: 'bg-slate-400' },
    { value: 'maintenance', label: 'Mantenimiento', color: 'bg-amber-500' },
    { value: 'error', label: 'Error', color: 'bg-red-500' },
    { value: 'offline', label: 'Offline', color: 'bg-slate-300' },
  ];
  
  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Filtros</span>
          {activeFilterCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {activeFilterCount}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded"
            >
              <RotateCcw className="w-3 h-3" />
              Limpiar
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Filter Content */}
      <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
        {/* Status Filter */}
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Estado
          </h4>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(({ value, label, color }) => {
              const isActive = filters.statuses.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleStatus(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  {label}
                  {isActive && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Location Filter */}
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Ubicación
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => onFiltersChange({ 
                hasLocation: filters.hasLocation === true ? null : true 
              })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                filters.hasLocation === true
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Con ubicación
              {filters.hasLocation === true && <Check className="w-3 h-3" />}
            </button>
            <button
              onClick={() => onFiltersChange({ 
                hasLocation: filters.hasLocation === false ? null : false 
              })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                filters.hasLocation === false
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sin ubicación
              {filters.hasLocation === false && <Check className="w-3 h-3" />}
            </button>
          </div>
        </div>
        
        {/* Type Filter by Category */}
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Tipos de Asset
          </h4>
          
          <div className="space-y-3">
            {Object.entries(typesByCategory).map(([category, types]) => {
              // Only show categories with items
              const hasItems = types.some(t => t.count > 0);
              if (!hasItems) return null;
              
              return (
                <div key={category}>
                  <p className="text-xs text-slate-400 mb-1.5 capitalize">{category}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {types
                      .filter(t => t.count > 0)
                      .map(({ type, label, count }) => {
                        const isActive = filters.types.includes(type);
                        return (
                          <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {label}
                            <span className={`text-[10px] ${
                              isActive ? 'text-blue-200' : 'text-slate-400'
                            }`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

AssetFiltersPanel.displayName = 'AssetFiltersPanel';

export default AssetFiltersPanel;

