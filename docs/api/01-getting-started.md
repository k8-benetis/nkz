# 🚀 Getting Started - Nekazari Integration Standard

## 📋 Prerrequisitos

Antes de comenzar, necesitas:

1. ✅ **Cuenta de tenant** en Nekazari
2. ✅ **API Key** activa (obtenible desde Settings del dashboard)
3. ✅ **Tenant ID** (identificador único de tu tenant)
4. ✅ **Acceso a internet** desde tu dispositivo

---

## 🔑 Paso 1: Obtener Credenciales

### Desde el Dashboard

1. Accede a: `https://nekazari.robotika.cloud/settings`
2. Inicia sesión con tu cuenta
3. En la sección "API Key":
   - Si no tienes una: Haz clic en **"Crear API Key"**
   - Si ya tienes una: Puedes regenerarla con **"Regenerar API Key"**
4. ⚠️ **IMPORTANTE**: Copia la API Key completa inmediatamente (solo se muestra una vez)
5. Anota tu **Tenant ID** (aparece en "Información de Cuenta")

### Verificación Rápida

```bash
# Verificar que tienes API Key activa
curl -X GET https://nekazari.robotika.cloud/auth/api-key \
  -H "Authorization: Bearer TU_JWT_TOKEN"
```

---

## 📡 Paso 2: Registrar tu Dispositivo/Sensor

### Opción A: Desde el Dashboard (Recomendado para usuarios)

1. Accede al dashboard: `https://nekazari.robotika.cloud/dashboard`
2. Haz clic en **"Añadir Sensor"** o ve a `/sensors`
3. Completa el formulario:
   - **ID Externo**: Identificador único del dispositivo físico
   - **Nombre**: Nombre descriptivo
   - **Perfil SDM**: Selecciona el tipo de sensor
   - **Ubicación**: Coordenadas GPS (latitud, longitud)
   - **Estación** (opcional): Si el sensor pertenece a una estación
4. Haz clic en **"Guardar"**

### Opción B: Desde API (Recomendado para automatización)

```bash
curl -X POST https://nekazari.robotika.cloud/api/sensors/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TU_API_KEY_AQUI" \
  -H "Fiware-Service: TU_TENANT_ID_AQUI" \
  -d '{
    "external_id": "MI_SENSOR_001",
    "name": "Sensor Temperatura Principal",
    "profile": "temperature_sensor",
    "location": {
      "lat": 42.571493,
      "lon": -2.028218
    }
  }'
```

**Respuesta exitosa**:
```json
{
  "success": true,
  "sensor": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "external_id": "MI_SENSOR_001",
    "name": "Sensor Temperatura Principal",
    "profile": "temperature_sensor",
    "tenant_id": "tu-tenant-id",
    "created_at": "2025-11-14T15:30:00Z"
  },
  "orion_entity": {
    "id": "urn:ngsi-ld:AgriSensor:tu-tenant-id:MI_SENSOR_001",
    "type": "AgriSensor",
    "created": true
  },
  "message": "Sensor registered successfully"
}
```

**Guarda el `orion_entity.id`** - lo necesitarás para enviar datos.

---

## 📤 Paso 3: Enviar Datos de Telemetría

Una vez registrado el sensor, puedes empezar a enviar datos:

```bash
curl -X POST "https://nekazari.robotika.cloud/ngsi-ld/v1/entities/urn:ngsi-ld:AgriSensor:tu-tenant-id:MI_SENSOR_001/attrs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TU_API_KEY_AQUI" \
  -H "Fiware-Service: TU_TENANT_ID_AQUI" \
  -d '{
    "temperature": {
      "type": "Property",
      "value": 25.5,
      "unitCode": "CEL"
    },
    "humidity": {
      "type": "Property",
      "value": 60.0,
      "unitCode": "P1"
    },
    "timestamp": {
      "type": "Property",
      "value": {
        "@type": "DateTime",
        "@value": "2025-11-14T15:30:00Z"
      }
    }
  }'
```

---

## 🔍 Paso 4: Verificar Datos

### Desde el Dashboard

1. Ve a `https://nekazari.robotika.cloud/dashboard`
2. Los sensores aparecerán automáticamente
3. Los datos se actualizan en tiempo real

### Desde API

```bash
curl -X GET "https://nekazari.robotika.cloud/ngsi-ld/v1/entities?type=AgriSensor&limit=10" \
  -H "X-API-Key: TU_API_KEY_AQUI" \
  -H "Fiware-Service: TU_TENANT_ID_AQUI" \
  -H "Accept: application/json"
```

---

## 📝 Ejemplo Completo (Python)

```python
import requests
import time
from datetime import datetime

# Configuración
API_KEY = "TU_API_KEY_AQUI"
TENANT_ID = "TU_TENANT_ID_AQUI"
BASE_URL = "https://nekazari.robotika.cloud"

# 1. Registrar sensor (solo una vez)
def register_sensor():
    url = f"{BASE_URL}/api/sensors/register"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "Fiware-Service": TENANT_ID
    }
    data = {
        "external_id": "MI_SENSOR_001",
        "name": "Sensor Temperatura Principal",
        "profile": "temperature_sensor",
        "location": {
            "lat": 42.571493,
            "lon": -2.028218
        }
    }
    
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 201:
        result = response.json()
        print(f"Sensor registrado: {result['sensor']['external_id']}")
        return result['orion_entity']['id']
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return None

# 2. Enviar datos (continuo)
def send_telemetry(entity_id, temperature, humidity):
    url = f"{BASE_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "Fiware-Service": TENANT_ID
    }
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
        "timestamp": {
            "type": "Property",
            "value": {
                "@type": "DateTime",
                "@value": datetime.utcnow().isoformat() + "Z"
            }
        }
    }
    
    response = requests.post(url, json=data, headers=headers)
    if response.status_code in [200, 204]:
        print(f"Datos enviados: {temperature}°C, {humidity}%")
    else:
        print(f"Error: {response.status_code} - {response.text}")

# Uso
if __name__ == "__main__":
    # Registrar sensor (solo una vez)
    entity_id = register_sensor()
    
    if entity_id:
        # Enviar datos cada 60 segundos
        while True:
            # Simular lectura de sensor
            temp = 20 + (time.time() % 10)  # 20-30°C
            humidity = 50 + (time.time() % 20)  # 50-70%
            
            send_telemetry(entity_id, temp, humidity)
            time.sleep(60)  # Esperar 60 segundos
```

---

## 🎯 Próximos Pasos

1. **Elige tu tipo de dispositivo**: Ve a la sección correspondiente en `devices/`
2. **Consulta ejemplos específicos**: Revisa `examples/` para código de ejemplo
3. **Lee la referencia de API**: Consulta `api-reference.md` para detalles técnicos

---

## ❓ Preguntas Frecuentes

### ¿Puedo registrar múltiples sensores?
Sí, puedes registrar tantos sensores como necesites. Cada uno debe tener un `external_id` único.

### ¿Qué pasa si pierdo mi API Key?
Puedes regenerarla desde el dashboard en Settings. La API Key anterior quedará invalidada.

### ¿Con qué frecuencia debo enviar datos?
Depende de tu caso de uso. Para sensores ambientales, típicamente cada 5-60 minutos. Para telemetría de maquinaria, puede ser cada segundo.

### ¿Hay límites de rate?
Sí, hay rate limiting configurado. Consulta `error-handling.md` para más detalles.

---

**Siguiente**: [Authentication](./02-authentication.md)

