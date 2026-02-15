# 💻 Remote PCs - Integración de PCs Remotos

## 📋 Visión General

Esta guía explica cómo integrar PCs remotos con sensores conectados para enviar datos a Nekazari. Ideal para:

- ✅ Estaciones de monitoreo con múltiples sensores
- ✅ PCs con tarjetas de adquisición de datos
- ✅ Sistemas de control industrial
- ✅ Gateways de datos

---

## 🎯 Caso de Uso: PC Remoto con Sensores

### Escenario Típico

Un PC remoto en una explotación agrícola que:
- Lee datos de múltiples sensores conectados
- Procesa y agrega los datos
- Envía datos a Nekazari periódicamente
- Funciona de forma autónoma sin supervisión constante

---

## 🔧 Configuración Inicial

### 1. Obtener Credenciales

```bash
# Verificar configuración del tenant
./scripts/verify-tenant-sensor-setup.sh tu_email@ejemplo.com
```

Esto te mostrará:
- Tenant ID
- Instrucciones para obtener API Key
- Información de configuración

### 2. Instalar Dependencias (Python)

```bash
pip install requests python-dateutil
```

### 3. Configurar Variables de Entorno

Crea un archivo `.env`:

```bash
NEKAZARI_API_KEY=tu_api_key_aqui
NEKAZARI_TENANT_ID=tu_tenant_id_aqui
NEKAZARI_SERVER_URL=https://nekazari.robotika.cloud
```

---

## 📝 Ejemplo Completo: Python

### Código Principal

```python
#!/usr/bin/env python3
"""
Nekazari Remote PC Sensor Client
Envía datos de sensores desde un PC remoto a Nekazari
"""

import os
import time
import json
import requests
from datetime import datetime
from typing import Dict, List, Optional

class NekazariClient:
    """Cliente para enviar datos a Nekazari"""
    
    def __init__(self, api_key: str, tenant_id: str, server_url: str = "https://nekazari.robotika.cloud"):
        self.api_key = api_key
        self.tenant_id = tenant_id
        self.server_url = server_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "Fiware-Service": tenant_id
        }
    
    def register_sensor(self, external_id: str, name: str, profile: str, 
                       lat: float, lon: float, station_id: Optional[str] = None) -> Optional[str]:
        """Registra un sensor en Nekazari"""
        url = f"{self.server_url}/api/sensors/register"
        
        data = {
            "external_id": external_id,
            "name": name,
            "profile": profile,
            "location": {
                "lat": lat,
                "lon": lon
            }
        }
        
        if station_id:
            data["station_id"] = station_id
        
        try:
            response = requests.post(url, json=data, headers=self.headers, timeout=10)
            if response.status_code == 201:
                result = response.json()
                entity_id = result.get('orion_entity', {}).get('id')
                print(f"✅ Sensor registrado: {external_id} -> {entity_id}")
                return entity_id
            elif response.status_code == 409:
                print(f"⚠️ Sensor ya existe: {external_id}")
                # Construir Entity ID manualmente
                return f"urn:ngsi-ld:AgriSensor:{self.tenant_id}:{external_id}"
            else:
                print(f"❌ Error registrando sensor: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"❌ Error de conexión: {e}")
            return None
    
    def send_telemetry(self, entity_id: str, data: Dict) -> bool:
        """Envía datos de telemetría a Nekazari"""
        url = f"{self.server_url}/ngsi-ld/v1/entities/{entity_id}/attrs"
        
        # Agregar timestamp si no existe
        if "timestamp" not in data:
            data["timestamp"] = {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": datetime.utcnow().isoformat() + "Z"
                }
            }
        
        try:
            response = requests.post(url, json=data, headers=self.headers, timeout=10)
            if response.status_code in [200, 204]:
                return True
            else:
                print(f"❌ Error enviando datos: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error de conexión: {e}")
            return False

class SensorReader:
    """Lee datos de sensores físicos"""
    
    def __init__(self):
        # Aquí inicializarías tus sensores reales
        # Ejemplo: conexiones serial, GPIO, etc.
        pass
    
    def read_temperature(self) -> Optional[float]:
        """Lee temperatura (ejemplo)"""
        # Implementar lectura real del sensor
        import random
        return 20 + random.uniform(-2, 2)  # Simulado
    
    def read_humidity(self) -> Optional[float]:
        """Lee humedad (ejemplo)"""
        # Implementar lectura real del sensor
        import random
        return 60 + random.uniform(-5, 5)  # Simulado
    
    def read_soil_moisture(self) -> Optional[float]:
        """Lee humedad del suelo (ejemplo)"""
        # Implementar lectura real del sensor
        import random
        return 50 + random.uniform(-10, 10)  # Simulado

def main():
    """Función principal"""
    # Cargar configuración
    api_key = os.getenv("NEKAZARI_API_KEY")
    tenant_id = os.getenv("NEKAZARI_TENANT_ID")
    server_url = os.getenv("NEKAZARI_SERVER_URL", "https://nekazari.robotika.cloud")
    
    if not api_key or not tenant_id:
        print("❌ Error: Configura NEKAZARI_API_KEY y NEKAZARI_TENANT_ID")
        return
    
    # Inicializar cliente y lector de sensores
    client = NekazariClient(api_key, tenant_id, server_url)
    sensor_reader = SensorReader()
    
    # Configuración de sensores
    sensors = [
        {
            "external_id": "PC_REMOTO_TEMP_001",
            "name": "Sensor Temperatura PC Remoto",
            "profile": "temperature_sensor",
            "lat": 42.571493,
            "lon": -2.028218,
            "station_id": "PC_REMOTO_ESTACION"
        },
        {
            "external_id": "PC_REMOTO_HUM_001",
            "name": "Sensor Humedad PC Remoto",
            "profile": "humidity_sensor",
            "lat": 42.571493,
            "lon": -2.028218,
            "station_id": "PC_REMOTO_ESTACION"
        },
        {
            "external_id": "PC_REMOTO_SOIL_001",
            "name": "Sensor Humedad Suelo PC Remoto",
            "profile": "soil_moisture_sensor",
            "lat": 42.571493,
            "lon": -2.028218,
            "station_id": "PC_REMOTO_ESTACION"
        }
    ]
    
    # Registrar sensores (solo una vez)
    entity_ids = {}
    for sensor in sensors:
        entity_id = client.register_sensor(**sensor)
        if entity_id:
            entity_ids[sensor["external_id"]] = entity_id
    
    # Loop principal: enviar datos cada 60 segundos
    print("🚀 Iniciando envío de datos...")
    while True:
        try:
            # Leer sensores
            temp = sensor_reader.read_temperature()
            humidity = sensor_reader.read_humidity()
            soil_moisture = sensor_reader.read_soil_moisture()
            
            # Enviar datos de temperatura
            if temp is not None and "PC_REMOTO_TEMP_001" in entity_ids:
                client.send_telemetry(entity_ids["PC_REMOTO_TEMP_001"], {
                    "temperature": {
                        "type": "Property",
                        "value": temp,
                        "unitCode": "CEL"
                    }
                })
            
            # Enviar datos de humedad
            if humidity is not None and "PC_REMOTO_HUM_001" in entity_ids:
                client.send_telemetry(entity_ids["PC_REMOTO_HUM_001"], {
                    "humidity": {
                        "type": "Property",
                        "value": humidity,
                        "unitCode": "P1"
                    }
                })
            
            # Enviar datos de humedad del suelo
            if soil_moisture is not None and "PC_REMOTO_SOIL_001" in entity_ids:
                client.send_telemetry(entity_ids["PC_REMOTO_SOIL_001"], {
                    "soilMoisture": {
                        "type": "Property",
                        "value": soil_moisture,
                        "unitCode": "P1"
                    }
                })
            
            print(f"✅ Datos enviados: {datetime.now().isoformat()}")
            
        except KeyboardInterrupt:
            print("\n🛑 Deteniendo...")
            break
        except Exception as e:
            print(f"❌ Error: {e}")
        
        time.sleep(60)  # Esperar 60 segundos

if __name__ == "__main__":
    main()
```

