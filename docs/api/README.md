# 🔌 Nekazari Integration Standard (NIS)

## 📋 Visión General

El **Nekazari Integration Standard (NIS)** es un estándar abierto diseñado para la industria agrícola que permite integrar cualquier tipo de dispositivo, sistema o fuente de datos con la plataforma Nekazari.

---

## 🎯 Objetivo

Crear un estándar unificado que permita a cualquier tenant integrar sus propios dispositivos y sistemas de datos, independientemente del tipo:

- ✅ Tractores con ISOBUS
- ✅ Estaciones meteorológicas
- ✅ Sensores IoT (ESP32, Arduino, Raspberry Pi)
- ✅ Estaciones de ordeño
- ✅ Granjas de pollos sensorizadas
- ✅ Collares GPS de ganado
- ✅ PCs remotos con sensores
- ✅ Sistemas de riego automatizado
- ✅ Drones agrícolas
- ✅ Cualquier otro dispositivo agrícola

---

## 📚 Documentación

### 🚀 Inicio Rápido
- [**Getting Started**](./01-getting-started.md) - Primeros pasos para integrar tu dispositivo
- [**Authentication**](./02-authentication.md) - Autenticación con API Keys y JWT

### 📖 Guías por Tipo de Dispositivo
- [**IoT Devices**](./devices/iot-devices.md) - ESP32, Arduino, Raspberry Pi
- [**ISOBUS Tractors**](./devices/isobus-tractors.md) - Tractores con protocolo ISOBUS
- [**Weather Stations**](./devices/weather-stations.md) - Estaciones meteorológicas
- [**Livestock Tracking**](./devices/livestock-tracking.md) - Collares GPS, estaciones de ordeño
- [**Remote PCs**](./devices/remote-pcs.md) - PCs remotos con sensores
- [**Poultry Farms**](./devices/poultry-farms.md) - Granjas de pollos sensorizadas

### 🔧 Referencia Técnica
- [**API Reference**](./api-reference.md) - Referencia completa de la API
- [**Data Models**](./data-models.md) - Modelos de datos NGSI-LD y SDM
- [**Sensor Profiles**](./sensor-profiles.md) - Perfiles de sensores disponibles
- [**Error Handling**](./error-handling.md) - Manejo de errores y troubleshooting

### 📝 Ejemplos Prácticos
- [**Examples**](./examples/) - Ejemplos de código para cada tipo de dispositivo

---

## 🏗️ Arquitectura

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

### 1. **Tenant Isolation**
Cada tenant tiene su propio espacio de datos aislado usando `Fiware-Service` header.

### 2. **API Key Authentication**
Cada tenant tiene una API Key única que permite autenticación segura sin necesidad de tokens JWT.

### 3. **NGSI-LD Standard**
Todos los datos siguen el estándar NGSI-LD (FIWARE) para máxima interoperabilidad.

### 4. **SDM Compatibility**
Compatibilidad con Sensor Data Model (SDM) para mapeo automático de tipos de sensores.

### 5. **Self-Service Registration**
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
   └─> Consultas NGSI-LD
   └─> API de series temporales
```

---

## 📊 Tipos de Datos Soportados

### Sensores Ambientales
- Temperatura
- Humedad
- Presión atmosférica
- Radiación solar (PAR)
- Velocidad del viento
- Dirección del viento
- Precipitación

### Sensores de Suelo
- Humedad del suelo
- pH del suelo
- Conductividad eléctrica
- Temperatura del suelo
- Nutrientes (N, P, K)

### Sensores de Cultivos
- NDVI (Índice de vegetación)
- LAI (Índice de área foliar)
- Contenido de clorofila
- Estrés hídrico

### Datos de Maquinaria
- Posición GPS
- Velocidad
- Combustible
- Horas de trabajo
- Datos ISOBUS (implementos, semillas, fertilizantes)

### Datos de Ganado
- Posición GPS
- Actividad
- Temperatura corporal
- Producción de leche
- Peso

---

## 🔒 Seguridad

- ✅ Autenticación mediante API Keys (SHA256 hash)
- ✅ Aislamiento de datos por tenant
- ✅ HTTPS obligatorio
- ✅ Validación de datos de entrada
- ✅ Rate limiting configurable

---

## 📞 Soporte

Para preguntas o problemas con la integración:
- 📧 Email: support@nekazari.com
- 📖 Documentación: Esta carpeta
- 🐛 Issues: GitHub Issues

---

**Última actualización**: 2025-11-14

