# 🚜 ISOBUS Tractors - Integración de Maquinaria Agrícola

## 📋 Visión General

Esta guía explica cómo integrar tractores y maquinaria agrícola con protocolo **ISOBUS** (ISO 11783) con Nekazari para capturar y analizar datos de operaciones agrícolas en tiempo real.

---

## 🎯 ¿Qué es ISOBUS?

**ISOBUS** (ISO 11783) es un estándar internacional que permite la comunicación entre tractores y sus implementos agrícolas mediante un bus de datos común. Permite:

- ✅ Intercambio de datos entre tractor e implementos
- ✅ Control remoto de implementos desde la cabina
- ✅ Telemetría en tiempo real
- ✅ Registro de operaciones agrícolas
- ✅ Gestión de datos de siembra, fertilización, pulverización, etc.

---

## 🎯 Casos de Uso

### Caso de Uso 1: Siembra de Precisión

**Escenario**: Tractor con sembradora ISOBUS realizando siembra de maíz.

**Datos capturados**:
- Posición GPS del tractor
- Velocidad de avance
- Profundidad de siembra
- Espaciado entre semillas
- Cantidad de semillas sembradas por hectárea
- Estado de cada línea de siembra
- Consumo de combustible

**Beneficios**:
- Trazabilidad completa de la siembra
- Optimización de densidad de siembra
- Detección de fallos en tiempo real
- Análisis de eficiencia por parcela

**Ejemplo de datos**:
```json
{
  "tractor_id": "TRACTOR_001",
  "operation": "seeding",
  "timestamp": "2025-11-14T10:30:00Z",
  "position": {
    "lat": 42.571493,
    "lon": -2.028218
  },
  "speed": 8.5,
  "seeding_data": {
    "depth": 3.5,
    "spacing": 0.20,
    "seeds_per_hectare": 75000,
    "active_rows": 12,
    "total_rows": 12
  },
  "fuel_consumption": 12.5
}
```

---

### Caso de Uso 2: Fertilización Variable

**Escenario**: Tractor con esparcidor de fertilizante ISOBUS aplicando fertilizante según mapa de prescripción.

**Datos capturados**:
- Posición GPS
- Tasa de aplicación (kg/ha)
- Tipo de fertilizante (N, P, K)
- Ancho de trabajo
- Estado del sistema de aplicación
- Consumo de fertilizante

**Beneficios**:
- Aplicación precisa según necesidades del suelo
- Reducción de costos de fertilizante
- Cumplimiento de normativas ambientales
- Trazabilidad de aplicaciones

**Ejemplo de datos**:
```json
{
  "tractor_id": "TRACTOR_002",
  "operation": "fertilization",
  "timestamp": "2025-11-14T14:15:00Z",
  "position": {
    "lat": 42.572000,
    "lon": -2.029000
  },
  "application_rate": 150.0,
  "fertilizer_type": "NPK_15_15_15",
  "working_width": 24.0,
  "fertilizer_consumption": 45.2,
  "prescription_map_id": "PRESCRIPTION_2025_001"
}
```

---

### Caso de Uso 3: Pulverización de Precisión

**Escenario**: Tractor con pulverizador ISOBUS aplicando fitosanitarios.

**Datos capturados**:
- Posición GPS
- Presión de pulverización
- Volumen aplicado (L/ha)
- Velocidad del viento
- Temperatura ambiente
- Humedad relativa
- Estado de boquillas

**Beneficios**:
- Aplicación precisa según condiciones meteorológicas
- Reducción de deriva
- Cumplimiento de normativas de aplicación
- Registro para auditorías

**Ejemplo de datos**:
```json
{
  "tractor_id": "TRACTOR_003",
  "operation": "spraying",
  "timestamp": "2025-11-14T16:00:00Z",
  "position": {
    "lat": 42.573000,
    "lon": -2.030000
  },
  "spray_pressure": 3.5,
  "application_volume": 200.0,
  "wind_speed": 8.2,
  "wind_direction": 180,
  "temperature": 18.5,
  "humidity": 65.0,
  "nozzle_status": {
    "active": 24,
    "total": 24,
    "blocked": 0
  },
  "product_applied": "HERBICIDE_GLYPHOSATE"
}
```