---

## 🔧 Configuración como Servicio (Linux)

### Crear servicio systemd

`/etc/systemd/system/nekazari-sensor-client.service`:

```ini
[Unit]
Description=Nekazari Sensor Client
After=network.target

[Service]
Type=simple
User=tu_usuario
WorkingDirectory=/ruta/a/tu/script
Environment="NEKAZARI_API_KEY=tu_api_key"
Environment="NEKAZARI_TENANT_ID=tu_tenant_id"
Environment="NEKAZARI_SERVER_URL=https://nekazari.robotika.cloud"
ExecStart=/usr/bin/python3 /ruta/a/tu/script/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Activar servicio

```bash
sudo systemctl enable nekazari-sensor-client
sudo systemctl start nekazari-sensor-client
sudo systemctl status nekazari-sensor-client
```

---

## 📊 Ejemplo con Múltiples Sensores

```python
# Configuración de múltiples sensores
sensors_config = [
    {
        "external_id": "SENSOR_001",
        "read_function": sensor_reader.read_temperature,
        "entity_id_key": "TEMP_001",
        "data_mapper": lambda v: {
            "temperature": {
                "type": "Property",
                "value": v,
                "unitCode": "CEL"
            }
        }
    },
    # ... más sensores
]

# Enviar datos de todos los sensores
for sensor in sensors_config:
    value = sensor["read_function"]()
    if value is not None:
        entity_id = entity_ids[sensor["entity_id_key"]]
        data = sensor["data_mapper"](value)
        client.send_telemetry(entity_id, data)
```

---

## ⚠️ Troubleshooting

### Error de Conexión
- Verifica conectividad a internet
- Verifica que el servidor está accesible
- Revisa firewall y proxies

### Datos no se envían
- Verifica API Key y Tenant ID
- Verifica que los sensores están registrados
- Revisa logs del script

### Sensores no registrados
- Ejecuta el registro de sensores primero
- Verifica que el perfil del sensor existe
- Revisa respuesta del servidor

---

**Siguiente**: [ISOBUS Tractors](./isobus-tractors.md)

