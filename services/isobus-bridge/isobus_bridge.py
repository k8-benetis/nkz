#!/usr/bin/env python3
# =============================================================================
# ISOBUS Bridge - Telematic Gateway Integration Service
# =============================================================================
# Recibe datos de gateways telemáticos (Teltonika, CalAmp, etc.) que leen
# el bus CAN J1939/ISOBUS de maquinaria agrícola y los traduce a NGSI-LD
# para persistirlos en FIWARE Orion-LD.
#
# Flujo:
# 1. Gateway telemático → POST /api/v1/telemetry/isobus (con API-Key)
# 2. ISOBUS Bridge valida API-Key y traduce JSON → NGSI-LD
# 3. ISOBUS Bridge → PATCH Orion-LD (actualiza entidad Tractor/Implement)
# =============================================================================

import os
import sys
import json
import logging
import hashlib
from typing import Dict, Any, Optional, Tuple
from datetime import datetime

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

# Add common directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'common'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
POSTGRES_URL = os.getenv('POSTGRES_URL')
ORION_URL = os.getenv('ORION_URL', 'http://orion-ld-service:1026')
# Get CONTEXT_URL, constructing from PRODUCTION_DOMAIN if not set
PRODUCTION_DOMAIN = os.getenv('PRODUCTION_DOMAIN', '')
CONTEXT_URL = os.getenv('CONTEXT_URL', f'https://{PRODUCTION_DOMAIN}/ngsi-ld' if PRODUCTION_DOMAIN else '')
HMAC_SECRET = os.getenv('HMAC_SECRET', '')

# Cache de API keys por tenant
API_KEYS_CACHE: Dict[str, str] = {}


