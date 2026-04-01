import api from '@/services/api';
import type { IoTSensorFormData } from '../types';
import type { MqttCredentials } from '../MqttCredentialsModal';

export interface IoTSubmitResult {
  mqttCredentials: MqttCredentials | null;
}

/**
 * Submit an IoT sensor entity via SDM Integration Service.
 *
 * SDM Integration handles the full workflow in one call:
 *   1. Creates the NGSI-LD entity in Orion-LD
 *   2. Provisions the device in the IoT Agent (MQTT transport)
 *   3. Returns MQTT credentials (api_key, topics, host/port)
 *
 * The returned credentials are shown once and cannot be recovered later.
 */
export async function submitIoTSensor(
  entityType: string,
  formData: IoTSensorFormData,
): Promise<IoTSubmitResult> {
  // Build the body for SDM Integration.
  // SDM Integration auto-generates the entity ID and wraps properties in NGSI-LD format.
  const body: Record<string, unknown> = {
    name: formData.name,
  };

  if (formData.description) {
    body.description = formData.description;
  }

  if (formData.geometry) {
    body.location = {
      type: 'GeoProperty',
      value: formData.geometry,
    };
  }

  // refDeviceProfile as NGSI-LD Relationship (mandatory for IoT sensors)
  if (!formData.deviceProfileId) {
    throw new Error('DeviceProfile is required for IoT sensors');
  }
  const profileUrn = formData.deviceProfileId.startsWith('urn:')
    ? formData.deviceProfileId
    : `urn:ngsi-ld:DeviceProfile:${formData.deviceProfileId}`;
  body.refDeviceProfile = {
    type: 'Relationship',
    object: profileUrn,
  };

  if (formData.iconUrl) {
    body.icon2d = formData.iconUrl;
  } else if (formData.defaultIconKey) {
    body.icon2d = `icon:${formData.defaultIconKey}`;
  }

  // Dynamic SDM attributes (flat values — SDM Integration wraps them)
  for (const [k, v] of Object.entries(formData.additionalAttributes)) {
    if (v !== '' && v !== null && v !== undefined) {
      body[k] = v;
    }
  }

  // Single call: entity creation + IoT Agent provisioning + MQTT credentials
  const result = await api.createSDMIoTEntity(entityType, body);

  // Extract MQTT credentials from SDM Integration response
  let mqttCredentials: MqttCredentials | null = null;
  const mqtt = result.mqtt_credentials;
  if (mqtt) {
    mqttCredentials = {
      host: mqtt.host ?? 'mosquitto-service',
      port: mqtt.port ?? 8883,
      protocol: mqtt.protocol ?? 'mqtts',
      api_key: mqtt.api_key ?? result.api_key,
      device_id: mqtt.device_id ?? '',
      topics: {
        publish_data: mqtt.topics?.publish_data ?? '',
        publish_data_json: mqtt.topics?.publish_data_json ?? '',
        commands: mqtt.topics?.commands ?? '',
      },
      example_payload: mqtt.example_payload,
      warning: mqtt.warning,
    };
  }

  return { mqttCredentials };
}
