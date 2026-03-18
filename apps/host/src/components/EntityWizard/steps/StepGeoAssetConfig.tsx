import { useState, useEffect } from 'react';
import { Sprout } from 'lucide-react';
import { useWizard } from '../WizardContext';
import { ParentEntitySelector } from '../ParentEntitySelector';
import api from '@/services/api';
import type { GeoAssetFormData } from '../types';

// Types that support the subdivision (parent-child) workflow
const SUBDIVISION_CAPABLE = new Set([
  'AgriParcel', 'Vineyard', 'OliveGrove', 'AgriBuilding',
]);

// Types that should pick an associated parcel (for module integration)
const PARCEL_ASSOCIATION_TYPES = new Set([
  'AgriEnergyTracker', 'PhotovoltaicInstallation',
]);

// AgriParcel gets first-class cadastral fields instead of generic additionalAttributes
const IS_AGRI_PARCEL = (type: string) => type === 'AgriParcel';

export function StepGeoAssetConfig() {
  const { entityType, formData, updateFormData } = useWizard();

  const needsParcel = PARCEL_ASSOCIATION_TYPES.has(entityType ?? '');
  const [parcels, setParcels] = useState<{ id: string; name: string }[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);

  useEffect(() => {
    if (!needsParcel) return;
    setParcelsLoading(true);
    api.getSDMEntityInstances('AgriParcel')
      .then((entities: any[]) => {
        setParcels(entities.map(e => ({
          id: e.id,
          name: typeof e.name === 'string' ? e.name : e.name?.value || e.id,
        })));
      })
      .catch(() => setParcels([]))
      .finally(() => setParcelsLoading(false));
  }, [needsParcel]);

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

      {/* Parcel association (AgriEnergyTracker, PhotovoltaicInstallation) */}
      {needsParcel && (
        <div className="pt-4 border-t">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-1.5">
              <Sprout className="w-4 h-4 text-green-600" />
              Parcela asociada
            </span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Vincula este activo a una parcela existente para que el módulo AgriEnergy lo gestione.
          </p>
          {parcelsLoading ? (
            <p className="text-sm text-gray-400">Cargando parcelas...</p>
          ) : parcels.length === 0 ? (
            <p className="text-sm text-amber-600">No hay parcelas creadas. Puedes vincularla después.</p>
          ) : (
            <select
              value={data.parentEntity?.id ?? ''}
              onChange={e => {
                const parcel = parcels.find(p => p.id === e.target.value);
                updateFormData({
                  parentEntity: parcel ? { id: parcel.id, type: 'AgriParcel', name: parcel.name, geometry: null } : null,
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="">Sin parcela (opcional)</option>
              {parcels.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
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
