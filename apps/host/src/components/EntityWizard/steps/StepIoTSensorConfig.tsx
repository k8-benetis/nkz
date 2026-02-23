import { useState, useEffect } from 'react';
import { Cable, Activity, Zap, HelpCircle } from 'lucide-react';
import { useWizard } from '../WizardContext';
import { listDeviceProfiles, createDeviceProfile, type DeviceProfile } from '@/services/deviceProfilesApi';
import { DeviceProfileHelpModal } from '../../DeviceProfileHelpModal';
import type { IoTSensorFormData } from '../types';

export function StepIoTSensorConfig() {
  const { entityType, formData, updateFormData } = useWizard();
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfile[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!entityType) return;
    listDeviceProfiles({ sdm_entity_type: entityType })
      .then(setDeviceProfiles)
      .catch(() => setDeviceProfiles([]));
  }, [entityType]);

  if (!formData || formData.macroCategory !== 'sensors') return null;
  const data = formData as IoTSensorFormData;

  const handleImportProfile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.name && json.sdm_entity_type && Array.isArray(json.mappings)) {
          await createDeviceProfile({
            name: json.name,
            description: json.description ?? '',
            sdm_entity_type: json.sdm_entity_type,
            mappings: json.mappings,
            is_public: false,
          });
          alert(`Perfil "${json.name}" importado. Selecciónalo de la lista.`);
          const updated = await listDeviceProfiles({ sdm_entity_type: entityType ?? undefined });
          setDeviceProfiles(updated);
        } else {
          alert('El JSON debe contener: name, sdm_entity_type y mappings[]');
        }
      } catch {
        alert('Error al leer el archivo JSON. Verifica el formato.');
      }
    };
    reader.readAsText(file);
  };

  const publicProfiles  = deviceProfiles.filter(p => p.is_public);
  const privateProfiles = deviceProfiles.filter(p => !p.is_public);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Datos del sensor</h3>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          type="text"
          value={data.name}
          onChange={e => updateFormData({ name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          placeholder="Ej: Sensor suelo parcela norte"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          value={data.description ?? ''}
          onChange={e => updateFormData({ description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          placeholder="Descripción opcional"
          rows={2}
        />
      </div>

      {/* Device profile */}
      <div className="pt-4 border-t bg-purple-50 p-4 rounded-xl border border-purple-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Cable className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-800">Conectividad IoT y Datos</h4>
            <p className="text-xs text-purple-700">Configura cómo este dispositivo enviará datos</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Profile selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Perfil de Dispositivo (Mapeo de Datos)
            </label>
            <div className="flex gap-2">
              <select
                value={data.deviceProfileId ?? ''}
                onChange={e => updateFormData({ deviceProfileId: e.target.value || null })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="">-- Sin perfil (configurar manualmente después) --</option>
                {publicProfiles.length > 0 && (
                  <optgroup label="🏛️ Perfiles Oficiales">
                    {publicProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                )}
                {privateProfiles.length > 0 && (
                  <optgroup label="🏠 Mis Perfiles">
                    {privateProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                )}
              </select>
              <button
                onClick={() => setShowHelp(true)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center"
                title="Ayuda y plantillas"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Actions row */}
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="flex items-center justify-center gap-2 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 py-2 rounded-lg border border-purple-200"
            >
              <Activity className="w-3 h-3" /> Ver Plantillas
            </button>

            <label className="flex items-center justify-center gap-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 py-2 rounded-lg border border-blue-200 cursor-pointer">
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImportProfile(file);
                  e.target.value = '';
                }}
              />
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar JSON
            </label>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 py-2 rounded-lg">
              <Zap className="w-3 h-3 text-yellow-500" />
              Credenciales MQTT al finalizar
            </div>
          </div>

          <p className="text-xs text-gray-500 italic">
            * Si no seleccionas un perfil ahora, podrás configurar el mapeo JSON manualmente desde el panel de "Conectividad" una vez creada la entidad.
          </p>
        </div>
      </div>

      <DeviceProfileHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
