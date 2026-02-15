// =============================================================================
// Asset Category Navigation - Category Pills for Quick Filtering
// =============================================================================

import React, { memo } from 'react';
import {
  Map,
  Gauge,
  Truck,
  Building,
  Trees,
  Beef,
  Droplets,
  CloudSun,
  LayoutGrid,
} from 'lucide-react';
import { AssetCategory, CATEGORY_REGISTRY } from '@/types/assets';

// =============================================================================
// Icon Map
// =============================================================================

const CATEGORY_ICONS: Record<AssetCategory | 'all', React.ComponentType<{ className?: string }>> = {
  all: LayoutGrid,
  parcels: Map,
  sensors: Gauge,
  fleet: Truck,
  infrastructure: Building,
  vegetation: Trees,
  livestock: Beef,
  water: Droplets,
  weather: CloudSun,
};

// =============================================================================
// Props
// =============================================================================

export interface AssetCategoryNavProps {
  activeCategory: AssetCategory | null;
  countsByCategory: Record<AssetCategory, number>;
  onCategoryChange: (category: AssetCategory | null) => void;
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const AssetCategoryNav: React.FC<AssetCategoryNavProps> = memo(({
  activeCategory,
  countsByCategory,
  onCategoryChange,
  compact = false,
}) => {
  const totalCount = Object.values(countsByCategory).reduce((a, b) => a + b, 0);
  
  const categories: (AssetCategory | 'all')[] = [
    'all',
    'parcels',
    'sensors',
    'fleet',
    'vegetation',
    'infrastructure',
    'water',
    'weather',
    'livestock',
  ];
  
  // Filter out categories with 0 items (except 'all')
  const visibleCategories = categories.filter(cat => 
    cat === 'all' || (countsByCategory[cat as AssetCategory] || 0) > 0
  );
  
  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200/50 bg-white/50">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {visibleCategories.map(cat => {
          const isAll = cat === 'all';
          const isActive = isAll ? activeCategory === null : activeCategory === cat;
          const count = isAll ? totalCount : (countsByCategory[cat as AssetCategory] || 0);
          const info = isAll ? null : CATEGORY_REGISTRY[cat as AssetCategory];
          const Icon = CATEGORY_ICONS[cat];
          
          // Color classes based on category
          const colorClasses: Record<string, { active: string; inactive: string }> = {
            all: { 
              active: 'bg-slate-800 text-white',
              inactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            },
            parcels: {
              active: 'bg-green-600 text-white',
              inactive: 'bg-green-50 text-green-700 hover:bg-green-100'
            },
            sensors: {
              active: 'bg-teal-600 text-white',
              inactive: 'bg-teal-50 text-teal-700 hover:bg-teal-100'
            },
            fleet: {
              active: 'bg-indigo-600 text-white',
              inactive: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            },
            infrastructure: {
              active: 'bg-slate-600 text-white',
              inactive: 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            },
            vegetation: {
              active: 'bg-emerald-600 text-white',
              inactive: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            },
            livestock: {
              active: 'bg-amber-600 text-white',
              inactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            },
            water: {
              active: 'bg-blue-600 text-white',
              inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            },
            weather: {
              active: 'bg-sky-600 text-white',
              inactive: 'bg-sky-50 text-sky-700 hover:bg-sky-100'
            },
          };
          
          const colors = colorClasses[cat] || colorClasses.all;
          
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(isAll ? null : cat as AssetCategory)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {!compact && (
                <span>
                  {isAll ? 'Todos' : info?.label || cat}
                </span>
              )}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isActive 
                  ? 'bg-white/20' 
                  : 'bg-black/5'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

AssetCategoryNav.displayName = 'AssetCategoryNav';

export default AssetCategoryNav;

