---
title: "Platform Conventions & Mobile Integration"
description: "Core architecture rules, API requirements, and mobile integration guidelines for Nekazari modules."
---

# Nekazari Platform Conventions

> **MOLDE DE TRABAJO:** Cualquier módulo del ecosistema Nekazari (NKZ) debe acatar de manera estricta estas convenciones arquitectónicas para garantizar la interoperabilidad con la UI Web (Host) y la App Móvil (Cabin HMI).

## 1. Reglas Core (Datos y Auth)

1. **Autenticación:** Todos los módulos externos deben validar el contexto de seguridad mediante cookies `nkz_token` o cabeceras Bearer. El JWT se firma en Keycloak (RS256).
2. **Multi-tenant isolation:** Cualquier escritura o lectura a bases de datos PostgreSQL o MongoDB debe estar filtrada obligatoriamente por el `tenant_id` incluido en el token.
3. **FIWARE Context Broker:** El Broker (Orion-LD) es la **única** fuente de verdad de la ontología.
   - **CERO ESCRITURAS DIRECTAS:** Prohibido hacer `INSERT` en bases de datos relacionales para modelos de negocio. La ingesta es vía Orion-LD; las DBs se alimentan vía suscripción (MQTT/QuantumLeap).
   - **SDM Strictly:** Usar Smart Data Models (ej. `AgriParcel`, `AgriEquipment`). No inventar esquemas.
4. **i18n (Internacionalización):** Todo string expuesto a usuario (frontend) debe usar la función `t()` de `@nekazari/sdk` (react-i18next) garantizando soporte para `es`, `en`, `ca`, `eu`, `fr`, y `pt`. En el monorepo local, el host usa **un solo** i18next (`NekazariI18nProvider` + `public/locales/{lang}/{common,navigation,layout}.json`). Reglas detalladas de claves y `useI18n()`: ver **`PLATFORM_CONVENTIONS.md` §10** en la **raíz del workspace** (`nekazari/`, no solo el repo `nkz/`).

## 1b. IoT Device Provisioning (FIWARE Standard)

The platform follows the **FIWARE IoT Agent JSON** standard provisioning flow for connecting physical devices (sensors, actuators, gateways) to the digital twin layer.

### Architecture

```
Device/Gateway → MQTT (Mosquitto) → IoT Agent JSON → Orion-LD (NGSI-LD)
                  ↑                    ↑                ↑
           /<apikey>/<device_id>/attrs  Translates JSON   Stores entity
           {"attr": value}              to NGSI-LD        attributes
```

### Provisioning Flow (SDM Integration Service)

1. **User creates entity** via EntityWizard (`POST /sdm/entities/{type}/instances`)
2. **SDM creates NGSI-LD entity** in Orion-LD (digital twin)
3. **SDM provisions IoT device** in IoT Agent:
   - **`get_or_create_service_group(tenant_id)`** → retrieves or creates ONE apikey per tenant
   - **`POST /iot/devices`** → registers device with the tenant apikey
4. **MQTT credentials returned** to user (shown once, not recoverable)

### Key Rules

| Rule | Detail |
|------|--------|
| **One apikey per tenant** | The service group apikey identifies the tenant in MQTT topics. All devices in a tenant share it. The `device_id` differentiates individual devices. |
| **Topic format** | `/<tenant_apikey>/<device_id>/attrs` |
| **Payload format** | `{"attributeName": value}` (FIWARE IoT Agent JSON standard) |
| **IoT Agent mode** | NGSIv2 + `appendMode=true` (auto-creates new attributes in Orion-LD) |
| **explicitAttrs** | `false` — any attribute sent by a device is passed through, not just declared ones |
| **Entity types with IoT** | `AgriSensor`, `Sensor`, `Actuator`, `WeatherStation`, `AgriculturalTractor`, `LivestockAnimal`, `AgriculturalMachine` |
| **MQTT external endpoint** | Configured via `MQTT_EXTERNAL_HOST` / `MQTT_EXTERNAL_PORT` in `nekazari-config` ConfigMap |
| **Credentials security** | API key shown ONCE at creation. Cannot be recovered. User must save it. |

