import api from '@/services/api';
import type { IoTSensorFormData } from '../types';
import type { MqttCredentials } from '../MqttCredentialsModal';

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

  // Step 1: Create entity in Orion-LD
  await api.createSDMEntity(entityType, entity);

  // Step 2: Provision MQTT credentials for the new IoT device.
  // This is a separate call because Orion doesn't handle IoT provisioning.
  // The device_id is derived from the entity URN (last segment).
  let mqttCredentials: MqttCredentials | null = null;
  try {
    const deviceId = entityId.split(':').pop() ?? entityId;
    const result = await api.provisionMqttCredentials(deviceId);
    if (result?.username && result?.password) {
      const host = result.mqtt_host ?? result.host ?? 'mosquitto-service';
      const port = result.mqtt_port ?? result.port ?? 1883;
      const dataTopic = result.topics?.data ?? `platform/${deviceId}/data`;
      const cmdTopic = result.topics?.commands ?? `platform/${deviceId}/cmd`;
      mqttCredentials = {
        host,
        port,
        protocol: 'mqtt',
        api_key: result.password,
        device_id: deviceId,
        topics: {
          publish_data: dataTopic,
          publish_data_json: dataTopic,
          commands: cmdTopic,
        },
        warning: result.warning,
      };
    }
  } catch (e: any) {
    // MQTT provisioning failure should not block entity creation
    console.warn('[submitIoTSensor] MQTT provisioning failed (entity was created):', e?.message);
  }

  return { mqttCredentials };
}
