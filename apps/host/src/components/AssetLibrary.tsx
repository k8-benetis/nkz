// =============================================================================
// Asset Library Component - Panel de Tipos de Activos
// =============================================================================
// Panel lateral que muestra una biblioteca de tipos de activos disponibles

import React, { useState } from 'react';
import {
  TreePine,
  Trees,
  Crop,
  Square,
  Search,
  X
} from 'lucide-react';
import type { AssetType } from '@/types';
import { useI18n } from '@/context/I18nContext';

// Icon mapping from string to React component
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  TreePine,
  Trees,
  Crop,
  Square,
};

// Available asset types configuration
const AVAILABLE_ASSET_TYPES: AssetType[] = [
  {
    id: 'OliveTree',
    name: 'Olivo Individual',
    icon: 'TreePine',
    geometryType: 'Point',
    sdmType: 'AgriParcel',
    model3d: '/models/olive-tree.glb', // Optional
    defaultScale: 1.0,
    category: 'trees',
    defaultAttributes: {
      cropType: 'Olive',
      treeCount: 1
    }
  },
  {
    id: 'VineRow',
    name: 'Hilera de Viña',
    icon: 'Trees',
    geometryType: 'LineString',
    sdmType: 'AgriParcel',
    model3d: '/models/vine-row.glb', // Optional
    defaultScale: 1.0,
    category: 'rows',
    defaultAttributes: {
      cropType: 'Grape',
      rowCount: 1
    }
  },
  {
    id: 'VineRowSegment',
    name: 'Segmento de Hilera',
    icon: 'Crop',
    geometryType: 'LineString',
    sdmType: 'AgriParcel',
    defaultScale: 1.0,
    category: 'rows',
    defaultAttributes: {
      cropType: 'Grape'
    }
  },
  {
    id: 'CerealParcel',
    name: 'Parcela de Cereal',
    icon: 'Square',
    geometryType: 'Polygon',
    sdmType: 'AgriParcel',
    defaultScale: 1.0,
    category: 'parcels',
    defaultAttributes: {
      cropType: 'Cereal'
    }
  }
];

interface AssetLibraryProps {
  onSelectAsset: (assetType: AssetType) => void;
  selectedAssetType?: AssetType | null;
  className?: string;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  onSelectAsset,
  selectedAssetType,
  className = '',
}) => {
  useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = ['trees', 'rows', 'parcels', 'infrastructure'] as const;
  const categoryLabels: Record<string, string> = {
    trees: 'Árboles',
    rows: 'Hileras',
    parcels: 'Parcelas',
    infrastructure: 'Infraestructura'
  };

  // Filter assets
  const filteredAssets = AVAILABLE_ASSET_TYPES.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || asset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getIconComponent = (iconName: string) => {
    const IconComponent = iconMap[iconName] || Square;
    return IconComponent;
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Biblioteca de Activos
        </h3>
        
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar activos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              !selectedCategory
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todos
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {categoryLabels[category] || category}
            </button>
          ))}
        </div>
      </div>

      {/* Asset List */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No se encontraron activos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAssets.map(asset => {
              const IconComponent = getIconComponent(asset.icon);
              const isSelected = selectedAssetType?.id === asset.id;
              
              return (
                <button
                  key={asset.id}
                  onClick={() => onSelectAsset(asset)}
                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 mb-1">
                        {asset.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {asset.geometryType === 'Point' && 'Punto'}
                        {asset.geometryType === 'LineString' && 'Línea'}
                        {asset.geometryType === 'Polygon' && 'Polígono'}
                        {asset.model3d && ' • Modelo 3D'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-600">
          Selecciona un activo para comenzar a digitalizarlo en el mapa
        </p>
      </div>
    </div>
  );
};

