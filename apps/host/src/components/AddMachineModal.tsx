// =============================================================================
// Add Agricultural Machine Modal Component
// =============================================================================
// Modal para registrar maquinaria agrícola (tractores ISOBUS, etc.)
// =============================================================================

import React, { useState } from 'react';
import { X, Save, MapPin, Tractor, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getConfig } from '@/config/environment';
import api from '@/services/api';

const config = getConfig();

interface AddMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultLocation?: { lat: number; lon: number };
}

export const AddMachineModal: React.FC<AddMachineModalProps> = ({
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
    machine_type: 'tractor' as 'tractor' | 'harvester' | 'sprayer' | 'spreader' | 'planter' | 'tiller',
    operation_type: 'seeding' as 'seeding' | 'fertilization' | 'spraying' | 'harvesting' | 'tillage' | 'irrigation',
    status: 'idle' as 'idle' | 'working' | 'maintenance' | 'error',
    latitude: defaultLocation?.lat || 0,
    longitude: defaultLocation?.lon || 0,
    manufacturer: '',
    model: '',
    serialNumber: '',
    isobusCompatible: false,
    icon2d: '',
    model3d: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.name) {
      setError(t('machines.required_fields') || 'Por favor completa todos los campos obligatorios');
      setLoading(false);
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      setError(t('machines.required_coordinates') || 'Por favor ingresa las coordenadas GPS (latitud y longitud)');
      setLoading(false);
      return;
    }

    try {
      // Create NGSI-LD entity according to SDM
      const machineData: any = {
        id: `urn:ngsi-ld:AgriculturalTractor:${Date.now()}`,
        type: 'AgriculturalTractor',
        name: {
          type: 'Property',
          value: formData.name
        },
        status: {
          type: 'Property',
          value: formData.status
        },
        operationType: {
          type: 'Property',
          value: formData.operation_type
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
      if (formData.manufacturer) {
        machineData.manufacturer = {
          type: 'Property',
          value: formData.manufacturer
        };
      }
      if (formData.model) {
        machineData.model = {
          type: 'Property',
          value: formData.model
        };
      }
      if (formData.serialNumber) {
        machineData.serialNumber = {
          type: 'Property',
          value: formData.serialNumber
        };
      }
      if (formData.isobusCompatible !== undefined) {
        machineData.isobusCompatible = {
          type: 'Property',
          value: formData.isobusCompatible
        };
      }
      if (formData.icon2d) {
        machineData.icon2d = {
          type: 'Property',
          value: formData.icon2d
        };
      }
      if (formData.model3d) {
        machineData.model3d = {
          type: 'Property',
          value: formData.model3d
        };
      }
      if (formData.notes) {
        machineData.notes = {
          type: 'Property',
          value: formData.notes
        };
      }

      await api.createMachine(machineData);
      
      // Reset form
      setFormData({
        name: '',
        machine_type: 'tractor',
        operation_type: 'seeding',
        status: 'idle',
        latitude: defaultLocation?.lat || 0,
        longitude: defaultLocation?.lon || 0,
        manufacturer: '',
        model: '',
        serialNumber: '',
        isobusCompatible: false,
        icon2d: '',
        model3d: '',
        notes: ''
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error: any) {
      console.error('Error saving machine:', error);
      const errorMsg = error.response?.data?.error || (t('machines.save_error') || 'Error al guardar la maquinaria');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Tractor className="w-6 h-6" />
            {t('machines.title') || 'Registrar Maquinaria Agrícola'}
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
              {t('machines.name') || 'Nombre'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('machines.name_placeholder') || 'Ej: Tractor John Deere 6130M'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={loading}
              required
            />
          </div>

          {/* Manufacturer & Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.manufacturer') || 'Fabricante'}
              </label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder={t('machines.manufacturer_placeholder') || 'Ej: John Deere'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.model') || 'Modelo'}
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder={t('machines.model_placeholder') || 'Ej: 6130M'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Serial Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('machines.serial_number') || 'Número de Serie'}
            </label>
            <input
              type="text"
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              placeholder={t('machines.serial_number_placeholder') || 'Ej: SN-2024-001'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Status & Operation Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.status') || 'Estado'}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="idle">{t('machines.idle') || 'Inactivo'}</option>
                <option value="working">{t('machines.working') || 'Trabajando'}</option>
                <option value="maintenance">{t('machines.maintenance') || 'Mantenimiento'}</option>
                <option value="error">{t('machines.error') || 'Error'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.operation_type') || 'Tipo de Operación'}
              </label>
              <select
                value={formData.operation_type}
                onChange={(e) => setFormData({ ...formData, operation_type: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="seeding">{t('machines.op_seeding') || 'Siembra'}</option>
                <option value="fertilization">{t('machines.op_fertilization') || 'Fertilización'}</option>
                <option value="spraying">{t('machines.op_spraying') || 'Pulverización'}</option>
                <option value="harvesting">{t('machines.op_harvesting') || 'Cosecha'}</option>
                <option value="tillage">{t('machines.op_tillage') || 'Labranza'}</option>
                <option value="irrigation">{t('machines.op_irrigation') || 'Riego'}</option>
              </select>
            </div>
          </div>

          {/* ISOBUS Compatibility */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isobus"
              checked={formData.isobusCompatible}
              onChange={(e) => setFormData({ ...formData, isobusCompatible: e.target.checked })}
              className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              disabled={loading}
            />
            <label htmlFor="isobus" className="ml-2 text-sm text-gray-700">
              {t('machines.isobus_compatible') || 'Compatible con ISOBUS'}
            </label>
          </div>

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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('machines.latitude') || 'Latitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('machines.latitude_placeholder') || 'Ej: 42.571493'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {t('machines.longitude') || 'Longitud (GPS)'} *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                placeholder={t('machines.longitude_placeholder') || 'Ej: -2.028218'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Visual Assets */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.icon2d') || 'Icono 2D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.icon2d}
                onChange={(e) => setFormData({ ...formData, icon2d: e.target.value })}
                placeholder="https://ejemplo.com/icono.png"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('machines.model3d') || 'Modelo 3D (URL opcional)'}
              </label>
              <input
                type="url"
                value={formData.model3d}
                onChange={(e) => setFormData({ ...formData, model3d: e.target.value })}
                placeholder="https://ejemplo.com/modelo.glb"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('machines.notes') || 'Notas'}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder={t('machines.notes_placeholder') || 'Notas adicionales...'}
              disabled={loading}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? (t('machines.saving') || 'Guardando...') : (t('machines.save') || 'Guardar Maquinaria')}
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

