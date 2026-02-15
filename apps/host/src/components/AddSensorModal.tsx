// =============================================================================
// Add Sensor Modal Component
// =============================================================================
// Modal reutilizable para registrar sensores desde cualquier parte del dashboard
// =============================================================================

import React, { useState, useEffect } from 'react';
import { X, Save, MapPin, Gauge, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useViewer } from '@/context/ViewerContext';
import api from '@/services/api';

interface SensorProfile {
  code: string;
  name: string;
  description?: string;
  sdm_entity_type?: string;
  sdm_category?: string;
  metadata?: {
    protocol?: string;
    measurementKind?: string;
    component?: string;
    [key: string]: any;
  };
  sdm_attributes?: string[];
}

interface AddSensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultLocation?: { lat: number; lon: number };
}

export const AddSensorModal: React.FC<AddSensorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultLocation
}) => {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<SensorProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    external_id: '',
    name: '',
    profile: '',
    latitude: defaultLocation?.lat || 0,
    longitude: defaultLocation?.lon || 0,
    station_id: '',
    is_under_canopy: false
  });

  const { pickLocation, mapMode } = useViewer(); // Use ViewerContext for map picking

  // Cargar perfiles disponibles
  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    }
  }, [isOpen]);

  const loadProfiles = async () => {
    try {
      const data = await api.getSensorProfiles();
      setProfiles(data);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.external_id || !formData.name || !formData.profile) {
      setError(t('sensors.required_fields'));
      setLoading(false);
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      setError(t('sensors.required_coordinates'));
      setLoading(false);
      return;
    }

    try {
      // Build payload matching Partial<Sensor> structure where possible
      // or at least passing necessary data for api.createSensor to handle mapping
      const sensorData: any = {
        external_id: formData.external_id,
        name: { type: 'Property', value: formData.name }, // Satisfy Sensor type
        profile: formData.profile,
        location: {
          type: 'GeoProperty',
          value: {
            type: 'Point',
            coordinates: [formData.longitude, formData.latitude]
          }
        },
        // Extra fields not strictly in Sensor type but needed for creation
        station_id: formData.station_id || undefined,
        is_under_canopy: formData.is_under_canopy,
        metadata: formData.station_id ? { station_id: formData.station_id } : undefined
      };

      await api.createSensor(sensorData);

      // Reset form
      setFormData({
        external_id: '',
        name: '',
        profile: '',
        latitude: defaultLocation?.lat || 0,
        longitude: defaultLocation?.lon || 0,
        station_id: '',
        is_under_canopy: false
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error: any) {
      console.error('Error saving sensor:', error);
      const errorMsg = error.response?.data?.error || t('sensors.save_error');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Si estamos en modo selección de ubicación, ocultamos el modal pero mantenemos el componente montado
  // para no perder el estado del formulario.
  if (mapMode === 'PICK_LOCATION') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Gauge className="w-6 h-6" />
            Registrar Nuevo Sensor
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* ID Externo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID Externo *
            </label>
            <input
              type="text"
              value={formData.external_id}
              onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
              placeholder="Ej: BP_Vaso_PAR_1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Identificador único del sensor físico (no se puede cambiar después)
            </p>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Sensor Temperatura Estación 01"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
              required
            />
          </div>

          {/* Perfil SDM */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Perfil SDM *
            </label>
            <select
              value={formData.profile}
              onChange={(e) => setFormData({ ...formData, profile: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
              required
            >
              <option value="">Selecciona un perfil</option>
              {profiles.map((profile) => (
                <option key={profile.code} value={profile.code}>
                  {profile.name} ({profile.code})
                  {profile.description && ` - ${profile.description}`}
                </option>
              ))}
            </select>
            {formData.profile && (() => {
              const selectedProfile = profiles.find(p => p.code === formData.profile);
              if (!selectedProfile) return null;

              const isISOBUS = selectedProfile.metadata?.protocol === 'ISOBUS';
              const sdmAttributes = selectedProfile.sdm_attributes || [];
              const extendedSDMAttributes = [
                'soilingIndex', 'shadingCoverage', 'ptoSpeed', 'solarAzimuth',
                'solarElevation', 'solarZenith', 'vaporPressureDeficit',
                'stemWaterPotential', 'leafAreaIndex', 'soilCompaction',
                'soilOrganicMatter', 'grainLosses', 'workQuality', 'nozzleStatus'
              ];
              const hasExtendedAttributes = sdmAttributes.some(attr =>
                extendedSDMAttributes.includes(attr)
              );

              return (
                <div className="space-y-2 mt-2">
                  {selectedProfile.description && (
                    <p className="text-xs text-gray-500">
                      {selectedProfile.description}
                    </p>
                  )}

                  {isISOBUS && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs">
                      <p className="text-purple-800 font-medium">🔌 Protocolo ISOBUS</p>
                      <p className="text-purple-700 mt-1">
                        Compatible con maquinaria ISOBUS. Los datos se mapean automáticamente desde el bus CAN.
                      </p>
                    </div>
                  )}

                  {hasExtendedAttributes && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                      <p className="text-amber-800 font-medium">⚠️ Atributos SDM Extendidos</p>
                      <p className="text-amber-700 mt-1">
                        Puede requerir extensión del contexto NGSI-LD para integración completa.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Coordenadas GPS */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                Latitud (GPS) *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                placeholder="Ej: 42.571493"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                Longitud (GPS) *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                placeholder="Ej: -2.028218"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Botón Seleccionar en Mapa */}
          <button
            type="button"
            onClick={() => {
              pickLocation((lat, lon) => {
                setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));
              });
            }}
            className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition flex items-center justify-center gap-2 border border-slate-300"
          >
            <MapPin className="w-4 h-4" />
            Seleccionar en el mapa del Visor
          </button>

          {/* Estación */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estación (opcional)
            </label>
            <input
              type="text"
              value={formData.station_id}
              onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
              placeholder="Ej: Estacion_Principal"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Agrupa sensores relacionados en una estación
            </p>
          </div>

          {/* Bajo dosel */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="under_canopy"
              checked={formData.is_under_canopy}
              onChange={(e) => setFormData({ ...formData, is_under_canopy: e.target.checked })}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              disabled={loading}
            />
            <label htmlFor="under_canopy" className="ml-2 text-sm text-gray-700">
              Bajo dosel (panel solar)
            </label>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Guardando...' : 'Guardar Sensor'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

