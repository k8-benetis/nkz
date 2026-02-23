import api from '@/services/api';
import { getConfig } from '@/config/environment';
import type { FleetFormData } from '../types';
import type { RobotCredentials } from '../RobotCredentialsModal';

const config = getConfig();

export interface FleetSubmitResult {
  robotCredentials: RobotCredentials | null;
}

export async function submitFleet(
  entityType: string,
  formData: FleetFormData,
): Promise<FleetSubmitResult> {
  // AgriculturalRobot: dedicated provisioning endpoint that returns VPN credentials
  if (entityType === 'AgriculturalRobot') {
    const response = await api.provisionRobot({
      name: formData.name,
      location: formData.geometry ? { type: 'GeoProperty', value: formData.geometry } : undefined,
      robotType: formData.robotType,
      manufacturer: formData.manufacturer,
      serialNumber: formData.serialNumber,
      icon: formData.iconUrl,
      ref3DModel: formData.model3DUrl,
      modelScale: formData.modelScale,
      modelRotation: formData.modelRotation,
    });
    return { robotCredentials: response.credentials ?? null };
  }

  // Tractors, implements, operations — generic SDM entity
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

  if (formData.geometry) {
    entity.location = { type: 'GeoProperty', value: formData.geometry };
  }

  if (formData.manufacturer) {
    entity.manufacturer = { type: 'Property', value: formData.manufacturer };
  }
  if (formData.serialNumber) {
    entity.serialNumber = { type: 'Property', value: formData.serialNumber };
  }
  if (formData.isobusCompatible !== undefined) {
    entity.isobusCompatible = { type: 'Property', value: formData.isobusCompatible };
  }

  if (formData.iconUrl) {
    entity.icon2d = { type: 'Property', value: formData.iconUrl };
  } else if (formData.defaultIconKey) {
    entity.icon2d = { type: 'Property', value: `icon:${formData.defaultIconKey}` };
  }
  if (formData.model3DUrl) {
    entity.ref3DModel    = { type: 'Property', value: formData.model3DUrl };
    entity.modelScale    = { type: 'Property', value: formData.modelScale ?? 1 };
    entity.modelRotation = { type: 'Property', value: formData.modelRotation ?? [0, 0, 0] };
  }

  for (const [k, v] of Object.entries(formData.additionalAttributes)) {
    if (v !== '' && v !== null && v !== undefined) {
      entity[k] = { type: 'Property', value: v };
    }
  }

  await api.createSDMEntity(entityType, entity);
  return { robotCredentials: null };
}
