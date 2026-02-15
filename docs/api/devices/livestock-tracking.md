# 🐄 Livestock Tracking - Seguimiento de Ganado

## 📋 Visión General

Esta guía explica cómo integrar sistemas de seguimiento de ganado (collares GPS, estaciones de ordeño, sensores de actividad) con Nekazari para monitorear la salud, ubicación y producción del ganado.

---

## 🎯 Casos de Uso

### Caso de Uso 1: Collares GPS para Vacas en Pastoreo

**Escenario**: Vacas con collares GPS que transmiten su ubicación y actividad.

**Datos capturados**:
- Posición GPS (latitud, longitud)
- Altitud
- Velocidad de movimiento
- Actividad (pastando, caminando, descansando)
- Temperatura corporal
- Batería del collar

**Beneficios**:
- Localización de animales perdidos
- Monitoreo de comportamiento
- Detección de celo (aumento de actividad)
- Optimización de pastoreo
- Prevención de robos

**Ejemplo de datos**:
```json
{
  "animal_id": "COW_001",
  "timestamp": "2025-11-14T10:30:00Z",
  "position": {
    "lat": 42.571493,
    "lon": -2.028218,
    "altitude": 450.0
  },
  "speed": 0.5,
  "activity": "grazing",
  "body_temperature": 38.5,
  "battery_level": 85.0,
  "herd_id": "HERD_A"
}
```

---

### Caso de Uso 2: Estación de Ordeño Automatizada

**Escenario**: Sistema de ordeño robotizado que registra producción y salud de cada vaca.

**Datos capturados**:
- Animal ID
- Producción de leche (litros)
- Calidad de leche (grasa, proteína, células somáticas)
- Duración del ordeño
- Temperatura de la leche
- Estado de salud (mastitis, cojera)

**Beneficios**:
- Trazabilidad completa de producción
- Detección temprana de mastitis
- Optimización de alimentación
- Análisis de producción por animal

**Ejemplo de datos**:
```json
{
  "animal_id": "COW_002",
  "milking_station_id": "MILKING_STATION_001",
  "timestamp": "2025-11-14T06:00:00Z",
  "milk_production": 25.5,
  "milk_fat": 4.2,
  "milk_protein": 3.5,
  "somatic_cells": 150000,
  "milking_duration": 420,
  "milk_temperature": 37.5,
  "health_status": "healthy"
}
```

---

### Caso de Uso 3: Sensores de Actividad para Detección de Celo

**Escenario**: Sensores de actividad en collares o patas que detectan cambios de comportamiento indicativos de celo.

**Datos capturados**:
- Actividad (pasos por hora)
- Tiempo de descanso
- Tiempo de rumia
- Cambios de comportamiento

**Beneficios**:
- Detección precisa del momento óptimo de inseminación
- Aumento de tasas de concepción
- Reducción de días abiertos
- Optimización de reproducción

---

### Caso de Uso 4: Monitoreo de Pollos en Granja

**Escenario**: Sensores ambientales y de comportamiento en granjas avícolas.

**Datos capturados**:
- Temperatura del galpón
- Humedad relativa
- Concentración de amoníaco
- Consumo de alimento
- Consumo de agua
- Mortalidad
- Peso promedio

**Beneficios**:
- Optimización de condiciones ambientales
- Reducción de mortalidad
- Mejora de conversión alimentaria
- Cumplimiento de bienestar animal

---

## 📝 Ejemplo de Integración: Collar GPS

```python
#!/usr/bin/env python3
"""
Livestock GPS Collar Integration - Envía datos de ubicación y actividad a Nekazari
"""

import requests
import time
from datetime import datetime

class LivestockTracker:
    def __init__(self, api_key: str, tenant_id: str, animal_id: str, server_url: str = "https://nekazari.robotika.cloud"):
        self.api_key = api_key
        self.tenant_id = tenant_id
        self.animal_id = animal_id
        self.server_url = server_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "Fiware-Service": tenant_id
        }
        self.entity_id = f"urn:ngsi-ld:LivestockAnimal:{tenant_id}:{animal_id}"
    
    def register_animal(self, name: str, species: str, breed: str, lat: float, lon: float, herd_id: str = None):
        """Registra el animal en Nekazari"""
        url = f"{self.server_url}/api/sensors/register"
        data = {
            "external_id": self.animal_id,
            "name": name,
            "profile": "livestock_gps_collar",
            "location": {
                "lat": lat,
                "lon": lon
            },
            "metadata": {
                "species": species,
                "breed": breed,
                "herd_id": herd_id
            }
        }
        response = requests.post(url, json=data, headers=self.headers)
        return response.status_code == 201
    
    def send_location(self, lat: float, lon: float, altitude: float = None,
                     speed: float = None, activity: str = None,
                     body_temperature: float = None, battery_level: float = None):
        """Envía ubicación y datos del animal"""
        url = f"{self.server_url}/ngsi-ld/v1/entities/{self.entity_id}/attrs"
        
        data = {
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                }
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": datetime.utcnow().isoformat() + "Z"
                }
            }
        }
        
        if altitude is not None:
            data["altitude"] = {
                "type": "Property",
                "value": altitude,
                "unitCode": "MTR"
            }
        
        if speed is not None:
            data["speed"] = {
                "type": "Property",
                "value": speed,
                "unitCode": "KMH"
            }
        
        if activity is not None:
            data["activity"] = {
                "type": "Property",
                "value": activity
            }
        
        if body_temperature is not None:
            data["bodyTemperature"] = {
                "type": "Property",
                "value": body_temperature,
                "unitCode": "CEL"
            }
        
        if battery_level is not None:
            data["batteryLevel"] = {
                "type": "Property",
                "value": battery_level,
                "unitCode": "P1"
            }
        
        response = requests.post(url, json=data, headers=self.headers)
        return response.status_code in [200, 204]

# Uso
if __name__ == "__main__":
    tracker = LivestockTracker(
        api_key="TU_API_KEY",
        tenant_id="TU_TENANT_ID",
        animal_id="COW_001"
    )
    
    # Registrar animal (una vez)
    tracker.register_animal("Vaca 001", "Bos taurus", "Frisona", 42.571493, -2.028218, "HERD_A")
    
    # Enviar ubicación cada 5 minutos
    while True:
        # Leer datos del collar GPS (simulado)
        lat = 42.571493 + (time.time() % 100) / 10000
        lon = -2.028218 + (time.time() % 100) / 10000
        speed = 0.5
        activity = "grazing"
        body_temp = 38.5
        battery = 85.0
        
        tracker.send_location(
            lat, lon, speed=speed,
            activity=activity, body_temperature=body_temp,
            battery_level=battery
        )
        
        time.sleep(300)  # 5 minutos
```

---

## 🔧 Registro desde Dashboard

Los animales se pueden registrar desde el dashboard usando perfiles como:
- `livestock_gps_collar` - Collares GPS
- `milking_station` - Estaciones de ordeño
- `poultry_sensor` - Sensores de granjas avícolas

---

**Siguiente**: [Poultry Farms](./poultry-farms.md)