### Connecting a Device/Gateway

After creating a sensor in the platform:

```bash
# MQTT publish (example with mosquitto_pub)
mosquitto_pub -h <MQTT_EXTERNAL_HOST> -p <MQTT_EXTERNAL_PORT> \
  -u <mqtt_username> -P <mqtt_password> \
  -t "/<tenant_apikey>/<device_id>/attrs" \
  -m '{"airTemperature": 22.5, "relativeHumidity": 65}'
```

For DaTaK gateways: configure `digital_twin` section in `configs/gateway.yaml` with the MQTT credentials from the wizard.

### Common Pitfalls

- **`MEASURES-004: Device not found`**: Device apikey doesn't match any service group. All devices MUST use the tenant apikey from `get_or_create_service_group()`.
- **`entity does not have such attribute`**: `IOTA_APPEND_MODE` not set to `true`. Without it, the IoT Agent can't create new attributes.
- **`MQTT_EXTERNAL_HOST` empty or wrong**: Check `nekazari-config` ConfigMap. Devices can't connect if this is misconfigured.
- **Lost credentials**: Cannot be recovered. User must delete and re-create the sensor.

## 2. Requerimientos de Visualización en Cabina (nkz-mobile)

Para que los datos de un módulo puedan visualizarse o ejecutarse en la aplicación nativa del tractor (`nkz-mobile`), se exigen las siguientes implementaciones SOTA:

### 2.1 Sincronización 100% Offline (Arquitectura de Malla)
La maquinaria pesada opera en entornos de cobertura 4G/5G intermitente o nula. **Prohibido depender de APIs REST cloud-based en el bucle de renderizado local.**

Los módulos que gestionen topología espacial o guiado deben exponer rutas asíncronas de sincronización que la App invocará solo cuando haya red:

- **Estructuras Vectoriales (`GET /sync/vectorial?last_pulled_at={ts}`)**: 
  Debe retornar un FeatureCollection GeoJSON con operaciones o geometrías nuevas generadas desde el timestamp. La app cachea esto localmente en **WatermelonDB**.
  > **Norma Crítica - Vectorización Asíncrona:** Todo procesamiento de Raster (imágenes satélite COG) a polígonos vectoriales (GeoJSON) **no** puede realizarse sincrónicamente en un endpoint. Debe ejecutarse como un Job asíncrono en segundo plano (ej. vía **Celery**) que serialice y cachee el mapa para su descarga In-Memory `O(1)`.
  
- **Cacheo de BaseMap Raster (`GET /basemap/{parcel_id}`)**: 
  El módulo debe ser capaz de suministrar un empaquetado **PMTiles** (o MBTiles nativo) del mapa satélite, empaquetado dinámicamente o por lotes vía servicios dedicados en el Core.

### 2.2 Telemetría Táctica de Tractor (UDP Edge Computing)
El cálculo matemático transversal (XTE) debe realizarse in-situ dentro de la tablet de la cabina (`nkz-mobile`).
- El nodo IoT (Gateway ESP32) debe emitir un local **Broadcast UDP (10Hz-20Hz)** en la LAN del tractor evitando así subidas latentes a la arquitectura nube.
- > **Aislamiento Robótico:** Esta telemetría móvil UDP es privativa del flujo Tractor <-> Tablet y **es independiente del módulo `nekazari-module-robotics`**, el cual mantiene íntegro su stack ROS2/Zenoh y túnel VPN para control de rovers autónomos profesionales.

### 2.3 Diseño Industrial HMI (`@nekazari/ui-kit` Dual Theme)
Todo panel UI para control de maquinaria asume exigencias ISO 11783-6:
- **No reescribiremos ningún módulo web actual:** La librería fundacional `@nekazari/ui-kit` alojará un **HMI Context Theme**. Si se detecta el flag `hmi_mode=true` (ej. carga webview en `nkz-mobile`), todo el UI-Kit pasará de su estilo analítico de monitor al modo pesado industrial: opaco puro, controles masivos de **48x48dp** y esquemas Amber/Slate limitando la fatiga solar extrema. Un único código base servirá ambos contextos.