---

### Caso de Uso 4: Cosecha con Monitor de Rendimiento

**Escenario**: Cosechadora con monitor de rendimiento ISOBUS.

**Datos capturados**:
- Posición GPS
- Rendimiento (kg/ha)
- Humedad del grano (%)
- Velocidad de cosecha
- Ancho de corte
- Pérdidas de cosecha
- Estado del motor

**Beneficios**:
- Mapas de rendimiento por parcela
- Optimización de momento de cosecha
- Detección de problemas en el campo
- Análisis de variabilidad

**Ejemplo de datos**:
```json
{
  "tractor_id": "HARVESTER_001",
  "operation": "harvesting",
  "timestamp": "2025-11-14T11:00:00Z",
  "position": {
    "lat": 42.574000,
    "lon": -2.031000
  },
  "yield": 8500.0,
  "grain_moisture": 14.5,
  "harvest_speed": 6.2,
  "cutting_width": 9.0,
  "grain_losses": 2.5,
  "engine_rpm": 2100,
  "fuel_level": 45.0
}
```

---

### Caso de Uso 5: Labranza con Control de Profundidad

**Escenario**: Tractor con arado o cultivador con control automático de profundidad ISOBUS.

**Datos capturados**:
- Posición GPS
- Profundidad de trabajo
- Velocidad de trabajo
- Resistencia del suelo
- Consumo de combustible
- Horas de trabajo

**Beneficios**:
- Control preciso de profundidad
- Optimización de consumo de combustible
- Análisis de resistencia del suelo
- Mantenimiento predictivo

**Ejemplo de datos**:
```json
{
  "tractor_id": "TRACTOR_004",
  "operation": "tillage",
  "timestamp": "2025-11-14T09:00:00Z",
  "position": {
    "lat": 42.575000,
    "lon": -2.032000
  },
  "working_depth": 25.0,
  "working_speed": 7.5,
  "soil_resistance": 2.8,
  "fuel_consumption": 15.2,
  "working_hours": 1250.5,
  "implement_type": "PLOW"
}
```

---

## 🔧 Arquitectura de Integración ISOBUS

### Componentes del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    Tractor + Implemento                  │
│                                                          │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Terminal   │◄───────►│  Implemento  │             │
│  │   Virtual    │  ISOBUS │   ISOBUS     │             │
│  │   (VT)       │         │              │             │
│  └──────┬───────┘         └──────────────┘             │
│         │                                                 │
│         │ Datos ISOBUS (ISO-XML, Binary)                │
│         │                                                 │
└─────────┼─────────────────────────────────────────────────┘
          │
          │ HTTP/HTTPS + API Key
          │
┌─────────▼─────────────────────────────────────────────────┐
│              Gateway ISOBUS → Nekazari                    │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Parser ISOBUS                                    │   │
│  │  - ISO-XML                                        │   │
│  │  - Binary Data                                    │   │
│  │  - Task Controller                                │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Mapper ISOBUS → NGSI-LD                          │   │
│  │  - Tractor → AgriculturalRobot                    │   │
│  │  - Operation → AgriOperation                      │   │
│  │  - Data → Sensor Data                             │   │
│  └────────────────────────────────────────────────────┘   │
└─────────┬─────────────────────────────────────────────────┘
          │
          │ POST /ngsi-ld/v1/entities
          │
