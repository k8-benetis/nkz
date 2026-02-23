import type { PlacementState, PlacementAction } from '@/machines/placementMachine';
import { useWizard } from '../WizardContext';
import { GeometryEditor } from '../GeometryEditor';
import { StampTool } from '../StampTool';
import { PlacementModeSelector } from '../PlacementModeSelector';
import { AssetBrowser } from '../AssetBrowser';
import { validateGeometryWithinParent } from '@/utils/geometryValidation';
import type { Geometry } from 'geojson';
import type { GeoAssetFormData } from '../types';

// ─── Props — placementState lives in shell (UI state, not form payload) ───────

export interface StepGeometryProps {
  placementState: PlacementState;
  dispatchPlacement: React.Dispatch<PlacementAction>;
}

export function StepGeometry({ placementState, dispatchPlacement }: StepGeometryProps) {
  const { entityType, formData, updateFormData, setValidationError } = useWizard();

  if (!formData) return null;

  const isAsset = formData.macroCategory === 'assets';
  const assetData = isAsset ? (formData as GeoAssetFormData) : null;

  const handleGeometryChange = (geometry: Geometry | null) => {
    if (!geometry) {
      updateFormData({ geometry: null });
      return;
    }

    // Geo-fencing validation for subdivisions
    if (assetData?.isSubdivision && assetData.parentEntity?.geometry) {
      const result = validateGeometryWithinParent(geometry, assetData.parentEntity.geometry);
      if (!result.valid) {
        setValidationError(result.error ?? 'La geometría no está dentro del padre');
        return;
      }
    }

    setValidationError(null);
    updateFormData({ geometry });
  };

  const geometryType = (formData as GeoAssetFormData).geometryType ?? 'Point';

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {formData.macroCategory === 'assets' ? 'Geometría y ubicación' : 'Ubicación'}
      </h3>

      {/* Placement mode (assets only — sensors/fleet are always single point) */}
      {isAsset && (
        <PlacementModeSelector
          mode={placementState.mode}
          onChange={mode => dispatchPlacement({ type: 'SET_MODE', payload: mode })}
          entityType={entityType ?? undefined}
        />
      )}

      {/* Stamp mode: asset library + paint tool */}
      {placementState.mode === 'stamp' && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Selecciona el activo a pintar</h4>
            <AssetBrowser
              selectedUrl={formData.model3DUrl}
              onSelect={url => {
                updateFormData({ model3DUrl: url });
                dispatchPlacement({ type: 'SELECT_MODEL', payload: url });
              }}
              scale={formData.modelScale}
              onScaleChange={s => updateFormData({ modelScale: s })}
            />
            {!formData.model3DUrl && (
              <p className="text-red-500 text-sm mt-2 font-medium">Selecciona un modelo 3D para continuar.</p>
            )}
          </div>
          <StampTool
            modelUrl={formData.model3DUrl}
            onInstancesChange={instances => {
              dispatchPlacement({ type: 'ADD_STAMPED_INSTANCES', payload: instances });
              setValidationError(instances.length === 0 ? 'Pinta al menos una instancia' : null);
            }}
            height="h-96"
          />
        </>
      )}

      {/* Normal geometry editor */}
      {placementState.mode !== 'stamp' && (
        <>
          {/* Geometry type selector (assets only) */}
          {isAsset && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de geometría</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Point', 'Polygon', 'LineString', 'MultiLineString'] as const).map(gt => (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => updateFormData({ geometryType: gt, geometry: null })}
                    className={`p-2 rounded border text-sm ${geometryType === gt ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-200'}`}
                  >
                    {gt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <GeometryEditor
            geometryType={geometryType}
            parentGeometry={
              assetData?.isSubdivision && assetData.parentEntity
                ? { id: assetData.parentEntity.id, name: assetData.parentEntity.name, geometry: assetData.parentEntity.geometry }
                : undefined
            }
            initialGeometry={formData.geometry ?? undefined}
            onGeometryChange={handleGeometryChange}
            onValidationChange={(valid, err) => setValidationError(valid ? null : (err ?? null))}
            height="h-96"
          />

          {assetData?.isSubdivision && assetData.parentEntity && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <strong>Padre:</strong> {assetData.parentEntity.name} ({assetData.parentEntity.type})<br />
              <span className="text-xs text-yellow-700">La geometría debe quedar completamente dentro de los límites del padre.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
