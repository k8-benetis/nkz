import { useWizard } from '../WizardContext';
import { ParentEntitySelector } from '../ParentEntitySelector';
import type { GeoAssetFormData } from '../types';

// Types that support the subdivision (parent-child) workflow
const SUBDIVISION_CAPABLE = new Set([
  'AgriParcel', 'Vineyard', 'OliveGrove', 'AgriBuilding',
]);

// AgriParcel gets first-class cadastral fields instead of generic additionalAttributes
const IS_AGRI_PARCEL = (type: string) => type === 'AgriParcel';

export function StepGeoAssetConfig() {
  const { entityType, formData, updateFormData } = useWizard();

  if (!formData || formData.macroCategory !== 'assets') return null;
  const data = formData as GeoAssetFormData;

  const canSubdivide = SUBDIVISION_CAPABLE.has(entityType ?? '');
  const isAgriParcel = IS_AGRI_PARCEL(entityType ?? '');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Datos del activo</h3>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          type="text"
          value={data.name}
          onChange={e => updateFormData({ name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          placeholder="Nombre del activo"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          value={data.description ?? ''}
          onChange={e => updateFormData({ description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          placeholder="Descripción opcional"
          rows={2}
        />
      </div>

      {/* AgriParcel: first-class cadastral fields */}
      {isAgriParcel && (
        <div className="pt-4 border-t space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Datos catastrales</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Municipio</label>
              <input
                type="text"
                value={data.municipality ?? ''}
                onChange={e => updateFormData({ municipality: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                placeholder="Ej: Vitoria-Gasteiz"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
              <input
                type="text"
                value={data.province ?? ''}
                onChange={e => updateFormData({ province: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                placeholder="Ej: Álava"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Referencia catastral</label>
            <input
              type="text"
              value={data.cadastralReference ?? ''}
              onChange={e => updateFormData({ cadastralReference: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 font-mono"
              placeholder="Ej: 01001A001000010000DP"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cultivo</label>
            <input
              type="text"
              value={data.cropType ?? ''}
              onChange={e => updateFormData({ cropType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              placeholder="Ej: Viñedo, Cereal, Olivar"
            />
          </div>
        </div>
      )}

      {/* Subdivision / parent entity */}
      {canSubdivide && (
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="isSubdivision"
              checked={data.isSubdivision}
              onChange={e => updateFormData({
                isSubdivision: e.target.checked,
                parentEntity: e.target.checked ? data.parentEntity : null,
              })}
              className="w-4 h-4 accent-green-600"
            />
            <label htmlFor="isSubdivision" className="text-sm font-medium text-gray-700">
              Crear como subdivisión de otra entidad existente
            </label>
          </div>

          {data.isSubdivision && (
            <ParentEntitySelector
              selectedParentId={data.parentEntity?.id}
              onSelect={parent => updateFormData({ parentEntity: parent })}
              entityType={entityType ?? undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