┌─────────▼─────────────────────────────────────────────────┐
│                    Nekazari Platform                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ API Validator│  │ Orion-LD     │  │ Dashboard    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└───────────────────────────────────────────────────────────┘
```

---

## 📝 Implementación: Gateway ISOBUS → Nekazari

### Opción 1: Gateway en PC/Tablet en el Tractor

Un PC o tablet conectado al terminal virtual ISOBUS del tractor actúa como gateway.

**Ventajas**:
- ✅ Acceso directo a datos ISOBUS
- ✅ Procesamiento en tiempo real
- ✅ Funciona sin conexión (buffer local)
- ✅ Sincronización cuando hay conexión

**Desventajas**:
- ⚠️ Requiere hardware adicional
- ⚠️ Necesita software específico

### Opción 2: Gateway en Cloud (si el tractor tiene conectividad)

El tractor envía datos ISOBUS directamente a un gateway en la nube.

**Ventajas**:
- ✅ No requiere hardware adicional en el tractor
- ✅ Procesamiento centralizado
- ✅ Escalable

**Desventajas**:
- ⚠️ Requiere conectividad constante
- ⚠️ Depende del fabricante del tractor

---

## 🔌 Ejemplo de Implementación: Gateway Python

### Código del Gateway ISOBUS

```python
#!/usr/bin/env python3
"""
ISOBUS Gateway - Convierte datos ISOBUS a NGSI-LD y los envía a Nekazari
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Optional
import xml.etree.ElementTree as ET  # Para ISO-XML

class ISOBUSGateway:
    """Gateway que convierte datos ISOBUS a NGSI-LD"""
    
    def __init__(self, api_key: str, tenant_id: str, server_url: str = "https://nekazari.robotika.cloud"):
        self.api_key = api_key
        self.tenant_id = tenant_id
        self.server_url = server_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "Fiware-Service": tenant_id
        }
    
    def parse_isobus_xml(self, xml_data: str) -> Dict:
        """Parsea datos ISO-XML a diccionario Python"""
        try:
            root = ET.fromstring(xml_data)
            # Mapear elementos ISO-XML a estructura Python
            data = {}
            
            # Ejemplo: parsear datos de siembra
            if root.tag == "Task":
                data["operation"] = "seeding"
                data["tractor_id"] = root.find("Device").get("id") if root.find("Device") is not None else None
                # ... más parsing según estructura ISO-XML
                
            return data
        except Exception as e:
            print(f"Error parsing ISO-XML: {e}")
            return {}
    
    def map_isobus_to_ngsi_ld(self, isobus_data: Dict, operation_type: str) -> Dict:
        """Mapea datos ISOBUS a formato NGSI-LD"""
        
        # Mapeo base según tipo de operación
        if operation_type == "seeding":
            return self._map_seeding_to_ngsi_ld(isobus_data)
        elif operation_type == "fertilization":
            return self._map_fertilization_to_ngsi_ld(isobus_data)
        elif operation_type == "spraying":
            return self._map_spraying_to_ngsi_ld(isobus_data)
        elif operation_type == "harvesting":
            return self._map_harvesting_to_ngsi_ld(isobus_data)
        elif operation_type == "tillage":
            return self._map_tillage_to_ngsi_ld(isobus_data)
        else:
            return self._map_generic_to_ngsi_ld(isobus_data)
    
    def _map_seeding_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapea datos de siembra a NGSI-LD"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "operationType": {
                "type": "Property",
                "value": "seeding"
            },
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "speed": {
                "type": "Property",
                "value": data.get("speed", 0),
                "unitCode": "KMH"
            },
            "seedingDepth": {
                "type": "Property",
                "value": data.get("seeding_data", {}).get("depth", 0),
                "unitCode": "CMT"
            },
            "seedingSpacing": {
                "type": "Property",
                "value": data.get("seeding_data", {}).get("spacing", 0),
                "unitCode": "MTR"
            },
            "seedsPerHectare": {
                "type": "Property",
                "value": data.get("seeding_data", {}).get("seeds_per_hectare", 0)
            },
            "activeRows": {
                "type": "Property",
                "value": data.get("seeding_data", {}).get("active_rows", 0)
            },
            "fuelConsumption": {
                "type": "Property",
                "value": data.get("fuel_consumption", 0),
                "unitCode": "LTR"
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def _map_fertilization_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapea datos de fertilización a NGSI-LD"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "operationType": {
                "type": "Property",
                "value": "fertilization"
            },
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "applicationRate": {
                "type": "Property",
                "value": data.get("application_rate", 0),
                "unitCode": "KGM"
            },
            "fertilizerType": {
                "type": "Property",
                "value": data.get("fertilizer_type", "UNKNOWN")
            },
            "workingWidth": {
                "type": "Property",
                "value": data.get("working_width", 0),
                "unitCode": "MTR"
            },
            "fertilizerConsumption": {
                "type": "Property",
                "value": data.get("fertilizer_consumption", 0),
                "unitCode": "KGM"
            },
            "prescriptionMapId": {
                "type": "Property",
                "value": data.get("prescription_map_id", "")
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def _map_spraying_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapea datos de pulverización a NGSI-LD"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "operationType": {
                "type": "Property",
                "value": "spraying"
            },
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "sprayPressure": {
                "type": "Property",
                "value": data.get("spray_pressure", 0),
                "unitCode": "BAR"
            },
            "applicationVolume": {
                "type": "Property",
                "value": data.get("application_volume", 0),
                "unitCode": "LTR"
            },
            "windSpeed": {
                "type": "Property",
                "value": data.get("wind_speed", 0),
                "unitCode": "MTS"
            },
            "windDirection": {
                "type": "Property",
                "value": data.get("wind_direction", 0),
                "unitCode": "DD"
            },
            "temperature": {
                "type": "Property",
                "value": data.get("temperature", 0),
                "unitCode": "CEL"
            },
            "humidity": {
                "type": "Property",
                "value": data.get("humidity", 0),
                "unitCode": "P1"
            },
            "productApplied": {
                "type": "Property",
                "value": data.get("product_applied", "UNKNOWN")
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def _map_harvesting_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapea datos de cosecha a NGSI-LD"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "operationType": {
                "type": "Property",
                "value": "harvesting"
            },
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "yield": {
                "type": "Property",
                "value": data.get("yield", 0),
                "unitCode": "KGM"
            },
            "grainMoisture": {
                "type": "Property",
                "value": data.get("grain_moisture", 0),
                "unitCode": "P1"
            },
            "harvestSpeed": {
                "type": "Property",
                "value": data.get("harvest_speed", 0),
                "unitCode": "KMH"
            },
            "cuttingWidth": {
                "type": "Property",
                "value": data.get("cutting_width", 0),
                "unitCode": "MTR"
            },
            "grainLosses": {
                "type": "Property",
                "value": data.get("grain_losses", 0),
                "unitCode": "P1"
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def _map_tillage_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapea datos de labranza a NGSI-LD"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "operationType": {
                "type": "Property",
                "value": "tillage"
            },
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "workingDepth": {
                "type": "Property",
                "value": data.get("working_depth", 0),
                "unitCode": "CMT"
            },
            "workingSpeed": {
                "type": "Property",
                "value": data.get("working_speed", 0),
                "unitCode": "KMH"
            },
            "soilResistance": {
                "type": "Property",
                "value": data.get("soil_resistance", 0),
                "unitCode": "KGM"
            },
            "fuelConsumption": {
                "type": "Property",
                "value": data.get("fuel_consumption", 0),
                "unitCode": "LTR"
            },
            "implementType": {
                "type": "Property",
                "value": data.get("implement_type", "UNKNOWN")
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def _map_generic_to_ngsi_ld(self, data: Dict) -> Dict:
        """Mapeo genérico para datos ISOBUS no específicos"""
        entity_id = f"urn:ngsi-ld:AgriOperation:{self.tenant_id}:{data.get('tractor_id', 'UNKNOWN')}_{int(time.time())}"
        
        return {
            "id": entity_id,
            "type": "AgriOperation",
            "tractorId": {
                "type": "Property",
                "value": data.get("tractor_id", "UNKNOWN")
            },
            "location": {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": [
                        data.get("position", {}).get("lon", 0),
                        data.get("position", {}).get("lat", 0)
                    ]
                }
            },
            "rawData": {
                "type": "Property",
                "value": data
            },
            "timestamp": {
                "type": "Property",
                "value": {
                    "@type": "DateTime",
                    "@value": data.get("timestamp", datetime.utcnow().isoformat() + "Z")
                }
            }
        }
    
    def send_to_nekazari(self, ngsi_ld_entity: Dict) -> bool:
        """Envía entidad NGSI-LD a Nekazari"""
        url = f"{self.server_url}/ngsi-ld/v1/entities"
        
        try:
            response = requests.post(url, json=ngsi_ld_entity, headers=self.headers, timeout=10)
            if response.status_code in [200, 201]:
                print(f"✅ Datos ISOBUS enviados: {ngsi_ld_entity.get('id')}")
                return True
            elif response.status_code == 409:
                # Entidad ya existe, actualizar atributos
                entity_id = ngsi_ld_entity.get("id")
                update_url = f"{self.server_url}/ngsi-ld/v1/entities/{entity_id}/attrs"
                update_data = {k: v for k, v in ngsi_ld_entity.items() if k not in ["id", "type"]}
                response = requests.patch(update_url, json=update_data, headers=self.headers, timeout=10)
                if response.status_code in [200, 204]:
                    print(f"✅ Datos ISOBUS actualizados: {entity_id}")
                    return True
            else:
                print(f"❌ Error enviando datos: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error de conexión: {e}")
            return False
    
    def process_isobus_data(self, isobus_data: Dict, operation_type: str):
        """Procesa datos ISOBUS y los envía a Nekazari"""
        # Mapear a NGSI-LD
        ngsi_ld_entity = self.map_isobus_to_ngsi_ld(isobus_data, operation_type)
        
        # Enviar a Nekazari
        return self.send_to_nekazari(ngsi_ld_entity)

# Ejemplo de uso
if __name__ == "__main__":
    # Configuración
    gateway = ISOBUSGateway(
        api_key="TU_API_KEY_AQUI",
        tenant_id="TU_TENANT_ID_AQUI"
    )
    
    # Ejemplo: Datos de siembra
    seeding_data = {
        "tractor_id": "TRACTOR_001",
        "operation": "seeding",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "position": {
            "lat": 42.571493,
            "lon": -2.028218
        },
        "speed": 8.5,
        "seeding_data": {
            "depth": 3.5,
            "spacing": 0.20,
            "seeds_per_hectare": 75000,
            "active_rows": 12,
            "total_rows": 12
        },
        "fuel_consumption": 12.5
    }
    
    # Procesar y enviar
    gateway.process_isobus_data(seeding_data, "seeding")
```

---

## 🔧 Registro del Tractor

Antes de enviar datos de operaciones, registra el tractor como dispositivo:

```bash
curl -X POST https://nekazari.robotika.cloud/api/sensors/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TU_API_KEY_AQUI" \
  -H "Fiware-Service: TU_TENANT_ID_AQUI" \
  -d '{
    "external_id": "TRACTOR_001",
    "name": "Tractor John Deere 6130M",
    "profile": "agricultural_tractor",
    "location": {
      "lat": 42.571493,
      "lon": -2.028218
    },
    "metadata": {
      "brand": "John Deere",
      "model": "6130M",
      "year": 2020,
      "isobus_compatible": true
    }
  }'
```

---

## 📊 Tipos de Operaciones Soportadas

### Operaciones Agrícolas Principales

| Operación | Tipo NGSI-LD | Descripción |
|-----------|--------------|-------------|
| **Seeding** | `AgriOperation` | Siembra de semillas |
| **Fertilization** | `AgriOperation` | Aplicación de fertilizantes |
| **Spraying** | `AgriOperation` | Pulverización de fitosanitarios |
| **Harvesting** | `AgriOperation` | Cosecha de cultivos |
| **Tillage** | `AgriOperation` | Labranza del suelo |
| **Irrigation** | `AgriOperation` | Riego |
| **Planting** | `AgriOperation` | Plantación |

---

## 🔌 Integración con Terminales Virtuales ISOBUS

### Terminales Virtuales Comunes

- **AgCommand** (Ag Leader)
- **Field-IQ** (Trimble)
- **Apex** (Raven)
- **GreenStar** (John Deere)
- **AutoGuide** (Case IH)

### Formato de Datos

Los datos ISOBUS pueden venir en diferentes formatos:

1. **ISO-XML**: Formato XML estándar
2. **Binary Data**: Datos binarios del bus ISOBUS
3. **Task Controller**: Datos del controlador de tareas
4. **Proprietary Formats**: Formatos propietarios de cada fabricante

---

## ⚠️ Consideraciones Importantes

### Conectividad

- ✅ **Modo Online**: Envío en tiempo real (requiere conexión constante)
- ✅ **Modo Offline**: Buffer local y sincronización posterior
- ✅ **Modo Híbrido**: Buffer local + sincronización periódica

### Frecuencia de Envío

- **Tiempo Real**: Cada 1-5 segundos (para operaciones críticas)
- **Periódico**: Cada 30-60 segundos (para operaciones normales)
- **Por Evento**: Cuando ocurre un evento significativo (cambio de parcela, fin de operación)

### Volumen de Datos

Las operaciones agrícolas pueden generar grandes volúmenes de datos:
- **Siembra**: ~100-500 puntos por hectárea
- **Fertilización**: ~50-200 puntos por hectárea
- **Cosecha**: ~200-1000 puntos por hectárea

Considera implementar:
- ✅ Agregación de datos
- ✅ Filtrado de puntos redundantes
- ✅ Compresión de datos
- ✅ Envío por lotes

---

## 🎯 Beneficios de la Integración ISOBUS

### Para el Agricultor

- ✅ **Trazabilidad completa** de todas las operaciones
- ✅ **Análisis de eficiencia** por parcela y operación
- ✅ **Optimización de recursos** (combustible, fertilizante, semillas)
- ✅ **Cumplimiento normativo** automático
- ✅ **Toma de decisiones** basada en datos

### Para la Explotación

- ✅ **Gestión centralizada** de toda la maquinaria
- ✅ **Análisis comparativo** entre operadores
- ✅ **Planificación mejorada** basada en datos históricos
- ✅ **Mantenimiento predictivo** basado en horas de trabajo y consumo
- ✅ **ROI mejorado** de la maquinaria

---

## 📝 Ejemplo Completo: Flujo de Siembra

```python
# 1. Registrar tractor (una vez)
gateway.register_tractor("TRACTOR_001", "John Deere 6130M", 42.571493, -2.028218)

# 2. Durante la operación de siembra (cada 5 segundos)
while seeding_operation_active:
    # Leer datos del terminal ISOBUS
    isobus_data = read_from_isobus_terminal()
    
    # Procesar y enviar
    gateway.process_isobus_data(isobus_data, "seeding")
    
    time.sleep(5)  # Esperar 5 segundos

# 3. Al finalizar la operación
final_data = {
    "tractor_id": "TRACTOR_001",
    "operation": "seeding",
    "status": "completed",
    "total_area": 25.5,  # hectáreas
    "total_seeds": 1912500,
    "duration": 18000  # segundos
}
gateway.process_isobus_data(final_data, "seeding")
```

---

## 🔗 Recursos Adicionales

- **ISO 11783 Standard**: Documentación oficial del estándar ISOBUS
- **AEF (Agricultural Industry Electronics Foundation)**: Organización que promueve ISOBUS
- **ISOBUS Database**: Base de datos de implementos compatibles

---

**Siguiente**: [Weather Stations](./weather-stations.md)