def load_api_keys_from_db():
    """Cargar API keys desde PostgreSQL"""
    global API_KEYS_CACHE
    if not POSTGRES_URL:
        logger.warning("POSTGRES_URL not set, API keys DB disabled")
        return
    
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT tenant_id, key_hash, key_type
            FROM api_keys
            WHERE is_active = true AND key_type IN ('tenant', 'device')
        """)
        rows = cur.fetchall()
        API_KEYS_CACHE = {}
        for row in rows:
            tenant_id = row['tenant_id']
            key_hash = row['key_hash']
            # Permitir múltiples keys por tenant (tenant + device keys)
            if tenant_id not in API_KEYS_CACHE:
                API_KEYS_CACHE[tenant_id] = []
            API_KEYS_CACHE[tenant_id].append(key_hash)
        cur.close()
        conn.close()
        logger.info(f"Loaded {len(API_KEYS_CACHE)} tenant API keys from database")
    except Exception as e:
        logger.error(f"Error loading API keys from DB: {e}")


def validate_api_key(api_key: str) -> Optional[Tuple[str, str]]:
    """
    Valida API Key y retorna (tenant_id, key_type)
    
    Returns:
        Tuple (tenant_id, key_type) si válida, None si inválida
    """
    if not api_key:
        return None
    
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    # Buscar en cache
    for tenant_id, hashes in API_KEYS_CACHE.items():
        if api_key_hash in hashes:
            return (tenant_id, 'tenant')  # Por ahora asumimos tenant key
    
    # Si no está en cache, consultar DB
    if POSTGRES_URL:
        try:
            conn = psycopg2.connect(POSTGRES_URL)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT tenant_id, key_type
                FROM api_keys
                WHERE key_hash = %s AND is_active = true
                LIMIT 1
            """, (api_key_hash,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            
            if row:
                tenant_id = row['tenant_id']
                key_type = row['key_type']
                # Actualizar cache
                if tenant_id not in API_KEYS_CACHE:
                    API_KEYS_CACHE[tenant_id] = []
                if api_key_hash not in API_KEYS_CACHE[tenant_id]:
                    API_KEYS_CACHE[tenant_id].append(api_key_hash)
                return (tenant_id, key_type)
        except Exception as e:
            logger.error(f"Error validating API key from DB: {e}")
    
    return None


def get_entity_from_orion(entity_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
    """Obtener entidad desde Orion-LD"""
    try:
        url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        headers = {
            'Accept': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            return None
        else:
            logger.warning(f"Error getting entity {entity_id}: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Exception getting entity {entity_id}: {e}")
        return None


def should_overwrite_location(current_location: Optional[Dict], new_location: Dict) -> bool:
    """
    Determina si se debe sobreescribir la ubicación.
    
    Reglas:
    - Si la ubicación actual es (0,0) o muy cercana, sobreescribir
    - Si la ubicación actual tiene metadata.location_source == 'initial', sobreescribir
    - Si la nueva ubicación viene de GPS real (accuracy < 50m), sobreescribir si es inicial
    """
    if not current_location:
        return True  # No existe, crear nueva
    
    coords = current_location.get('value', {}).get('coordinates', [0, 0])
    lon, lat = coords[0], coords[1]
    
    # Si es (0,0) o muy cercano, es ubicación inicial
    if abs(lon) < 0.0001 and abs(lat) < 0.0001:
        return True
    
    # Verificar metadata.location_source
    metadata = current_location.get('metadata', {})
    location_source = metadata.get('location_source', {}).get('value')
    if location_source == 'initial':
        return True
    
    # Si la nueva ubicación tiene buena precisión GPS, sobreescribir si es inicial
    new_accuracy = new_location.get('accuracy', 999)
    if new_accuracy < 50 and location_source == 'initial':
        return True
    
    return False


def map_isobus_to_ngsi_ld(
    device_id: str,
    telemetry_data: Dict[str, Any],
    tenant_id: str,
    entity_type: str = 'AgriculturalTractor'
) -> Dict[str, Any]:
    """
    Mapea datos ISOBUS/J1939 a formato NGSI-LD
    
    Args:
        device_id: ID del dispositivo (ej: TELTONIKA-SN-A4B8)
        telemetry_data: Datos del gateway telemático
        tenant_id: ID del tenant
        entity_type: Tipo de entidad (AgriculturalTractor, AgriculturalImplement)
    
    Returns:
        Payload NGSI-LD para PATCH
    """
    # Extraer datos del payload
    location_data = telemetry_data.get('location', {})
    j1939_data = telemetry_data.get('j1939_data', {})
    timestamp = telemetry_data.get('timestamp')
    
    lat = location_data.get('lat', 0)
    lon = location_data.get('lon', 0)
    accuracy = location_data.get('accuracy', 999)  # Precisión GPS en metros
    
    # Construir payload NGSI-LD
    ngsi_payload: Dict[str, Any] = {
        '@context': [CONTEXT_URL]
    }
    
    # Location (GeoProperty)
    ngsi_payload['location'] = {
        'type': 'GeoProperty',
        'value': {
            'type': 'Point',
            'coordinates': [lon, lat]
        },
        'metadata': {
            'location_source': {
                'type': 'Property',
                'value': 'gps'  # GPS real desde gateway
            },
            'accuracy': {
                'type': 'Property',
                'value': accuracy,
                'unitCode': 'MTR'  # Metros
            },
            'observedAt': {
                'type': 'Property',
                'value': {
                    '@type': 'DateTime',
                    '@value': datetime.fromtimestamp(timestamp).isoformat() if timestamp else datetime.utcnow().isoformat()
                }
            }
        }
    }
    
    # Mapear datos J1939/ISOBUS según PGNs estándar
    # PGN 61444: Engine Speed (RPM)
    if 'engine_speed' in j1939_data:
        ngsi_payload['engineSpeed'] = {
            'type': 'Property',
            'value': float(j1939_data['engine_speed']),
            'unitCode': 'RPM'
        }
    
    # PGN 65276: Fuel Level (%)
    if 'fuel_level_percent' in j1939_data:
        ngsi_payload['fuelLevel'] = {
            'type': 'Property',
            'value': float(j1939_data['fuel_level_percent']),
            'unitCode': 'P1'  # Porcentaje
        }
    
    # PGN 65265: Vehicle Speed (km/h)
    if 'vehicle_speed_kmh' in j1939_data:
        ngsi_payload['speed'] = {
            'type': 'Property',
            'value': float(j1939_data['vehicle_speed_kmh']),
            'unitCode': 'KMH'
        }
    
    # PGN 65253: Engine Hours
    if 'engine_hours' in j1939_data:
        ngsi_payload['engineHours'] = {
            'type': 'Property',
            'value': float(j1939_data['engine_hours']),
            'unitCode': 'HUR'  # Horas
        }
    
    # Datos específicos de implementos
    if entity_type == 'AgriculturalImplement':
        # Tasa de siembra (kg/ha)
        if 'implement_rate' in j1939_data:
            ngsi_payload['seedingRate'] = {
                'type': 'Property',
                'value': float(j1939_data['implement_rate']),
                'unitCode': 'KGH'  # kg/ha
            }
        
        # Kilos cosechados
        if 'harvested_kg' in j1939_data:
            ngsi_payload['harvestedWeight'] = {
                'type': 'Property',
                'value': float(j1939_data['harvested_kg']),
                'unitCode': 'KGM'  # Kilogramos
            }
    
    # Timestamp de observación
    if timestamp:
        ngsi_payload['observedAt'] = {
            'type': 'Property',
            'value': {
                '@type': 'DateTime',
                '@value': datetime.fromtimestamp(timestamp).isoformat()
            }
        }
    
    return ngsi_payload


def update_entity_in_orion(
    entity_id: str,
    tenant_id: str,
    ngsi_payload: Dict[str, Any],
    overwrite_location: bool = False
) -> bool:
    """
    Actualiza entidad en Orion-LD usando PATCH
    
    Args:
        entity_id: ID de la entidad NGSI-LD
        tenant_id: ID del tenant
        ngsi_payload: Payload NGSI-LD para actualizar
        overwrite_location: Si True, fuerza actualización de location incluso si existe
    
    Returns:
        True si éxito, False si error
    """
    try:
        # Si no debemos sobreescribir location y ya existe, removerla del payload
        if not overwrite_location and 'location' in ngsi_payload:
            # Verificar si la entidad existe y tiene location
            existing_entity = get_entity_from_orion(entity_id, tenant_id)
            if existing_entity and 'location' in existing_entity:
                existing_location = existing_entity['location']
                if not should_overwrite_location(existing_location, ngsi_payload['location']['value']):
                    # No sobreescribir, mantener la existente
                    del ngsi_payload['location']
                    logger.info(f"Keeping existing location for {entity_id}, GPS data ignored")
        
        url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        response = requests.patch(url, json=ngsi_payload, headers=headers, timeout=10)
        
        if response.status_code in (204, 200):
            logger.info(f"Successfully updated entity {entity_id} for tenant {tenant_id}")
            return True
        else:
            logger.error(f"Failed to update entity {entity_id}: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Exception updating entity {entity_id}: {e}")
        return False


def create_entity_if_not_exists(
    entity_id: str,
    entity_type: str,
    device_id: str,
    tenant_id: str,
    initial_location: Dict[str, Any]
) -> bool:
    """
    Crea entidad en Orion-LD si no existe
    
    Returns:
        True si existe o se creó, False si error
    """
    # Verificar si existe
    existing = get_entity_from_orion(entity_id, tenant_id)
    if existing:
        return True
    
    # Crear nueva entidad
    try:
        entity_payload = {
            'id': entity_id,
            'type': entity_type,
            '@context': [CONTEXT_URL],
            'name': {
                'type': 'Property',
                'value': device_id
            },
            'location': {
                'type': 'GeoProperty',
                'value': {
                    'type': 'Point',
                    'coordinates': [initial_location.get('lon', 0), initial_location.get('lat', 0)]
                },
                'metadata': {
                    'location_source': {
                        'type': 'Property',
                        'value': 'initial'  # Marcar como inicial
                    }
                }
            }
        }
        
        url = f"{ORION_URL}/ngsi-ld/v1/entities"
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        response = requests.post(url, json=entity_payload, headers=headers, timeout=10)
        
        if response.status_code in (201, 200):
            logger.info(f"Created entity {entity_id} for tenant {tenant_id}")
            return True
        else:
            logger.error(f"Failed to create entity {entity_id}: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Exception creating entity {entity_id}: {e}")
        return False


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'isobus-bridge',
        'orion_url': ORION_URL
    }), 200


@app.route('/api/v1/telemetry/isobus', methods=['POST'])
def receive_isobus_telemetry():
    """
    Endpoint principal para recibir telemetría ISOBUS
    
    Headers requeridos:
        X-API-Key: API Key del tenant
        Fiware-Service: ID del tenant (opcional, se puede inferir de API-Key)
    
    Body (JSON):
        {
            "deviceId": "TELTONIKA-SN-A4B8",
            "timestamp": 1678886400,
            "location": {
                "lat": 42.501,
                "lon": -1.602,
                "accuracy": 2.5
            },
            "j1939_data": {
                "engine_speed": 1850,
                "fuel_level_percent": 78.5,
                "vehicle_speed_kmh": 8.2,
                "implement_rate": 120.0
            },
            "entity_type": "AgriculturalTractor"  // Opcional, default: AgriculturalTractor
        }
    """
    try:
        # 1. Validar API Key
        api_key = request.headers.get('X-API-Key')
        if not api_key:
            return jsonify({
                'error': 'Missing X-API-Key header',
                'detail': 'API Key is required for authentication'
            }), 401
        
        validation_result = validate_api_key(api_key)
        if not validation_result:
            return jsonify({
                'error': 'Invalid API Key',
                'detail': 'The provided API Key is not valid'
            }), 403
        
        tenant_id, key_type = validation_result
        
        # 2. Obtener tenant_id del header si está presente (tiene prioridad)
        header_tenant = request.headers.get('Fiware-Service')
        if header_tenant:
            tenant_id = header_tenant
        
        # 3. Validar payload JSON
        if not request.is_json:
            return jsonify({
                'error': 'Invalid content type',
                'detail': 'Request must be JSON'
            }), 400
        
        data = request.json
        
        # Validar campos requeridos
        device_id = data.get('deviceId') or data.get('device_id')
        if not device_id:
            return jsonify({
                'error': 'Missing required field',
                'detail': 'deviceId is required'
            }), 400
        
        location_data = data.get('location', {})
        if not location_data or 'lat' not in location_data or 'lon' not in location_data:
            return jsonify({
                'error': 'Missing required field',
                'detail': 'location.lat and location.lon are required'
            }), 400
        
        # 4. Determinar tipo de entidad
        entity_type = data.get('entity_type', 'AgriculturalTractor')
        if entity_type not in ['AgriculturalTractor', 'AgriculturalImplement']:
            entity_type = 'AgriculturalTractor'  # Default
        
        # 5. Construir entity_id
        entity_id = f"urn:ngsi-ld:{entity_type}:{tenant_id}:{device_id}"
        
        # 6. Verificar si debemos sobreescribir location
        existing_entity = get_entity_from_orion(entity_id, tenant_id)
        overwrite_location = True  # Por defecto, sobreescribir con GPS real
        
        if existing_entity and 'location' in existing_entity:
            overwrite_location = should_overwrite_location(
                existing_entity['location'],
                location_data
            )
        
        # 7. Crear entidad si no existe
        if not existing_entity:
            create_entity_if_not_exists(
                entity_id,
                entity_type,
                device_id,
                tenant_id,
                location_data
            )
        
        # 8. Mapear datos ISOBUS a NGSI-LD
        ngsi_payload = map_isobus_to_ngsi_ld(
            device_id,
            data,
            tenant_id,
            entity_type
        )
        
        # 9. Actualizar entidad en Orion-LD
        success = update_entity_in_orion(
            entity_id,
            tenant_id,
            ngsi_payload,
            overwrite_location
        )
        
        if success:
            return jsonify({
                'status': 'success',
                'entity_id': entity_id,
                'tenant_id': tenant_id,
                'device_id': device_id,
                'location_overwritten': overwrite_location,
                'message': 'Telemetry data processed successfully'
            }), 200
        else:
            return jsonify({
                'error': 'Failed to update entity',
                'detail': 'Could not update entity in Orion-LD'
            }), 500
            
    except Exception as e:
        logger.error(f"Error processing ISOBUS telemetry: {e}", exc_info=True)
        return jsonify({
            'error': 'Internal server error',
            'detail': str(e)
        }), 500


if __name__ == '__main__':
    # Cargar API keys al iniciar
    load_api_keys_from_db()
    
    # Iniciar servidor
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

