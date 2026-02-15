// =============================================================================
// Add Weather Station Modal Component
// =============================================================================
// Modal para registrar estaciones meteorológicas
// =============================================================================

import React, { useState } from 'react';
import { X, Save, MapPin, Cloud, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getConfig } from '@/config/environment';
import api from '@/services/api';
import type { WeatherStation } from '@/types';

const config = getConfig();

interface AddWeatherStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultLocation?: { lat: number; lon: number };
}

export const AddWeatherStationModal: React.FC<AddWeatherStationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultLocation
}) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    latitude: defaultLocation?.lat || 0,
    longitude: defaultLocation?.lon || 0,
    elevation: '',
    icon2d: '',
    model3d: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.name) {
      setError(t('weather.required_fields') || 'Por favor completa todos los campos obligatorios');
      setLoading(false);
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      setError(t('weather.required_coordinates') || 'Por favor ingresa las coordenadas GPS (latitud y longitud)');
      setLoading(false);
      return;
    }

    try {
      // Create NGSI-LD entity according to SDM
      const stationData: any = {
        id: `urn:ngsi-ld:WeatherObserved:${Date.now()}`,
        type: 'WeatherObserved',
        name: {
          type: 'Property',
          value: formData.name
        },
        location: {
          type: 'GeoProperty',
          value: {
            type: 'Point',
            coordinates: [formData.longitude, formData.latitude]
          }
        },
        observedAt: {
          type: 'Property',
          value: new Date().toISOString(),
          '@type': 'DateTime'
        },
        '@context': [config.external.contextUrl]
      };

      // Add optional fields
      if (formData.elevation) {
        stationData.elevation = {
          type: 'Property',
          value: parseFloat(formData.elevation),
          unitCode: 'MTR'
        };
      }
      if (formData.icon2d) {
        stationData.icon2d = {
          type: 'Property',
          value: formData.icon2d
        };
      }
      if (formData.model3d) {
        stationData.model3d = {
          type: 'Property',
          value: formData.model3d
        };
      }
      if (formData.notes) {
        stationData.notes = {
          type: 'Property',
          value: formData.notes
        };
      }

      await api.createWeatherStation(stationData);
      
      // Reset form
      setFormData({
        name: '',
        latitude: defaultLocation?.lat || 0,
        longitude: defaultLocation?.lon || 0,
        elevation: '',
        icon2d: '',
        model3d: '',
        notes: ''
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error: any) {
      console.error('Error saving weather station:', error);
      const errorMsg = error.response?.data?.error || (t('weather.save_error') || 'Error al guardar la estación meteorológica');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cloud className="w-6 h-6" />
            {t('weather.title') || 'Registrar Estación Meteorológica'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

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

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('weather.name') || 'Nombre'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('weather.name_placeholder') || 'Ej: Estación Meteorológica Principal'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              disabled={loading}
              required
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('weather.latitude') || 'Latitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('weather.latitude_placeholder') || 'Ej: 42.571493'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('weather.longitude') || 'Longitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('weather.longitude_placeholder') || 'Ej: -2.028218'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Elevation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('weather.elevation') || 'Elevación (m)'}
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.elevation}
              onChange={(e) => setFormData({ ...formData, elevation: e.target.value })}
              placeholder={t('weather.elevation_placeholder') || 'Ej: 450.5'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Visual Assets */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('weather.icon2d') || 'Icono 2D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.icon2d}
                onChange={(e) => setFormData({ ...formData, icon2d: e.target.value })}
                placeholder="https://ejemplo.com/icono.png"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('weather.model3d') || 'Modelo 3D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.model3d}
                onChange={(e) => setFormData({ ...formData, model3d: e.target.value })}
                placeholder="https://ejemplo.com/modelo.glb"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('weather.notes') || 'Notas'}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder={t('weather.notes_placeholder') || 'Notas adicionales...'}
              disabled={loading}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? (t('weather.saving') || 'Guardando...') : (t('weather.save') || 'Guardar Estación')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel') || 'Cancelar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

