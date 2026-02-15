// =============================================================================
// Asset Manager Grid - Professional Asset Management Interface
// =============================================================================
// Full-featured asset grid with filtering, sorting, selection, bulk actions,
// hierarchical tree view, and FIWARE relationship management.
// Designed for integration with UnifiedViewer's slot system.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Search,
  RefreshCw,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckSquare,
  Square,
  Minus,
  Eye,
  Copy,
  X,
  Loader2,
  AlertCircle,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Plus,
  FolderTree,
  Link2,
} from 'lucide-react';
import { useAssets } from '@/hooks/useAssets';
import { useViewer } from '@/context/ViewerContext';
import {
  UnifiedAsset,
  AssetCategory,
  SortField,
  ASSET_TYPE_REGISTRY,
  CATEGORY_REGISTRY,
} from '@/types/assets';
import { AssetFiltersPanel } from './AssetFiltersPanel';
import { AssetRow } from './AssetRow';
import { AssetCategoryNav } from './AssetCategoryNav';
import { AssetTreeView } from './AssetTreeView';
import { AssetRelationshipModal } from './AssetRelationshipModal';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { useEntityDependencies } from '@/hooks/useEntityDependencies';
import { useToastContext } from '@/context/ToastContext';

// =============================================================================
// Types
// =============================================================================

