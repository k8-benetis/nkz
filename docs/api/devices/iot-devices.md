# 📱 IoT Devices - ESP32, Arduino, Raspberry Pi

## 📋 Visión General

Esta guía explica cómo integrar dispositivos IoT (ESP32, Arduino, Raspberry Pi) con Nekazari para enviar datos de sensores en tiempo real.

---

## 🎯 Casos de Uso

- ✅ Sensores de temperatura y humedad (DHT22, DHT11)
- ✅ Sensores de suelo (humedad, pH, conductividad)
- ✅ Sensores de luz (fotodiodos, sensores PAR)
- ✅ Sensores de presión atmosférica (BMP280)
- ✅ Sensores de calidad del aire
- ✅ Cualquier sensor compatible con estos microcontroladores

---

## 🔧 Hardware Requerido

### ESP32
- WiFi integrado
- Bajo consumo
- Ideal para sensores remotos con batería

### Arduino
- Requiere módulo WiFi (ESP8266) o Ethernet
- Más simple de programar
- Ideal para prototipos

### Raspberry Pi
- Más potente
- Puede ejecutar Python directamente
- Ideal para estaciones de monitoreo completas

---

## 📝 Ejemplo: ESP32 con Sensor DHT22

### Código Arduino/ESP32

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// Configuración WiFi
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";

// Configuración Nekazari
const char* apiKey = "TU_API_KEY_AQUI";
const char* tenantId = "TU_TENANT_ID_AQUI";
const char* serverUrl = "https://nekazari.robotika.cloud";
const char* entityId = "urn:ngsi-ld:AgriSensor:TU_TENANT_ID:ESP32_001";

// Sensor DHT22
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Intervalo de envío (milisegundos)
const unsigned long interval = 60000; // 60 segundos
unsigned long previousMillis = 0;

void setup() {
  Serial.begin(115200);
  
  // Inicializar sensor
  dht.begin();
  
  // Conectar WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado!");
}

void loop() {
  unsigned long currentMillis = millis();
  
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    
    // Leer sensor
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    
    if (!isnan(temperature) && !isnan(humidity)) {
      sendData(temperature, humidity);
    } else {
      Serial.println("Error leyendo sensor DHT22");
    }
  }
}

void sendData(float temp, float humidity) {
  HTTPClient http;
  
  // URL para actualizar atributos de la entidad
  String url = String(serverUrl) + "/ngsi-ld/v1/entities/" + String(entityId) + "/attrs";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  http.addHeader("Fiware-Service", tenantId);
  
  // Construir JSON
  String jsonData = "{";
  jsonData += "\"temperature\":{\"type\":\"Property\",\"value\":" + String(temp) + ",\"unitCode\":\"CEL\"},";
  jsonData += "\"humidity\":{\"type\":\"Property\",\"value\":" + String(humidity) + ",\"unitCode\":\"P1\"},";
  jsonData += "\"timestamp\":{\"type\":\"Property\",\"value\":{\"@type\":\"DateTime\",\"@value\":\"" + getISOTimestamp() + "\"}}";
  jsonData += "}";
  
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode == 200 || httpResponseCode == 204) {
    Serial.println("Datos enviados correctamente");
  } else {
    Serial.print("Error: ");
    Serial.println(httpResponseCode);
    Serial.println(http.getString());
  }
  
  http.end();
}

String getISOTimestamp() {
  // Generar timestamp ISO 8601
  // Nota: Necesitarías un RTC o usar NTP para timestamp real
  return "2025-11-14T15:30:00Z";
}
```

---

## 📝 Ejemplo: Raspberry Pi con Python

### Código Python

```python
#!/usr/bin/env python3
import requests
import time
import json
from datetime import datetime
import Adafruit_DHT  # Para sensor DHT22

# Configuración
API_KEY = "TU_API_KEY_AQUI"
TENANT_ID = "TU_TENANT_ID_AQUI"
SERVER_URL = "https://nekazari.robotika.cloud"
ENTITY_ID = f"urn:ngsi-ld:AgriSensor:{TENANT_ID}:RPI_001"

# Sensor DHT22
DHT_SENSOR = Adafruit_DHT.DHT22
DHT_PIN = 4

def read_sensor():
    """Lee datos del sensor DHT22"""
    humidity, temperature = Adafruit_DHT.read_retry(DHT_SENSOR, DHT_PIN)
    return temperature, humidity

def send_data(temperature, humidity):
    """Envía datos a Nekazari"""
    url = f"{SERVER_URL}/ngsi-ld/v1/entities/{ENTITY_ID}/attrs"
    
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
    
    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        if response.status_code in [200, 204]:
            print(f"✅ Datos enviados: {temperature}°C, {humidity}%")
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Error de conexión: {e}")

def main():
    """Loop principal"""
    print("Iniciando envío de datos a Nekazari...")
    
    while True:
        try:
            temp, humidity = read_sensor()
            if temp is not None and humidity is not None:
                send_data(temp, humidity)
            else:
                print("⚠️ Error leyendo sensor")
        except Exception as e:
            print(f"❌ Error: {e}")
        
        time.sleep(60)  # Esperar 60 segundos

if __name__ == "__main__":
    main()
```

---

## 🔧 Registro del Dispositivo

Antes de enviar datos, debes registrar el dispositivo:

```bash
curl -X POST https://nekazari.robotika.cloud/api/sensors/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TU_API_KEY_AQUI" \
  -H "Fiware-Service: TU_TENANT_ID_AQUI" \
  -d '{
    "external_id": "ESP32_001",
    "name": "Sensor ESP32 Temperatura/Humedad",
    "profile": "temperature_humidity_sensor",
    "location": {
      "lat": 42.571493,
      "lon": -2.028218
    }
  }'
```

---

## 📊 Tipos de Sensores Soportados

### Sensores Ambientales
- `temperature_sensor` - Temperatura
- `humidity_sensor` - Humedad
- `pressure_sensor` - Presión atmosférica
- `light_sensor` - Luz/radiación solar
- `wind_sensor` - Viento

### Sensores de Suelo
- `soil_moisture_sensor` - Humedad del suelo
- `soil_ph_sensor` - pH del suelo
- `soil_ec_sensor` - Conductividad eléctrica
- `soil_temperature_sensor` - Temperatura del suelo

---

## 🔋 Optimización de Batería (ESP32)

Para dispositivos con batería, optimiza el consumo:

```cpp
// Modo deep sleep entre lecturas
#define uS_TO_S_FACTOR 1000000  // Conversión microsegundos a segundos
#define TIME_TO_SLEEP 300       // 5 minutos

void setup() {
  // ... código de inicialización ...
  
  // Configurar wake-up
  esp_sleep_enable_timer_wakeup(TIME_TO_SLEEP * uS_TO_S_FACTOR);
  
  // Enviar datos
  sendData();
  
  // Entrar en deep sleep
  esp_deep_sleep_start();
}

void loop() {
  // No se ejecuta en deep sleep mode
}
```

---

## ⚠️ Troubleshooting

### Error de Conexión WiFi
- Verifica SSID y contraseña
- Verifica que el WiFi está en rango
- Revisa logs del ESP32

### Error 401: Invalid API Key
- Verifica que la API Key es correcta
- Verifica que el Tenant ID coincide
- Regenera la API Key si es necesario

### Datos no aparecen en Dashboard
- Verifica que el sensor está registrado
- Verifica que el Entity ID es correcto
- Revisa logs del servidor

---

**Siguiente**: [Weather Stations](./weather-stations.md)

