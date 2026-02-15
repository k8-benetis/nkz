// =============================================================================
// Add Livestock Animal Modal Component
// =============================================================================
// Modal para registrar animales de ganado (collares GPS, etc.)
// =============================================================================

import React, { useState } from 'react';
import { X, Save, MapPin, Heart, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getConfig } from '@/config/environment';
import api from '@/services/api';
import type { LivestockAnimal } from '@/types';

const config = getConfig();

interface AddLivestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultLocation?: { lat: number; lon: number };
}

export const AddLivestockModal: React.FC<AddLivestockModalProps> = ({
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
    species: 'Bos taurus' as 'Bos taurus' | 'Ovis aries' | 'Capra hircus' | 'Sus scrofa' | 'Equus caballus',
    breed: '',
    herdId: '',
    activity: 'grazing' as 'grazing' | 'resting' | 'moving' | 'feeding',
    latitude: defaultLocation?.lat || 0,
    longitude: defaultLocation?.lon || 0,
    birthDate: '',
    weight: '',
    icon2d: '',
    model3d: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.name) {
      setError(t('livestock.required_fields') || 'Por favor completa todos los campos obligatorios');
      setLoading(false);
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      setError(t('livestock.required_coordinates') || 'Por favor ingresa las coordenadas GPS (latitud y longitud)');
      setLoading(false);
      return;
    }

    try {
      // Create NGSI-LD entity according to SDM
      const animalData: any = {
        id: `urn:ngsi-ld:LivestockAnimal:${Date.now()}`,
        type: 'LivestockAnimal',
        name: {
          type: 'Property',
          value: formData.name
        },
        species: {
          type: 'Property',
          value: formData.species
        },
        activity: {
          type: 'Property',
          value: formData.activity
        },
        location: {
          type: 'GeoProperty',
          value: {
            type: 'Point',
            coordinates: [formData.longitude, formData.latitude]
          }
        },
        '@context': [config.external.contextUrl]
      };

      // Add optional fields
      if (formData.breed) {
        animalData.breed = {
          type: 'Property',
          value: formData.breed
        };
      }
      if (formData.herdId) {
        animalData.herdId = {
          type: 'Property',
          value: formData.herdId
        };
      }
      if (formData.birthDate) {
        animalData.birthDate = {
          type: 'Property',
          value: formData.birthDate,
          '@type': 'DateTime'
        };
      }
      if (formData.weight) {
        animalData.weight = {
          type: 'Property',
          value: parseFloat(formData.weight),
          unitCode: 'KGM'
        };
      }
      if (formData.icon2d) {
        animalData.icon2d = {
          type: 'Property',
          value: formData.icon2d
        };
      }
      if (formData.model3d) {
        animalData.model3d = {
          type: 'Property',
          value: formData.model3d
        };
      }
      if (formData.notes) {
        animalData.notes = {
          type: 'Property',
          value: formData.notes
        };
      }

      await api.createLivestockAnimal(animalData);
      
      // Reset form
      setFormData({
        name: '',
        species: 'Bos taurus',
        breed: '',
        herdId: '',
        activity: 'grazing',
        latitude: defaultLocation?.lat || 0,
        longitude: defaultLocation?.lon || 0,
        birthDate: '',
        weight: '',
        icon2d: '',
        model3d: '',
        notes: ''
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error: any) {
      console.error('Error saving livestock:', error);
      const errorMsg = error.response?.data?.error || (t('livestock.save_error') || 'Error al guardar el animal');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Heart className="w-6 h-6" />
            {t('livestock.title') || 'Registrar Animal de Ganado'}
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
              {t('livestock.name') || 'Nombre'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('livestock.name_placeholder') || 'Ej: Vaca 001'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loading}
              required
            />
          </div>

          {/* Species & Breed */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.species') || 'Especie'} *
              </label>
              <select
                value={formData.species}
                onChange={(e) => setFormData({ ...formData, species: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
                required
              >
                <option value="Bos taurus">{t('livestock.species_cow') || 'Vaca (Bos taurus)'}</option>
                <option value="Ovis aries">{t('livestock.species_sheep') || 'Oveja (Ovis aries)'}</option>
                <option value="Capra hircus">{t('livestock.species_goat') || 'Cabra (Capra hircus)'}</option>
                <option value="Sus scrofa">{t('livestock.species_pig') || 'Cerdo (Sus scrofa)'}</option>
                <option value="Equus caballus">{t('livestock.species_horse') || 'Caballo (Equus caballus)'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.breed') || 'Raza'}
              </label>
              <input
                type="text"
                value={formData.breed}
                onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                placeholder={t('livestock.breed_placeholder') || 'Ej: Frisona'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Herd ID & Activity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.herd_id') || 'ID de Rebaño'}
              </label>
              <input
                type="text"
                value={formData.herdId}
                onChange={(e) => setFormData({ ...formData, herdId: e.target.value })}
                placeholder={t('livestock.herd_id_placeholder') || 'Ej: HERD_A'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.activity') || 'Actividad'}
              </label>
              <select
                value={formData.activity}
                onChange={(e) => setFormData({ ...formData, activity: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="grazing">{t('livestock.activity_grazing') || 'Pastando'}</option>
                <option value="resting">{t('livestock.activity_resting') || 'Descansando'}</option>
                <option value="moving">{t('livestock.activity_moving') || 'En movimiento'}</option>
                <option value="feeding">{t('livestock.activity_feeding') || 'Alimentándose'}</option>
              </select>
            </div>
          </div>

          {/* Birth Date & Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.birth_date') || 'Fecha de Nacimiento'}
              </label>
              <input
                type="date"
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.weight') || 'Peso (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                placeholder={t('livestock.weight_placeholder') || 'Ej: 450.5'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('livestock.latitude') || 'Latitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('livestock.latitude_placeholder') || 'Ej: 42.571493'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('livestock.longitude') || 'Longitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('livestock.longitude_placeholder') || 'Ej: -2.028218'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Visual Assets */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.icon2d') || 'Icono 2D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.icon2d}
                onChange={(e) => setFormData({ ...formData, icon2d: e.target.value })}
                placeholder="https://ejemplo.com/icono.png"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('livestock.model3d') || 'Modelo 3D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.model3d}
                onChange={(e) => setFormData({ ...formData, model3d: e.target.value })}
                placeholder="https://ejemplo.com/modelo.glb"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('livestock.notes') || 'Notas'}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={t('livestock.notes_placeholder') || 'Notas adicionales...'}
              disabled={loading}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? (t('livestock.saving') || 'Guardando...') : (t('livestock.save') || 'Guardar Animal')}
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

