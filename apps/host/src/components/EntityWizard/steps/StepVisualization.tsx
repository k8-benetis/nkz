import { MapPin } from 'lucide-react';
import { useWizard } from '../WizardContext';
import { IconUploader } from '../IconUploader';
import { AssetBrowser } from '../AssetBrowser';
import { DefaultIconSelector } from '../DefaultIconSelector';
import { useViewer } from '@/context/ViewerContext';
import type { Geometry, Point } from 'geojson';

export function StepVisualization() {
  const { entityType, formData, updateFormData } = useWizard();
  const { startModelPreview } = useViewer();

  if (!formData) return null;

  const getPointCoords = (geometry: Geometry | null) => {
    if (!geometry || geometry.type !== 'Point') return null;
    const [lon, lat] = (geometry as Point).coordinates;
    return { lat, lon };
  };

  const coords = getPointCoords(formData.geometry);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Visualización</h3>
        <p className="text-sm text-gray-600">Configura cómo se verá esta entidad en el mapa y en las listas.</p>
      </div>

      {/* Default icon */}
      <div className="bg-gray-50 rounded-xl p-4">
        <DefaultIconSelector
          entityType={entityType ?? undefined}
          selectedIcon={formData.defaultIconKey ?? null}
          onSelect={iconKey => updateFormData({
            defaultIconKey: iconKey ?? undefined,
            iconUrl: iconKey ? undefined : formData.iconUrl,
          })}
        />
      </div>

      {/* Divider */}
      <div className="relative flex items-center">
        <div className="flex-1 border-t border-gray-200" />
        <span className="px-3 text-sm text-gray-500 bg-white">o sube un icono personalizado</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Custom icon upload */}
      <IconUploader
        currentIconUrl={formData.iconUrl}
        onUpload={url => updateFormData({ iconUrl: url, defaultIconKey: undefined })}
        onRemove={() => updateFormData({ iconUrl: undefined })}
      />

      {/* 3D Model */}
      <div className="border-t pt-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Modelo 3D (Opcional)</h4>

        <AssetBrowser
          selectedUrl={formData.model3DUrl}
          onSelect={url => updateFormData({ model3DUrl: url })}
          scale={formData.modelScale ?? 1.0}
          onScaleChange={s => updateFormData({ modelScale: s })}
          rotation={formData.modelRotation ?? [0, 0, 0]}
          onRotationChange={r => updateFormData({ modelRotation: r })}
        />

        {formData.model3DUrl && (
          <div className="mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-800">Ajuste Visual</span>
              <span className="text-xs text-gray-500">
                Escala: {(formData.modelScale ?? 1).toFixed(1)}x · Rot: {formData.modelRotation?.[0] ?? 0}°
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!coords) {
                  alert('Por favor, selecciona primero una ubicación en el paso de Geometría');
                  return;
                }
                startModelPreview(formData.model3DUrl!, coords, {
                  scale: formData.modelScale ?? 1,
                  rotation: formData.modelRotation ?? [0, 0, 0],
                });
              }}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 font-medium shadow-md"
            >
              <MapPin className="w-5 h-5" />
              Previsualizar en el Terreno
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">El wizard se ocultará. Ajusta escala y rotación sobre el mapa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
