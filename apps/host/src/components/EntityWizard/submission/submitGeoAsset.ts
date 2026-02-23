import { parcelApi } from '@/services/parcelApi';
import api from '@/services/api';
import { getConfig } from '@/config/environment';
import type { GeoAssetFormData } from '../types';
import type { PlacementState } from '@/machines/placementMachine';

const config = getConfig();

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

  const entity: Record<string, unknown> = {
    id: entityId,
    type: entityType,
    '@context': [config.external.contextUrl],
    name: { type: 'Property', value: formData.name },
  };

  if (formData.description) {
    entity.description = { type: 'Property', value: formData.description };
  }

  // Location: stamp mode builds MultiPoint from instances
  if (placementState.mode === 'stamp' && placementState.stampedInstances.length > 0) {
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

  // Dynamic SDM attributes
  for (const [k, v] of Object.entries(formData.additionalAttributes)) {
    if (v !== '' && v !== null && v !== undefined) {
      entity[k] = { type: 'Property', value: v };
    }
  }

  await api.createSDMEntity(entityType, entity);
}
