# 📚 Nekazari Integration Standard - Índice Completo

## 🎯 Visión del Estándar

El **Nekazari Integration Standard (NIS)** es un estándar abierto diseñado para crear un ecosistema unificado de integración de datos agrícolas. Permite a cualquier tenant integrar sus propios dispositivos y sistemas, independientemente del tipo o fabricante.

---

## 📖 Documentación por Sección

### 🚀 Inicio Rápido
- **[Getting Started](./01-getting-started.md)** - Primeros pasos para integrar tu dispositivo
- **[Authentication](./02-authentication.md)** - Métodos de autenticación (API Key y JWT)

### 📱 Dispositivos Específicos
- **[IoT Devices](./devices/iot-devices.md)** - ESP32, Arduino, Raspberry Pi
- **[Remote PCs](./devices/remote-pcs.md)** - PCs remotos con sensores
- **[Weather Stations](./devices/weather-stations.md)** - Estaciones meteorológicas (próximamente)
- **[ISOBUS Tractors](./devices/isobus-tractors.md)** - Tractores con protocolo ISOBUS (próximamente)
- **[Livestock Tracking](./devices/livestock-tracking.md)** - Collares GPS, estaciones de ordeño (próximamente)
- **[Poultry Farms](./devices/poultry-farms.md)** - Granjas de pollos sensorizadas (próximamente)

### 🔧 Referencia Técnica
- **[API Reference](./api-reference.md)** - Referencia completa de la API (próximamente)
- **[Data Models](./data-models.md)** - Modelos de datos NGSI-LD y SDM (próximamente)
- **[Sensor Profiles](./sensor-profiles.md)** - Perfiles de sensores disponibles (próximamente)
- **[Error Handling](./error-handling.md)** - Manejo de errores y troubleshooting (próximamente)

### 📝 Ejemplos Prácticos
- **[Examples](./examples/)** - Ejemplos de código para cada tipo de dispositivo (próximamente)

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    Nekazari Platform                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ API Validator │  │ Entity      │  │ Orion-LD     │  │
│  │ (Auth)        │→ │ Manager     │→ │ (Storage)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         ↑                  ↑                  ↑          │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │
          │                  │                  │
    ┌─────┴─────┐    ┌──────┴──────┐    ┌─────┴─────┐
    │           │    │              │    │           │
┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
│ISOBUS │  │  IoT  │  │Weather│  │GPS    │  │Remote │
│Tractor│  │Device │  │Station│  │Collar │  │  PC   │
└───────┘  └───────┘  └───────┘  └───────┘  └───────┘
```

---

## 🔑 Conceptos Clave

### 1. Tenant Isolation
Cada tenant tiene su propio espacio de datos aislado usando `Fiware-Service` header.

### 2. API Key Authentication
Cada tenant tiene una API Key única que permite autenticación segura sin necesidad de tokens JWT.

### 3. NGSI-LD Standard
Todos los datos siguen el estándar NGSI-LD (FIWARE) para máxima interoperabilidad.

### 4. SDM Compatibility
Compatibilidad con Sensor Data Model (SDM) para mapeo automático de tipos de sensores.

### 5. Self-Service Registration
Los tenants pueden registrar sus propios sensores y dispositivos desde el dashboard o mediante API.

---

## 🚀 Flujo de Integración Típico

```
1. REGISTRO DEL DISPOSITIVO
   └─> POST /api/sensors/register
       └─> Crea registro en PostgreSQL
       └─> Crea entidad en Orion-LD

2. ENVÍO DE DATOS (Continuo)
   └─> POST /ngsi-ld/v1/entities/{id}/attrs
       └─> Actualiza datos en Orion-LD
       └─> Visible en dashboard y consultas

3. VISUALIZACIÓN Y ANÁLISIS
   └─> Dashboard web
   └─> Grafana dashboards
   └─> Consultas NGSI-LD
```

---

## 📊 Tipos de Datos Soportados

### Sensores Ambientales
- Temperatura, Humedad, Presión atmosférica
- Radiación solar (PAR), Velocidad del viento
- Dirección del viento, Precipitación

### Sensores de Suelo
- Humedad del suelo, pH del suelo
- Conductividad eléctrica, Temperatura del suelo
- Nutrientes (N, P, K)

### Sensores de Cultivos
- NDVI (Índice de vegetación)
- LAI (Índice de área foliar)
- Contenido de clorofila, Estrés hídrico

### Datos de Maquinaria
- Posición GPS, Velocidad, Combustible
- Horas de trabajo
- Datos ISOBUS (implementos, semillas, fertilizantes)

### Datos de Ganado
- Posición GPS, Actividad
- Temperatura corporal, Producción de leche
- Peso

---

## 🔒 Seguridad

- ✅ Autenticación mediante API Keys (SHA256 hash)
- ✅ Aislamiento de datos por tenant
- ✅ HTTPS obligatorio
- ✅ Validación de datos de entrada
- ✅ Rate limiting configurable

---

## 📞 Contribuir al Estándar

El Nekazari Integration Standard está diseñado para crecer y evolucionar. Si tienes:

- ✅ Nuevos tipos de dispositivos para integrar
- ✅ Mejoras en la documentación
- ✅ Ejemplos de código útiles
- ✅ Casos de uso específicos

Por favor, contribuye al proyecto o contacta con el equipo.

---

## 🎯 Roadmap

### Fase 1: Core (✅ Completado)
- [x] Sistema de autenticación dual (API Key + JWT)
- [x] Endpoint unificado de registro de sensores
- [x] Creación automática en PostgreSQL y Orion-LD
- [x] Documentación básica
- [x] Dashboard con modal de registro

### Fase 2: Dispositivos Específicos (🚧 En Progreso)
- [x] IoT Devices (ESP32, Arduino, Raspberry Pi)
- [x] Remote PCs
- [ ] Weather Stations
- [ ] ISOBUS Tractors
- [ ] Livestock Tracking
- [ ] Poultry Farms

### Fase 3: Avanzado (📅 Planificado)
- [ ] API Reference completa
- [ ] Data Models detallados
- [ ] Sensor Profiles expandidos
- [ ] Ejemplos prácticos por dispositivo
- [ ] SDKs por lenguaje
- [ ] Herramientas de testing

---

**Última actualización**: 2025-11-14