export interface AssetManagerGridProps {
  /** Callback when add button is clicked */
  onAddEntity?: () => void;
  /** Initial category filter */
  initialCategory?: AssetCategory | null;
  /** Show category navigation */
  showCategoryNav?: boolean;
  /** Compact mode for smaller panels */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

type ViewMode = 'list' | 'grid' | 'tree';

// =============================================================================
// Component
// =============================================================================

export const AssetManagerGrid: React.FC<AssetManagerGridProps> = ({
  onAddEntity,
  initialCategory = null,
  showCategoryNav = true,
  compact = false,
  className = '',
}) => {
  // Hooks
  const {
    assets,
    filteredAssets,
    selectedAssets,
    isLoading,
    isRefreshing,
    error,
    filters,
    setFilters,
    resetFilters,
    sort,
    setSort,
    countsByCategory,
    countsByType,
    totalCount,
    filteredCount,
    toggleAsset,
    selectAll,
    deselectAll,
    isSelected,
    refresh,
    deleteAssets,
    exportAssets,
  } = useAssets({
    autoFetch: true,
    initialFilters: initialCategory ? { categories: [initialCategory] } : undefined,
  });

  const { selectEntity } = useViewer();
  const { success: toastSuccess, error: toastError } = useToastContext();
  const { checkDependenciesBatch, shouldBlockDeletion, isChecking: isCheckingDependencies } = useEntityDependencies();

  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AssetCategory | null>(initialCategory);
  const [contextMenu, setContextMenu] = useState<{
    asset: UnifiedAsset;
    x: number;
    y: number;
  } | null>(null);
  const [relationshipModal, setRelationshipModal] = useState<UnifiedAsset | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    entities: UnifiedAsset[];
    dependencies: any[];
    isBlocked: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Get potential parents (parcels and farms)
  const potentialParents = useMemo(() => {
    return assets.filter(a =>
      a.category === 'parcels' ||
      a.type === 'AgriFarm' ||
      a.type === 'AgriGreenhouse'
    );
  }, [assets]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleCategoryChange = useCallback((category: AssetCategory | null) => {
    setActiveCategory(category);
    setFilters({ categories: category ? [category] : [] });
  }, [setFilters]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value });
  }, [setFilters]);

  const handleSortChange = useCallback((field: SortField) => {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [sort, setSort]);

  const handleRowClick = useCallback((asset: UnifiedAsset) => {
    selectEntity(asset.id, asset.type);
  }, [selectEntity]);

  const handleContextMenu = useCallback((e: React.MouseEvent, asset: UnifiedAsset) => {
    e.preventDefault();
    setContextMenu({
      asset,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedAssets);
    if (ids.length === 0) return;

    const entitiesToDelete = assets.filter(a => ids.includes(a.id));
    if (entitiesToDelete.length === 0) return;

    // Check dependencies
    const dependencies = await checkDependenciesBatch(entitiesToDelete);
    const isBlocked = shouldBlockDeletion(dependencies);

    setDeleteModal({
      entities: entitiesToDelete,
      dependencies,
      isBlocked,
    });
  }, [selectedAssets, assets, checkDependenciesBatch, shouldBlockDeletion]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModal) return;

    const ids = deleteModal.entities.map(e => e.id);

    try {
      await deleteAssets(ids);
      toastSuccess(`${deleteModal.entities.length} entidad(es) eliminada(s) correctamente`);
      setDeleteModal(null);
      deselectAll();
    } catch (err: any) {
      toastError(err.message || 'Error al eliminar entidades');
      // Don't close modal on error so user can retry
    }
  }, [deleteModal, deleteAssets, toastSuccess, toastError, deselectAll]);

  const handleSingleDelete = useCallback(async (entity: UnifiedAsset) => {
    // Check dependencies
    const dependencies = await checkDependenciesBatch([entity]);
    const isBlocked = shouldBlockDeletion(dependencies);

    setDeleteModal({
      entities: [entity],
      dependencies,
      isBlocked,
    });
  }, [checkDependenciesBatch, shouldBlockDeletion]);

  const handleBulkExport = useCallback((format: 'json' | 'csv') => {
    const ids = Array.from(selectedAssets);
    exportAssets(ids, format);
  }, [selectedAssets, exportAssets]);

  const handleAssignParent = useCallback((asset: UnifiedAsset) => {
    setRelationshipModal(asset);
    setContextMenu(null);
  }, []);

  // Checkbox header state
  const allSelected = filteredAssets.length > 0 &&
    filteredAssets.every(a => selectedAssets.has(a.id));
  const someSelected = filteredAssets.some(a => selectedAssets.has(a.id)) && !allSelected;

  const handleSelectAllToggle = useCallback(() => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [allSelected, selectAll, deselectAll]);

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const renderSortIcon = (field: SortField) => {
    if (sort.field !== field) return null;
    return sort.direction === 'asc'
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
  };

  const renderCheckbox = () => {
    if (allSelected) {
      return <CheckSquare className="w-4 h-4 text-blue-600" />;
    }
    if (someSelected) {
      return <Minus className="w-4 h-4 text-blue-600" />;
    }
    return <Square className="w-4 h-4 text-slate-400" />;
  };

  // ==========================================================================
  // Main Render
  // ==========================================================================

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/80 to-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          {/* Title & Count */}
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-800">Assets</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
              {filteredCount === totalCount
                ? totalCount
                : `${filteredCount} / ${totalCount}`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => refresh()}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters || Object.values(filters).some(v =>
                Array.isArray(v) ? v.length > 0 : v !== '' && v !== null
              )
                ? 'bg-blue-100 text-blue-600'
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                }`}
              title="Filtros"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-slate-200 mx-1" />

            {/* View Mode Toggles */}
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list'
                ? 'bg-slate-200 text-slate-700'
                : 'hover:bg-slate-100 text-slate-500'
                }`}
              title="Vista lista"
            >
              <List className="w-4 h-4" />
            </button>

            <button
              onClick={() => setViewMode('tree')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'tree'
                ? 'bg-emerald-100 text-emerald-700'
                : 'hover:bg-slate-100 text-slate-500'
                }`}
              title="Vista jerárquica"
            >
              <FolderTree className="w-4 h-4" />
            </button>

            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid'
                ? 'bg-slate-200 text-slate-700'
                : 'hover:bg-slate-100 text-slate-500'
                }`}
              title="Vista cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {onAddEntity && (
              <>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button
                  onClick={onAddEntity}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Añadir</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, tipo o ubicación..."
            value={filters.search}
            onChange={handleSearch}
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Category Navigation (hidden in tree view) */}
      {showCategoryNav && viewMode !== 'tree' && (
        <AssetCategoryNav
          activeCategory={activeCategory}
          countsByCategory={countsByCategory}
          onCategoryChange={handleCategoryChange}
          compact={compact}
        />
      )}

      {/* Filters Panel */}
      {showFilters && (
        <AssetFiltersPanel
          filters={filters}
          countsByType={countsByType}
          onFiltersChange={setFilters}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Bulk Actions Bar */}
      {selectedAssets.size > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <CheckSquare className="w-4 h-4" />
            <span className="font-medium">{selectedAssets.size} seleccionado(s)</span>
            <button
              onClick={deselectAll}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              Deseleccionar
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkExport('csv')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-white rounded border border-slate-200 hover:bg-slate-50"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
            <button
              onClick={() => handleBulkExport('json')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-white rounded border border-slate-200 hover:bg-slate-50"
            >
              <Download className="w-3 h-3" />
              JSON
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-white rounded border border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500">Cargando assets...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-sm text-slate-600">{error}</p>
              <button
                onClick={() => refresh()}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredAssets.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm text-slate-600">
                {filters.search || filters.categories.length > 0
                  ? 'No se encontraron assets con estos filtros'
                  : 'No hay assets registrados'}
              </p>
              {(filters.search || filters.categories.length > 0) && (
                <button
                  onClick={resetFilters}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
              {onAddEntity && !filters.search && filters.categories.length === 0 && (
                <button
                  onClick={onAddEntity}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                >
                  <Plus className="w-4 h-4" />
                  Crear primer asset
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tree View */}
        {!isLoading && !error && filteredAssets.length > 0 && viewMode === 'tree' && (
          <AssetTreeView
            assets={filteredAssets}
            selectedAssets={selectedAssets}
            onToggleSelect={toggleAsset}
            onAssetClick={handleRowClick}
            onContextMenu={handleContextMenu}
            onAssignParent={handleAssignParent}
          />
        )}

        {/* List View */}
        {!isLoading && !error && filteredAssets.length > 0 && viewMode === 'list' && (
          <div className="h-full overflow-x-auto overflow-y-auto">
            {/* Table Container with min-width to enable horizontal scroll */}
            <div className="min-w-[600px]">
              {/* Table Header */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
                <button
                  onClick={handleSelectAllToggle}
                  className="flex-shrink-0 p-1 rounded hover:bg-slate-200"
                >
                  {renderCheckbox()}
                </button>

                <button
                  onClick={() => handleSortChange('name')}
                  className="flex-1 min-w-[180px] flex items-center gap-1 hover:text-slate-700 text-left"
                >
                  Nombre {renderSortIcon('name')}
                </button>

                <button
                  onClick={() => handleSortChange('type')}
                  className="w-28 flex-shrink-0 flex items-center gap-1 hover:text-slate-700"
                >
                  Tipo {renderSortIcon('type')}
                </button>

                <button
                  onClick={() => handleSortChange('status')}
                  className="w-24 flex-shrink-0 flex items-center gap-1 hover:text-slate-700"
                >
                  Estado {renderSortIcon('status')}
                </button>

                {!compact && (
                  <button
                    onClick={() => handleSortChange('municipality')}
                    className="w-32 flex-shrink-0 flex items-center gap-1 hover:text-slate-700 hidden md:flex"
                  >
                    Ubicación {renderSortIcon('municipality')}
                  </button>
                )}

                <div className="w-8 flex-shrink-0" />
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {filteredAssets.map(asset => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    isSelected={isSelected(asset.id)}
                    onSelect={() => toggleAsset(asset.id)}
                    onClick={() => handleRowClick(asset)}
                    onContextMenu={(e) => handleContextMenu(e, asset)}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Grid View */}
        {!isLoading && !error && filteredAssets.length > 0 && viewMode === 'grid' && (
          <div className="h-full overflow-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredAssets.map(asset => (
                <AssetGridCard
                  key={asset.id}
                  asset={asset}
                  isSelected={isSelected(asset.id)}
                  onSelect={() => toggleAsset(asset.id)}
                  onClick={() => handleRowClick(asset)}
                  onContextMenu={(e) => handleContextMenu(e, asset)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <AssetContextMenu
          asset={contextMenu.asset}
          x={contextMenu.x}
          y={contextMenu.y}
          canAssignParent={contextMenu.asset.category !== 'parcels'}
          onClose={() => setContextMenu(null)}
          onView={() => {
            handleRowClick(contextMenu.asset);
            setContextMenu(null);
          }}
          onAssignParent={() => handleAssignParent(contextMenu.asset)}
          onDelete={() => {
            handleSingleDelete(contextMenu.asset);
            setContextMenu(null);
          }}
        />
      )}

      {/* Relationship Modal */}
      {relationshipModal && (
        <AssetRelationshipModal
          asset={relationshipModal}
          potentialParents={potentialParents}
          onClose={() => setRelationshipModal(null)}
          onSuccess={() => refresh()}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <DeleteConfirmationModal
          entities={deleteModal.entities}
          dependencies={deleteModal.dependencies}
          isBlockedByDependencies={deleteModal.isBlocked}
          isCheckingDependencies={isCheckingDependencies}
          isOpen={!!deleteModal}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
};

// =============================================================================
// Grid Card Component
// =============================================================================

interface AssetGridCardProps {
  asset: UnifiedAsset;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const AssetGridCard: React.FC<AssetGridCardProps> = ({
  asset,
  isSelected,
  onSelect,
  onClick,
  onContextMenu,
}) => {
  const typeInfo = ASSET_TYPE_REGISTRY[asset.type];
  const categoryInfo = CATEGORY_REGISTRY[asset.category];

  return (
    <div
      className={`relative p-3 rounded-xl border transition-all cursor-pointer ${isSelected
        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
        }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100"
      >
        {isSelected
          ? <CheckSquare className="w-4 h-4 text-blue-600" />
          : <Square className="w-4 h-4 text-slate-300" />
        }
      </button>

      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2`}
        style={{ backgroundColor: `var(--color-${categoryInfo?.color || 'slate'}-100, #f1f5f9)` }}
      >
        {asset.hasLocation && <MapPin className={`w-5 h-5 text-${categoryInfo?.color || 'slate'}-600`} />}
      </div>

      {/* Name */}
      <h3 className="font-medium text-sm text-slate-800 truncate">
        {asset.name}
      </h3>

      {/* Type */}
      <p className="text-xs text-slate-500 truncate mt-0.5">
        {typeInfo?.label || asset.type}
      </p>

      {/* Status */}
      <div className="flex items-center gap-1 mt-2">
        <span className={`w-1.5 h-1.5 rounded-full ${asset.status === 'active' ? 'bg-green-500' :
          asset.status === 'inactive' ? 'bg-slate-400' :
            asset.status === 'error' ? 'bg-red-500' :
              asset.status === 'maintenance' ? 'bg-amber-500' :
                'bg-slate-300'
          }`} />
        <span className="text-xs text-slate-500 capitalize">
          {asset.statusLabel || asset.status}
        </span>
      </div>
    </div>
  );
};

// =============================================================================
// Context Menu Component
// =============================================================================

interface AssetContextMenuProps {
  asset: UnifiedAsset;
  x: number;
  y: number;
  canAssignParent: boolean;
  onClose: () => void;
  onView: () => void;
  onAssignParent: () => void;
  onDelete: () => void;
}

const AssetContextMenu: React.FC<AssetContextMenuProps> = ({
  asset,
  x,
  y,
  canAssignParent,
  onClose,
  onView,
  onAssignParent,
  onDelete,
}) => {
  return ReactDOM.createPortal(
    <div
      className="fixed z-[9999] min-w-[180px] bg-white rounded-lg shadow-xl border border-slate-200 py-1 text-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onView}
        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
      >
        <Eye className="w-4 h-4" />
        Ver en mapa
      </button>

      {canAssignParent && (
        <button
          onClick={onAssignParent}
          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
        >
          <Link2 className="w-4 h-4" />
          Asignar a Parcela...
        </button>
      )}

      <button
        onClick={() => {
          navigator.clipboard.writeText(asset.id);
          onClose();
        }}
        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
      >
        <Copy className="w-4 h-4" />
        Copiar ID
      </button>

      <div className="border-t border-slate-100 my-1" />

      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-red-50 text-red-600"
      >
        <Trash2 className="w-4 h-4" />
        Eliminar
      </button>
    </div>,
    document.body
  );
};

export default AssetManagerGrid;
