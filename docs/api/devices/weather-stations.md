# 🌤️ Weather Stations - Estaciones Meteorológicas

## 📋 Visión General

Esta guía explica cómo integrar estaciones meteorológicas con Nekazari para capturar datos meteorológicos en tiempo real que son cruciales para la toma de decisiones agrícolas.

---

## 🎯 Casos de Uso

### Caso de Uso 1: Monitoreo Meteorológico para Riego

**Escenario**: Estación meteorológica automática que monitorea condiciones ambientales para optimizar el riego.

**Datos capturados**:
- Temperatura del aire
- Humedad relativa
- Precipitación acumulada
- Velocidad y dirección del viento
- Presión atmosférica
- Radiación solar
- Evapotranspiración potencial (ET0)

**Beneficios**:
- Optimización del riego según ET0
- Prevención de enfermedades fúngicas (humedad)
- Protección contra heladas (temperatura)
- Ahorro de agua

**Ejemplo de datos**:
```json
{
  "station_id": "WEATHER_STATION_001",
  "timestamp": "2025-11-14T12:00:00Z",
  "temperature": 18.5,
  "humidity": 65.0,
  "precipitation": 0.0,
  "wind_speed": 8.2,
  "wind_direction": 180,
  "pressure": 1013.25,
  "solar_radiation": 850.0,
  "et0": 3.5
}
```

---

### Caso de Uso 2: Alerta Temprana de Heladas

**Escenario**: Estación meteorológica con sensores de temperatura a diferentes alturas para detectar inversiones térmicas.

**Datos capturados**:
- Temperatura a 2m
- Temperatura a 0.5m (nivel del suelo)
- Humedad relativa
- Velocidad del viento
- Punto de rocío

**Beneficios**:
- Alertas tempranas de heladas
- Activación automática de sistemas antiheladas
- Protección de cultivos sensibles

---

### Caso de Uso 3: Monitoreo para Aplicación de Fitosanitarios

**Escenario**: Estación meteorológica que monitorea condiciones ideales para aplicación de fitosanitarios.

**Datos capturados**:
- Velocidad del viento (crítico para evitar deriva)
- Dirección del viento
- Temperatura
- Humedad relativa
- Condiciones de inversión térmica

**Beneficios**:
- Aplicación segura de fitosanitarios
- Cumplimiento de normativas
- Reducción de deriva
- Optimización de eficacia

---

## 📝 Ejemplo de Integración

```python
#!/usr/bin/env python3
"""
Weather Station Integration - Envía datos meteorológicos a Nekazari
"""

import requests
import time
from datetime import datetime

class WeatherStationClient:
    def __init__(self, api_key: str, tenant_id: str, station_id: str, server_url: str = "https://nekazari.robotika.cloud"):
        self.api_key = api_key
        self.tenant_id = tenant_id
        self.station_id = station_id
        self.server_url = server_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "Fiware-Service": tenant_id
        }
        self.entity_id = f"urn:ngsi-ld:WeatherObserved:{tenant_id}:{station_id}"
    
    def register_station(self, name: str, lat: float, lon: float):
        """Registra la estación meteorológica"""
        url = f"{self.server_url}/api/sensors/register"
        data = {
            "external_id": self.station_id,
            "name": name,
            "profile": "weather_station",
            "location": {
                "lat": lat,
                "lon": lon
            }
        }
        response = requests.post(url, json=data, headers=self.headers)
        return response.status_code == 201
    
    def send_weather_data(self, temperature: float, humidity: float, precipitation: float,
                         wind_speed: float, wind_direction: float, pressure: float,
                         solar_radiation: float = None, et0: float = None):
        """Envía datos meteorológicos"""
        url = f"{self.server_url}/ngsi-ld/v1/entities/{self.entity_id}/attrs"
        
        data = {
            "temperature": {
                "type": "Property",
                "value": temperature,
                "unitCode": "CEL"
            },
            "humidity": {
                "type": "Property",
                "value": humidity,
                "unitCode": "P1"
            },
            "precipitation": {
                "type": "Property",
                "value": precipitation,
                "unitCode": "MMT"
            },
            "windSpeed": {
                "type": "Property",
                "value": wind_speed,
                "unitCode": "MTS"
            },
            "windDirection": {
                "type": "Property",
                "value": wind_direction,
                "unitCode": "DD"
            },
            "atmosphericPressure": {
                "type": "Property",
                "value": pressure,
                "unitCode": "BAR"
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": datetime.utcnow().isoformat() + "Z"
                }
            }
        }
        
        if solar_radiation is not None:
            data["solarRadiation"] = {
                "type": "Property",
                "value": solar_radiation,
                "unitCode": "WMT"
            }
        
        if et0 is not None:
            data["et0"] = {
                "type": "Property",
                "value": et0,
                "unitCode": "MMT"
            }
        
        response = requests.post(url, json=data, headers=self.headers)
        return response.status_code in [200, 204]

# Uso
if __name__ == "__main__":
    client = WeatherStationClient(
        api_key="TU_API_KEY",
        tenant_id="TU_TENANT_ID",
        station_id="WEATHER_STATION_001"
    )
    
    # Registrar estación (una vez)
    client.register_station("Estación Meteorológica Principal", 42.571493, -2.028218)
    
    # Enviar datos cada 15 minutos
    while True:
        # Leer datos del sensor (simulado)
        temp = 18.5
        humidity = 65.0
        precipitation = 0.0
        wind_speed = 8.2
        wind_direction = 180
        pressure = 1013.25
        solar_radiation = 850.0
        et0 = 3.5
        
        client.send_weather_data(
            temp, humidity, precipitation,
            wind_speed, wind_direction, pressure,
            solar_radiation, et0
        )
        
        time.sleep(900)  # 15 minutos
```

---

## 🔧 Registro desde Dashboard

La estación meteorológica se puede registrar desde el dashboard usando el perfil `weather_station`.

---

**Siguiente**: [Livestock Tracking](./livestock-tracking.md)

