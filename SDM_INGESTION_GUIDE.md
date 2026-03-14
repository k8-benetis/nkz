# Guía de Entidades y Datos SDM en Nekazari

Esta guía explica cómo Nekazari gestiona el ciclo de vida de la información, desde la creación de una entidad física hasta la visualización de sus datos, siguiendo el estándar internacional **Smart Data Models (SDM)** y el protocolo **NGSI-LD**.

---

## 1. Conceptos Fundamentales

*   **SDM (Smart Data Models):** Un estándar global que define cómo deben llamarse los atributos de las cosas (ej. `temperature` en lugar de `temp` o `t1`).
*   **NGSI-LD:** El lenguaje que usamos para que diferentes máquinas se entiendan (basado en JSON-LD).
*   **Orion-LD:** Nuestro "Context Broker" o cerebro central que guarda el estado actual de todas las entidades.

---

## 2. El Flujo de Trabajo en Dos Fases

### Fase A: Registro de la Entidad (Definición)
Es el proceso de dar de alta un dispositivo o activo en la plataforma.

1.  **Frontend (Entity Wizard):** El usuario usa el asistente para elegir un tipo (ej. `AgriSensor`). El sistema carga los campos obligatorios del estándar SDM.
2.  **Entity Manager:** Valida que la información cumple con el modelo.
3.  **Orion-LD:** Se crea la "identidad digital" con un ID único: `urn:ngsi-ld:Tipo:TenantID:DeviceID`.

### Fase B: Ingesta de Telemetría (Datos en Tiempo Real)
Es el camino que sigue un dato desde el sensor físico hasta la base de datos.

1.  **Transporte:** El sensor envía datos por **MQTT** o **HTTP** usando claves cortas para ahorrar batería y ancho de banda (ej. `{"t": 25}`).
2.  **Telemetry Worker:** Recibe el dato y busca el **Sensor Profile** (el "traductor").
3.  **Normalización SDM:** El worker traduce la clave corta (`t`) al atributo estándar (`temperature`), añade la unidad (`CEL`) y la marca de tiempo (`observedAt`).
4.  **Actualización Dual:**
    *   **Estado Actual:** Se envía a Orion-LD para que los mapas y paneles se actualicen.
    *   **Histórico:** Se guarda directamente en **TimescaleDB** para generar gráficas y análisis de largo plazo.

---

## 3. Cómo añadir un nuevo Tipo de Entidad (Developer)

Para soportar un nuevo modelo SDM (ej. un Invernadero o un Tractor nuevo), sigue estos pasos:

1.  **Consultar el Estándar:** Busca el modelo en [smartdatamodels.org](https://smartdatamodels.org/).
2.  **Registrar en el Wizard:** Añade el tipo en `apps/host/src/components/EntityWizard/entityTypes.ts`.
3.  **Definir el Perfil de Mapeo:** Crea un registro en la tabla `sensor_profiles` de la base de datos.
    *   Este perfil le dirá al Telemetry Worker: *"Cuando recibas 'h' de este dispositivo, guárdalo como 'relativeHumidity' en el modelo estándar"*.
4.  **Verificación:** Envía un dato de prueba y verifica que Orion-LD refleja el atributo estándar.

---

## 4. Ventajas de esta Arquitectura

*   **Interoperabilidad:** No importa quién fabrique el sensor; una vez mapeado, la plataforma solo ve "temperatura estándar".
*   **Escalabilidad:** Podemos añadir miles de sensores nuevos simplemente creando perfiles de mapeo, sin tocar el código del backend.
*   **Inteligencia:** Los módulos de IA pueden analizar datos de cualquier granja porque todos usan el mismo vocabulario técnico.

---
*Documento generado por el motor autónomo Nekazari - v1.0 - 2026-03-13*
