// =============================================================================
// Delete Confirmation Modal - Secure Entity Deletion
// =============================================================================
// Professional deletion confirmation modal with dependency checking.
// Prevents accidental deletions and shows dependencies before allowing deletion.

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { UnifiedAsset } from '@/types/assets';
import { EntityDependency } from '@/hooks/useEntityDependencies';

// =============================================================================
// Types
// =============================================================================

export interface DeleteConfirmationModalProps {
  /** Entities to delete */
  entities: UnifiedAsset[];
  /** Dependencies found (if any) */
  dependencies?: EntityDependency[];
  /** Whether dependencies block deletion */
  isBlockedByDependencies?: boolean;
  /** Loading state for dependency check */
  isCheckingDependencies?: boolean;
  /** Callback when deletion is confirmed */
  onConfirm: () => Promise<void>;
  /** Callback when modal is closed */
  onCancel: () => void;
  /** Whether modal is open */
  isOpen: boolean;
}

const REQUIRED_CONFIRM_TEXT = 'ELIMINAR';

// =============================================================================
// Component
// =============================================================================

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  entities,
  dependencies = [],
  isBlockedByDependencies = false,
  isCheckingDependencies = false,
  onConfirm,
  onCancel,
  isOpen,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (confirmText !== REQUIRED_CONFIRM_TEXT || isBlockedByDependencies) return;
    
    setIsDeleting(true);
    try {
      await onConfirm();
      // Modal will be closed by parent after success
    } catch (error) {
      // Error handling is done by parent
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      onCancel();
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  const isConfirmEnabled = 
    confirmText === REQUIRED_CONFIRM_TEXT && 
    !isBlockedByDependencies && 
    !isDeleting &&
    !isCheckingDependencies;

  const entityCount = entities.length;
  const hasDependencies = dependencies.length > 0;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isBlockedByDependencies 
                ? 'bg-red-100' 
                : 'bg-orange-100'
            }`}>
              {isBlockedByDependencies ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {isBlockedByDependencies 
                  ? 'No se puede eliminar'
                  : 'Confirmar eliminación'
                }
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Esta acción no se puede deshacer
              </p>
            </div>
          </div>
          {!isDeleting && (
            <button
              onClick={handleCancel}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Dependency Warning (if blocked) */}
          {isBlockedByDependencies && hasDependencies && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-900 mb-2">
                    Dependencias encontradas
                  </h4>
                  <p className="text-sm text-red-800 mb-3">
                    Esta(s) entidad(es) tienen elementos asociados que deben ser eliminados o movidos primero:
                  </p>
                  <ul className="space-y-2">
                    {dependencies.map((dep, idx) => (
                      <li key={idx} className="text-sm text-red-700">
                        <span className="font-medium">{dep.entityName}</span>
                        {' '}tiene{' '}
                        <span className="font-semibold">{dep.dependentCount} {dep.dependentType}</span>
                        {' '}asociado(s)
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-red-700 mt-3 font-medium">
                    Por favor, elimine o mueva los elementos dependientes antes de continuar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dependency Info (if not blocked but has dependencies) */}
          {!isBlockedByDependencies && hasDependencies && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-yellow-900 mb-2">
                    Información sobre dependencias
                  </h4>
                  <p className="text-sm text-yellow-800">
                    Se encontraron elementos asociados. Estos quedarán huérfanos (apuntando a entidades que ya no existen).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Entities List */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-3">
              Estás a punto de eliminar <strong>{entityCount}</strong> entidad(es):
            </p>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              <ul className="divide-y divide-gray-100">
                {entities.slice(0, 10).map((entity) => (
                  <li key={entity.id} className="p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {entity.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {entity.type} {entity.municipality && `• ${entity.municipality}`}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {entities.length > 10 && (
                  <li className="p-3 text-sm text-gray-500 italic bg-gray-50">
                    ... y {entities.length - 10} más
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Confirmation Input (only if not blocked) */}
          {!isBlockedByDependencies && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Escribe <strong className="text-red-600">{REQUIRED_CONFIRM_TEXT}</strong> para confirmar:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isConfirmEnabled) {
                    handleConfirm();
                  }
                }}
                disabled={isDeleting || isCheckingDependencies}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed font-mono"
                placeholder={REQUIRED_CONFIRM_TEXT}
                autoFocus
              />
            </div>
          )}

          {/* Loading State for Dependency Check */}
          {isCheckingDependencies && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verificando dependencias...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleCancel}
            disabled={isDeleting || isCheckingDependencies}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              isConfirmEnabled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Eliminando...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


