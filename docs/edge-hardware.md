---
title: Edge & Hardware Integration
description: Technical specifications for hardware integration, MQTT telemetry, and Open Hardware reference designs.
sidebar:
  order: 3
---

# Edge & Hardware Integration

The Nekazari OS platform is designed to seamlessly bridge the gap between physical agricultural assets (Edge) and the digital twin representation (Cloud). Hardware integration is strictly standards-based, utilizing MQTT for transport and FIWARE Smart Data Models for semantic interoperability.

## Telemetry Ingestion Architecture

Hardware devices (dataloggers, weather stations, rovers) communicate with the platform via the **MQTT broker** (Eclipse Mosquitto). 

The data is intercepted by the **FIWARE IoT Agent (JSON)**, which translates lightweight MQTT payloads into highly structured NGSI-LD entities within the Orion-LD Context Broker.

### Supported Protocol: MQTT + JSON

To minimize bandwidth on low-power IoT networks (LoRaWAN, NB-IoT, 2G), devices do not need to construct complex NGSI-LD payloads. Instead, they send flat JSON objects to specific MQTT topics.

**Topic Structure:**
```text
/{api-key}/{device-id}/attrs
```

**Payload Example (Smart Data Model attributes):**
```json
{
  "airTemperature": 24.5,
  "relativeHumidity": 60.2,
  "soilMoisture": 0.35
}
```

The attribute names must match those declared in the device's **DeviceProfile**. The IoT Agent runs with `explicitAttrs=true` — only profiled attributes are forwarded to Orion-LD. Undeclared keys are silently dropped.

If your datalogger uses short keys (e.g. `t`, `h`), the DeviceProfile handles the translation: `incoming_key: "t"` maps to `target_attribute: "airTemperature"` via JEXL expressions if needed.

## Open Hardware Reference Designs

Nekazari promotes the adoption of Open Hardware. To assist manufacturers, universities, and farmers in building compatible edge devices, we will publish schematics, Bill of Materials (BOM), and firmware under open licenses.

### Upcoming Resources

In the near future, the **[nkz-os/hardware-reference](https://github.com/nkz-os/hardware-reference)** repository will host:
- **Datalogger Schematics**: ESP32/STM32-based designs for environmental sensing.
- **isoBUS Connection Diagrams**: Schematics for integrating tractor CAN bus data (ISO 11783) directly into the Nekazari telemetry pipeline.
- **Rover Chassis Designs**: 3D-printable and CNC-machinable parts for autonomous agricultural robots.

*Stay tuned for the official release of the hardware reference repository.*

## Datak: Native Software Datalogger

For scenarios where edge computing is required (e.g., remote farms with a local PC gathering sensor data before transmitting it to the cloud), Nekazari provides **[Datak](https://github.com/nkz-os/datak)**.

DaTaK is an open-source software datalogger designed to run on a separate local machine or Raspberry Pi. It acts as an edge gateway that:
1. **Collects** data locally from serial ports, Modbus, CANbus, or local network sensors.
2. **Buffers** the data if the internet connection is unstable.
3. **Auto-maps** sensor names to SDM attributes (e.g. "Piranometro solar" becomes `solarRadiation`).
4. **Transmits** securely via MQTT to the platform broker when connectivity is restored.

DaTaK can auto-generate a DeviceProfile compatible with the platform wizard (`GET /api/config/device-profile`). Import the JSON file in the Entity Wizard to create a sensor with the correct attribute mappings.

By utilizing DaTaK on your edge PCs, you guarantee 100% native compatibility with the Nekazari telemetry pipeline without writing custom MQTT clients.
