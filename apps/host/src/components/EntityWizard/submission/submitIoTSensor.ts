import api from '@/services/api';
import { getConfig } from '@/config/environment';
import type { IoTSensorFormData } from '../types';
import type { MqttCredentials } from '../MqttCredentialsModal';

const config = getConfig();

export interface IoTSubmitResult {
  mqttCredentials: MqttCredentials | null;
}

export async function submitIoTSensor(
  entityType: string,
  formData: IoTSensorFormData,
): Promise<IoTSubmitResult> {
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

  if (formData.deviceProfileId) {
    const profileUrn = formData.deviceProfileId.startsWith('urn:')
      ? formData.deviceProfileId
      : `urn:ngsi-ld:DeviceProfile:${formData.deviceProfileId}`;
    entity.refDeviceProfile = { type: 'Relationship', object: profileUrn };
  }

  if (formData.iconUrl) {
    entity.icon2d = { type: 'Property', value: formData.iconUrl };
  } else if (formData.defaultIconKey) {
    entity.icon2d = { type: 'Property', value: `icon:${formData.defaultIconKey}` };
  }

  // Dynamic SDM attributes
  for (const [k, v] of Object.entries(formData.additionalAttributes)) {
    if (v !== '' && v !== null && v !== undefined) {
      entity[k] = { type: 'Property', value: v };
    }
  }

  const response = await api.createSDMEntity(entityType, entity);
  return { mqttCredentials: response?.mqtt_credentials ?? null };
}
