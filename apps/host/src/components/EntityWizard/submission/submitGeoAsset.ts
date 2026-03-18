import { parcelApi } from '@/services/parcelApi';
import api from '@/services/api';
import type { GeoAssetFormData } from '../types';
import type { PlacementState } from '@/machines/placementMachine';

export async function submitGeoAsset(
  entityType: string,
  formData: GeoAssetFormData,
  placementState: PlacementState,
): Promise<void> {
  // AgriParcel uses the dedicated parcel API (NGSI-LD structure with cadastral fields)
  if (entityType === 'AgriParcel') {
    await parcelApi.createParcel({
      name: formData.name,
      geometry: formData.geometry as any,
      municipality: formData.municipality ?? '',
      province: formData.province ?? '',
      cadastralReference: formData.cadastralReference,
      cropType: formData.cropType ?? '',
      notes: formData.description,
      ndviEnabled: true,
    });
    return;
  }

  // All other asset types use the generic SDM entity API
  const entityId = `urn:ngsi-ld:${entityType}:current:${Date.now()}`;

  // No @context in body — the api-gateway injects the Link header with the
  // platform's NGSI-LD context, so Orion-LD resolves types correctly.
  const entity: Record<string, unknown> = {
    id: entityId,
    type: entityType,
    name: { type: 'Property', value: formData.name },
  };

  if (formData.description) {
    entity.description = { type: 'Property', value: formData.description };
  }

  // Location: stamp mode builds MultiPoint from instances
  if ((placementState.mode === 'stamp' || placementState.mode === 'array') && placementState.stampedInstances.length > 0) {
    entity.location = {
      type: 'GeoProperty',
      value: {
        type: 'MultiPoint',
        coordinates: placementState.stampedInstances.map(i => [i.lng, i.lat]),
      },
    };
  } else if (formData.geometry) {
    entity.location = { type: 'GeoProperty', value: formData.geometry };
  }

  // Parent relationship
  if (formData.isSubdivision && formData.parentEntity) {
    entity.refParent = { type: 'Relationship', object: formData.parentEntity.id };
  }

  // Parcel association for energy-related types (AgriEnergy module integration)
  if (!formData.isSubdivision && formData.parentEntity?.type === 'AgriParcel') {
    entity.refAgriParcel = { type: 'Relationship', object: formData.parentEntity.id };
  }

  // Visualization
  if (formData.iconUrl) {
    entity.icon2d = { type: 'Property', value: formData.iconUrl };
  } else if (formData.defaultIconKey) {
    entity.icon2d = { type: 'Property', value: `icon:${formData.defaultIconKey}` };
  }
  if (formData.model3DUrl) {
    entity.ref3DModel   = { type: 'Property', value: formData.model3DUrl };
    entity.modelScale   = { type: 'Property', value: formData.modelScale ?? 1 };
    entity.modelRotation = { type: 'Property', value: formData.modelRotation ?? [0, 0, 0] };
  }

  // AgriEnergyTracker: inject tilt/azimuth/modelRotation from array settings
  if (entityType === 'AgriEnergyTracker' && placementState.mode === 'array') {
    const { bearing, tilt, nominalPower } = placementState.arraySettings;
    entity.tilt      = { type: 'Property', value: tilt };
    entity.azimuth   = { type: 'Property', value: bearing };
    entity.modelRotation = { type: 'Property', value: [bearing, -tilt, 0] };
    // SDM-aligned panel defaults (overridable via additionalAttributes)
    if (!formData.additionalAttributes.panelDimension) {
      entity.panelDimension = { type: 'Property', value: { width: 2.0, length: 4.0, thickness: 0.04 } };
    }
    if (!formData.additionalAttributes.NominalPower) {
      entity.NominalPower = { type: 'Property', value: nominalPower };
    }
  }

  // Dynamic SDM attributes
  for (const [k, v] of Object.entries(formData.additionalAttributes)) {
    if (v !== '' && v !== null && v !== undefined) {
      entity[k] = { type: 'Property', value: v };
    }
  }

  await api.createSDMEntity(entityType, entity);
}
