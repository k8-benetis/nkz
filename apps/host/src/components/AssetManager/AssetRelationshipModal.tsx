// =============================================================================
// Asset Relationship Modal - Assign Parent Entity (FIWARE Relationships)
// =============================================================================
// Modal for establishing NGSI-LD relationships between entities.
// Updates refAgriParcel, refAgriFarm, etc. via PATCH to Orion-LD.

import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  MapPin,
  Link2,
  Unlink,
  Loader2,
  AlertCircle,
  CheckCircle,
  Building2,
} from 'lucide-react';
import api from '@/services/api';
import { UnifiedAsset, ASSET_TYPE_REGISTRY, CATEGORY_REGISTRY } from '@/types/assets';

// =============================================================================
// Types
// =============================================================================

export interface AssetRelationshipModalProps {
  /** The asset to assign a parent to */
  asset: UnifiedAsset;
  /** List of potential parent assets (parcels, farms) */
  potentialParents: UnifiedAsset[];
  /** Close modal callback */
  onClose: () => void;
  /** Success callback - called after relationship is updated */
  onSuccess: () => void;
}

type RelationshipType = 'refAgriParcel' | 'refAgriFarm' | 'refAgriGreenhouse';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine which relationship attribute to use based on parent type
 */
function getRelationshipAttribute(parentType: string): RelationshipType {
  switch (parentType) {
    case 'AgriFarm':
      return 'refAgriFarm';
    case 'AgriGreenhouse':
      return 'refAgriGreenhouse';
    default:
      return 'refAgriParcel';
  }
}

/**
 * Get human-readable relationship description
 */
function getRelationshipLabel(parentType: string): string {
  switch (parentType) {
    case 'AgriFarm':
      return 'Pertenece a la finca';
    case 'AgriGreenhouse':
      return 'Ubicado en invernadero';
    default:
      return 'Ubicado en parcela';
  }
}

// =============================================================================
// Component
// =============================================================================

export const AssetRelationshipModal: React.FC<AssetRelationshipModalProps> = ({
  asset,
  potentialParents,
  onClose,
  onSuccess,
}) => {
  // State
  const [search, setSearch] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(asset.parentId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Filter parents by search
  const filteredParents = useMemo(() => {
    if (!search) return potentialParents;
    const searchLower = search.toLowerCase();
    return potentialParents.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      p.municipality?.toLowerCase().includes(searchLower)
    );
  }, [potentialParents, search]);
  
  // Group parents by category
  const groupedParents = useMemo(() => {
    const groups: Record<string, UnifiedAsset[]> = {};
    filteredParents.forEach(parent => {
      const category = parent.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(parent);
    });
    return groups;
  }, [filteredParents]);
  
  // Handle save
  const handleSave = useCallback(async () => {
    if (selectedParentId === asset.parentId) {
      // No change
      onClose();
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Find parent to determine relationship type
      const parent = potentialParents.find(p => p.id === selectedParentId);
      const relationshipAttr = parent 
        ? getRelationshipAttribute(parent.type)
        : 'refAgriParcel';
      
      // Build update payload
      const updates: Record<string, any> = {};
      
      if (selectedParentId) {
        // Set new relationship
        updates[relationshipAttr] = {
          type: 'Relationship',
          object: selectedParentId,
        };
      } else {
        // Remove relationship (set to null)
        updates[relationshipAttr] = null;
      }
      
      // Also clear other relationship types if changing parent type
      if (relationshipAttr !== 'refAgriParcel') {
        updates['refAgriParcel'] = null;
      }
      if (relationshipAttr !== 'refAgriFarm') {
        updates['refAgriFarm'] = null;
      }
      
      // PATCH to Orion-LD via entity-manager
      await api.updateSDMEntity(asset.type, asset.id, updates);
      
      setSuccess(true);
      
      // Close after short delay to show success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
      
    } catch (err: any) {
      console.error('[AssetRelationshipModal] Error updating relationship:', err);
      setError(err.message || 'Error al actualizar la relación');
    } finally {
      setIsLoading(false);
    }
  }, [asset, selectedParentId, potentialParents, onClose, onSuccess]);
  
  // Handle remove relationship
  const handleRemove = useCallback(() => {
    setSelectedParentId(null);
  }, []);
  
  // Current parent info
  const currentParent = useMemo(() => {
    if (!asset.parentId) return null;
    return potentialParents.find(p => p.id === asset.parentId);
  }, [asset.parentId, potentialParents]);
  
  const selectedParent = useMemo(() => {
    if (!selectedParentId) return null;
    return potentialParents.find(p => p.id === selectedParentId);
  }, [selectedParentId, potentialParents]);
  
  const hasChanges = selectedParentId !== asset.parentId;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Asignar Ubicación</h2>
              <p className="text-sm text-slate-500">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Current Assignment */}
        {currentParent && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs text-slate-500 mb-1">Actualmente asignado a:</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-600" />
                <span className="font-medium text-sm text-slate-700">{currentParent.name}</span>
                <span className="text-xs text-slate-400">
                  ({ASSET_TYPE_REGISTRY[currentParent.type]?.label || currentParent.type})
                </span>
              </div>
              <button
                onClick={handleRemove}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
              >
                <Unlink className="w-3 h-3" />
                Quitar
              </button>
            </div>
          </div>
        )}
        
        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar parcela, finca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
        
        {/* Parent List */}
        <div className="max-h-72 overflow-y-auto">
          {filteredParents.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              No se encontraron ubicaciones disponibles
            </div>
          ) : (
            Object.entries(groupedParents).map(([category, parents]) => (
              <div key={category}>
                {/* Category Header */}
                <div className="px-6 py-2 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wider sticky top-0">
                  {CATEGORY_REGISTRY[category as keyof typeof CATEGORY_REGISTRY]?.label || category}
                </div>
                
                {/* Parent Items */}
                {parents.map(parent => {
                  const isSelected = selectedParentId === parent.id;
                  const typeInfo = ASSET_TYPE_REGISTRY[parent.type];
                  
                  return (
                    <button
                      key={parent.id}
                      onClick={() => setSelectedParentId(parent.id)}
                      className={`w-full px-6 py-3 flex items-center gap-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-l-2 border-blue-500'
                          : 'hover:bg-slate-50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        parent.category === 'parcels' ? 'bg-green-100' : 'bg-slate-100'
                      }`}>
                        {parent.category === 'parcels' 
                          ? <MapPin className="w-4 h-4 text-green-600" />
                          : <Building2 className="w-4 h-4 text-slate-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                          {parent.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {typeInfo?.label || parent.type}
                          {parent.municipality && ` • ${parent.municipality}`}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          {/* Status */}
          <div className="text-sm">
            {error && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Relación actualizada
              </div>
            )}
            {!error && !success && selectedParent && (
              <span className="text-slate-500">
                {getRelationshipLabel(selectedParent.type)}: <span className="font-medium text-slate-700">{selectedParent.name}</span>
              </span>
            )}
            {!error && !success && !selectedParent && asset.parentId && (
              <span className="text-amber-600">
                Se eliminará la asignación actual
              </span>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || !hasChanges || success}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                hasChanges && !success
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {success ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetRelationshipModal;

