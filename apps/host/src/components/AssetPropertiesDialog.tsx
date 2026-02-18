// =============================================================================
// Asset Properties Dialog - Form for Asset Properties
// =============================================================================
// Dialog modal for editing asset properties (name, scale, rotation)

import React, { useState, useEffect } from 'react';
import { X, Save, RotateCw } from 'lucide-react';
import type { AssetType, AssetProperties } from '@/types';
import { useI18n } from '@/context/I18nContext';

interface AssetPropertiesDialogProps {
  isOpen: boolean;
  assetType: AssetType | null;
  geometry: any; // GeoJSON geometry
  onSave: (name: string, properties: AssetProperties) => void;
  onCancel: () => void;
  suggestedName?: string;
}

export const AssetPropertiesDialog: React.FC<AssetPropertiesDialogProps> = ({
  isOpen,
  assetType,
  geometry,
  onSave,
  onCancel,
  suggestedName,
}) => {
  useI18n();
  const [name, setName] = useState('');
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && assetType) {
      // Reset form
      setName(suggestedName || '');
      setScale(assetType.defaultScale || 1.0);
      setRotation(0);
      setErrors({});
    }
  }, [isOpen, assetType, suggestedName]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (scale < 0.1 || scale > 5.0) {
      newErrors.scale = 'La escala debe estar entre 0.1 y 5.0';
    }
    
    if (rotation < 0 || rotation > 360) {
      newErrors.rotation = 'La rotación debe estar entre 0 y 360 grados';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const properties: AssetProperties = {
      scale,
      rotation,
      model3d: assetType?.model3d,
    };

    onSave(name || suggestedName || '', properties);
  };

  if (!isOpen || !assetType) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Propiedades del Activo
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Asset Type Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-900">{assetType.name}</p>
            <p className="text-xs text-blue-700 mt-1">
              Tipo: {assetType.geometryType === 'Point' ? 'Punto' : 
                     assetType.geometryType === 'LineString' ? 'Línea' : 'Polígono'}
            </p>
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-gray-500">(opcional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggestedName || 'Se generará automáticamente'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {suggestedName && !name && (
              <p className="text-xs text-gray-500 mt-1">
                Nombre sugerido: {suggestedName}
              </p>
            )}
          </div>

          {/* Scale Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Escala: {scale.toFixed(2)}x
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min="0.1"
                max="5.0"
                step="0.1"
                value={scale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.1 && val <= 5.0) {
                    setScale(val);
                  }
                }}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            {errors.scale && (
              <p className="text-xs text-red-600 mt-1">{errors.scale}</p>
            )}
          </div>

          {/* Rotation Control */}
          {assetType.model3d && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rotación: {rotation}°
              </label>
              <div className="flex items-center gap-3">
                <RotateCw className="w-4 h-4 text-gray-500" />
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  step="1"
                  value={rotation}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 360) {
                      setRotation(val);
                    }
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              {errors.rotation && (
                <p className="text-xs text-red-600 mt-1">{errors.rotation}</p>
              )}
            </div>
          )}

          {/* Geometry Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">
              <strong>Geometría:</strong> {geometry?.type || 'N/A'}
            </p>
            {geometry?.coordinates && (
              <p className="text-xs text-gray-600 mt-1">
                <strong>Coordenadas:</strong> {JSON.stringify(geometry.coordinates).substring(0, 100)}
                {JSON.stringify(geometry.coordinates).length > 100 ? '...' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Guardar Activo
          </button>
        </div>
      </div>
    </div>
  );
};

