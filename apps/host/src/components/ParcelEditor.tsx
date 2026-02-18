// =============================================================================
// Parcel Editor Component - Draw and edit agricultural parcels
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Save, X, Edit3, Trash2, Map as MapIcon, Check } from 'lucide-react';

interface ParcelGeometry {
  type: 'Polygon';
  coordinates: number[][][]; // Array of rings (exterior + holes)
}

interface CadastralParcel {
  id?: string;
  cadastral_reference?: string; // Optional if not from catastro
  municipality: string;
  province: string;
  area_hectares: number;
  crop_type: string;
  geometry: ParcelGeometry;
  notes?: string;
  isActive?: boolean;
}

interface ParcelEditorProps {
  parcel?: CadastralParcel | null;
  onSave: (parcel: CadastralParcel) => void;
  onCancel: () => void;
  mode: 'create' | 'edit'; // Create new or edit existing
}

export const ParcelEditor: React.FC<ParcelEditorProps> = ({
  parcel,
  onSave,
  onCancel,
  mode,
}) => {
  const [municipality, setMunicipality] = useState(parcel?.municipality || '');
  const [province, setProvince] = useState(parcel?.province || '');
  const [cropType, setCropType] = useState(parcel?.crop_type || '');
  const [notes, setNotes] = useState(parcel?.notes || '');
  const [geometry, setGeometry] = useState<ParcelGeometry | null>(
    parcel?.geometry || null
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingCoords, setDrawingCoords] = useState<[number, number][]>([]);

  // Initialize map (simplified - would use Leaflet in production)
  useEffect(() => {
    // TODO: Initialize Leaflet map here
    // For now, show drawing tools
  }, []);

  const handleDrawPolygon = () => {
    setIsDrawing(true);
    setDrawingCoords([]);
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
    setDrawingCoords([]);
  };

  const handleConfirmDrawing = () => {
    if (drawingCoords.length >= 3) {
      // Close the polygon
      const closedCoords = [...drawingCoords, drawingCoords[0]];
      
      setGeometry({
        type: 'Polygon',
        coordinates: [closedCoords],
      });
      
      setIsDrawing(false);
      setDrawingCoords([]);
    }
  };

  const handleSave = async () => {
    if (!geometry) {
      alert('Por favor, dibuja una parcela antes de guardar');
      return;
    }

    if (!municipality || !province || !cropType) {
      alert('Por favor, completa todos los campos requeridos');
      return;
    }

    try {
      // Calculate area from geometry
      const area = calculateAreaHectares(geometry);

      const parcelData: CadastralParcel = {
        municipality,
        province,
        crop_type: cropType,
        geometry,
        area_hectares: area,
        notes: notes || undefined,
        isActive: true,
      };

      // If editing, include ID
      if (parcel?.id) {
        parcelData.id = parcel.id;
      }

      // Save via API
      await onSave(parcelData);
    } catch (error) {
      console.error('Error saving parcel:', error);
      alert('Error al guardar la parcela');
    }
  };

  // Calculate area in hectares (simplified calculation)
  const calculateAreaHectares = (_geom: ParcelGeometry): number => {
    // TODO: Implement proper area calculation using PostGIS or Turf.js
    // For now, return mock value
    return 2.5;
  };

  const handleClearGeometry = () => {
    setGeometry(null);
    setDrawingCoords([]);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {mode === 'create' ? 'Crear Parcela' : 'Editar Parcela'}
        </h3>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Drawing Tools */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <MapIcon className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-blue-900">Dibujar en Mapa</h4>
        </div>
        
        {!geometry && !isDrawing && (
          <div className="flex gap-2">
            <button
              onClick={handleDrawPolygon}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <MapIcon className="w-4 h-4" />
              Dibujar Parcela
            </button>
            <button
              onClick={() => {
                // TODO: Trigger cadastral selector
                alert('Selector catastral será implementado');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Buscar en Catastro
            </button>
          </div>
        )}

        {isDrawing && (
          <div className="space-y-3">
            <p className="text-sm text-blue-800">
              Haz clic en el mapa para dibujar vértices. Haz clic en el primer punto para cerrar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDrawing}
                disabled={drawingCoords.length < 3}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirmar
              </button>
              <button
                onClick={handleCancelDrawing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {geometry && !isDrawing && (
          <div className="space-y-2">
            <div className="p-3 bg-white border border-gray-200 rounded-lg">
              <p className="text-sm font-medium text-gray-900">
                Parcela dibujada
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {geometry.coordinates[0].length - 1} vértices • ~{geometry.coordinates[0].length > 0 ? 'X' : '0'} ha
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDrawPolygon}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm"
              >
                <Edit3 className="w-4 h-4" />
                Redibujar
              </button>
              <button
                onClick={handleClearGeometry}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Municipio *
            </label>
            <input
              type="text"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provincia *
            </label>
            <input
              type="text"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de Cultivo *
          </label>
          <select
            value={cropType}
            onChange={(e) => setCropType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Seleccionar...</option>
            <option value="Olive">Olivo</option>
            <option value="Vineyard">Vid</option>
            <option value="Citrus">Cítricos</option>
            <option value="Cereal">Cereal</option>
            <option value="Pasture">Pastos</option>
            <option value="TreeCrop">Frutos Secos</option>
            <option value="Other">Otro</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Información adicional sobre la parcela..."
          />
        </div>

        {parcel?.cadastral_reference && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600">
              Ref. Catastral: <span className="font-mono font-semibold">{parcel.cadastral_reference}</span>
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!geometry || !municipality || !province || !cropType}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Guardar Parcela
        </button>
      </div>
    </div>
  );
};

