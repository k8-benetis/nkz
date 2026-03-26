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
4. **i18n (Internacionalización):** Todo string expuesto a usuario (frontend) debe usar la función `t()` de `@nekazari/sdk` (react-i18next) garantizando soporte para `es`, `en`, `ca`, `eu`, `fr`, y `pt`.

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
  
- **Cacheo de BaseMap Raster (`GET /basemap/{parcel_id}`)**: 
  El módulo debe ser capaz de suministrar un empaquetado **PMTiles** (o MBTiles nativo) aislado del mapa satélite, correspondiente exclusivamente al Bounding Box de la parcela operativa, ahorrando miles de peticiones HTTP en cabina.

### 2.2 Telemetría de Baja Latencia (UDP Edge Computing)
El cálculo matemático de la operación en tiempo real (ej. Desviación Angular XTE) debe realizarse de forma in-situ en la tablet de cabina.
- El hardware de posicionamiento (NTRIP/ESP32) debe hacer **Broadcasting UDP de alta frecuencia (10Hz-20Hz)** en la red WiFi local de la cabina.
- Los módulos deben rechazar procesar guiados milimétricos en el servidor cloud a fin de erradicar el "efecto serpiente" producido por la latencia de ida y vuelta a la red celular.

### 2.3 Diseño Industrial HMI
Las pantallas (HUD) inyectadas en la tablet móvil están regidas por las normativas mecánicas ISO 11783-6:
- Alto contraste de interfaz, componentes opacos, fondos sólidos. Queda revocado el uso de *glassmorphism* o capas difuminadas.
- Controles de gran área táctil (**48x48dp mínimo**).
- Sin serifas, máxima legibilidad ante exposición solar directa de 1000+ nits.
