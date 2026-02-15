#!/usr/bin/env python3
# =============================================================================
# Entity Management API - Production Service
# =============================================================================

import os
import sys
import uuid
import json
import logging
import time
import secrets
import subprocess
from math import cos, radians
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from urllib.parse import quote

from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify, g, Response, send_file
from flask_cors import CORS
import requests
import paho.mqtt.client as mqtt
import threading
import boto3
from botocore.exceptions import ClientError
from io import BytesIO

# Add common directory to path for imports
# Try multiple paths for compatibility (local dev vs container)
common_paths = [
    os.path.join(os.path.dirname(__file__), '..', 'common'),
    '/app/common',
    '/common',
    os.path.join(os.path.dirname(__file__), 'common')
]

# Import audit logger
try:
    from audit_logger import audit_log, log_module_toggle, log_module_job_create, log_error
    AUDIT_LOGGER_AVAILABLE = True
except ImportError:
    AUDIT_LOGGER_AVAILABLE = False
    # Fallback functions
    def audit_log(*args, **kwargs):
        pass
    def log_module_toggle(*args, **kwargs):
        pass
    def log_module_job_create(*args, **kwargs):
        pass
    def log_error(*args, **kwargs):
        pass

# Import module health checks
# Try importing from local directory first, then from common
try:
    # Try local import first (module_health.py in same directory)
    from module_health import get_module_health
    MODULE_HEALTH_AVAILABLE = True
except ImportError:
    try:
        # Try from common directory
        from common.module_health import get_module_health
        MODULE_HEALTH_AVAILABLE = True
    except ImportError:
        MODULE_HEALTH_AVAILABLE = False
        def get_module_health(*args, **kwargs):
            return {'error': 'Module health checks not available'}

# Import audit middleware
try:
    from audit_middleware import setup_audit_middleware
    AUDIT_MIDDLEWARE_AVAILABLE = True
except ImportError:
    AUDIT_MIDDLEWARE_AVAILABLE = False
    def setup_audit_middleware(*args, **kwargs):
        pass

# Import rate limiter
try:
    from rate_limiter import rate_limit_module
    RATE_LIMITER_AVAILABLE = True
except ImportError:
    RATE_LIMITER_AVAILABLE = False
    def rate_limit_module(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

# Import module metrics
try:
    from module_metrics import record_module_usage, record_module_latency, record_module_error, metrics_decorator
    MODULE_METRICS_AVAILABLE = True
except ImportError:
    MODULE_METRICS_AVAILABLE = False
    def record_module_usage(*args, **kwargs):
        pass
    def record_module_latency(*args, **kwargs):
        pass
    def record_module_error(*args, **kwargs):
        pass
    def metrics_decorator(*args, **kwargs):
        def decorator(func):
            return func
        return decorator
task_queue_paths = [
    os.path.join(os.path.dirname(__file__), '..', 'task-queue'),
    '/app/task-queue',
    '/task-queue',
    os.path.join(os.path.dirname(__file__), 'task-queue')
]

for path in common_paths:
    if os.path.exists(path):
        sys.path.insert(0, path)
        break

for path in task_queue_paths:
    if os.path.exists(path):
        sys.path.insert(0, path)
        break

# Import from common/auth_middleware (not local auth_middleware.py)
from common.auth_middleware import require_auth, inject_fiware_headers
# Import entity-specific functions from local auth_middleware if they exist
try:
    from auth_middleware import log_entity_operation, require_entity_ownership
except ImportError:
    # Fallback if local auth_middleware doesn't have these functions
    def log_entity_operation(*args, **kwargs):
        pass
    def require_entity_ownership(*args, **kwargs):
        def decorator(f):
            return f
        return decorator
from db_helper import get_db_connection_with_tenant, get_db_connection_simple, return_db_connection, set_platform_admin_context
from task_queue import enqueue_task, TaskType
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Setup audit middleware (automatic request logging)
if AUDIT_MIDDLEWARE_AVAILABLE:
    setup_audit_middleware(app, postgres_url=POSTGRES_URL)

# Configure CORS to allow requests from frontend
# CORS must be configured before routes to handle OPTIONS preflight
ALLOWED_ORIGINS = {
    "https://nekazari.robotika.cloud",
    "https://nkz.robotika.cloud",
    "http://localhost:3000",
    "http://localhost:5173",
}

@app.route('/api/weather/<path:subpath>', methods=['OPTIONS'])
def weather_cors_preflight(subpath):
    """Explicit OPTIONS handler for all /api/weather/* routes to ensure CORS headers"""
    origin = request.headers.get('Origin')
    requested_method = request.headers.get('Access-Control-Request-Method', 'GET')
    requested_headers = request.headers.get('Access-Control-Request-Headers', '')
    logger.info(f"[CORS Preflight] OPTIONS /api/weather/{subpath}, origin={origin}, method={requested_method}, headers={requested_headers}")
    
    # Create response with explicit headers
    resp = Response(response='{}', status=200, mimetype='application/json')
    
    if origin and origin in ALLOWED_ORIGINS:
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Vary'] = 'Origin'
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Tenant-ID, x-tenant-id, X-Auth-Signature'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        resp.headers['Access-Control-Max-Age'] = '86400'  # 24 hours
        logger.info(f"[CORS Preflight] Headers set: Allow-Origin={resp.headers.get('Access-Control-Allow-Origin')}, Allow-Headers={resp.headers.get('Access-Control-Allow-Headers')}, Allow-Methods={resp.headers.get('Access-Control-Allow-Methods')}")
    else:
        logger.warning(f"[CORS Preflight] Origin {origin} not in ALLOWED_ORIGINS: {ALLOWED_ORIGINS}")
    
    return resp

CORS(
    app,
    resources={
        # Exclude /api/weather/* from Flask-CORS - we handle it manually with weather_cors_preflight
        # Only configure CORS for non-weather API routes
        r"/api/entities/*": {
            "origins": list(ALLOWED_ORIGINS),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id", "X-Auth-Signature"],
            "expose_headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
            "supports_credentials": True,
        },
        r"/api/parcels/*": {
            "origins": list(ALLOWED_ORIGINS),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id", "X-Auth-Signature"],
            "expose_headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
            "supports_credentials": True,
        },
        r"/api/ndvi/*": {
            "origins": list(ALLOWED_ORIGINS),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id", "X-Auth-Signature"],
            "expose_headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
            "supports_credentials": True,
        },
        r"/api/vegetation/*": {
            "origins": list(ALLOWED_ORIGINS),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id", "X-Auth-Signature", "X-Source-Module"],
            "expose_headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
            "supports_credentials": True,
        },
        # NOTE: We do NOT configure /api/* here because it would catch /api/weather/*
        # which we handle manually with weather_cors_preflight handler
        r"/*": {
            "origins": list(ALLOWED_ORIGINS),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id", "X-Auth-Signature"],
            "expose_headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
            "supports_credentials": True,
        },
    },
    # Disable automatic OPTIONS handling - we handle it manually for /api/weather/*
    automatic_options=False,
)


@app.before_request
def handle_preflight():
    """Log incoming requests for debugging"""
    # Don't handle OPTIONS here - let Flask-CORS handle it
    # Log all incoming requests for debugging
    if '/api/weather' in request.path:
        logger.info(f"[before_request] Incoming request: {request.method} {request.path}, origin={request.headers.get('Origin')}, has_auth={bool(request.headers.get('Authorization'))}")


@app.before_request
def _start_timer():
    g._request_start_time = time.perf_counter()


@app.after_request
def _record_metrics(response):
    start_time = getattr(g, '_request_start_time', None)
    if start_time is not None:
        elapsed = time.perf_counter() - start_time
        endpoint = request.endpoint or request.path or 'unknown'
        REQUEST_LATENCY.labels(request.method, endpoint).observe(elapsed)
        REQUEST_COUNT.labels(request.method, endpoint, response.status_code).inc()
    
    # Ensure CORS headers for allowed origins (especially for OPTIONS requests)
    origin = request.headers.get('Origin')
    if request.method == 'OPTIONS' and '/api/weather' in request.path:
        logger.info(f"[after_request] OPTIONS request for {request.path}, endpoint={request.endpoint}, origin={origin}")
        if origin and origin in ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Tenant-ID, x-tenant-id, X-Auth-Signature'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            response.headers['Access-Control-Max-Age'] = '86400'
            logger.info(f"[after_request] CORS headers set: {dict(response.headers)}")
        else:
            logger.warning(f"[after_request] Origin {origin} not in ALLOWED_ORIGINS")
    elif origin and origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Tenant-ID, x-tenant-id, X-Auth-Signature'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
    
    return response


@app.route('/metrics', methods=['GET'])
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

# Configuration
ORION_URL = os.getenv('ORION_URL', 'http://orion:1026')
# Límites y tipos sujetos a control (valores por defecto seguros, configurables por env)
MAX_ROBOTS = int(os.getenv('MAX_ROBOTS', '999999'))
MAX_SENSORS = int(os.getenv('MAX_SENSORS', '999999'))
MAX_AREA_HECTARES = float(os.getenv('MAX_AREA_HECTARES', '1000000000'))
ROBOT_ENTITY_TYPES = set([t.strip() for t in os.getenv('ROBOT_ENTITY_TYPES', 'AgriculturalRobot').split(',') if t.strip()])
SENSOR_ENTITY_TYPES = set([t.strip() for t in os.getenv('SENSOR_ENTITY_TYPES', 'AgriSensor').split(',') if t.strip()])
PARCEL_ENTITY_TYPES = set([t.strip() for t in os.getenv('PARCEL_ENTITY_TYPES', 'AgriParcel,Parcel,Vineyard,OliveGrove,vineyard,olive_grove').split(',') if t.strip()])
ENTITY_BASE_PATH = os.getenv('ENTITY_BASE_PATH', '/app/config/entities')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
POSTGRES_URL = os.getenv('POSTGRES_URL')
NDVI_QUEUE_NAME = os.getenv('NDVI_QUEUE_NAME', 'ndvi')
DEFAULT_SATELLITE = os.getenv('NDVI_DEFAULT_SATELLITE', 'sentinel-2-l2a')
DEFAULT_RESOLUTION = int(os.getenv('NDVI_DEFAULT_RESOLUTION', '10'))
MAX_NDVI_RESULT_HISTORY = int(os.getenv('NDVI_RESULTS_HISTORY', '100'))
GRAFANA_URL = os.getenv('GRAFANA_URL')
GRAFANA_PUBLIC_URL = os.getenv('GRAFANA_PUBLIC_URL', GRAFANA_URL)
GRAFANA_ADMIN_USER = os.getenv('GRAFANA_ADMIN_USER')
GRAFANA_ADMIN_PASSWORD = os.getenv('GRAFANA_ADMIN_PASSWORD')
GRAFANA_DEFAULT_DASHBOARD = os.getenv('GRAFANA_DEFAULT_DASHBOARD', '')
# Get URLs from config manager or construct from PRODUCTION_DOMAIN
try:
    from common.config_manager import ConfigManager
    KEYCLOAK_PUBLIC_URL = ConfigManager.get_keycloak_public_url()
    CONTEXT_URL = os.getenv('CONTEXT_URL', '')
    if not CONTEXT_URL:
        domain = ConfigManager.get_production_domain()
        CONTEXT_URL = f'https://{domain}/ngsi-ld-context.json'
except ImportError:
    # Fallback if config_manager not available
    PRODUCTION_DOMAIN = os.getenv('PRODUCTION_DOMAIN', 'nekazari.robotika.cloud')
    KEYCLOAK_PUBLIC_URL = os.getenv('KEYCLOAK_PUBLIC_URL', f'https://{PRODUCTION_DOMAIN}/auth').rstrip('/')
    CONTEXT_URL = os.getenv('CONTEXT_URL', f'https://{PRODUCTION_DOMAIN}/ngsi-ld-context.json')
KEYCLOAK_REALM = os.getenv('KEYCLOAK_REALM', 'nekazari')
GRAFANA_OAUTH_CLIENT_ID = os.getenv('GRAFANA_OAUTH_CLIENT_ID', 'nekazari-frontend')
# MQTT Configuration for device commands
MQTT_HOST = os.getenv('MQTT_HOST', 'mosquitto-service')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USERNAME = os.getenv('MQTT_USERNAME', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')

REQUEST_LATENCY = Histogram(
    'entity_manager_request_latency_seconds',
    'Latencia de las peticiones HTTP en entity-manager',
    ['method', 'endpoint']
)
REQUEST_COUNT = Counter(
    'entity_manager_requests_total',
    'Total de peticiones HTTP en entity-manager',
    ['method', 'endpoint', 'http_status']
)
NDVI_JOBS_CREATED = Counter(
    'entity_manager_ndvi_job_created_total',
    'Trabajos NDVI creados correctamente'
)
NDVI_JOB_CREATION_FAILURES = Counter(
    'entity_manager_ndvi_job_failed_total',
    'Intentos fallidos de creación de trabajos NDVI'
)

# Set logging level
logging.getLogger().setLevel(getattr(logging, LOG_LEVEL))

# Cache sencillo de límites por tenant
_limits_cache = {}
_limits_cache_ts = {}
_LIMITS_TTL_SECONDS = 60

def _get_limits_from_orion(tenant: str):
    entity_id = f"TenantConfig:{tenant}"
    orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
    headers = {'Accept': 'application/ld+json'}
    headers = inject_fiware_headers(headers, tenant)
    try:
        resp = requests.get(orion_url, headers=headers)
        if resp.status_code != 200:
            return None
        ent = resp.json()
        def _num(attr):
            v = ent.get(attr)
            if isinstance(v, dict):
                return _extract_number(v)
            return _extract_number(v)
        return {
            'planType': (ent.get('planType') or {}).get('value') if isinstance(ent.get('planType'), dict) else ent.get('planType'),
            'maxUsers': _num('maxUsers'),
            'maxRobots': _num('maxRobots'),
            'maxSensors': _num('maxSensors'),
            'maxAreaHectares': _num('maxAreaHectares'),
        }
    except Exception:
        return None

def get_limits_for_tenant(tenant: str):
    now = datetime.utcnow().timestamp()
    if tenant in _limits_cache and (now - _limits_cache_ts.get(tenant, 0)) < _LIMITS_TTL_SECONDS:
        return _limits_cache[tenant]
    limits = _get_limits_from_orion(tenant)
    if limits:
        _limits_cache[tenant] = limits
        _limits_cache_ts[tenant] = now
    return limits

def upsert_limits_in_orion(tenant: str, limits: dict):
    entity_id = f"TenantConfig:{tenant}"
    headers = {
        'Content-Type': 'application/ld+json',
    }
    headers = inject_fiware_headers(headers, tenant)
    # Construir entidad NGSI-LD
    entity = {
        'id': entity_id,
        'type': 'TenantConfig',
    }
    if 'planType' in limits and limits['planType'] is not None:
        entity['planType'] = { 'type': 'Property', 'value': str(limits['planType']) }
    if 'maxUsers' in limits and limits['maxUsers'] is not None:
        entity['maxUsers'] = { 'type': 'Property', 'value': float(limits['maxUsers']) }
    if 'maxRobots' in limits and limits['maxRobots'] is not None:
        entity['maxRobots'] = { 'type': 'Property', 'value': float(limits['maxRobots']) }
    if 'maxSensors' in limits and limits['maxSensors'] is not None:
        entity['maxSensors'] = { 'type': 'Property', 'value': float(limits['maxSensors']) }
    if 'maxAreaHectares' in limits and limits['maxAreaHectares'] is not None:
        entity['maxAreaHectares'] = { 'type': 'Property', 'value': float(limits['maxAreaHectares']) }
    # Intentar crear; si existe, hacer upsert vía /attrs
    try:
        resp = requests.post(f"{ORION_URL}/ngsi-ld/v1/entities", json=entity, headers=headers)
        if resp.status_code in (201, 200):
            return True
        # Si ya existe, 409
        if resp.status_code == 409:
            # PATCH attrs
            attrs = entity.copy()
            attrs.pop('id', None)
            attrs.pop('type', None)
            patch = attrs
            resp2 = requests.patch(f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs", json=patch, headers=headers)
            return resp2.status_code in (200, 204)
        return False
    except Exception:
        return False

def get_entity_types():
    """Get available entity types from configuration"""
    default_types = {
        "robot_types": {
            "harvester_robot": {
                "name": "Harvester Robot",
                "description": "Robot for harvesting crops",
                "attributes": {
                    "status": {"type": "Text", "description": "Current status"},
                    "battery_level": {"type": "Number", "description": "Battery percentage"},
                    "current_task": {"type": "Text", "description": "Current task"},
                    "location": {"type": "geo:json", "description": "Robot location"},
                    "speed": {"type": "Number", "description": "Current speed"},
                    "payload": {"type": "Number", "description": "Current payload weight"}
                }
            },
            "sprayer_robot": {
                "name": "Sprayer Robot",
                "description": "Robot for spraying pesticides/herbicides",
                "attributes": {
                    "status": {"type": "Text", "description": "Current status"},
                    "tank_level": {"type": "Number", "description": "Tank level percentage"},
                    "spray_rate": {"type": "Number", "description": "Current spray rate"},
                    "location": {"type": "geo:json", "description": "Robot location"}
                }
            }
        },
        "sensor_types": {
            "soil_sensor": {
                "name": "Soil Sensor",
                "description": "Sensor for soil conditions",
                "attributes": {
                    "moisture": {"type": "Number", "description": "Soil moisture percentage"},
                    "ph": {"type": "Number", "description": "Soil pH level"},
                    "temperature": {"type": "Number", "description": "Soil temperature"},
                    "location": {"type": "geo:json", "description": "Sensor location"}
                }
            },
            "weather_sensor": {
                "name": "Weather Sensor",
                "description": "Environmental weather sensor",
                "attributes": {
                    "temperature": {"type": "Number", "description": "Air temperature"},
                    "humidity": {"type": "Number", "description": "Air humidity percentage"},
                    "pressure": {"type": "Number", "description": "Atmospheric pressure"},
                    "wind_speed": {"type": "Number", "description": "Wind speed"},
                    "location": {"type": "geo:json", "description": "Sensor location"}
                }
            }
        },
        "parcel_types": {
            "olive_grove": {
                "name": "Olive Grove",
                "description": "Olive tree plantation",
                "attributes": {
                    "area": {"type": "Number", "description": "Parcel area in hectares"},
                    "tree_count": {"type": "Number", "description": "Number of olive trees"},
                    "variety": {"type": "Text", "description": "Olive variety"},
                    "planting_date": {"type": "DateTime", "description": "Planting date"},
                    "location": {"type": "geo:json", "description": "Parcel boundaries"}
                }
            },
            "vineyard": {
                "name": "Vineyard",
                "description": "Grape vine plantation",
                "attributes": {
                    "area": {"type": "Number", "description": "Parcel area in hectares"},
                    "row_count": {"type": "Number", "description": "Number of vine rows"},
                    "variety": {"type": "Text", "description": "Grape variety"},
                    "planting_date": {"type": "DateTime", "description": "Planting date"},
                    "location": {"type": "geo:json", "description": "Parcel boundaries"}
                }
            }
        }
    }
    return default_types

def _extract_number(value):
    """Extrae un número desde payload NGSI-LD (Property) o valor simple."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        # NGSI-LD Property {"type":"Property","value": X}
        inner = value.get('value')
        if isinstance(inner, (int, float)):
            return float(inner)
        # También aceptar cadenas numéricas
        try:
            return float(inner)
        except Exception:
            return None
    try:
        return float(value)
    except Exception:
        return None

@app.route('/api/entities/inventory', methods=['GET'])
@require_auth
def get_entity_inventory():
    """
    Get entity inventory for current tenant
    Returns list of entity types and counts for context-aware risk configuration
    """
    try:
        tenant = g.tenant
        headers = inject_fiware_headers({}, tenant)
        
        # Get all entities from Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {'limit': 1000}
        
        response = requests.get(orion_url, params=params, headers=headers, timeout=30)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to get entities from Orion'}), 500
        
        entities = response.json()
        if not isinstance(entities, list):
            entities = []
        
        # Group by entity type
        inventory = {}
        for entity in entities:
            entity_type = entity.get('type', 'Unknown')
            if entity_type not in inventory:
                inventory[entity_type] = {
                    'type': entity_type,
                    'count': 0,
                    'entities': []
                }
            inventory[entity_type]['count'] += 1
            inventory[entity_type]['entities'].append({
                'id': entity.get('id'),
                'name': entity.get('name', {}).get('value', entity.get('id'))
            })
        
        # Convert to list format
        result = list(inventory.values())
        
        return jsonify({
            'inventory': result,
            'tenant': tenant
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting entity inventory: {e}")
        return jsonify({'error': 'Internal server error'}), 500

def _count_entities_by_type(entity_type, tenant):
    """Cuenta entidades de un tipo para un tenant vía Orion-LD."""
    orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
    params = {'type': entity_type, 'limit': 1, 'count': 'true'}
    headers = {'Accept': 'application/ld+json'}
    headers = inject_fiware_headers(headers, tenant)
    # Solicitar cabecera Ngsild-Results-Count si Orion la soporta
    resp = requests.get(orion_url, params=params, headers=headers)
    if resp.status_code != 200:
        return None
    # Orion-LD suele devolver Link/Content-Range; intentamos con Content-Range
    count_header = resp.headers.get('Ngsild-Results-Count') or resp.headers.get('Content-Range')
    if count_header and '/' in count_header:
        try:
            total = count_header.split('/')[-1]
            return int(total)
        except Exception:
            pass
    # Fallback: contar elementos del body (si no hay muchísimos)
    try:
        data = resp.json()
        if isinstance(data, list):
            return len(data)
    except Exception:
        pass
    return None

def _sum_parcel_area(entity_type, tenant):
    """Suma el área (hectáreas) de todas las parcelas de un tipo para un tenant."""
    orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
    params = {'type': entity_type, 'limit': 1000}
    headers = {'Accept': 'application/ld+json'}
    headers = inject_fiware_headers(headers, tenant)
    total = 0.0
    page = 0
    while True:
        p = dict(params)
        p['offset'] = page * 1000
        resp = requests.get(orion_url, params=p, headers=headers)
        if resp.status_code != 200:
            break
        try:
            items = resp.json()
        except Exception:
            break
        if not items:
            break
        for ent in items:
            area_val = _extract_number(ent.get('area'))
            if area_val is not None:
                total += area_val
        if len(items) < 1000:
            break
        page += 1
    return total

def _grafana_integration_enabled() -> bool:
    return all([
        GRAFANA_URL,
        GRAFANA_PUBLIC_URL,
        GRAFANA_ADMIN_USER,
        GRAFANA_ADMIN_PASSWORD,
    ])

def _grafana_request(method: str, path: str, **kwargs) -> Optional[requests.Response]:
    if not _grafana_integration_enabled():
        return None
    url = f"{GRAFANA_URL.rstrip('/')}{path}" if path.startswith('/') else f"{GRAFANA_URL.rstrip('/')}/{path}"
    auth = (GRAFANA_ADMIN_USER, GRAFANA_ADMIN_PASSWORD)
    timeout = kwargs.pop('timeout', 10)
    headers = kwargs.setdefault('headers', {})
    if 'Content-Type' not in headers and 'json' in kwargs:
        headers['Content-Type'] = 'application/json'
    return requests.request(method, url, auth=auth, timeout=timeout, **kwargs)

def _grafana_find_org(tenant_id: str) -> Optional[Dict[str, Any]]:
    response = _grafana_request('GET', '/api/orgs')
    if not response or response.status_code != 200:
        return None
    orgs = response.json() or []
    tenant_lower = tenant_id.lower()
    for org in orgs:
        name = (org.get('name') or '').lower()
        if tenant_lower in name or f"({tenant_lower})" in name:
            return org
        if name.strip() == tenant_lower:
            return org
    return None

def _grafana_create_org(tenant_id: str) -> Optional[Dict[str, Any]]:
    """Create a Grafana organization for the tenant"""
    org_name = tenant_id
    response = _grafana_request('POST', '/api/orgs', json={'name': org_name})
    if response and response.status_code in (200, 201):
        org = response.json()
        logger.info("Created Grafana organization %s (ID: %s) for tenant %s", org_name, org.get('orgId') or org.get('id'), tenant_id)
        return org
    elif response and response.status_code == 409:
        # Organization already exists, try to find it
        return _grafana_find_org(tenant_id)
    else:
        logger.error("Failed to create Grafana organization for tenant %s: %s", tenant_id, response.status_code if response else 'No response')
        return None

def _grafana_get_org_members(org_id: int) -> List[Dict[str, Any]]:
    response = _grafana_request('GET', f'/api/orgs/{org_id}/users')
    if response and response.status_code == 200:
        return response.json() or []
    return []

def _grafana_lookup_user(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    response = _grafana_request('GET', f"/api/users/lookup?loginOrEmail={quote(email)}")
    if response and response.status_code == 200:
        return response.json()
    return None

def _grafana_create_user(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    password = secrets.token_urlsafe(24)
    payload = {
        "name": email.split('@')[0],
        "email": email,
        "login": email,
        "password": password
    }
    response = _grafana_request('POST', '/api/admin/users', json=payload)
    if response and response.status_code in (200, 201):
        return response.json()
    return None

def _grafana_assign_user_to_org(org_id: int, email: str, role: str) -> bool:
    """Assign a user to a Grafana organization.
    
    Note: When Grafana is configured with OAuth (Keycloak SSO), users are created
    automatically when they log in for the first time. This function attempts to
    assign the user to the organization, but if the user doesn't exist yet, it will
    return False. The user will be created on first OAuth login, but won't be
    automatically assigned to the organization until they log in.
    """
    if not email:
        return False
    
    # Check if user is already a member
    members = _grafana_get_org_members(org_id)
    for member in members:
        if (member.get('email') or '').lower() == email.lower() or (member.get('login') or '').lower() == email.lower():
            # Update role if necessary
            current_role = member.get('role')
            if current_role != role:
                _grafana_request('PATCH', f"/api/orgs/{org_id}/users/{member.get('userId')}", json={'role': role})
            return True

    # Check if user exists in Grafana
    user = _grafana_lookup_user(email)
    if not user:
        # User doesn't exist yet - this is normal when using OAuth SSO.
        # The user will be created automatically on first login via OAuth.
        # We can't assign them to the organization until they exist.
        logger.info("User %s not found in Grafana (will be created on first OAuth login)", email)
        return False

    # User exists, try to add them to the organization
    response = _grafana_request('POST', f"/api/orgs/{org_id}/users", json={
        "loginOrEmail": email,
        "role": role
    })
    if response and response.status_code in (200, 201):
        logger.info("Added user %s to Grafana organization %s with role %s", email, org_id, role)
        return True
    if response and response.status_code == 412:
        # User is already a member (race condition)
        return True
    if response:
        logger.warning("Failed to add user %s to Grafana organization %s: %s", email, org_id, response.status_code)
    return False

def _determine_grafana_role(user_roles: List[str]) -> str:
    if not user_roles:
        return 'Viewer'
    roles_set = {role for role in user_roles}
    if 'PlatformAdmin' in roles_set or 'TenantAdmin' in roles_set:
        return 'Admin'
    if 'TechnicalConsultant' in roles_set or 'DeviceManager' in roles_set:  # DeviceManager kept for backward compatibility
        return 'Editor'
    return 'Viewer'

def _build_grafana_login_url(org_id: Optional[int], dashboard: Optional[str] = None) -> str:
    """
    Build Grafana OAuth SSO login URL.
    
    Instead of redirecting to Grafana's login page, we construct the Keycloak
    authorization URL directly with the correct redirect_uri pointing to Grafana.
    This initiates the OAuth flow automatically.
    """
    grafana_base = (GRAFANA_PUBLIC_URL or GRAFANA_URL or '').rstrip('/')
    if not grafana_base:
        return '/grafana/login/generic_oauth'

    # Build the target URL in Grafana after OAuth callback
    target_path = '/grafana/'
    if dashboard:
        target_path = f"/grafana/d/{dashboard}"
    if org_id:
        separator = '?' if '?' not in target_path else '&'
        target_path = f"{target_path}{separator}orgId={org_id}"
    elif org_id == 0:
        target_path = f"{target_path}?orgId=1"

    # Grafana's OAuth callback URL (where Keycloak will redirect after auth)
    redirect_uri = f"{grafana_base}/login/generic_oauth"
    
    # Keycloak authorization URL with OAuth parameters
    # Fallback to old URL if Keycloak URL is not configured
    if not KEYCLOAK_PUBLIC_URL or not KEYCLOAK_REALM or not GRAFANA_OAUTH_CLIENT_ID:
        logger.warning("Keycloak OAuth configuration missing, using fallback Grafana login URL")
        redirect_param = quote(target_path, safe='/?=&')
        return f"{grafana_base}/login/generic_oauth?redirect_to={redirect_param}"
    
    keycloak_base = KEYCLOAK_PUBLIC_URL.rstrip('/')
    auth_url = f"{keycloak_base}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth"
    
    # OAuth parameters
    params = {
        'client_id': GRAFANA_OAUTH_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': quote(target_path, safe='/?=&'),  # Pass target path as state
    }
    
    # Build query string
    query_string = '&'.join([f"{k}={quote(str(v), safe='')}" for k, v in params.items()])
    logger.info("Building Keycloak OAuth URL: %s?%s", auth_url, query_string)
    return f"{auth_url}?{query_string}"

def _gather_usage_for_tenant(tenant: str) -> Dict[str, Any]:
    """Compute aggregated usage statistics for a tenant."""
    robots_total = 0
    sensors_total = 0
    parcels_total = 0
    total_area = 0.0

    for entity_type in ROBOT_ENTITY_TYPES:
        count = _count_entities_by_type(entity_type, tenant)
        if isinstance(count, int) and count > 0:
            robots_total += count

    for entity_type in SENSOR_ENTITY_TYPES:
        count = _count_entities_by_type(entity_type, tenant)
        if isinstance(count, int) and count > 0:
            sensors_total += count

    for entity_type in PARCEL_ENTITY_TYPES:
        count = _count_entities_by_type(entity_type, tenant)
        if isinstance(count, int) and count > 0:
            parcels_total += count
        area_val = _sum_parcel_area(entity_type, tenant)
        if isinstance(area_val, (int, float)):
            total_area += area_val

    return {
        'robots': robots_total,
        'sensors': sensors_total,
        'parcels': parcels_total,
        'areaHectares': total_area,
    }

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'entity-manager'
    })

@app.route('/entity-types', methods=['GET'])
@require_auth
def list_entity_types():
    """List all available entity types"""
    try:
        entity_types = get_entity_types()
        return jsonify({
            'entity_types': entity_types,
            'count': sum(len(types) for types in entity_types.values()),
            'tenant': g.tenant
        })
    except Exception as e:
        logger.error(f"Error listing entity types: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/entity-types/<category>/<type_name>', methods=['GET'])
@require_auth
def get_entity_type(category, type_name):
    """Get specific entity type definition"""
    try:
        entity_types = get_entity_types()
        
        if category not in entity_types:
            return jsonify({'error': 'Category not found'}), 404
        
        if type_name not in entity_types[category]:
            return jsonify({'error': 'Entity type not found'}), 404
        
        return jsonify({
            'category': category,
            'type_name': type_name,
            'definition': entity_types[category][type_name],
            'tenant': g.tenant
        })
    
    except Exception as e:
        logger.error(f"Error getting entity type: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/entity-types/<category>/<type_name>', methods=['POST'])
def create_entity_type(category, type_name):
    """Create new entity type definition"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required fields
        required_fields = ['name', 'description', 'attributes']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Store entity type definition (in production, this would be stored in database)
        entity_types = get_entity_types()
        
        if category not in entity_types:
            entity_types[category] = {}
        
        entity_types[category][type_name] = {
            'name': data['name'],
            'description': data['description'],
            'attributes': data['attributes'],
            'created_at': datetime.utcnow().isoformat()
        }
        
        return jsonify({
            'message': 'Entity type created successfully',
            'category': category,
            'type_name': type_name,
            'definition': entity_types[category][type_name]
        }), 201
    
    except Exception as e:
        logger.error(f"Error creating entity type: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/entity-types/<category>/<type_name>', methods=['DELETE'])
def delete_entity_type(category, type_name):
    """Delete entity type definition"""
    try:
        entity_types = get_entity_types()
        
        if category not in entity_types or type_name not in entity_types[category]:
            return jsonify({'error': 'Entity type not found'}), 404
        
        del entity_types[category][type_name]
        
        return jsonify({
            'message': 'Entity type deleted successfully',
            'category': category,
            'type_name': type_name
        })
    
    except Exception as e:
        logger.error(f"Error deleting entity type: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# NDVI Jobs Endpoints
# =============================================================================

def _normalize_polygon(geometry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate and normalize a Polygon GeoJSON"""
    if not geometry or geometry.get('type') != 'Polygon':
        return None
    coordinates = geometry.get('coordinates')
    if not coordinates or not isinstance(coordinates, list):
        return None
    exterior = coordinates[0]
    if not exterior or len(exterior) < 3:
        return None

    # Ensure coordinates are list of [lon, lat]
    normalized = []
    for point in exterior:
        if (
            not isinstance(point, (list, tuple))
            or len(point) < 2
            or not isinstance(point[0], (int, float))
            or not isinstance(point[1], (int, float))
        ):
            return None
        normalized.append([float(point[0]), float(point[1])])

    # Ensure polygon is closed
    if normalized[0] != normalized[-1]:
        normalized.append(normalized[0])

    return {
        'type': 'Polygon',
        'coordinates': [normalized],
    }


def _calculate_area_hectares_from_polygon(polygon: Dict[str, Any]) -> Optional[float]:
    """Approximate polygon area (hectares) using equirectangular projection"""
    if not polygon:
        return None
    exterior = polygon.get('coordinates', [[]])[0]
    if len(exterior) < 4:
        return None

    # Remove last point if duplicate for area calculation
    coords = exterior[:-1]
    if len(coords) < 3:
        return None

    # Convert degrees to meters using equirectangular approximation
    lats = [coord[1] for coord in coords]
    lat0 = sum(lats) / len(lats)
    lat0_rad = radians(lat0)
    earth_radius = 6378137.0  # meters

    xy = []
    for lon, lat in coords:
        x = radians(lon) * earth_radius * cos(lat0_rad)
        y = radians(lat) * earth_radius
        xy.append((x, y))

    # Shoelace formula
    area = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        area += x1 * y2 - x2 * y1

    area_sq_m = abs(area) / 2.0
    return round(area_sq_m / 10_000.0, 4)


def _serialize_job(row: Dict[str, Any], tenant_id: Optional[str] = None) -> Dict[str, Any]:
    # Calculate estimated time remaining for processing jobs
    estimated_seconds_remaining = None
    if row.get('status') == 'processing' and row.get('started_at'):
        try:
            # Use tenant_id from row if not provided
            job_tenant = tenant_id or row.get('tenant_id') or (hasattr(g, 'tenant') and g.tenant)
            if job_tenant:
                # Get average duration from similar completed jobs
                with get_db_connection_with_tenant(job_tenant) as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration
                        FROM ndvi_jobs
                        WHERE tenant_id = %s
                        AND status = 'completed'
                        AND started_at IS NOT NULL
                        AND finished_at IS NOT NULL
                        AND started_at > NOW() - INTERVAL '30 days'
                        LIMIT 10
                    """, (job_tenant,))
                    result = cursor.fetchone()
                    cursor.close()
                    
                    if result and result[0]:
                        avg_duration = result[0]
                        started = row.get('started_at')
                        if isinstance(started, str):
                            from dateutil.parser import parse
                            started = parse(started)
                        elapsed = (datetime.utcnow() - started).total_seconds() if started else 0
                        estimated_seconds_remaining = max(0, avg_duration - elapsed)
        except Exception:
            pass  # Ignore errors in estimation
    
    # Helper function to convert NaN/Infinity to None for JSON serialization
    def clean_numeric_value(value):
        import math
        if value is None:
            return None
        if isinstance(value, (int, float)):
            if math.isnan(value) or math.isinf(value):
                return None
        return value
    
    ndvi_mean = row.get('ndvi_mean')
    area_hectares = row.get('area_hectares')
    
    return {
        'id': row.get('id'),
        'parcelId': row.get('parcel_id'),
        'status': row.get('status'),
        'requestedBy': row.get('requested_by'),
        'requestedAt': row.get('requested_at').isoformat() if row.get('requested_at') else None,
        'startedAt': row.get('started_at').isoformat() if row.get('started_at') else None,
        'finishedAt': row.get('finished_at').isoformat() if row.get('finished_at') else None,
        'timeRange': {
            'from': row.get('time_from').isoformat() if row.get('time_from') else None,
            'to': row.get('time_to').isoformat() if row.get('time_to') else None
        },
        'resolution': row.get('resolution'),
        'satellite': row.get('satellite'),
        'ndviMean': clean_numeric_value(ndvi_mean),
        'previewUrl': row.get('preview_url'),
        'error': row.get('error_message'),
        'parameters': row.get('parameters'),
        'geometry': row.get('geometry'),
        'areaHectares': clean_numeric_value(area_hectares),
        'jobType': row.get('job_type', 'parcel'),
        'progressMessage': row.get('progress_message'),
        'estimatedSecondsRemaining': int(estimated_seconds_remaining) if estimated_seconds_remaining else None
    }


def _clean_indices_data(indices_data: Any) -> Optional[Dict[str, Any]]:
    """Clean NaN values from indices_data JSONB structure"""
    import math
    if indices_data is None:
        return None
    if isinstance(indices_data, str):
        try:
            import json
            indices_data = json.loads(indices_data)
        except Exception:
            return indices_data
    if isinstance(indices_data, dict):
        cleaned = {}
        for key, value in indices_data.items():
            if isinstance(value, dict):
                cleaned[key] = {}
                for sub_key, sub_value in value.items():
                    if isinstance(sub_value, (int, float)):
                        if math.isnan(sub_value) or math.isinf(sub_value):
                            cleaned[key][sub_key] = None
                        else:
                            cleaned[key][sub_key] = sub_value
                    else:
                        cleaned[key][sub_key] = sub_value
            else:
                cleaned[key] = value
        return cleaned
    return indices_data

def _serialize_result(row: Dict[str, Any]) -> Dict[str, Any]:
    # Helper function to convert NaN/Infinity to None for JSON serialization
    def clean_numeric_value(value):
        import math
        if value is None:
            return None
        if isinstance(value, (int, float)):
            if math.isnan(value) or math.isinf(value):
                return None
        return value
    
    # Helper function to convert MinIO internal URLs to proxy URLs
    def convert_minio_url(url: Optional[str]) -> Optional[str]:
        if not url:
            return None
        # If URL is internal MinIO URL (minio-service:9000), convert to proxy endpoint
        if 'minio-service:9000' in url or 'http://minio-service:9000' in url or 'https://minio-service:9000' in url:
            # Extract the path part after the bucket name
            # URL format: http://minio-service:9000/ndvi-rasters/tenant/parcel/file.tif
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                # Path format: /bucket/key -> extract key part (e.g., /ndvi-rasters/platformadmin/parcel/file.tif)
                path = parsed.path.strip('/')
                # Remove bucket name (first part) to get the key
                path_parts = path.split('/', 1)
                if len(path_parts) == 2:
                    bucket, key = path_parts
                    # Return proxy URL: /api/ndvi/download/tenant/parcel/file.tif
                    converted_url = f'/api/ndvi/download/{key}'
                    logger.info(f"Converting MinIO URL: {url} -> {converted_url}")
                    return converted_url
                else:
                    logger.warning(f"Unexpected MinIO URL format: {url}")
            except Exception as e:
                logger.warning(f"Failed to convert MinIO URL {url}: {e}")
        return url
    
    # Clean indices_data
    indices_data_cleaned = None
    if 'indices_data' in row:
        raw_indices_data = row.get('indices_data')
        if raw_indices_data:
            # Handle both JSONB (dict) and JSON string formats
            if isinstance(raw_indices_data, str):
                try:
                    import json
                    raw_indices_data = json.loads(raw_indices_data)
                except Exception:
                    logger.warning(f"Failed to parse indices_data JSON string: {raw_indices_data[:100] if raw_indices_data else 'None'}")
                    raw_indices_data = None
            if raw_indices_data:
                indices_data_cleaned = _clean_indices_data(raw_indices_data)
                # Validate that we have at least some index data
                if indices_data_cleaned and isinstance(indices_data_cleaned, dict):
                    # Check if it's empty dict or has at least one valid index
                    has_valid_index = any(
                        isinstance(v, dict) and v.get('mean') is not None
                        for k, v in indices_data_cleaned.items()
                        if k != 'cloud_cover_real'
                    )
                    if not has_valid_index:
                        logger.debug(f"indices_data has no valid index stats: {list(indices_data_cleaned.keys())}")
    
    return {
        'id': row.get('id'),
        'jobId': row.get('job_id'),
        'parcelId': row.get('parcel_id'),
        'date': row.get('acquisition_date').isoformat() if row.get('acquisition_date') else None,
        'ndviMean': clean_numeric_value(row.get('ndvi_mean')),
        'ndviMin': clean_numeric_value(row.get('ndvi_min')),
        'ndviMax': clean_numeric_value(row.get('ndvi_max')),
        'ndviStddev': clean_numeric_value(row.get('ndvi_stddev')),
        'cloudCover': clean_numeric_value(row.get('cloud_cover')),
        'rasterUrl': convert_minio_url(row.get('raster_url')),
        'previewUrl': convert_minio_url(row.get('preview_url')),
        'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
        'geometry': row.get('geometry') if 'geometry' in row else None,
        'areaHectares': clean_numeric_value(row.get('area_hectares')) if 'area_hectares' in row else None,
        'indicesData': indices_data_cleaned
    }


def _parse_time_range(data: Dict[str, Any]) -> Dict[str, Optional[datetime]]:
    time_range = data.get('timeRange') or {}
    start = time_range.get('start')
    end = time_range.get('end')
    try:
        start_dt = datetime.fromisoformat(start) if start else None
        end_dt = datetime.fromisoformat(end) if end else None
    except Exception:
        start_dt = None
        end_dt = None
    return {'start': start_dt, 'end': end_dt}


@app.route('/ndvi/jobs', methods=['POST'])
@require_auth(require_hmac=False)
def create_ndvi_job():
    """Enqueue NDVI calculation for a parcel"""
    if not POSTGRES_URL:
        return jsonify({'error': 'NDVI database not configured'}), 503

    data = request.get_json() or {}
    parcel_id = data.get('parcelId') or data.get('parcel_id')
    raw_geometry = data.get('geometry')
    
    # Detect source module: from header, parameter, or default to 'ndvi' (legacy)
    source_module = (
        request.headers.get('X-Source-Module') or
        data.get('sourceModule') or
        data.get('source_module') or
        'ndvi'  # Default to legacy for backward compatibility
    )
    # Validate source_module (only allow known modules)
    if source_module not in ['ndvi']:
        logger.warning(f"Invalid source_module '{source_module}', defaulting to 'ndvi'")
        source_module = 'ndvi'

    normalized_geometry: Optional[Dict[str, Any]] = None
    area_hectares: Optional[float] = None
    job_type = 'parcel'

    if raw_geometry:
        normalized_geometry = _normalize_polygon(raw_geometry)
        if not normalized_geometry:
            return jsonify({'error': 'Invalid geometry. Expecting GeoJSON Polygon.'}), 400
        area_hectares = _calculate_area_hectares_from_polygon(normalized_geometry)
        job_type = 'manual'

    if not parcel_id and not normalized_geometry:
        return jsonify({'error': 'Either parcelId or geometry must be provided'}), 400

    time_range = _parse_time_range(data)
    if not time_range['start'] or not time_range['end']:
        time_range['end'] = datetime.utcnow()
        time_range['start'] = time_range['end'] - timedelta(days=7)

    resolution = int(data.get('resolution') or DEFAULT_RESOLUTION)
    satellite = data.get('satellite') or DEFAULT_SATELLITE
    max_cloud = data.get('maxCloudCoverage', 40)

    job_id = str(uuid.uuid4())
    requested_by = (getattr(g, 'current_user', {}) or {}).get('email')

    # Attempt to fetch parcel area if not provided and parcelId available
    if parcel_id and area_hectares is None:
        try:
            with get_db_connection_with_tenant(g.tenant) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT area_hectares
                    FROM cadastral_parcels
                    WHERE id = %s
                    LIMIT 1
                    """,
                    (parcel_id,)
                )
                parcel_row = cursor.fetchone()
                cursor.close()
            if parcel_row:
                area_hectares = parcel_row[0]
        except Exception as parcel_err:
            logger.warning(f"Unable to fetch parcel metadata for {parcel_id}: {parcel_err}")

    parameters = {
        'timeRange': {
            'start': time_range['start'].isoformat(),
            'end': time_range['end'].isoformat()
        },
        'resolution': resolution,
        'satellite': satellite,
        'maxCloudCoverage': max_cloud
    }

    try:
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor()
            # Check if source_module column exists (for backward compatibility)
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'ndvi_jobs' 
                AND column_name = 'source_module'
            """)
            has_source_module = cursor.fetchone() is not None
            
            if has_source_module:
                cursor.execute("""
                    INSERT INTO ndvi_jobs (
                        id, tenant_id, parcel_id, status,
                        requested_by, requested_at, time_from, time_to,
                        resolution, satellite, parameters,
                        geometry, area_hectares, job_type, source_module
                    ) VALUES (
                        %s, %s, %s, 'queued',
                        %s, NOW(), %s, %s,
                        %s, %s, %s::jsonb,
                        %s::jsonb, %s, %s, %s
                    )
                """, (
                    job_id, g.tenant, parcel_id,
                    requested_by,
                    time_range['start'], time_range['end'],
                    resolution, satellite,
                    json.dumps(parameters),
                    json.dumps(normalized_geometry) if normalized_geometry else None,
                    area_hectares,
                    job_type,
                    source_module
                ))
            else:
                # Fallback for databases without source_module column
                cursor.execute("""
                    INSERT INTO ndvi_jobs (
                        id, tenant_id, parcel_id, status,
                        requested_by, requested_at, time_from, time_to,
                        resolution, satellite, parameters,
                        geometry, area_hectares, job_type
                    ) VALUES (
                        %s, %s, %s, 'queued',
                        %s, NOW(), %s, %s,
                        %s, %s, %s::jsonb,
                        %s::jsonb, %s, %s
                    )
                """, (
                    job_id, g.tenant, parcel_id,
                    requested_by,
                    time_range['start'], time_range['end'],
                    resolution, satellite,
                    json.dumps(parameters),
                    json.dumps(normalized_geometry) if normalized_geometry else None,
                    area_hectares,
                    job_type
                ))
            conn.commit()
            cursor.close()
    except Exception as e:
        logger.error(f"Failed to insert NDVI job: {e}")
        NDVI_JOB_CREATION_FAILURES.inc()
        return jsonify({'error': 'Failed to create job'}), 500

    payload = {
        'job_id': job_id,
        'tenant_id': g.tenant,
        'parcel_id': parcel_id,
        'time_range': parameters['timeRange'],
        'resolution': resolution,
        'satellite': satellite,
        'max_cloud_coverage': max_cloud,
        'requested_by': requested_by,
        'geometry': normalized_geometry,
        'area_hectares': area_hectares
    }

    try:
        logger.info(f"Attempting to enqueue NDVI task for job {job_id}, tenant {g.tenant}, queue {NDVI_QUEUE_NAME}")
        task_id = enqueue_task(
            tenant_id=g.tenant,
            task_type=TaskType.NDVI_PROCESSING,
            payload=payload,
            queue_name=NDVI_QUEUE_NAME,
            max_retries=3
        )
        if task_id:
            logger.info(f"Successfully enqueued NDVI task {task_id} for job {job_id}")
        else:
            logger.error(f"enqueue_task returned None for job {job_id}")
    except Exception as e:
        logger.error(f"Exception while enqueueing NDVI task for job {job_id}: {e}", exc_info=True)
        task_id = None

    if not task_id:
        logger.error(f"Failed to enqueue NDVI task for job {job_id}; marking job as failed")
        NDVI_JOB_CREATION_FAILURES.inc()
        try:
            with get_db_connection_with_tenant(g.tenant) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE ndvi_jobs
                    SET status = 'failed',
                        finished_at = NOW(),
                        error_message = %s
                    WHERE id = %s
                """, ("Queue unavailable", job_id))
                conn.commit()
                cursor.close()
        except Exception as e:
            logger.error(f"Failed to update job after enqueue failure: {e}")
        return jsonify({'error': 'Unable to enqueue NDVI job'}), 503

    NDVI_JOBS_CREATED.inc()
    return jsonify({
        'job': {
            'id': job_id,
            'parcelId': parcel_id,
            'status': 'queued',
            'requestedAt': datetime.utcnow().isoformat(),
            'timeRange': parameters['timeRange'],
            'resolution': resolution,
            'satellite': satellite
        }
    }), 202


@app.route('/ndvi/jobs', methods=['GET'])
@require_auth(require_hmac=False)
def list_ndvi_jobs():
    if not POSTGRES_URL:
        return jsonify({'jobs': []})

    try:
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # Check if progress_message column exists
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'ndvi_jobs' 
                AND column_name = 'progress_message'
            """)
            has_progress = cursor.fetchone() is not None
            
            if has_progress:
                cursor.execute("""
                    SELECT
                        id, parcel_id, status, requested_by, requested_at,
                        started_at, finished_at, time_from, time_to,
                        resolution, satellite, ndvi_mean, preview_url,
                        error_message, parameters,
                        geometry, area_hectares, job_type, progress_message
                    FROM ndvi_jobs
                    WHERE tenant_id = %s
                    ORDER BY requested_at DESC
                    LIMIT 100
                """, (g.tenant,))
            else:
                cursor.execute("""
                    SELECT
                        id, parcel_id, status, requested_by, requested_at,
                        started_at, finished_at, time_from, time_to,
                        resolution, satellite, ndvi_mean, preview_url,
                        error_message, parameters,
                        geometry, area_hectares, job_type
                    FROM ndvi_jobs
                    WHERE tenant_id = %s
                    ORDER BY requested_at DESC
                    LIMIT 100
                """, (g.tenant,))
            rows = cursor.fetchall()
            cursor.close()
        jobs = [_serialize_job(row, g.tenant) for row in rows]
        logger.info(f"Returning {len(jobs)} jobs for tenant {g.tenant}")
        if jobs:
            logger.info(f"First job ID: {jobs[0].get('id')}, status: {jobs[0].get('status')}")
        return jsonify({'jobs': jobs}), 200
    except Exception as e:
        logger.error(f"Error listing NDVI jobs: {e}")
        return jsonify({'error': 'Failed to list jobs'}), 500


@app.route('/ndvi/jobs/<job_id>', methods=['GET', 'DELETE'])
@require_auth(require_hmac=False)
def get_ndvi_job(job_id: str):
    if not POSTGRES_URL:
        return jsonify({'error': 'NDVI not configured'}), 503

    if request.method == 'DELETE':
        # Delete or cancel NDVI job and associated data
        logger.info(f"DELETE request for job {job_id}, tenant {g.tenant}, query params: {dict(request.args)}")
        try:
            # Get S3 configuration for file deletion
            S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
            S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY')
            S3_SECRET_KEY = os.getenv('S3_SECRET_KEY')
            S3_BUCKET = os.getenv('S3_BUCKET', 'ndvi-rasters')
            S3_REGION = os.getenv('S3_REGION', 'us-east-1')
            S3_USE_SSL = os.getenv('S3_USE_SSL', 'false').lower() == 'true'
            
            s3_client = None
            if S3_ACCESS_KEY and S3_SECRET_KEY:
                s3_client = boto3.client(
                    's3',
                    endpoint_url=S3_ENDPOINT_URL,
                    aws_access_key_id=S3_ACCESS_KEY,
                    aws_secret_access_key=S3_SECRET_KEY,
                    region_name=S3_REGION,
                    use_ssl=S3_USE_SSL,
                    verify=S3_USE_SSL
                )
            
            with get_db_connection_with_tenant(g.tenant) as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                
                # Get job details including status
                cursor.execute("""
                    SELECT status, parcel_id FROM ndvi_jobs
                    WHERE id = %s AND tenant_id = %s
                """, (job_id, g.tenant))
                job_row = cursor.fetchone()
                
                if not job_row:
                    cursor.close()
                    return jsonify({'error': 'Job not found'}), 404
                
                current_status = job_row['status']
                parcel_id = job_row.get('parcel_id')
                
                # Get all results associated with this job to delete files
                cursor.execute("""
                    SELECT id, raster_url, preview_url FROM ndvi_results
                    WHERE job_id = %s AND tenant_id = %s
                """, (job_id, g.tenant))
                results = cursor.fetchall()
                
                # Delete files from MinIO
                deleted_files = 0
                if s3_client and results:
                    for result in results:
                        for url_field in ['raster_url', 'preview_url']:
                            url = result.get(url_field)
                            if url and 'minio-service:9000' in url:
                                try:
                                    from urllib.parse import urlparse
                                    parsed = urlparse(url)
                                    path = parsed.path.strip('/')
                                    # Remove bucket name (first part) to get the key
                                    path_parts = path.split('/', 1)
                                    if len(path_parts) == 2:
                                        bucket, key = path_parts
                                        try:
                                            s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
                                            deleted_files += 1
                                            logger.info(f"Deleted file from S3: {S3_BUCKET}/{key}")
                                        except ClientError as e:
                                            logger.warning(f"Failed to delete file {key} from S3: {e}")
                                except Exception as e:
                                    logger.warning(f"Failed to parse URL {url} for deletion: {e}")
                
                # Delete results from database
                if results:
                    cursor.execute("""
                        DELETE FROM ndvi_results
                        WHERE job_id = %s AND tenant_id = %s
                    """, (job_id, g.tenant))
                    deleted_results = cursor.rowcount
                    logger.info(f"Deleted {deleted_results} results for job {job_id}")
                
                # If job is processing, cancel it (mark as failed with cancellation message)
                if current_status == 'processing':
                    cursor.execute("""
                        UPDATE ndvi_jobs
                        SET status = 'failed',
                            error_message = 'Job cancelled by user',
                            finished_at = NOW()
                        WHERE id = %s AND tenant_id = %s
                    """, (job_id, g.tenant))
                    conn.commit()
                    updated = cursor.rowcount
                    cursor.close()
                    if updated == 0:
                        return jsonify({'error': 'Failed to cancel job'}), 500
                    logger.info(f"Job {job_id} cancelled by user, deleted {deleted_files} files and {len(results)} results")
                    return jsonify({
                        'status': 'cancelled', 
                        'job_id': job_id,
                        'deleted_results': len(results),
                        'deleted_files': deleted_files
                    }), 200
                
                # For pending, queued, or failed jobs, delete them completely
                elif current_status in ('pending', 'queued', 'failed'):
                    cursor.execute("""
                        DELETE FROM ndvi_jobs
                        WHERE id = %s AND tenant_id = %s
                    """, (job_id, g.tenant))
                    conn.commit()
                    deleted = cursor.rowcount
                    cursor.close()
                    if deleted == 0:
                        return jsonify({'error': 'Failed to delete job'}), 500
                    logger.info(f"Job {job_id} deleted, removed {deleted_files} files and {len(results)} results")
                    return jsonify({
                        'status': 'deleted', 
                        'job_id': job_id,
                        'deleted_results': len(results),
                        'deleted_files': deleted_files
                    }), 200
                
                # For completed jobs, allow deletion but keep results by default
                # If ?delete_results=true is passed, also delete results
                else:  # current_status == 'completed'
                    delete_results = request.args.get('delete_results', 'false').lower() == 'true'
                    logger.info(f"Deleting completed job {job_id}, delete_results={delete_results}")
                    if delete_results:
                        # Delete job and results
                        cursor.execute("""
                            DELETE FROM ndvi_jobs
                            WHERE id = %s AND tenant_id = %s
                        """, (job_id, g.tenant))
                        conn.commit()
                        deleted = cursor.rowcount
                        cursor.close()
                        logger.info(f"Completed job {job_id} deleted with results, removed {deleted_files} files")
                        return jsonify({
                            'status': 'deleted', 
                            'job_id': job_id,
                            'deleted_results': len(results),
                            'deleted_files': deleted_files
                        }), 200
                    else:
                        # Just delete the job, keep results
                        cursor.execute("""
                            DELETE FROM ndvi_jobs
                            WHERE id = %s AND tenant_id = %s
                        """, (job_id, g.tenant))
                        conn.commit()
                        deleted = cursor.rowcount
                        cursor.close()
                        logger.info(f"Completed job {job_id} deleted (results kept)")
                        return jsonify({
                            'status': 'deleted', 
                            'job_id': job_id,
                            'results_kept': True
                        }), 200
                    
        except Exception as e:
            logger.error(f"Error deleting/cancelling NDVI job: {e}", exc_info=True)
            return jsonify({'error': 'Failed to delete job'}), 500

    # GET method
    try:
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # Check if progress_message column exists
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'ndvi_jobs' 
                AND column_name = 'progress_message'
            """)
            has_progress = cursor.fetchone() is not None
            
            if has_progress:
                cursor.execute("""
                    SELECT
                        id, parcel_id, status, requested_by, requested_at,
                        started_at, finished_at, time_from, time_to,
                        resolution, satellite, ndvi_mean, preview_url,
                        error_message, parameters,
                        geometry, area_hectares, job_type, progress_message
                    FROM ndvi_jobs
                    WHERE id = %s AND tenant_id = %s
                    LIMIT 1
                """, (job_id, g.tenant))
            else:
                cursor.execute("""
                    SELECT
                        id, parcel_id, status, requested_by, requested_at,
                        started_at, finished_at, time_from, time_to,
                        resolution, satellite, ndvi_mean, preview_url,
                        error_message, parameters,
                        geometry, area_hectares, job_type
                    FROM ndvi_jobs
                    WHERE id = %s AND tenant_id = %s
                    LIMIT 1
                """, (job_id, g.tenant))
            row = cursor.fetchone()
            cursor.close()
        if not row:
            return jsonify({'error': 'Job not found'}), 404
        return jsonify({'job': _serialize_job(row, g.tenant)}), 200
    except Exception as e:
        logger.error(f"Error fetching NDVI job: {e}")
        return jsonify({'error': 'Failed to fetch job'}), 500


@app.route('/ndvi/results', methods=['GET'])
@require_auth(require_hmac=False)
def list_ndvi_results():
    parcel_id = request.args.get('parcelId') or request.args.get('parcel_id')
    limit = min(int(request.args.get('limit', MAX_NDVI_RESULT_HISTORY)), 500)

    if not POSTGRES_URL:
        return jsonify({'results': []})

    try:
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check which columns exist in the table
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'ndvi_results' 
                ORDER BY ordinal_position
            """)
            rows = cursor.fetchall()
            # RealDictCursor returns dicts, regular cursor returns tuples
            if rows and isinstance(rows[0], dict):
                existing_columns = {row['column_name'] for row in rows}
            else:
                existing_columns = {row[0] for row in rows}
            
            # Build SELECT query based on available columns
            # Only include columns that actually exist in the table
            base_columns = [
                'id', 'job_id', 'parcel_id', 'acquisition_date',
                'ndvi_mean', 'ndvi_min', 'ndvi_max', 'ndvi_stddev',
                'cloud_cover', 'raster_url', 'preview_url', 'created_at'
            ]
            
            # Add optional columns if they exist
            if 'geometry' in existing_columns:
                base_columns.append('geometry')
            if 'area_hectares' in existing_columns:
                base_columns.append('area_hectares')
            if 'indices_data' in existing_columns:
                base_columns.append('indices_data')
            
            columns_str = ', '.join(base_columns)
            
            if parcel_id:
                cursor.execute(f"""
                    SELECT {columns_str}
                    FROM ndvi_results
                    WHERE tenant_id = %s AND parcel_id = %s
                    ORDER BY acquisition_date DESC
                    LIMIT %s
                """, (g.tenant, parcel_id, limit))
            else:
                cursor.execute(f"""
                    SELECT {columns_str}
                    FROM ndvi_results
                    WHERE tenant_id = %s
                    ORDER BY acquisition_date DESC
                    LIMIT %s
                """, (g.tenant, limit))
            rows = cursor.fetchall()
            cursor.close()
        results = [_serialize_result(row) for row in rows]
        return jsonify(results), 200  # Return array directly, not wrapped in object
    except Exception as e:
        logger.error(f"Error listing NDVI results: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch results'}), 500

@app.route('/ndvi/download/<path:file_path>', methods=['GET'])
@require_auth(require_hmac=False)
def download_ndvi_file(file_path: str):
    """
    Proxy endpoint to download NDVI raster/preview files from MinIO.
    Converts internal MinIO URLs to accessible download URLs.
    
    Args:
        file_path: Path to file in MinIO bucket (e.g., 'tenant/parcel/file.tif')
    """
    try:
        # Get MinIO configuration from environment
        S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
        S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY')
        S3_SECRET_KEY = os.getenv('S3_SECRET_KEY')
        S3_BUCKET = os.getenv('S3_BUCKET', 'ndvi-rasters')
        S3_REGION = os.getenv('S3_REGION', 'us-east-1')
        S3_USE_SSL = os.getenv('S3_USE_SSL', 'false').lower() == 'true'
        
        if not S3_ACCESS_KEY or not S3_SECRET_KEY:
            logger.error("S3 credentials not configured for NDVI file download")
            return jsonify({'error': 'File storage not configured'}), 503
        
        # Verify tenant access (file path should start with tenant_id)
        tenant_id = g.tenant
        if not file_path.startswith(tenant_id):
            logger.warning(f"Access denied: file path {file_path} does not start with tenant {tenant_id}")
            return jsonify({'error': 'Access denied'}), 403
        
        # Create S3 client
        s3_client = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
            use_ssl=S3_USE_SSL,
            verify=S3_USE_SSL
        )
        
        # Download file from S3
        # file_path format from convert_minio_url: platformadmin/parcel/file.tif (bucket name already removed)
        # The s3_key format from worker: tenant_id/parcel_id/file.tif (same format, no bucket prefix)
        # So we can use file_path directly as the S3 key
        s3_key = file_path
        logger.info(f"Downloading file from S3: bucket={S3_BUCKET}, key={s3_key}, tenant={tenant_id}, file_path={file_path}")
        try:
            s3_response = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_key)
            file_data = s3_response['Body'].read()
            content_type = s3_response.get('ContentType', 'application/octet-stream')
            
            # Determine file extension for proper content type
            if file_path.endswith('.tif') or file_path.endswith('.tiff'):
                content_type = 'image/tiff'
            elif file_path.endswith('.png'):
                content_type = 'image/png'
            elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
                content_type = 'image/jpeg'
            
            # Extract filename from path for Content-Disposition header
            filename = file_path.split('/')[-1]
            
            # Return file with appropriate headers
            return Response(
                file_data,
                mimetype=content_type,
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"',
                    'Content-Length': str(len(file_data))
                }
            )
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == 'NoSuchKey':
                logger.warning(f"File not found in S3: {S3_BUCKET}/{file_path}")
                return jsonify({'error': 'File not found'}), 404
            else:
                logger.error(f"Error downloading file from S3: {e}", exc_info=True)
                return jsonify({'error': 'Failed to download file'}), 500
        except Exception as e:
            logger.error(f"Error downloading file from S3: {e}", exc_info=True)
            return jsonify({'error': 'Failed to download file'}), 500
            
    except Exception as e:
        logger.error(f"Error in download_ndvi_file: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/ndvi/results/<result_id>', methods=['DELETE'])
@require_auth(require_hmac=False)
def delete_ndvi_result(result_id: str):
    """
    Delete an NDVI result and its associated files from MinIO.
    """
    try:
        # Get S3 configuration
        S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
        S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY')
        S3_SECRET_KEY = os.getenv('S3_SECRET_KEY')
        S3_BUCKET = os.getenv('S3_BUCKET', 'ndvi-rasters')
        S3_REGION = os.getenv('S3_REGION', 'us-east-1')
        S3_USE_SSL = os.getenv('S3_USE_SSL', 'false').lower() == 'true'
        
        if not S3_ACCESS_KEY or not S3_SECRET_KEY:
            logger.error("S3 credentials not configured for NDVI file deletion")
            return jsonify({'error': 'File storage not configured'}), 503
        
        s3_client = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
            use_ssl=S3_USE_SSL,
            verify=S3_USE_SSL
        )
        
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get result details including file URLs
            cursor.execute("""
                SELECT id, raster_url, preview_url FROM ndvi_results
                WHERE id = %s AND tenant_id = %s
            """, (result_id, g.tenant))
            result = cursor.fetchone()
            
            if not result:
                cursor.close()
                return jsonify({'error': 'Result not found'}), 404
            
            # Delete files from MinIO
            deleted_files = 0
            for url_field in ['raster_url', 'preview_url']:
                url = result.get(url_field)
                if url and 'minio-service:9000' in url:
                    try:
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        path = parsed.path.strip('/')
                        # Remove bucket name (first part) to get the key
                        path_parts = path.split('/', 1)
                        if len(path_parts) == 2:
                            bucket, key = path_parts
                            try:
                                s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
                                deleted_files += 1
                                logger.info(f"Deleted file from S3: {S3_BUCKET}/{key}")
                            except ClientError as e:
                                if e.response['Error']['Code'] != 'NoSuchKey':
                                    logger.warning(f"Failed to delete file {key} from S3: {e}")
                    except Exception as e:
                        logger.warning(f"Failed to parse URL {url} for deletion: {e}")
            
            # Delete result from database
            cursor.execute("""
                DELETE FROM ndvi_results
                WHERE id = %s AND tenant_id = %s
            """, (result_id, g.tenant))
            conn.commit()
            deleted = cursor.rowcount
            cursor.close()
            
            if deleted == 0:
                return jsonify({'error': 'Failed to delete result'}), 500
            
            logger.info(f"Result {result_id} deleted, removed {deleted_files} files")
            return jsonify({
                'status': 'deleted',
                'result_id': result_id,
                'deleted_files': deleted_files
            }), 200
            
    except Exception as e:
        logger.error(f"Error deleting NDVI result: {e}", exc_info=True)
        return jsonify({'error': 'Failed to delete result'}), 500

@app.route('/ndvi/jobs/cleanup', methods=['POST'])
@require_auth(require_hmac=False)
def cleanup_ndvi_jobs():
    """
    Clean up old or problematic NDVI jobs.
    Query params:
    - status: comma-separated list of statuses to delete (default: 'failed,queued')
    - older_than_days: delete jobs older than N days (optional)
    - delete_results: also delete associated results and files (default: false)
    """
    try:
        status_filter = request.args.get('status', 'failed,queued').split(',')
        older_than_days = request.args.get('older_than_days', type=int)
        delete_results = request.args.get('delete_results', 'false').lower() == 'true'
        
        # Get S3 configuration for file deletion
        S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
        S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY')
        S3_SECRET_KEY = os.getenv('S3_SECRET_KEY')
        S3_BUCKET = os.getenv('S3_BUCKET', 'ndvi-rasters')
        S3_REGION = os.getenv('S3_REGION', 'us-east-1')
        S3_USE_SSL = os.getenv('S3_USE_SSL', 'false').lower() == 'true'
        
        s3_client = None
        if S3_ACCESS_KEY and S3_SECRET_KEY:
            s3_client = boto3.client(
                's3',
                endpoint_url=S3_ENDPOINT_URL,
                aws_access_key_id=S3_ACCESS_KEY,
                aws_secret_access_key=S3_SECRET_KEY,
                region_name=S3_REGION,
                use_ssl=S3_USE_SSL,
                verify=S3_USE_SSL
            )
        
        with get_db_connection_with_tenant(g.tenant) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Build query to find jobs to delete
            query = """
                SELECT id FROM ndvi_jobs
                WHERE tenant_id = %s AND status = ANY(%s)
            """
            params = [g.tenant, status_filter]
            
            if older_than_days:
                query += " AND requested_at < NOW() - INTERVAL '%s days'"
                params.append(older_than_days)
            
            cursor.execute(query, params)
            jobs_to_delete = cursor.fetchall()
            job_ids = [job['id'] for job in jobs_to_delete]
            
            if not job_ids:
                cursor.close()
                return jsonify({
                    'status': 'success',
                    'deleted_jobs': 0,
                    'message': 'No jobs found matching criteria'
                }), 200
            
            deleted_files = 0
            deleted_results = 0
            
            if delete_results and s3_client:
                # Get all results for these jobs
                cursor.execute("""
                    SELECT id, raster_url, preview_url FROM ndvi_results
                    WHERE job_id = ANY(%s) AND tenant_id = %s
                """, (job_ids, g.tenant))
                results = cursor.fetchall()
                
                # Delete files from MinIO
                for result in results:
                    for url_field in ['raster_url', 'preview_url']:
                        url = result.get(url_field)
                        if url and 'minio-service:9000' in url:
                            try:
                                from urllib.parse import urlparse
                                parsed = urlparse(url)
                                path = parsed.path.strip('/')
                                path_parts = path.split('/', 1)
                                if len(path_parts) == 2:
                                    bucket, key = path_parts
                                    try:
                                        s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
                                        deleted_files += 1
                                    except ClientError:
                                        pass  # File might not exist
                            except Exception:
                                pass
                
                # Delete results
                if results:
                    cursor.execute("""
                        DELETE FROM ndvi_results
                        WHERE job_id = ANY(%s) AND tenant_id = %s
                    """, (job_ids, g.tenant))
                    deleted_results = cursor.rowcount
            
            # Delete jobs
            cursor.execute("""
                DELETE FROM ndvi_jobs
                WHERE id = ANY(%s) AND tenant_id = %s
            """, (job_ids, g.tenant))
            deleted_jobs = cursor.rowcount
            conn.commit()
            cursor.close()
            
            logger.info(f"Cleaned up {deleted_jobs} jobs, {deleted_results} results, {deleted_files} files")
            return jsonify({
                'status': 'success',
                'deleted_jobs': deleted_jobs,
                'deleted_results': deleted_results,
                'deleted_files': deleted_files
            }), 200
            
    except Exception as e:
        logger.error(f"Error cleaning up NDVI jobs: {e}", exc_info=True)
        return jsonify({'error': 'Failed to cleanup jobs'}), 500

@app.route('/instances/<entity_type>', methods=['GET'])
@require_auth
def list_instances(entity_type):
    """List instances of a specific entity type"""
    try:
        # Query Orion-LD for entities of this type
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {'type': entity_type}
        
        headers = {
            'Accept': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.get(orion_url, params=params, headers=headers)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to query Orion'}), 500
        
        entities = response.json()
        
        # Log the operation
        log_entity_operation('list', None, entity_type, g.tenant, g.farmer_id, 
                           {'count': len(entities)})
        
        return jsonify({
            'entity_type': entity_type,
            'instances': entities,
            'count': len(entities),
            'tenant': g.tenant
        })
    
    except Exception as e:
        logger.error(f"Error listing instances: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/instances/<entity_type>', methods=['POST'])
@require_auth
def create_instance(entity_type):
    """Create new instance of entity type"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Add type and ID to entity
        entity_id = data.get('id', f"{entity_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")
        entity_data = {
            'id': entity_id,
            'type': entity_type,
            **data
        }

        # Enforcements por límites (por tipo)
        tenant = g.tenant
        # Cargar límites por tenant (override de env si existen en Orion)
        limits = get_limits_for_tenant(tenant) or {}
        max_robots = int(limits.get('maxRobots') or MAX_ROBOTS)
        max_sensors = int(limits.get('maxSensors') or MAX_SENSORS)
        max_area = float(limits.get('maxAreaHectares') or MAX_AREA_HECTARES)

        # Límite de robots - contar todos los tipos de robots
        if entity_type in ROBOT_ENTITY_TYPES and max_robots < 999999:
            robots_total = 0
            for robot_type in ROBOT_ENTITY_TYPES:
                count = _count_entities_by_type(robot_type, tenant)
                if count is not None:
                    robots_total += count
            if robots_total >= max_robots:
                return jsonify({'error': 'Robot limit exceeded', 'limit': max_robots, 'current': robots_total}), 403
        # Límite de sensores - contar todos los tipos de sensores
        if entity_type in SENSOR_ENTITY_TYPES and max_sensors < 999999:
            sensors_total = 0
            for sensor_type in SENSOR_ENTITY_TYPES:
                count = _count_entities_by_type(sensor_type, tenant)
                if count is not None:
                    sensors_total += count
            if sensors_total >= max_sensors:
                return jsonify({'error': 'Sensor limit exceeded', 'limit': max_sensors, 'current': sensors_total}), 403
        # Límite de superficie (ha) para parcelas
        if entity_type in PARCEL_ENTITY_TYPES and max_area < 1000000000:
            new_area = _extract_number(entity_data.get('area'))
            if new_area is None:
                new_area = 0.0
            current_area = _sum_parcel_area(entity_type, tenant)
            if (current_area + new_area) > max_area:
                return jsonify({
                    'error': 'Parcel area limit exceeded',
                    'limit_hectares': max_area,
                    'current_hectares': current_area,
                    'requested_hectares': new_area
                }), 403
        
        # Send to Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        headers = {
            'Content-Type': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.post(orion_url, json=entity_data, headers=headers)
        if response.status_code in [200, 201]:
            # Log the operation
            log_entity_operation('create', entity_id, entity_type, g.tenant, g.farmer_id, 
                               {'attributes': list(entity_data.keys())})
            
            return jsonify({
                'message': 'Entity instance created successfully',
                'entity': entity_data,
                'tenant': g.tenant
            }), 201
        else:
            return jsonify({'error': 'Failed to create entity in Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error creating instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/instances/<entity_type>/<entity_id>', methods=['GET'])
@require_auth
@require_entity_ownership
def get_instance(entity_type, entity_id):
    """Get specific entity instance"""
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        headers = {
            'Accept': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.get(orion_url, headers=headers)
        if response.status_code == 200:
            entity = response.json()
            return jsonify({
                'entity': entity,
                'tenant': g.tenant
            })
        elif response.status_code == 404:
            return jsonify({'error': 'Entity not found'}), 404
        else:
            return jsonify({'error': 'Failed to get entity from Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error getting instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/instances/<entity_type>/<entity_id>', methods=['PATCH'])
@require_auth
@require_entity_ownership
def update_instance(entity_type, entity_id):
    """Update specific entity instance attributes"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
        headers = {
            'Content-Type': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.patch(orion_url, json=data, headers=headers)
        if response.status_code in [200, 204]:
            # Log the operation
            log_entity_operation('update', entity_id, entity_type, g.tenant, g.farmer_id, 
                               {'updated_attributes': list(data.keys())})
            
            return jsonify({
                'message': 'Entity updated successfully',
                'entity_id': entity_id,
                'updated_attributes': list(data.keys()),
                'tenant': g.tenant
            })
        elif response.status_code == 404:
            return jsonify({'error': 'Entity not found'}), 404
        else:
            return jsonify({'error': 'Failed to update entity in Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error updating instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/instances/<entity_type>/<entity_id>', methods=['DELETE'])
@require_auth
@require_entity_ownership
def delete_instance(entity_type, entity_id):
    """Delete specific entity instance"""
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        headers = {}
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.delete(orion_url, headers=headers)
        if response.status_code in [200, 204]:
            # Log the operation
            log_entity_operation('delete', entity_id, entity_type, g.tenant, g.farmer_id)
            
            return jsonify({
                'message': 'Entity deleted successfully',
                'entity_id': entity_id,
                'tenant': g.tenant
            })
        elif response.status_code == 404:
            return jsonify({'error': 'Entity not found'}), 404
        else:
            return jsonify({'error': 'Failed to delete entity from Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error deleting instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/tenant-limits', methods=['GET'])
@require_auth
def api_get_tenant_limits():
    """Devuelve límites efectivos del tenant actual (dinámicos si existen en Orion)."""
    try:
        tenant = getattr(g, 'tenant', 'master')
        limits = get_limits_for_tenant(tenant) or {}
        result = {
            'planType': limits.get('planType'),
            'maxUsers': int(limits.get('maxUsers') or 0) if limits.get('maxUsers') is not None else None,
            'maxRobots': int(limits.get('maxRobots') or 0) if limits.get('maxRobots') is not None else None,
            'maxSensors': int(limits.get('maxSensors') or 0) if limits.get('maxSensors') is not None else None,
            'maxAreaHectares': float(limits.get('maxAreaHectares') or 0.0) if limits.get('maxAreaHectares') is not None else None,
            'defaults': {
                'maxUsers': None,
                'maxRobots': int(os.getenv('MAX_ROBOTS', '999999')),
                'maxSensors': int(os.getenv('MAX_SENSORS', '999999')),
                'maxAreaHectares': float(os.getenv('MAX_AREA_HECTARES', '1000000000'))
            }
        }
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error getting tenant limits: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/tenant-usage', methods=['GET'])
@require_auth
def api_get_tenant_usage():
    tenant = request.headers.get('X-Tenant-Id') or request.args.get('tenant') or getattr(g, 'current_tenant', None) or getattr(g, 'tenant', None)
    if not tenant:
        return jsonify({'error': 'Tenant context required'}), 400
    try:
        usage = _gather_usage_for_tenant(tenant)
        limits_raw = get_limits_for_tenant(tenant) or {}

        def _safe_int(value):
            try:
                return int(value) if value is not None else None
            except Exception:
                return None

        def _safe_float(value):
            try:
                return float(value) if value is not None else None
            except Exception:
                return None

        limits_payload = {
            'planType': limits_raw.get('planType'),
            'maxUsers': _safe_int(limits_raw.get('maxUsers')),
            'maxRobots': _safe_int(limits_raw.get('maxRobots')),
            'maxSensors': _safe_int(limits_raw.get('maxSensors')),
            'maxAreaHectares': _safe_float(limits_raw.get('maxAreaHectares')),
        }

        percentages = {}
        robots_limit = limits_payload.get('maxRobots') or 0
        sensors_limit = limits_payload.get('maxSensors') or 0
        area_limit = limits_payload.get('maxAreaHectares') or 0.0

        if robots_limit > 0:
            percentages['robots'] = min(100.0, (usage['robots'] / robots_limit) * 100)
        if sensors_limit > 0:
            percentages['sensors'] = min(100.0, (usage['sensors'] / sensors_limit) * 100)
        if area_limit > 0:
            percentages['areaHectares'] = min(100.0, (usage['areaHectares'] / area_limit) * 100)

        return jsonify({
            'tenant': tenant,
            'usage': usage,
            'limits': limits_payload,
            'percentages': percentages,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        })
    except Exception as exc:
        logger.exception("Error computing tenant usage: %s", exc)
        return jsonify({'error': 'Failed to compute tenant usage'}), 500

@app.route('/integrations/grafana/link', methods=['GET'])
@require_auth
def api_get_grafana_link():
    if not _grafana_integration_enabled():
        return jsonify({'error': 'Grafana integration is not configured'}), 503

    tenant = getattr(g, 'tenant', None)
    if not tenant:
        return jsonify({'error': 'Tenant context required'}), 400

    email = getattr(g, 'email', None) or getattr(g, 'user', None)
    user_roles = getattr(g, 'roles', []) or []
    role = _determine_grafana_role(user_roles)
    
    # Log for debugging
    if not email or email == 'unknown':
        logger.warning("Email not found in request context. g.email=%s, g.user=%s, g.tenant=%s", 
                      getattr(g, 'email', None), getattr(g, 'user', None), getattr(g, 'tenant', None))

    try:
        # Find or create organization for tenant
        org = _grafana_find_org(tenant)
        if not org:
            logger.info("Grafana organization not found for tenant %s, creating it", tenant)
            org = _grafana_create_org(tenant)
            if not org:
                logger.error("Failed to create Grafana organization for tenant %s", tenant)
                return jsonify({'error': 'Failed to create Grafana organization for tenant'}), 500

        org_id = org.get('id') or org.get('orgId') or org.get('org_id')
        if not org_id:
            logger.error("Grafana organization %s has no ID", tenant)
            return jsonify({'error': 'Invalid Grafana organization'}), 500

        # Try to assign user to organization (may fail if user doesn't exist yet)
        membership_granted = False
        if email:
            membership_granted = _grafana_assign_user_to_org(org_id, email, role)
            if not membership_granted:
                logger.info("User %s not yet assigned to Grafana organization %s (may not exist yet)", email, org_id)
        else:
            logger.warning("Grafana link requested without email for tenant %s", tenant)

        dashboard_override = request.args.get('dashboard') or (GRAFANA_DEFAULT_DASHBOARD or '').strip()
        login_url = _build_grafana_login_url(org_id, dashboard_override if dashboard_override else None)

        return jsonify({
            'tenant': tenant,
            'email': email,
            'orgId': org_id,
            'role': role,
            'membershipGranted': membership_granted,
            'url': login_url,
            'dashboard': dashboard_override or None
        })
    except Exception as exc:
        logger.exception("Error generating Grafana link for tenant %s: %s", tenant, exc)
        return jsonify({'error': 'Failed to prepare Grafana link'}), 500

app.add_url_rule(
    '/entity-manager/integrations/grafana/link',
    view_func=api_get_grafana_link,
    methods=['GET']
)

@app.route('/admin/tenant-limits', methods=['PATCH'])
@require_auth
def api_update_tenant_limits():
    """Actualiza/crea en Orion-LD los límites del tenant actual (TenantConfig:<tenant>)."""
    try:
        tenant = getattr(g, 'tenant', 'master')
        data = request.get_json() or {}
        # Mapear claves esperadas
        allowed = {
            'planType': data.get('planType'),
            'maxUsers': data.get('maxUsers'),
            'maxRobots': data.get('maxRobots'),
            'maxSensors': data.get('maxSensors'),
            'maxAreaHectares': data.get('maxAreaHectares')
        }
        # Limpiar None
        update = {k: v for k, v in allowed.items() if v is not None}
        if not update:
            return jsonify({'error': 'No limits provided'}), 400
        ok = upsert_limits_in_orion(tenant, update)
        if not ok:
            return jsonify({'error': 'Failed to update tenant limits'}), 500
        # invalidar cache
        _limits_cache.pop(tenant, None)
        _limits_cache_ts.pop(tenant, None)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating tenant limits: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/sensors/register', methods=['POST'])
@require_auth
def register_sensor():
    """
    Register a sensor in the sensors table for SDM mapping
    
    Request body:
    {
        "external_id": "BP_Vaso_PAR_1",
        "name": "BP Vaso PAR 1",
        "profile": "par_photon_flux",
        "location": {"lat": 42.57, "lon": -2.02},
        "station_id": "BP_Vaso",
        "is_under_canopy": true
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found in token'}), 401
        
        external_id = data.get('external_id')
        name = data.get('name')
        profile_code = data.get('profile')
        
        if not external_id or not name or not profile_code:
            return jsonify({
                'error': 'Missing required fields: external_id, name, profile'
            }), 400
        
        location = data.get('location', {})
        lat = location.get('lat')
        lon = location.get('lon')
        
        if not lat or not lon:
            return jsonify({
                'error': 'Location (lat, lon) is required'
            }), 400
        
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if profile exists
            cur.execute("""
                SELECT id FROM sensor_profiles 
                WHERE code = %s AND (tenant_id IS NULL OR tenant_id = %s)
                ORDER BY tenant_id NULLS LAST
                LIMIT 1
            """, (profile_code, tenant_id))
            
            profile_row = cur.fetchone()
            if not profile_row:
                cur.close()
                conn.close()
                return jsonify({
                    'error': f'Profile "{profile_code}" not found'
                }), 404
            
            profile_id = profile_row['id']
            
            # Check if sensor already exists
            cur.execute("""
                SELECT id, external_id, name FROM sensors 
                WHERE tenant_id = %s AND external_id = %s
            """, (tenant_id, external_id))
            
            existing = cur.fetchone()
            if existing:
                cur.close()
                conn.close()
                return jsonify({
                    'error': f'Sensor with external_id "{external_id}" already exists',
                    'sensor': {
                        'id': str(existing['id']),
                        'external_id': existing['external_id'],
                        'name': existing['name']
                    }
                }), 409
            
            # Prepare metadata
            metadata = data.get('metadata', {})
            if data.get('station_id'):
                metadata['group'] = data['station_id']
                metadata['station_id'] = data['station_id']
            
            import json
            metadata_json = json.dumps(metadata)
            
            # Insert sensor
            cur.execute("""
                INSERT INTO sensors (
                    tenant_id, external_id, profile_id, name,
                    installation_location, is_under_canopy, metadata
                )
                VALUES (
                    %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                    %s, %s::jsonb
                )
                RETURNING id, external_id, name, created_at
            """, (
                tenant_id, external_id, profile_id, name,
                lon, lat,
                data.get('is_under_canopy', False),
                metadata_json
            ))
            
            sensor_row = cur.fetchone()
            
            # Get profile info for SDM entity type and mapping
            cur.execute("""
                SELECT sdm_entity_type, sdm_category, mapping
                FROM sensor_profiles
                WHERE id = %s
            """, (profile_id,))
            profile_info = cur.fetchone()
            
            sdm_entity_type = profile_info.get('sdm_entity_type') if profile_info else 'AgriSensor'
            profile_mapping = profile_info.get('mapping') if profile_info else {}
            
            conn.commit()
            cur.close()
            
            # Create NGSI-LD entity in Orion-LD for SDM compatibility
            orion_entity_created = False
            orion_entity_id = None
            try:
                # Generate entity ID following NGSI-LD format
                orion_entity_id = f"urn:ngsi-ld:{sdm_entity_type}:{tenant_id}:{external_id}"
                
                # Build NGSI-LD entity
                orion_entity = {
                    'id': orion_entity_id,
                    'type': sdm_entity_type,
                    'name': {
                        'type': 'Property',
                        'value': name
                    },
                    'location': {
                        'type': 'GeoProperty',
                        'value': {
                            'type': 'Point',
                            'coordinates': [lon, lat]
                        }
                    },
                    'externalId': {
                        'type': 'Property',
                        'value': external_id
                    },
                    'sensorType': {
                        'type': 'Property',
                        'value': profile_code
                    }
                }
                
                # Add metadata if available
                if metadata:
                    orion_entity['metadata'] = {
                        'type': 'Property',
                        'value': metadata
                    }
                
                # Add isUnderCanopy if set
                if data.get('is_under_canopy'):
                    orion_entity['isUnderCanopy'] = {
                        'type': 'Property',
                        'value': True
                    }
                
                # Add station_id if available
                if data.get('station_id'):
                    orion_entity['stationId'] = {
                        'type': 'Property',
                        'value': data['station_id']
                    }
                
                # Send to Orion-LD (direct internal access - entity-manager is inside the cluster)
                orion_headers = {
                    'Content-Type': 'application/ld+json',
                    'Fiware-Service': tenant_id,
                    'Fiware-ServicePath': '/'
                }
                orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
                
                response = requests.post(orion_url, json=orion_entity, headers=orion_headers, timeout=10)
                
                if response.status_code in [200, 201]:
                    orion_entity_created = True
                    logger.info(f"Created Orion-LD entity {orion_entity_id} for sensor {external_id}")
                elif response.status_code == 409:
                    # Entity already exists, that's OK
                    orion_entity_created = True
                    logger.info(f"Orion-LD entity {orion_entity_id} already exists for sensor {external_id}")
                else:
                    logger.warning(f"Failed to create Orion-LD entity for sensor {external_id}: {response.status_code} - {response.text}")
            
            except Exception as orion_error:
                logger.error(f"Error creating Orion-LD entity for sensor {external_id}: {orion_error}")
                # Don't fail the whole request if Orion-LD fails, but log it
            
            conn.close()
            
            # =============================================================================
            # STEP 2: Create MQTT credentials for the device
            # =============================================================================
            mqtt_credentials = None
            mqtt_credentials_created = False
            try:
                mqtt_service_url = os.getenv('MQTT_CREDENTIALS_SERVICE_URL', 'http://mqtt-credentials-manager-service:5000')
                mqtt_response = requests.post(
                    f'{mqtt_service_url}/api/mqtt/credentials/create',
                    json={
                        'tenant_id': tenant_id,
                        'device_id': external_id
                    },
                    timeout=10
                )
                
                if mqtt_response.status_code == 201:
                    mqtt_credentials = mqtt_response.json()
                    mqtt_credentials_created = True
                    logger.info(f"Created MQTT credentials for device {external_id}")
                else:
                    logger.warning(f"Failed to create MQTT credentials: {mqtt_response.status_code} - {mqtt_response.text}")
            except Exception as mqtt_error:
                logger.error(f"Error creating MQTT credentials: {mqtt_error}")
                # Don't fail the whole request, but log it
            
            # =============================================================================
            # STEP 3: Configure IoT Agent for this device
            # =============================================================================
            iot_agent_configured = False
            try:
                if profile_mapping and mqtt_credentials_created:
                    iot_agent_url = os.getenv('IOT_AGENT_URL', 'http://iot-agent-json-service:4041')
                    
                    # Build IoT Agent device configuration
                    # Topic pattern: {tenant_id}/{device_id}/data
                    device_config = {
                        'devices': [{
                            'device_id': external_id,
                            'entity_name': orion_entity_id,
                            'entity_type': sdm_entity_type,
                            'protocol': 'MQTT',
                            'transport': 'MQTT',
                            'timezone': 'Europe/Madrid',
                            'attributes': []
                        }]
                    }
                    
                    # Add attributes from profile mapping
                    mapping_data = profile_mapping if isinstance(profile_mapping, dict) else {}
                    measurements = mapping_data.get('measurements', [])
                    
                    for measurement in measurements:
                        attr_config = {
                            'name': measurement.get('sdmAttribute', measurement.get('type')),
                            'type': 'Number' if measurement.get('unit') else 'Text'
                        }
                        if measurement.get('unit'):
                            attr_config['unit'] = measurement.get('unit')
                        device_config['devices'][0]['attributes'].append(attr_config)
                    
                    # Register device in IoT Agent
                    iot_headers = {
                        'Content-Type': 'application/json',
                        'Fiware-Service': tenant_id,
                        'Fiware-ServicePath': '/'
                    }
                    
                    iot_response = requests.post(
                        f'{iot_agent_url}/iot/devices',
                        json=device_config,
                        headers=iot_headers,
                        timeout=10
                    )
                    
                    if iot_response.status_code in [200, 201]:
                        iot_agent_configured = True
                        logger.info(f"Configured IoT Agent for device {external_id}")
                    else:
                        logger.warning(f"Failed to configure IoT Agent: {iot_response.status_code} - {iot_response.text}")
                        
            except Exception as iot_error:
                logger.error(f"Error configuring IoT Agent: {iot_error}")
                # Don't fail the whole request, but log it
            
            logger.info(f"Registered sensor {external_id} for tenant {tenant_id} (Orion-LD: {'created' if orion_entity_created else 'skipped'}, MQTT: {'created' if mqtt_credentials_created else 'skipped'}, IoT Agent: {'configured' if iot_agent_configured else 'skipped'})")
            
            response_data = {
                'success': True,
                'sensor': {
                    'id': str(sensor_row['id']),
                    'external_id': sensor_row['external_id'],
                    'name': sensor_row['name'],
                    'profile': profile_code,
                    'tenant_id': tenant_id,
                    'created_at': sensor_row['created_at'].isoformat()
                },
                'message': 'Sensor registered successfully'
            }
            
            # Add Orion-LD entity info if created
            if orion_entity_created and orion_entity_id:
                response_data['orion_entity'] = {
                    'id': orion_entity_id,
                    'type': sdm_entity_type,
                    'created': True
                }
            
            # Add MQTT credentials if created (ONLY returned on creation)
            if mqtt_credentials_created and mqtt_credentials:
                response_data['mqtt'] = {
                    'username': mqtt_credentials.get('username'),
                    'password': mqtt_credentials.get('password'),
                    'host': mqtt_credentials.get('mqtt_host', os.getenv('MQTT_HOST', 'mosquitto-service')),
                    'port': mqtt_credentials.get('mqtt_port', 1883),
                    'topics': mqtt_credentials.get('topics', {
                        'data': f'{tenant_id}/{external_id}/data',
                        'commands': f'{tenant_id}/{external_id}/cmd'
                    }),
                    'warning': 'Save these credentials securely. Password cannot be retrieved later.'
                }
            
            # Add IoT Agent status
            response_data['iot_agent'] = {
                'configured': iot_agent_configured,
                'status': 'ready' if iot_agent_configured else 'pending'
            }
            
            return jsonify(response_data), 201
        
        except Exception as e:
            conn.rollback()
            conn.close()
            logger.error(f"Error registering sensor: {e}")
            return jsonify({
                'error': f'Database error: {str(e)}'
            }), 500
    
    except Exception as e:
        logger.error(f"Error in register_sensor: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensors/profiles', methods=['GET'])
@require_auth
def list_sensor_profiles():
    """List available sensor profiles"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT code, name, description, sdm_entity_type, sdm_category, mapping, metadata
                FROM sensor_profiles
                WHERE tenant_id IS NULL OR tenant_id = %s
                ORDER BY code
            """, (tenant_id,))
            
            profiles = []
            for row in cur.fetchall():
                profile_data = {
                    'code': row['code'],
                    'name': row['name'],
                    'description': row['description'],
                    'sdm_entity_type': row['sdm_entity_type'],
                    'sdm_category': row['sdm_category']
                }
                
                # Include metadata if available
                if row.get('metadata'):
                    profile_data['metadata'] = row['metadata']
                
                # Include mapping info for frontend hints
                if row.get('mapping'):
                    mapping = row['mapping']
                    if isinstance(mapping, dict):
                        measurements = mapping.get('measurements', [])
                        if measurements:
                            # Extract SDM attributes for hints
                            sdm_attributes = [m.get('sdmAttribute') for m in measurements if m.get('sdmAttribute')]
                            if sdm_attributes:
                                profile_data['sdm_attributes'] = sdm_attributes
                
                profiles.append(profile_data)
            
            cur.close()
            conn.close()
            
            return jsonify({
                'profiles': profiles
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error listing profiles: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in list_sensor_profiles: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensors/profiles/status', methods=['GET'])
@require_auth
def sensor_profiles_status():
    """Check if sensor profiles are initialized"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor()
            
            # Count global profiles (tenant_id IS NULL)
            cur.execute("SELECT COUNT(*) FROM sensor_profiles WHERE tenant_id IS NULL")
            global_count = cur.fetchone()[0] or 0
            
            # Count tenant-specific profiles
            cur.execute("SELECT COUNT(*) FROM sensor_profiles WHERE tenant_id = %s", (tenant_id,))
            tenant_count = cur.fetchone()[0] or 0
            
            cur.close()
            conn.close()
            
            return jsonify({
                'initialized': global_count > 0,
                'global_profiles': global_count,
                'tenant_profiles': tenant_count,
                'total': global_count + tenant_count
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error checking profiles status: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in sensor_profiles_status: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensors', methods=['GET'])
@require_auth
def list_tenant_sensors():
    """List sensors for the current tenant"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT 
                    s.id,
                    s.external_id,
                    s.name,
                    sp.code as profile_code,
                    sp.name as profile_name,
                    s.is_under_canopy,
                    s.metadata,
                    s.created_at,
                    ST_X(s.installation_location::geometry) as lon,
                    ST_Y(s.installation_location::geometry) as lat,
                    (SELECT MAX(observed_at) FROM telemetry_events 
                     WHERE tenant_id = %s AND device_id = s.external_id) as last_telemetry
                FROM sensors s
                JOIN sensor_profiles sp ON s.profile_id = sp.id
                WHERE s.tenant_id = %s
                ORDER BY s.created_at DESC
            """, (tenant_id, tenant_id))
            
            sensors = []
            for row in cur.fetchall():
                sensor_data = {
                    'id': str(row['id']),
                    'external_id': row['external_id'],
                    'name': row['name'],
                    'profile': {
                        'code': row['profile_code'],
                        'name': row['profile_name']
                    },
                    'is_under_canopy': row['is_under_canopy'],
                    'metadata': row['metadata'],
                    'created_at': row['created_at'].isoformat(),
                    'last_telemetry': row['last_telemetry'].isoformat() if row['last_telemetry'] else None
                }
                
                # Add location if coordinates are available
                if row['lon'] is not None and row['lat'] is not None:
                    sensor_data['installation_location'] = {
                        'lon': float(row['lon']),
                        'lat': float(row['lat'])
                    }
                
                sensors.append(sensor_data)
            
            cur.close()
            conn.close()
            
            return jsonify({
                'sensors': sensors
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error listing sensors: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in list_tenant_sensors: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/devices/<device_id>/telemetry', methods=['GET'])
@require_auth
def get_device_telemetry(device_id):
    """Get telemetry history for a device"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        # Get query parameters
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        limit = int(request.args.get('limit', 1000))
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT 
                    observed_at,
                    payload,
                    metadata
                FROM telemetry_events
                WHERE tenant_id = %s AND device_id = %s
            """
            params = [tenant_id, device_id]
            
            if start_time:
                query += " AND observed_at >= %s"
                params.append(start_time)
            if end_time:
                query += " AND observed_at <= %s"
                params.append(end_time)
            
            query += " ORDER BY observed_at DESC LIMIT %s"
            params.append(limit)
            
            cur.execute(query, params)
            
            telemetry = []
            for row in cur.fetchall():
                telemetry.append({
                    'observed_at': row['observed_at'].isoformat(),
                    'payload': row['payload'],
                    'metadata': row['metadata']
                })
            
            cur.close()
            conn.close()
            
            return jsonify({
                'device_id': device_id,
                'telemetry': telemetry,
                'count': len(telemetry)
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error getting telemetry: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_device_telemetry: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/devices/<device_id>/telemetry/latest', methods=['GET'])
@require_auth
def get_device_latest_telemetry(device_id):
    """Get latest telemetry value for a device"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT 
                    observed_at,
                    payload,
                    metadata
                FROM telemetry_events
                WHERE tenant_id = %s AND device_id = %s
                ORDER BY observed_at DESC
                LIMIT 1
            """, (tenant_id, device_id))
            
            row = cur.fetchone()
            cur.close()
            conn.close()
            
            if row:
                return jsonify({
                    'device_id': device_id,
                    'observed_at': row['observed_at'].isoformat(),
                    'payload': row['payload'],
                    'metadata': row['metadata']
                }), 200
            else:
                return jsonify({
                    'device_id': device_id,
                    'message': 'No telemetry data available'
                }), 404
        
        except Exception as e:
            conn.close()
            logger.error(f"Error getting latest telemetry: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_device_latest_telemetry: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/devices/<device_id>/telemetry/stats', methods=['GET'])
@require_auth
def get_device_telemetry_stats(device_id):
    """Get aggregated statistics for device telemetry"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        # Get query parameters
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT 
                    COUNT(*) as total_records,
                    MIN(observed_at) as first_record,
                    MAX(observed_at) as last_record
                FROM telemetry_events
                WHERE tenant_id = %s AND device_id = %s
            """
            params = [tenant_id, device_id]
            
            if start_time:
                query += " AND observed_at >= %s"
                params.append(start_time)
            if end_time:
                query += " AND observed_at <= %s"
                params.append(end_time)
            
            cur.execute(query, params)
            row = cur.fetchone()
            
            cur.close()
            conn.close()
            
            return jsonify({
                'device_id': device_id,
                'stats': {
                    'total_records': row['total_records'],
                    'first_record': row['first_record'].isoformat() if row['first_record'] else None,
                    'last_record': row['last_record'].isoformat() if row['last_record'] else None
                }
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error getting telemetry stats: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_device_telemetry_stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# Device Commands Endpoints
# =============================================================================

def get_mqtt_client():
    """Get or create MQTT client (thread-safe)"""
    if not hasattr(get_mqtt_client, '_client') or get_mqtt_client._client is None:
        client = mqtt.Client(client_id=f"entity-manager-{secrets.token_hex(8)}")
        if MQTT_USERNAME and MQTT_PASSWORD:
            client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        
        def on_connect(client, userdata, flags, rc):
            if rc == 0:
                logger.info("MQTT client connected successfully")
            else:
                logger.error(f"MQTT connection failed with code {rc}")
        
        def on_disconnect(client, userdata, rc):
            logger.warning(f"MQTT client disconnected (rc={rc})")
        
        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            client.loop_start()
            get_mqtt_client._client = client
        except Exception as e:
            logger.error(f"Failed to connect MQTT client: {e}")
            get_mqtt_client._client = None
    
    return get_mqtt_client._client

get_mqtt_client._client = None


@app.route('/api/devices/<device_id>/commands', methods=['POST'])
@require_auth
def send_device_command(device_id):
    """Send a command to a device via MQTT"""
    try:
        tenant_id = g.tenant
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        command_type = data.get('command_type', 'custom')
        payload = data.get('payload', {})
        
        if not isinstance(payload, dict):
            return jsonify({'error': 'Payload must be a JSON object'}), 400
        
        # Get device info to determine MQTT topic
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT external_id
                FROM sensors
                WHERE tenant_id = %s AND external_id = %s
                LIMIT 1
            """, (tenant_id, device_id))
            
            device = cur.fetchone()
            cur.close()
            conn.close()
            
            if not device:
                return jsonify({'error': 'Device not found'}), 404
            
            # Determine MQTT topic for commands
            # Pattern: {tenant_id}/{device_id}/cmd
            mqtt_topic = f"{tenant_id}/{device_id}/cmd"
            
            # Create command record in database
            command_id = str(uuid.uuid4())
            conn = get_db_connection_with_tenant(tenant_id)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                INSERT INTO commands (id, tenant_id, device_id, command_type, payload, status, sent_at)
                VALUES (%s, %s, %s, %s, %s, 'pending', NOW())
                RETURNING id, sent_at
            """, (command_id, tenant_id, device_id, command_type, json.dumps(payload)))
            
            command_record = cur.fetchone()
            conn.commit()
            cur.close()
            conn.close()
            
            # Publish command to MQTT
            mqtt_client = get_mqtt_client()
            if not mqtt_client:
                # Update command status to failed
                conn = get_db_connection_with_tenant(tenant_id)
                cur = conn.cursor()
                cur.execute("""
                    UPDATE commands SET status = 'failed', response = %s
                    WHERE id = %s
                """, (json.dumps({'error': 'MQTT client not available'}), command_id))
                conn.commit()
                cur.close()
                conn.close()
                return jsonify({'error': 'MQTT service unavailable'}), 503
            
            # Publish command
            command_message = {
                'command_id': command_id,
                'command_type': command_type,
                'payload': payload,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            try:
                result = mqtt_client.publish(mqtt_topic, json.dumps(command_message), qos=1)
                
                if result.rc == mqtt.MQTT_ERR_SUCCESS:
                    # Update command status to sent
                    conn = get_db_connection_with_tenant(tenant_id)
                    cur = conn.cursor()
                    cur.execute("""
                        UPDATE commands SET status = 'sent'
                        WHERE id = %s
                    """, (command_id,))
                    conn.commit()
                    cur.close()
                    conn.close()
                    
                    return jsonify({
                        'success': True,
                        'command_id': command_id,
                        'mqtt_topic': mqtt_topic,
                        'status': 'sent',
                        'sent_at': command_record['sent_at'].isoformat()
                    }), 201
                else:
                    # Update command status to failed
                    conn = get_db_connection_with_tenant(tenant_id)
                    cur = conn.cursor()
                    cur.execute("""
                        UPDATE commands SET status = 'failed', response = %s
                        WHERE id = %s
                    """, (json.dumps({'error': f'MQTT publish failed with code {result.rc}'}), command_id))
                    conn.commit()
                    cur.close()
                    conn.close()
                    
                    return jsonify({'error': f'Failed to publish command: MQTT error {result.rc}'}), 500
                    
            except Exception as mqtt_error:
                logger.error(f"MQTT publish error: {mqtt_error}")
                # Update command status to failed
                conn = get_db_connection_with_tenant(tenant_id)
                cur = conn.cursor()
                cur.execute("""
                    UPDATE commands SET status = 'failed', response = %s
                    WHERE id = %s
                """, (json.dumps({'error': str(mqtt_error)}), command_id))
                conn.commit()
                cur.close()
                conn.close()
                
                return jsonify({'error': f'Failed to publish command: {str(mqtt_error)}'}), 500
        
        except Exception as e:
            if conn:
                conn.close()
            logger.error(f"Error sending command: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in send_device_command: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/devices/<device_id>/commands', methods=['GET'])
@require_auth
def get_device_commands(device_id):
    """Get command history for a device"""
    try:
        tenant_id = g.tenant
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        # Get query parameters
        limit = int(request.args.get('limit', 50))
        status = request.args.get('status')  # optional filter
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT 
                    id,
                    command_type,
                    payload,
                    status,
                    sent_at,
                    executed_at,
                    response
                FROM commands
                WHERE tenant_id = %s AND device_id = %s
            """
            params = [tenant_id, device_id]
            
            if status:
                query += " AND status = %s"
                params.append(status)
            
            query += " ORDER BY sent_at DESC LIMIT %s"
            params.append(limit)
            
            cur.execute(query, params)
            
            commands = []
            for row in cur.fetchall():
                commands.append({
                    'id': str(row['id']),
                    'command_type': row['command_type'],
                    'payload': row['payload'] if isinstance(row['payload'], dict) else json.loads(row['payload']) if row['payload'] else {},
                    'status': row['status'],
                    'sent_at': row['sent_at'].isoformat() if row['sent_at'] else None,
                    'executed_at': row['executed_at'].isoformat() if row['executed_at'] else None,
                    'response': row['response'] if isinstance(row['response'], dict) else json.loads(row['response']) if row['response'] else None
                })
            
            cur.close()
            conn.close()
            
            return jsonify({
                'device_id': device_id,
                'commands': commands,
                'count': len(commands)
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error getting commands: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_device_commands: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/vpn/config', methods=['GET'])
@require_auth
def get_vpn_config():
    """Obtiene la configuración VPN del tenant actual"""
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        # Obtener configuración VPN desde Kubernetes ConfigMap
        namespace = f"nekazari-{tenant_id}"
        configmap_name = f"{tenant_id}-ros2-config"
        
        vpn_config = {
            'tenant_id': tenant_id,
            'configured': False,
            'vpn_ip_range': None,
            'vpn_port': None,
            'server_endpoint': ConfigManager.get_vpn_server_endpoint() if _config_manager_available else os.getenv('VPN_SERVER_ENDPOINT', f"{os.getenv('PRODUCTION_DOMAIN', 'nekazari.robotika.cloud')}:51820"),
            'server_ip': '10.8.0.1',
            'subnet': '10.8.0.0/24',
            'instructions': []
        }
        
        try:
            # Intentar leer ConfigMap desde Kubernetes
            # Usar kubectl como fallback si no hay cliente de Kubernetes
            result = subprocess.run(
                [
                    'kubectl', 'get', 'configmap', configmap_name,
                    '-n', namespace,
                    '-o', 'json'
                ],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                configmap_data = json.loads(result.stdout)
                data = configmap_data.get('data', {})
                
                vpn_config['configured'] = True
                vpn_config['vpn_ip_range'] = data.get('vpn_ip_range', '10.8.0.0/24')
                vpn_config['vpn_port'] = data.get('vpn_port', '51820')
                
                # Calcular IP base del tenant (si está en formato 10.8.0.X)
                if 'vpn_ip_range' in data:
                    ip_range = data['vpn_ip_range']
                    # Extraer IP base si está en formato CIDR
                    if '/' in ip_range:
                        base_ip = ip_range.split('/')[0]
                        vpn_config['tenant_base_ip'] = base_ip
                    else:
                        vpn_config['tenant_base_ip'] = ip_range
                
                # Obtener información adicional del ConfigMap VPN
                vpn_configmap_name = f"{tenant_id}-vpn-config"
                vpn_result = subprocess.run(
                    [
                        'kubectl', 'get', 'configmap', vpn_configmap_name,
                        '-n', namespace,
                        '-o', 'json'
                    ],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if vpn_result.returncode == 0:
                    vpn_configmap_data = json.loads(vpn_result.stdout)
                    vpn_data = vpn_configmap_data.get('data', {})
                    if 'vpn.conf' in vpn_data:
                        vpn_config['has_wireguard_config'] = True
                
        except subprocess.TimeoutExpired:
            logger.warning(f"Timeout reading VPN config for tenant {tenant_id}")
        except FileNotFoundError:
            logger.warning("kubectl not found, VPN config may not be available")
        except Exception as e:
            logger.warning(f"Error reading VPN config: {e}")
        
        # Generar instrucciones de uso
        if vpn_config['configured']:
            vpn_config['instructions'] = [
                {
                    'step': 1,
                    'title': 'Instalar WireGuard',
                    'description': 'Instala WireGuard en tu dispositivo/robot',
                    'command': 'sudo apt update && sudo apt install wireguard-tools'
                },
                {
                    'step': 2,
                    'title': 'Generar configuración',
                    'description': 'Contacta con el administrador para obtener tu archivo de configuración VPN',
                    'command': None
                },
                {
                    'step': 3,
                    'title': 'Configurar WireGuard',
                    'description': f'Copia la configuración a /etc/wireguard/{tenant_id}.conf',
                    'command': f'sudo nano /etc/wireguard/{tenant_id}.conf'
                },
                {
                    'step': 4,
                    'title': 'Activar VPN',
                    'description': 'Activa la conexión VPN',
                    'command': f'sudo wg-quick up {tenant_id}'
                },
                {
                    'step': 5,
                    'title': 'Habilitar al inicio',
                    'description': 'Configura WireGuard para iniciar automáticamente',
                    'command': f'sudo systemctl enable wg-quick@{tenant_id}'
                }
            ]
        
        return jsonify(vpn_config), 200
    
    except Exception as e:
        logger.error(f"Error getting VPN config: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/vpn/generate-client-config', methods=['POST'])
@require_auth
def generate_vpn_client_config():
    """Genera configuración VPN para un nuevo cliente (robot/sensor)"""
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        data = request.get_json() or {}
        client_name = data.get('client_name', f'{tenant_id}_device_001')
        client_ip_number = data.get('ip_number', None)  # Opcional: número IP específico
        
        # Obtener configuración VPN del tenant
        namespace = f"nekazari-{tenant_id}"
        
        # Leer configuración del servidor VPN
        try:
            # Obtener clave pública del servidor desde el secret de WireGuard
            server_key_result = subprocess.run(
                [
                    'kubectl', 'get', 'secret', 'wireguard-keys',
                    '-n', 'nekazari-vpn',
                    '-o', 'jsonpath={.data.public-key}'
                ],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            server_public_key = None
            if server_key_result.returncode == 0:
                import base64
                server_public_key = base64.b64decode(server_key_result.stdout).decode('utf-8').strip()
            
            # Generar claves del cliente
            private_key_result = subprocess.run(
                ['wg', 'genkey'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if private_key_result.returncode != 0:
                return jsonify({'error': 'Failed to generate WireGuard keys'}), 500
            
            client_private_key = private_key_result.stdout.strip()
            
            public_key_result = subprocess.run(
                ['wg', 'pubkey'],
                input=client_private_key,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if public_key_result.returncode != 0:
                return jsonify({'error': 'Failed to generate public key'}), 500
            
            client_public_key = public_key_result.stdout.strip()
            
            # Calcular IP del cliente
            if not client_ip_number:
                # Obtener último IP usado o calcular basado en tenant
                tenant_num = tenant_id.replace('tenant', '').replace('tenant-', '')
                try:
                    tenant_num_int = int(tenant_num) if tenant_num.isdigit() else hash(tenant_id) % 100
                except:
                    tenant_num_int = hash(tenant_id) % 100
                client_ip_number = 10 + (tenant_num_int % 240)  # Rango 10-250
            
            client_ip = f"10.8.0.{client_ip_number}"
            server_endpoint = ConfigManager.get_vpn_server_endpoint() if _config_manager_available else os.getenv('VPN_SERVER_ENDPOINT', f"{os.getenv('PRODUCTION_DOMAIN', 'nekazari.robotika.cloud')}:51820")
            
            # Generar configuración del cliente
            client_config = f"""[Interface]
PrivateKey = {client_private_key}
Address = {client_ip}/24
DNS = 10.8.0.1

[Peer]
PublicKey = {server_public_key or 'SERVER_PUBLIC_KEY_HERE'}
Endpoint = {server_endpoint}
AllowedIPs = 10.8.0.0/24, 10.43.0.0/16
PersistentKeepalive = 25"""
            
            return jsonify({
                'success': True,
                'client_name': client_name,
                'client_ip': client_ip,
                'client_public_key': client_public_key,
                'config': client_config,
                'instructions': {
                    'save_to': f'/etc/wireguard/{tenant_id}.conf',
                    'activate': f'sudo wg-quick up {tenant_id}',
                    'enable': f'sudo systemctl enable wg-quick@{tenant_id}'
                }
            }), 200
        
        except FileNotFoundError:
            return jsonify({
                'error': 'WireGuard tools not available on server',
                'message': 'Contact administrator to generate VPN configuration'
            }), 503
        except Exception as e:
            logger.error(f"Error generating VPN client config: {e}")
            return jsonify({'error': str(e)}), 500
    
    except Exception as e:
        logger.error(f"Error in generate_vpn_client_config: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# Asset Digitization Configuration
# =============================================================================

ASSET_TYPE_TO_SDM = {
    "OliveTree": {
        "sdm_type": "AgriParcel",
        "geometry_type": "Point",
        "default_attributes": {
            "cropType": {"type": "Property", "value": "Olive"},
            "treeCount": {"type": "Property", "value": 1}
        }
    },
    "VineRow": {
        "sdm_type": "AgriParcel",
        "geometry_type": "LineString",
        "default_attributes": {
            "cropType": {"type": "Property", "value": "Grape"},
            "rowCount": {"type": "Property", "value": 1}
        }
    },
    "VineRowSegment": {
        "sdm_type": "AgriParcel",
        "geometry_type": "LineString",
        "default_attributes": {
            "cropType": {"type": "Property", "value": "Grape"}
        }
    },
    "CerealParcel": {
        "sdm_type": "AgriParcel",
        "geometry_type": "Polygon",
        "default_attributes": {
            "cropType": {"type": "Property", "value": "Cereal"}
        }
    }
}

def map_asset_type_to_sdm(asset_type: str) -> Optional[Dict[str, Any]]:
    """Map asset type to SDM configuration"""
    return ASSET_TYPE_TO_SDM.get(asset_type)

def generate_asset_name(asset_type: str, tenant_id: str, parcel_id: Optional[str] = None) -> str:
    """Generate unique asset name"""
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    if parcel_id:
        # Try to get sequential number for this parcel
        # For now, use timestamp
        return f"{asset_type.lower()}-{parcel_id}-{timestamp}"
    else:
        return f"{asset_type.lower()}-{tenant_id}-{timestamp}"

def build_ngsi_ld_entity_from_asset(
    data: Dict[str, Any],
    mapping: Dict[str, Any],
    tenant_id: str,
    name: str
) -> Dict[str, Any]:
    """Build complete NGSI-LD entity from asset creation payload"""
    geometry = data.get('geometry', {})
    properties = data.get('properties', {})
    
    # Build entity ID (URN format)
    entity_id = f"urn:ngsi-ld:{mapping['sdm_type']}:{tenant_id}:{name}"
    
    # Build base entity
    entity = {
        "@context": CONTEXT_URL,
        "id": entity_id,
        "type": mapping['sdm_type'],
        "name": {
            "type": "Property",
            "value": name
        },
        "location": {
            "type": "GeoProperty",
            "value": {
                "type": geometry.get('type', mapping['geometry_type']),
                "coordinates": geometry.get('coordinates', [])
            }
        },
        "createdAt": {
            "type": "Property",
            "value": {
                "@type": "DateTime",
                "@value": datetime.utcnow().isoformat() + "Z"
            }
        }
    }
    
    # Add default attributes from mapping
    if 'default_attributes' in mapping:
        for attr_name, attr_value in mapping['default_attributes'].items():
            entity[attr_name] = attr_value
    
    # Add 3D model properties if present
    if properties.get('model3d'):
        entity['ref3DModel'] = {
            "type": "Property",
            "value": properties['model3d']
        }
    
    if properties.get('scale') is not None:
        entity['modelScale'] = {
            "type": "Property",
            "value": float(properties['scale']),
            "unitCode": "SCL"
        }
    
    if properties.get('rotation') is not None:
        entity['modelRotation'] = {
            "type": "Property",
            "value": float(properties['rotation']),
            "unitCode": "DD"
        }
    
    return entity

@app.route('/api/assets', methods=['POST'])
@require_auth
def create_asset():
    """Create a new asset from digitization workflow"""
    try:
        # Verify permissions
        user_roles = g.get('user_roles', [])
        if not any(role in ['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant'] for role in user_roles):
            return jsonify({'error': 'Insufficient permissions. Only TechnicalConsultant or higher can create assets.'}), 403
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400
        
        tenant_id = g.tenant
        
        # Validate payload
        asset_type = data.get('assetType')
        if not asset_type:
            return jsonify({'error': 'assetType is required'}), 400
        
        # Map asset type to SDM
        mapping = map_asset_type_to_sdm(asset_type)
        if not mapping:
            return jsonify({'error': f'Invalid asset type: {asset_type}'}), 400
        
        # Validate geometry
        geometry = data.get('geometry')
        if not geometry:
            return jsonify({'error': 'geometry is required'}), 400
        
        geometry_type = geometry.get('type')
        if geometry_type != mapping['geometry_type']:
            return jsonify({
                'error': f'Geometry type mismatch. Expected {mapping["geometry_type"]}, got {geometry_type}'
            }), 400
        
        # Generate name if not provided
        name = data.get('name')
        if not name:
            parcel_id = data.get('parcelId')  # Optional parcel ID
            name = generate_asset_name(asset_type, tenant_id, parcel_id)
        
        # Build NGSI-LD entity
        entity = build_ngsi_ld_entity_from_asset(data, mapping, tenant_id, name)
        
        # Persist in Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        headers = {
            'Content-Type': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, tenant_id)
        
        response = requests.post(orion_url, json=entity, headers=headers)
        
        if response.status_code in [200, 201]:
            # Log the operation
            log_entity_operation(
                'create',
                entity['id'],
                mapping['sdm_type'],
                tenant_id,
                g.farmer_id,
                'asset_digitization',
                {'asset_type': asset_type, 'name': name}
            )
            
            return jsonify({
                'entity_id': entity['id'],
                'name': name,
                'type': mapping['sdm_type'],
                'message': 'Asset created successfully'
            }), 201
        else:
            error_msg = response.text or 'Unknown error'
            logger.error(f"Failed to create entity in Orion-LD: {response.status_code} - {error_msg}")
            return jsonify({
                'error': 'Failed to create entity in Orion-LD',
                'details': error_msg
            }), 500
    
    except Exception as e:
        logger.error(f"Error creating asset: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/version', methods=['GET'])
def version():
    """Get service version"""
    return jsonify({
        'service': 'entity-manager',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })


# =============================================================================
# Weather Data Endpoints
# =============================================================================

def get_platform_credential(credential_name: str) -> Optional[str]:
    """Get platform credential from Kubernetes secret or environment"""
    # Try environment variable first (for local dev or if injected)
    env_value = os.getenv(credential_name)
    if env_value:
        return env_value
    
    # Try to get from Kubernetes secret (if running in K8s)
    try:
        import subprocess
        result = subprocess.run(
            ['kubectl', 'get', 'secret', 'aemet-secret', '-n', 'nekazari', '-o', 'jsonpath={.data.api-key}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout:
            import base64
            return base64.b64decode(result.stdout).decode('utf-8')
    except Exception:
        pass
    
    return None


def geocode_municipality_on_demand(name: str, province: Optional[str] = None, ine_code: Optional[str] = None, country: str = 'Spain') -> Optional[tuple]:
    """
    Geocode a municipality using Nominatim (OpenStreetMap) on-demand
    Returns (latitude, longitude) or None if not found
    This is used for lazy geocoding when a municipality is searched but has no coordinates
    """
    try:
        # Build query: "Municipality Name, Province, Spain"
        query_parts = [name]
        if province:
            query_parts.append(province)
        query_parts.append(country)
        query = ', '.join(query_parts)
        
        params = {
            'q': query,
            'format': 'json',
            'limit': 1,
            'countrycodes': 'es',  # Restrict to Spain
        }
        
        headers = {
            'User-Agent': 'Nekazari-Platform/1.0 (Weather Service)',  # Required by Nominatim
        }
        
        # Use a short timeout for on-demand geocoding (don't block user requests)
        response = requests.get('https://nominatim.openstreetmap.org/search', params=params, headers=headers, timeout=5)
        response.raise_for_status()
        
        data = response.json()
        if data and len(data) > 0:
            result = data[0]
            lat = float(result.get('lat', 0))
            lon = float(result.get('lon', 0))
            if lat != 0 and lon != 0:
                logger.info(f"Geocoded '{name}' ({ine_code}): {lat}, {lon}")
                return (lat, lon)
        
        logger.warning(f"Could not geocode municipality '{name}' ({ine_code})")
        return None
        
    except requests.exceptions.Timeout:
        logger.warning(f"Geocoding timeout for '{name}' ({ine_code})")
        return None
    except Exception as e:
        logger.warning(f"Geocoding error for '{name}' ({ine_code}): {e}")
        return None

@app.route('/api/weather/municipalities/search', methods=['GET'])
@require_auth(require_hmac=False)  # Public read-only endpoint, no HMAC required
def search_municipalities():
    """Search municipalities in catalog (supports AEMET/INE codes and names)"""
    logger.info(f"=== SEARCH MUNICIPALITIES ENDPOINT CALLED ===")
    logger.info(f"Request method: {request.method}")
    logger.info(f"Request path: {request.path}")
    logger.info(f"Request args: {dict(request.args)}")
    logger.info(f"Authorization header present: {bool(request.headers.get('Authorization'))}")
    try:
        tenant_id = g.tenant
        query = request.args.get('q', '').strip()
        limit = int(request.args.get('limit', '20'))
        
        logger.info(f"Searching municipalities: query='{query}', tenant={tenant_id}, limit={limit}")
        
        if not query or len(query) < 2:
            logger.debug("Query too short, returning empty")
            return jsonify({'municipalities': []}), 200
        
        with get_db_connection_with_tenant(tenant_id) as conn:
            if not conn:
                return jsonify({'error': 'Database connection error'}), 500
            
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                # 1. First, search in local catalog
                search_term = f'%{query}%'
                cur.execute("""
                    SELECT 
                        ine_code,
                        name,
                        province,
                        autonomous_community,
                        aemet_id,
                        latitude,
                        longitude
                    FROM catalog_municipalities
                    WHERE 
                        LOWER(name) LIKE LOWER(%s)
                        OR ine_code LIKE %s
                        OR LOWER(province) LIKE LOWER(%s)
                    ORDER BY 
                        CASE 
                            WHEN LOWER(name) = LOWER(%s) THEN 1
                            WHEN LOWER(name) LIKE LOWER(%s) THEN 2
                            WHEN ine_code = %s THEN 3
                            ELSE 4
                        END,
                        name ASC
                    LIMIT %s
                """, (search_term, search_term, search_term, query, f'{query}%', query, limit))
                
                municipalities = cur.fetchall()
                logger.info(f"Found {len(municipalities)} municipalities in local catalog for query '{query}'")
                
                # 2. If no results and AEMET API key is available, try to fetch from AEMET
                if not municipalities:
                    aemet_api_key = get_platform_credential('AEMET_API_KEY')
                    if aemet_api_key:
                        try:
                            logger.info(f"Local catalog empty for '{query}', trying AEMET API")
                            aemet_url = "https://opendata.aemet.es/opendata/api/maestro/municipios"
                            headers = {'api_key': aemet_api_key}
                            aemet_response = requests.get(aemet_url, headers=headers, timeout=10)
                            aemet_response.raise_for_status()
                            
                            data_url = aemet_response.json().get('datos')
                            if data_url:
                                data_response = requests.get(data_url, timeout=30)
                                data_response.raise_for_status()
                                aemet_data = data_response.json()
                                
                                # Filter and insert matching municipalities
                                found_municipalities = []
                                for muni in aemet_data:
                                    muni_name = muni.get('nombre', '').lower()
                                    muni_id = muni.get('id', '')
                                    
                                    if query.lower() in muni_name or query in muni_id:
                                        # Insert into catalog if not exists
                                        cur.execute("""
                                            INSERT INTO catalog_municipalities 
                                            (ine_code, name, province, aemet_id, latitude, longitude, geom)
                                            VALUES (%s, %s, %s, %s, %s, %s, 
                                                CASE 
                                                    WHEN %s IS NOT NULL AND %s IS NOT NULL 
                                                    THEN ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                                                    ELSE NULL
                                                END)
                                            ON CONFLICT (ine_code) DO UPDATE SET
                                                name = EXCLUDED.name,
                                                province = EXCLUDED.province,
                                                aemet_id = EXCLUDED.aemet_id,
                                                latitude = EXCLUDED.latitude,
                                                longitude = EXCLUDED.longitude,
                                                geom = CASE 
                                                    WHEN EXCLUDED.longitude IS NOT NULL AND EXCLUDED.latitude IS NOT NULL 
                                                    THEN ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326)
                                                    ELSE catalog_municipalities.geom
                                                END
                                            RETURNING ine_code, name, province, autonomous_community, aemet_id, latitude, longitude
                                        """, (
                                            muni.get('id'),
                                            muni.get('nombre'),
                                            muni.get('provincia'),
                                            muni.get('idAEMET'),
                                            muni.get('latitud_dec'),
                                            muni.get('longitud_dec'),
                                            muni.get('longitud_dec'),
                                            muni.get('latitud_dec'),
                                            muni.get('longitud_dec'),
                                            muni.get('latitud_dec'),
                                        ))
                                        inserted = cur.fetchone()
                                        if inserted:
                                            found_municipalities.append(dict(inserted))
                                        
                                        if len(found_municipalities) >= limit:
                                            break
                                
                                conn.commit()
                                if found_municipalities:
                                    municipalities = found_municipalities
                                    logger.info(f"Found {len(found_municipalities)} municipalities from AEMET for '{query}'")
                        except Exception as e:
                            logger.warning(f"Error fetching from AEMET: {e}")
                            conn.rollback()
                
                # 3. Geocode municipalities without coordinates (on-demand geocoding)
                geocoded_count = 0
                for mun in municipalities:
                    if not mun.get('latitude') or not mun.get('longitude'):
                        try:
                            coords = geocode_municipality_on_demand(
                                name=mun.get('name', ''),
                                province=mun.get('province'),
                                ine_code=mun.get('ine_code')
                            )
                            if coords:
                                lat, lon = coords
                                # Update municipality with coordinates
                                cur.execute("""
                                    UPDATE catalog_municipalities
                                    SET latitude = %s,
                                        longitude = %s,
                                        geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                                    WHERE ine_code = %s
                                    RETURNING latitude, longitude
                                """, (lat, lon, lon, lat, mun.get('ine_code')))
                                updated = cur.fetchone()
                                if updated:
                                    mun['latitude'] = updated['latitude']
                                    mun['longitude'] = updated['longitude']
                                    geocoded_count += 1
                                    logger.info(f"Geocoded municipality {mun.get('name')} ({mun.get('ine_code')}): {lat}, {lon}")
                        except Exception as e:
                            logger.warning(f"Error geocoding municipality {mun.get('ine_code')}: {e}")
                            # Continue with other municipalities even if one fails
                
                if geocoded_count > 0:
                    conn.commit()
                    logger.info(f"Geocoded {geocoded_count} municipalities on-demand")
                
                cur.close()
                
                result = {
                    'municipalities': [dict(m) for m in municipalities],
                    'count': len(municipalities)
                }
                logger.info(f"Returning {len(municipalities)} municipalities for query '{query}'")
                return jsonify(result), 200
            
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error searching municipalities: {e}", exc_info=True)
                
                # Check if it's a missing table error
                if 'does not exist' in error_msg.lower() or 'relation' in error_msg.lower():
                    logger.error(f"CRITICAL: Required table 'catalog_municipalities' does not exist. Database migrations may not have been applied.")
                    return jsonify({
                        'error': 'Database schema incomplete',
                        'detail': 'The catalog_municipalities table is missing. Please run database migrations (010_sensor_ingestion_schema.sql).',
                        'migration_file': 'config/timescaledb/migrations/010_sensor_ingestion_schema.sql'
                    }), 500
                
                return jsonify({'error': 'Database error', 'detail': error_msg}), 500
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in search_municipalities: {e}", exc_info=True)
        
        # Check if it's an authentication/tenant error
        if 'tenant' in error_msg.lower() or 'g.tenant' in error_msg:
            logger.error(f"CRITICAL: Tenant not set in request context. Authentication may have failed.")
            return jsonify({
                'error': 'Authentication error',
                'detail': 'Tenant information not available. Please check authentication configuration.'
            }), 500
        
        return jsonify({'error': 'Internal server error', 'detail': error_msg}), 500


@app.route('/api/weather/locations', methods=['GET'])
@require_auth(require_hmac=False)  # Public read-only endpoint, no HMAC required
def get_weather_locations():
    """Get weather locations configured for the tenant"""
    try:
        tenant_id = g.tenant
        
        with get_db_connection_with_tenant(tenant_id) as conn:
            if not conn:
                return jsonify({'error': 'Database connection error'}), 500
            
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT 
                        twl.id,
                        twl.municipality_code,
                        cm.name as municipality_name,
                        cm.latitude,
                        cm.longitude,
                        twl.station_id,
                        twl.label,
                        twl.is_primary,
                        twl.metadata
                    FROM tenant_weather_locations twl
                    JOIN catalog_municipalities cm ON cm.ine_code = twl.municipality_code
                    WHERE twl.tenant_id = %s
                    ORDER BY twl.is_primary DESC, twl.created_at DESC
                """, (tenant_id,))
                
                locations = cur.fetchall()
                cur.close()
                
                return jsonify({
                    'locations': [dict(loc) for loc in locations]
                }), 200
            
            except Exception as e:
                logger.error(f"Error getting weather locations: {e}")
                return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_weather_locations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/municipality/near', methods=['GET'])
@require_auth(require_hmac=False)  # Public read-only endpoint
def get_nearest_municipality():
    """
    Get nearest municipality to given coordinates.
    Useful for finding municipality from parcel centroid.
    """
    try:
        tenant_id = g.tenant
        latitude = request.args.get('latitude', type=float)
        longitude = request.args.get('longitude', type=float)
        max_distance_km = request.args.get('max_distance_km', type=float, default=50.0)
        
        if not latitude or not longitude:
            return jsonify({'error': 'latitude and longitude are required'}), 400
        
        with get_db_connection_with_tenant(tenant_id) as conn:
            if not conn:
                return jsonify({'error': 'Database connection error'}), 500
            
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                # Find nearest municipality using PostGIS ST_Distance
                cur.execute("""
                    SELECT 
                        ine_code,
                        name,
                        province,
                        autonomous_community,
                        latitude,
                        longitude,
                        ST_Distance(
                            geom::geography,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                        ) / 1000.0 as distance_km
                    FROM catalog_municipalities
                    WHERE geom IS NOT NULL
                    AND ST_Distance(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                    ) / 1000.0 <= %s
                    ORDER BY distance_km ASC
                    LIMIT 1
                """, (longitude, latitude, longitude, latitude, max_distance_km))
                
                municipality = cur.fetchone()
                cur.close()
                
                if municipality:
                    return jsonify({
                        'municipality': dict(municipality)
                    }), 200
                else:
                    return jsonify({
                        'error': 'No municipality found within specified distance'
                    }), 404
            
            except Exception as e:
                logger.error(f"Error finding nearest municipality: {e}")
                return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_nearest_municipality: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/locations', methods=['POST'])
@require_auth(require_hmac=False)  # Public endpoint, no HMAC required
def create_weather_location():
    """Create a new weather location for the tenant"""
    try:
        tenant_id = g.tenant
        data = request.get_json()
        
        if not data or 'municipality_code' not in data:
            return jsonify({'error': 'municipality_code is required'}), 400
        
        municipality_code = data.get('municipality_code')
        is_primary = data.get('is_primary', False)
        label = data.get('label')
        station_id = data.get('station_id')
        metadata = data.get('metadata', {})
        
        with get_db_connection_with_tenant(tenant_id) as conn:
            if not conn:
                return jsonify({'error': 'Database connection error'}), 500
            
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                # Verify municipality exists in catalog, create if not exists
                cur.execute("""
                    SELECT ine_code, name FROM catalog_municipalities 
                    WHERE ine_code = %s
                """, (municipality_code,))
                municipality = cur.fetchone()
                
                if not municipality:
                    # Municipality not in catalog - create it with basic info
                    # Common municipalities mapping (INE codes)
                    common_municipalities = {
                        '31001': {'name': 'Pamplona', 'province': 'Navarra', 'latitude': 42.8169, 'longitude': -1.6432},
                        '28079': {'name': 'Madrid', 'province': 'Madrid', 'latitude': 40.4168, 'longitude': -3.7038},
                        '08019': {'name': 'Barcelona', 'province': 'Barcelona', 'latitude': 41.3851, 'longitude': 2.1734},
                        '41091': {'name': 'Sevilla', 'province': 'Sevilla', 'latitude': 37.3891, 'longitude': -5.9845},
                        '46015': {'name': 'Valencia', 'province': 'Valencia', 'latitude': 39.4699, 'longitude': -0.3763},
                        '15030': {'name': 'A Coruña', 'province': 'A Coruña', 'latitude': 43.3623, 'longitude': -8.4115},
                        '29067': {'name': 'Málaga', 'province': 'Málaga', 'latitude': 36.7213, 'longitude': -4.4214},
                        '33044': {'name': 'Oviedo', 'province': 'Asturias', 'latitude': 43.3619, 'longitude': -5.8494},
                        '48020': {'name': 'Bilbao', 'province': 'Vizcaya', 'latitude': 43.2627, 'longitude': -2.9253},
                        '50059': {'name': 'Zaragoza', 'province': 'Zaragoza', 'latitude': 41.6488, 'longitude': -0.8891},
                    }
                    
                    mun_data = common_municipalities.get(municipality_code)
                    if mun_data:
                        # Create municipality in catalog
                        cur.execute("""
                            INSERT INTO catalog_municipalities 
                            (ine_code, name, province, latitude, longitude, geom)
                            VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                            ON CONFLICT (ine_code) DO NOTHING
                        """, (
                            municipality_code,
                            mun_data['name'],
                            mun_data['province'],
                            mun_data['longitude'],
                            mun_data['latitude'],
                            mun_data['longitude'],
                            mun_data['latitude']
                        ))
                        logger.info(f"Created municipality {municipality_code} ({mun_data['name']}) in catalog")
                    else:
                        # Unknown municipality code - create with minimal info
                        cur.execute("""
                            INSERT INTO catalog_municipalities 
                            (ine_code, name, latitude, longitude, geom)
                            VALUES (%s, %s, NULL, NULL, NULL)
                            ON CONFLICT (ine_code) DO NOTHING
                        """, (municipality_code, f'Municipality {municipality_code}'))
                        logger.warning(f"Created municipality {municipality_code} with minimal info")
                    
                    # Re-fetch municipality
                    cur.execute("""
                        SELECT ine_code, name FROM catalog_municipalities 
                        WHERE ine_code = %s
                    """, (municipality_code,))
                    municipality = cur.fetchone()
                
                # If setting as primary, unset other primary locations
                if is_primary:
                    cur.execute("""
                        UPDATE tenant_weather_locations 
                        SET is_primary = false 
                        WHERE tenant_id = %s
                    """, (tenant_id,))
                
                # Insert new location
                cur.execute("""
                    INSERT INTO tenant_weather_locations 
                    (tenant_id, municipality_code, station_id, label, is_primary, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tenant_id, municipality_code) 
                    DO UPDATE SET 
                        station_id = EXCLUDED.station_id,
                        label = EXCLUDED.label,
                        is_primary = EXCLUDED.is_primary,
                        metadata = EXCLUDED.metadata,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id, municipality_code, station_id, label, is_primary, metadata, created_at, updated_at
                """, (tenant_id, municipality_code, station_id, label, is_primary, json.dumps(metadata)))
                
                result = cur.fetchone()
                conn.commit()
                
                if not result:
                    logger.error(f"No result returned from INSERT for tenant {tenant_id}, municipality {municipality_code}")
                    return jsonify({'error': 'Failed to create location'}), 500
                
                # Get full location with municipality name
                cur.execute("""
                    SELECT 
                        twl.id,
                        twl.municipality_code,
                        cm.name as municipality_name,
                        cm.latitude,
                        cm.longitude,
                        twl.station_id,
                        twl.label,
                        twl.is_primary,
                        twl.metadata
                    FROM tenant_weather_locations twl
                    JOIN catalog_municipalities cm ON cm.ine_code = twl.municipality_code
                    WHERE twl.id = %s
                """, (result['id'],))
                
                location = cur.fetchone()
                cur.close()
                
                if not location:
                    logger.error(f"Location not found after creation: id={result['id']}")
                    return jsonify({'error': 'Location created but not found'}), 500
                
                return jsonify({
                    'location': dict(location)
                }), 201
            
            except Exception as e:
                logger.error(f"Error creating weather location: {e}")
                return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in create_weather_location: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/observations/latest', methods=['GET'])
@require_auth(require_hmac=False)  # Public read-only endpoint, no HMAC required
def get_latest_weather_observations():
    """Get latest weather observations for tenant locations"""
    try:
        tenant_id = g.tenant
        if not tenant_id:
            logger.warning("Tenant not provided in request context; falling back to 'default' tenant for public weather reads")
            tenant_id = 'default'
        municipality_code = request.args.get('municipality_code')
        source = request.args.get('source', 'OPEN-METEO')  # Default to Open-Meteo
        data_type = request.args.get('data_type', 'HISTORY')  # Default to history
        
        def _fetch_for_tenant(tid: str):
            with get_db_connection_with_tenant(tid) as conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                query = """
                    SELECT DISTINCT ON (municipality_code, source, data_type)
                        municipality_code,
                        source,
                        data_type,
                        observed_at,
                        temp_avg,
                        temp_min,
                        temp_max,
                        humidity_avg,
                        precip_mm,
                        solar_rad_w_m2,
                        solar_rad_ghi_w_m2,
                        solar_rad_dni_w_m2,
                        eto_mm,
                        soil_moisture_0_10cm,
                        soil_moisture_10_40cm,
                        wind_speed_ms,
                        wind_direction_deg,
                        pressure_hpa,
                        gdd_accumulated,
                        metrics,
                        metadata
                    FROM weather_observations
                    WHERE tenant_id = %s
                """
                params = [tid]
                if municipality_code:
                    query += " AND municipality_code = %s"
                    params.append(municipality_code)
                if source:
                    query += " AND source = %s"
                    params.append(source)
                if data_type:
                    query += " AND data_type = %s"
                    params.append(data_type)
                query += " ORDER BY municipality_code, source, data_type, observed_at DESC"
                cur.execute(query, params)
                rows = cur.fetchall()
                cur.close()
                return rows

        try:
            observations = _fetch_for_tenant(tenant_id)
            if not observations and tenant_id != 'default':
                logger.info(f"No observations for tenant {tenant_id}, falling back to default")
                observations = _fetch_for_tenant('default')
            return jsonify({'observations': [dict(obs) for obs in observations]}), 200
        except Exception as e:
            logger.error(f"Error getting latest weather observations: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_latest_weather_observations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/observations', methods=['GET'])
@require_auth(require_hmac=False)  # Public read-only endpoint, no HMAC required
def get_weather_observations():
    """Get weather observations with optional filters"""
    try:
        tenant_id = g.tenant
        if not tenant_id:
            logger.warning("Tenant not provided in request context; falling back to 'default' tenant for public weather reads")
            tenant_id = 'default'
        municipality_code = request.args.get('municipality_code')
        source = request.args.get('source')
        data_type = request.args.get('data_type')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 100))
        
        def _fetch_for_tenant(tid: str):
            with get_db_connection_with_tenant(tid) as conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                query = """
                    SELECT 
                        municipality_code,
                        source,
                        data_type,
                        observed_at,
                        temp_avg,
                        temp_min,
                        temp_max,
                        humidity_avg,
                        precip_mm,
                        solar_rad_w_m2,
                        solar_rad_ghi_w_m2,
                        solar_rad_dni_w_m2,
                        eto_mm,
                        soil_moisture_0_10cm,
                        soil_moisture_10_40cm,
                        wind_speed_ms,
                        wind_direction_deg,
                        pressure_hpa,
                        gdd_accumulated,
                        metrics,
                        metadata
                    FROM weather_observations
                    WHERE tenant_id = %s
                """
                params = [tid]
                
                if municipality_code:
                    query += " AND municipality_code = %s"
                    params.append(municipality_code)
                
                if source:
                    query += " AND source = %s"
                    params.append(source)
                
                if data_type:
                    query += " AND data_type = %s"
                    params.append(data_type)
                
                if start_date:
                    query += " AND observed_at >= %s"
                    params.append(start_date)
                
                if end_date:
                    query += " AND observed_at <= %s"
                    params.append(end_date)
                
                query += " ORDER BY observed_at DESC LIMIT %s"
                params.append(limit)
                
                cur.execute(query, params)
                rows = cur.fetchall()
                cur.close()
                return rows
        
        try:
            observations = _fetch_for_tenant(tenant_id)
            if not observations and tenant_id != 'default':
                logger.info(f"No observations for tenant {tenant_id}, falling back to default")
                observations = _fetch_for_tenant('default')
            
            return jsonify({
                'observations': [dict(obs) for obs in observations],
                'count': len(observations)
            }), 200
        
        except Exception as e:
            logger.error(f"Error getting weather observations: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_weather_observations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/parcel/<parcel_id>/agro-status', methods=['GET'])
@require_auth
def get_parcel_agro_status(parcel_id):
    """
    Get agronomic weather status for a parcel.
    
    Fuses sensor data (if available) with Open-Meteo data:
    - Priority: Sensor > Open-Meteo
    - Calculates parcel centroid from geometry
    - Returns current conditions and agroclimatic metrics
    """
    try:
        tenant_id = g.tenant
        
        # Import geo_utils here to avoid circular imports
        from geo_utils import get_parcel_location
        
        # 1. Get parcel from Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{parcel_id}"
        headers = {
            'Accept': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, tenant_id)
        
        response = requests.get(orion_url, headers=headers, timeout=10)
        if response.status_code == 404:
            return jsonify({'error': 'Parcel not found'}), 404
        elif response.status_code != 200:
            logger.error(f"Error fetching parcel from Orion: {response.status_code}")
            return jsonify({'error': 'Failed to fetch parcel'}), 500
        
        parcel_entity = response.json()
        
        # 2. Calculate centroid from parcel geometry
        location = get_parcel_location(parcel_entity)
        if not location:
            # Try to get location from municipality if parcel has one
            municipality = parcel_entity.get('municipality', {}).get('value') if isinstance(parcel_entity.get('municipality'), dict) else parcel_entity.get('municipality')
            if municipality:
                # Try to find municipality coordinates from catalog
                try:
                    conn = get_db_connection_with_tenant(tenant_id)
                    if conn:
                        cur = conn.cursor(cursor_factory=RealDictCursor)
                        cur.execute("""
                            SELECT latitude, longitude 
                            FROM catalog_municipalities 
                            WHERE name ILIKE %s OR ine_code = %s
                            LIMIT 1
                        """, (f"%{municipality}%", municipality))
                        mun_row = cur.fetchone()
                        cur.close()
                        conn.close()
                        
                        if mun_row and mun_row.get('latitude') and mun_row.get('longitude'):
                            lat = float(mun_row['latitude'])
                            lon = float(mun_row['longitude'])
                            logger.info(f"Using municipality coordinates for parcel {parcel_id}: {lat}, {lon}")
                        else:
                            return jsonify({
                                'error': 'Parcel has no valid location/geometry',
                                'details': 'Parcel location could not be determined from geometry or municipality'
                            }), 400
                    else:
                        return jsonify({
                            'error': 'Parcel has no valid location/geometry',
                            'details': 'Database connection failed'
                        }), 400
                except Exception as e:
                    logger.warning(f"Error trying municipality fallback: {e}")
                    return jsonify({
                        'error': 'Parcel has no valid location/geometry',
                        'details': str(e)
                    }), 400
            else:
                return jsonify({
                    'error': 'Parcel has no valid location/geometry',
                    'details': 'Parcel has no location attribute and no municipality information'
                }), 400
        else:
            lon, lat = location
        
        # 3. Try to get sensor data near the parcel (within 5km radius)
        sensor_data = None
        try:
            conn = get_db_connection_with_tenant(tenant_id)
            if conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                # Find sensors within 5km of parcel centroid
                cur.execute("""
                    SELECT 
                        s.external_id,
                        s.name,
                        ST_X(s.installation_location::geometry) as lon,
                        ST_Y(s.installation_location::geometry) as lat,
                        ST_Distance(
                            s.installation_location::geography,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                        ) as distance_m,
                        te.observed_at,
                        te.payload
                    FROM sensors s
                    LEFT JOIN LATERAL (
                        SELECT observed_at, payload
                        FROM telemetry_events
                        WHERE tenant_id = %s 
                        AND device_id = s.external_id
                        ORDER BY observed_at DESC
                        LIMIT 1
                    ) te ON true
                    WHERE s.tenant_id = %s
                    AND ST_Distance(
                        s.installation_location::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                    ) <= 5000
                    ORDER BY distance_m ASC
                    LIMIT 1
                """, (lon, lat, tenant_id, tenant_id, lon, lat))
                
                sensor_row = cur.fetchone()
                cur.close()
                conn.close()
                
                if sensor_row and sensor_row['payload']:
                    sensor_data = {
                        'external_id': sensor_row['external_id'],
                        'name': sensor_row['name'],
                        'distance_m': float(sensor_row['distance_m']) if sensor_row['distance_m'] else None,
                        'observed_at': sensor_row['observed_at'].isoformat() if sensor_row['observed_at'] else None,
                        'payload': sensor_row['payload'] if isinstance(sensor_row['payload'], dict) else json.loads(sensor_row['payload']) if sensor_row['payload'] else {}
                    }
        except Exception as e:
            logger.warning(f"Error fetching sensor data: {e}")
            # Continue without sensor data
        
        # 4. Fetch Open-Meteo data for centroid
        openmeteo_data = None
        try:
            openmeteo_url = "https://api.open-meteo.com/v1/forecast"
            params = {
                'latitude': lat,
                'longitude': lon,
                'current': 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation',
                'hourly': 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
                'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration',
                'timezone': 'Europe/Madrid',
                'forecast_days': 7
            }
            
            response = requests.get(openmeteo_url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                current = data.get('current', {})
                daily = data.get('daily', {})
                
                openmeteo_data = {
                    'temperature': current.get('temperature_2m'),
                    'humidity': current.get('relative_humidity_2m'),
                    'wind_speed': current.get('wind_speed_10m'),
                    'wind_direction': current.get('wind_direction_10m'),
                    'pressure': current.get('pressure_msl'),
                    'precipitation': current.get('precipitation', 0),
                    'et0_today': daily.get('et0_fao_evapotranspiration', [0])[0] if daily.get('et0_fao_evapotranspiration') else None,
                    'precipitation_3d': sum(daily.get('precipitation_sum', [0])[:3]) if daily.get('precipitation_sum') else 0,
                    'et0_3d': sum(daily.get('et0_fao_evapotranspiration', [0])[:3]) if daily.get('et0_fao_evapotranspiration') else None,
                    'observed_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            logger.error(f"Error fetching Open-Meteo data: {e}")
            return jsonify({'error': 'Failed to fetch weather data'}), 500
        
        if not openmeteo_data:
            return jsonify({'error': 'No weather data available'}), 503
        
        # 5. Fuse sensor and Open-Meteo data (Sensor > Open-Meteo priority)
        fused = {
            'temperature': openmeteo_data.get('temperature'),
            'humidity': openmeteo_data.get('humidity'),
            'wind_speed': openmeteo_data.get('wind_speed'),
            'wind_direction': openmeteo_data.get('wind_direction'),
            'pressure': openmeteo_data.get('pressure'),
            'precipitation': openmeteo_data.get('precipitation', 0),
            'precipitation_3d': openmeteo_data.get('precipitation_3d', 0),
            'et0_today': openmeteo_data.get('et0_today'),
            'et0_3d': openmeteo_data.get('et0_3d'),
            'sources': {
                'temperature': 'OPEN-METEO',
                'humidity': 'OPEN-METEO',
                'wind_speed': 'OPEN-METEO',
                'wind_direction': 'OPEN-METEO',
                'pressure': 'OPEN-METEO',
                'precipitation': 'OPEN-METEO'
            },
            'source_confidence': 'OPEN-METEO'
        }
        
        # Override with sensor data if available
        if sensor_data and sensor_data.get('payload'):
            payload = sensor_data['payload']
            # Map sensor payload to weather metrics (adjust based on your sensor schema)
            if 'temperature' in payload or 'temp' in payload:
                fused['temperature'] = payload.get('temperature') or payload.get('temp')
                fused['sources']['temperature'] = 'SENSOR_REAL'
            if 'humidity' in payload:
                fused['humidity'] = payload.get('humidity')
                fused['sources']['humidity'] = 'SENSOR_REAL'
            if 'wind_speed' in payload:
                fused['wind_speed'] = payload.get('wind_speed')
                fused['sources']['wind_speed'] = 'SENSOR_REAL'
            if 'wind_direction' in payload:
                fused['wind_direction'] = payload.get('wind_direction')
                fused['sources']['wind_direction'] = 'SENSOR_REAL'
            if 'pressure' in payload:
                fused['pressure'] = payload.get('pressure')
                fused['sources']['pressure'] = 'SENSOR_REAL'
            
            fused['source_confidence'] = 'SENSOR_REAL'
            fused['sensor'] = {
                'external_id': sensor_data['external_id'],
                'name': sensor_data['name'],
                'distance_m': sensor_data['distance_m'],
                'last_observation': sensor_data['observed_at']
            }
        
        # 6. Calculate water balance (precipitation - ET0)
        if fused.get('precipitation_3d') is not None and fused.get('et0_3d') is not None:
            fused['water_balance'] = fused['precipitation_3d'] - fused['et0_3d']
        
        # 7. Calculate Delta T (wet-bulb depression) for spraying semaphore
        delta_t = None
        if fused.get('temperature') is not None and fused.get('humidity') is not None:
            try:
                import math
                # Calculate dew point (Magnus formula)
                a = 17.27
                b = 237.7
                temp = fused['temperature']
                hum = fused['humidity']
                alpha = ((a * temp) / (b + temp)) + math.log(hum / 100.0)
                dew_point = (b * alpha) / (a - alpha)
                # Approximate wet bulb temperature
                wet_bulb = temp - (temp - dew_point) * 0.4
                # Delta T = T_dry - T_wet
                delta_t = round(temp - wet_bulb, 2)
            except Exception as e:
                logger.warning(f"Error calculating Delta T: {e}")
        
        # 8. Calculate agronomic semaphores
        semaphores = {
            'spraying': 'unknown',
            'workability': 'unknown',
            'irrigation': 'unknown'
        }
        
        # Spraying semaphore (based on Delta T and wind speed)
        wind_speed_ms = fused.get('wind_speed', 0)
        wind_speed_kmh = wind_speed_ms * 3.6 if wind_speed_ms else 0
        precip = fused.get('precipitation', 0)
        
        if delta_t is not None and wind_speed_kmh is not None:
            # Green: Wind < 15km/h AND Delta T 2-8
            if wind_speed_kmh < 15 and 2 <= delta_t <= 8:
                semaphores['spraying'] = 'optimal'
            # Red: Wind > 20km/h OR Delta T > 10 OR Precip > 0.5mm
            elif wind_speed_kmh > 20 or delta_t > 10 or (precip and precip > 0.5):
                semaphores['spraying'] = 'not_suitable'
            # Yellow: Otherwise
            else:
                semaphores['spraying'] = 'caution'
        
        # Workability semaphore (based on soil moisture)
        # Try to get soil moisture from sensor first, then Open-Meteo
        soil_moisture = None
        if sensor_data and sensor_data.get('payload'):
            payload = sensor_data['payload']
            # Check for soil moisture in sensor payload
            if 'soil_moisture' in payload:
                soil_moisture = payload.get('soil_moisture')
            elif 'moisture' in payload:
                soil_moisture = payload.get('moisture')
        
        # Fallback to Open-Meteo soil moisture if no sensor data
        if soil_moisture is None:
            # Open-Meteo provides soil_moisture_0_10cm in daily data
            # For now, we'll use a simple heuristic based on recent precipitation and humidity
            # In a more complete implementation, we'd fetch soil_moisture from Open-Meteo daily data
            # For workability, we can estimate from precipitation and humidity patterns
            recent_precip = fused.get('precipitation_3d', 0)
            humidity = fused.get('humidity', 0)
            
            # Simple heuristic: if high humidity and recent rain, soil is likely wet
            # If low humidity and no recent rain, soil is likely dry
            if recent_precip > 5 or humidity > 80:
                # Soil likely too wet
                semaphores['workability'] = 'too_wet'
            elif recent_precip == 0 and humidity < 40:
                # Soil likely too dry
                semaphores['workability'] = 'too_dry'
            elif 1 <= recent_precip <= 5 and 40 <= humidity <= 80:
                # Soil likely in good condition (tempero)
                semaphores['workability'] = 'optimal'
            else:
                # Borderline conditions
                semaphores['workability'] = 'caution'
        else:
            # Use actual sensor soil moisture
            if 15 <= soil_moisture <= 25:
                semaphores['workability'] = 'optimal'
            elif soil_moisture > 25:
                semaphores['workability'] = 'too_wet'
            elif soil_moisture < 10:
                semaphores['workability'] = 'too_dry'
            else:
                semaphores['workability'] = 'caution'
        
        # Irrigation semaphore (based on water balance)
        water_balance = fused.get('water_balance')
        if water_balance is not None:
            # Green: Balance > 0 (surplus)
            if water_balance > 0:
                semaphores['irrigation'] = 'satisfied'
            # Red: Balance < -5mm (deficit)
            elif water_balance < -5:
                semaphores['irrigation'] = 'deficit'
            # Yellow: Balance 0 to -5mm (alert)
            else:
                semaphores['irrigation'] = 'alert'
        
        # 9. Return agronomic status with semaphores
        return jsonify({
            'parcel_id': parcel_id,
            'parcel_name': parcel_entity.get('name', {}).get('value', 'Unnamed'),
            'centroid': {
                'latitude': lat,
                'longitude': lon
            },
            'weather': fused,
            'semaphores': semaphores,
            'metrics': {
                'temperature': fused.get('temperature'),
                'humidity': fused.get('humidity'),
                'delta_t': delta_t,
                'water_balance': fused.get('water_balance'),
                'wind_speed': fused.get('wind_speed')  # Add wind speed for tooltips
            },
            'source_confidence': fused.get('source_confidence', 'OPEN-METEO'),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    
    except Exception as e:
        logger.error(f"Error in get_parcel_agro_status: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/weather/alerts', methods=['GET'])
@require_auth
def get_weather_alerts():
    """Get active weather alerts for tenant locations"""
    try:
        tenant_id = g.tenant
        municipality_code = request.args.get('municipality_code')
        alert_type = request.args.get('alert_type')  # YELLOW, ORANGE, RED
        active_only = request.args.get('active_only', 'true').lower() == 'true'
        
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT 
                    id,
                    municipality_code,
                    alert_type,
                    alert_category,
                    effective_from,
                    effective_to,
                    description,
                    aemet_alert_id,
                    metadata
                FROM weather_alerts
                WHERE tenant_id = %s
            """
            params = [tenant_id]
            
            if municipality_code:
                query += " AND municipality_code = %s"
                params.append(municipality_code)
            
            if alert_type:
                query += " AND alert_type = %s"
                params.append(alert_type)
            
            if active_only:
                query += " AND effective_to >= CURRENT_TIMESTAMP"
            
            query += " ORDER BY effective_from DESC, alert_type DESC"
            
            cur.execute(query, params)
            alerts = cur.fetchall()
            cur.close()
            conn.close()
            
            return jsonify({
                'alerts': [dict(alert) for alert in alerts],
                'count': len(alerts)
            }), 200
        
        except Exception as e:
            conn.close()
            logger.error(f"Error getting weather alerts: {e}")
            return jsonify({'error': 'Database error'}), 500
    
    except Exception as e:
        logger.error(f"Error in get_weather_alerts: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# Terms and Conditions Management Endpoints
# =============================================================================

@app.route('/api/admin/terms/<language>', methods=['GET'])
def get_terms(language):
    """Get terms and conditions for a specific language (public endpoint for registration)"""
    try:
        # Allow read access without authentication (needed for registration page)
        conn = get_db_connection_simple()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            cur.execute("""
                SELECT content, last_updated, language 
                FROM terms_and_conditions 
                WHERE language = %s 
                ORDER BY last_updated DESC 
                LIMIT 1
            """, (language,))
            
            result = cur.fetchone()
            cur.close()
            
            if result:
                return jsonify({
                    'content': result['content'],
                    'last_updated': result['last_updated'].isoformat() if result['last_updated'] else None,
                    'language': result['language']
                }), 200
            else:
                return jsonify({'error': 'Terms not found'}), 404
        finally:
            return_db_connection(conn)
            
    except Exception as e:
        logger.error(f"Error getting terms: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/terms/<language>', methods=['POST'])
@require_auth
def save_terms(language):
    """Save or update terms and conditions for a specific language (admin only)"""
    try:
        # Verify user is PlatformAdmin
        user_roles = g.get('user_roles', [])
        if 'PlatformAdmin' not in user_roles:
            return jsonify({'error': 'Unauthorized. Only PlatformAdmin can manage terms.'}), 403
        
        data = request.get_json()
        content = data.get('content', '').strip()
        
        if not content:
            return jsonify({'error': 'Content is required'}), 400
        
        # Validate language
        supported_languages = ['es', 'en', 'ca', 'eu', 'fr', 'pt']
        if language not in supported_languages:
            return jsonify({'error': f'Unsupported language: {language}'}), 400
        
        conn = get_db_connection_simple()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        try:
            set_platform_admin_context(conn)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if terms exist for this language
            cur.execute("""
                SELECT id FROM terms_and_conditions 
                WHERE language = %s 
                ORDER BY last_updated DESC 
                LIMIT 1
            """, (language,))
            
            existing = cur.fetchone()
            
            if existing:
                # Update existing
                cur.execute("""
                    UPDATE terms_and_conditions 
                    SET content = %s, last_updated = NOW() 
                    WHERE id = %s
                """, (content, existing['id']))
            else:
                # Insert new
                cur.execute("""
                    INSERT INTO terms_and_conditions (language, content, last_updated)
                    VALUES (%s, %s, NOW())
                """, (language, content))
            
            conn.commit()
            cur.close()
            
            return jsonify({
                'success': True,
                'message': 'Terms saved successfully'
            }), 200
        finally:
            return_db_connection(conn)
        
    except Exception as e:
        logger.error(f"Error saving terms: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Parent Entities (for hierarchy)
# =============================================================================

@app.route('/api/entities/parents', methods=['GET'])
@require_auth
def get_parent_entities():
    """
    Get entities that can be used as parents for hierarchical relationships
    
    Returns entities that have Polygon/MultiPolygon geometry and can contain
    child entities (subdivisions, zones, etc.)
    """
    try:
        entity_type = request.args.get('type')  # Optional filter by type
        
        # Types that can be parents (have area/geometry)
        parent_types = [
            'AgriParcel', 'Parcel', 'Vineyard', 'OliveGrove',
            'AgriBuilding', 'LivestockFarm'
        ]
        
        if entity_type:
            parent_types = [entity_type] if entity_type in parent_types else []
        
        all_parents = []
        tenant = g.tenant
        
        for parent_type in parent_types:
            try:
                # Query Orion-LD for entities of this type
                orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
                params = {'type': parent_type}
                
                headers = {
                    'Accept': 'application/ld+json'
                }
                headers = inject_fiware_headers(headers, tenant)
                
                response = requests.get(orion_url, params=params, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    entities = response.json()
                    if not isinstance(entities, list):
                        entities = [entities]
                    
                    # Filter entities that have Polygon/MultiPolygon geometry
                    for entity in entities:
                        location = entity.get('location', {})
                        if isinstance(location, dict):
                            value = location.get('value', {})
                            if isinstance(value, dict):
                                geom_type = value.get('type', '')
                                # Only include entities with area (Polygon/MultiPolygon)
                                if geom_type in ['Polygon', 'MultiPolygon']:
                                    all_parents.append({
                                        'id': entity.get('id'),
                                        'type': entity.get('type'),
                                        'name': entity.get('name', {}).get('value', 'Unnamed'),
                                        'geometry': value  # Full GeoJSON geometry
                                    })
            except Exception as e:
                logger.warning(f"Error fetching {parent_type} entities: {e}")
                continue
        
        return jsonify({
            'entities': all_parents,
            'count': len(all_parents),
            'tenant': tenant
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting parent entities: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# Robot Provisioning (with WireGuard, ROS namespace, etc.)
# =============================================================================

def _generate_wireguard_keys():
    """Generate WireGuard key pair"""
    try:
        # Try to use wg command if available
        private_key = subprocess.check_output(['wg', 'genkey'], stderr=subprocess.STDOUT).decode().strip()
        public_key = subprocess.check_output(['wg', 'pubkey'], input=private_key.encode(), stderr=subprocess.STDOUT).decode().strip()
        return private_key, public_key
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback: generate keys using Python (requires cryptography library)
        try:
            from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
            from cryptography.hazmat.primitives import serialization
            import base64
            
            private_key_obj = X25519PrivateKey.generate()
            private_key_bytes = private_key_obj.private_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PrivateFormat.Raw,
                encryption_algorithm=serialization.NoEncryption()
            )
            public_key_obj = private_key_obj.public_key()
            public_key_bytes = public_key_obj.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw
            )
            
            # WireGuard uses base64 encoding
            private_key = base64.b64encode(private_key_bytes).decode('ascii')
            public_key = base64.b64encode(public_key_bytes).decode('ascii')
            
            return private_key, public_key
        except ImportError:
            logger.error("WireGuard key generation requires 'wg' command or 'cryptography' library")
            raise ValueError("WireGuard key generation not available")


def _get_next_robot_index(tenant_id: str) -> int:
    """Get next sequential robot index for tenant"""
    try:
        conn = get_db_connection_with_tenant(tenant_id)
        if not conn:
            return 1  # Default to 1 if DB unavailable
        
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            # Query Orion-LD to count existing robots for this tenant
            orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
            params = {'type': 'AgriculturalRobot', 'options': 'count'}
            headers = inject_fiware_headers({'Accept': 'application/ld+json'}, tenant_id)
            
            response = requests.get(orion_url, params=params, headers=headers, timeout=5)
            if response.status_code == 200:
                count = response.json()
                if isinstance(count, list):
                    return len(count) + 1
                elif isinstance(count, dict) and 'count' in count:
                    return count['count'] + 1
            return 1
        finally:
            return_db_connection(conn)
    except:
        return 1


def _calculate_vpn_ip(tenant_id: str, robot_index: int) -> str:
    """Calculate VPN IP for robot based on tenant and index"""
    # Simple algorithm: base IP + tenant hash + robot index
    # Range: 10.8.0.10 - 10.8.0.250
    base = 10
    tenant_hash = hash(tenant_id) % 100  # 0-99
    robot_offset = robot_index % 20  # 0-19
    ip_last_octet = base + tenant_hash + robot_offset
    
    # Ensure within valid range
    if ip_last_octet > 250:
        ip_last_octet = 10 + (ip_last_octet % 240)
    
    return f"10.8.0.{ip_last_octet}"


@app.route('/api/robots/provision', methods=['POST'])
@require_auth
def provision_robot():
    """
    Provision a new robot with full identity:
    - UUID persistent
    - ROS_NAMESPACE
    - WireGuard keys
    - VPN IP
    - Status: offline (will change to online when ROS2 Bridge detects telemetry)
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        tenant_id = g.tenant
        
        # 1. Generate UUID persistent
        robot_uuid = str(uuid.uuid4())
        
        # 2. Generate ROS_NAMESPACE
        robot_index = _get_next_robot_index(tenant_id)
        ros_namespace = f"/{tenant_id}/robot_{robot_index:03d}"
        
        # 3. Generate WireGuard keys
        try:
            private_key, public_key = _generate_wireguard_keys()
        except Exception as e:
            logger.error(f"Error generating WireGuard keys: {e}")
            return jsonify({
                'error': 'Failed to generate WireGuard keys',
                'details': str(e)
            }), 500
        
        # 4. Calculate VPN IP
        vpn_ip = _calculate_vpn_ip(tenant_id, robot_index)
        
        # 5. Get WireGuard server info (from config or env)
        server_endpoint = os.getenv('WIREGUARD_SERVER_ENDPOINT')
        server_public_key = os.getenv('WIREGUARD_SERVER_PUBLIC_KEY', '')
        
        # 6. Build robot entity for Orion-LD
        robot_name = data.get('name', 'Robot')
        robot_location = data.get('location', {})
        
        robot_entity = {
            'id': f"urn:ngsi-ld:AgriculturalRobot:{tenant_id}:{robot_uuid}",
            'type': 'AgriculturalRobot',
            'name': {
                'type': 'Property',
                'value': robot_name
            },
            'status': {
                'type': 'Property',
                'value': 'offline'  # Initial status
            },
            'robotUUID': {
                'type': 'Property',
                'value': robot_uuid
            },
            'rosNamespace': {
                'type': 'Property',
                'value': ros_namespace
            },
            'vpnIp': {
                'type': 'Property',
                'value': vpn_ip
            },
            'wireguardPublicKey': {
                'type': 'Property',
                'value': public_key
            },
            '@context': [CONTEXT_URL]
        }
        
        # Add location if provided
        if robot_location:
            robot_entity['location'] = robot_location
        
        # Add optional fields
        if data.get('robotType'):
            robot_entity['robotType'] = {
                'type': 'Property',
                'value': data['robotType']
            }
        if data.get('model'):
            robot_entity['model'] = {
                'type': 'Property',
                'value': data['model']
            }
        if data.get('manufacturer'):
            robot_entity['manufacturer'] = {
                'type': 'Property',
                'value': data['manufacturer']
            }
        if data.get('serialNumber'):
            robot_entity['serialNumber'] = {
                'type': 'Property',
                'value': data['serialNumber']
            }
        if data.get('icon'):
            robot_entity['icon'] = {
                'type': 'Property',
                'value': data['icon']
            }
        if data.get('ref3DModel'):
            robot_entity['ref3DModel'] = {
                'type': 'Property',
                'value': data['ref3DModel']
            }
            if data.get('modelScale'):
                robot_entity['modelScale'] = {
                    'type': 'Property',
                    'value': data['modelScale']
                }
            if data.get('modelRotation'):
                robot_entity['modelRotation'] = {
                    'type': 'Property',
                    'value': data['modelRotation']
                }
        
        # 7. Create in Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        headers = {
            'Content-Type': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, tenant_id)
        
        response = requests.post(orion_url, json=robot_entity, headers=headers, timeout=10)
        
        if response.status_code not in [201, 409]:  # 409 = already exists
            logger.error(f"Failed to create robot in Orion: {response.status_code} - {response.text}")
            return jsonify({
                'error': 'Failed to create robot in Orion-LD',
                'details': response.text
            }), 500
        
        # 8. Save credentials in DB (encrypted) for recovery
        # Note: In production, encrypt private_key before storing
        if POSTGRES_URL:
            try:
                conn = get_db_connection_with_tenant(tenant_id)
                if conn:
                    try:
                        cur = conn.cursor()
                        # Create table if not exists
                        cur.execute("""
                            CREATE TABLE IF NOT EXISTS robot_credentials (
                                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                tenant_id TEXT NOT NULL,
                                robot_uuid TEXT NOT NULL UNIQUE,
                                ros_namespace TEXT NOT NULL,
                                vpn_ip TEXT NOT NULL,
                                wireguard_private_key TEXT NOT NULL,
                                wireguard_public_key TEXT NOT NULL,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                UNIQUE(tenant_id, robot_uuid)
                            )
                        """)
                        # Insert credentials
                        cur.execute("""
                            INSERT INTO robot_credentials 
                            (tenant_id, robot_uuid, ros_namespace, vpn_ip, wireguard_private_key, wireguard_public_key)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (robot_uuid) DO NOTHING
                        """, (tenant_id, robot_uuid, ros_namespace, vpn_ip, private_key, public_key))
                        conn.commit()
                        cur.close()
                    finally:
                        return_db_connection(conn)
            except Exception as e:
                logger.warning(f"Could not save robot credentials to DB: {e}")
        
        # 9. Log the operation
        log_entity_operation('create', robot_entity['id'], 'AgriculturalRobot', tenant_id, g.farmer_id, {
            'robot_uuid': robot_uuid,
            'ros_namespace': ros_namespace
        })
        
        # 10. Return robot entity and credentials (private key shown only once)
        return jsonify({
            'robot': robot_entity,
            'credentials': {
                'robot_uuid': robot_uuid,
                'ros_namespace': ros_namespace,
                'vpn_ip': vpn_ip,
                'wireguard_private_key': private_key,  # ⚠️ Show only once
                'wireguard_public_key': public_key,
                'server_endpoint': server_endpoint,
                'server_public_key': server_public_key
            },
            'warning': 'Save these credentials securely. The private key will not be shown again.'
        }), 201
        
    except Exception as e:
        logger.error(f"Error provisioning robot: {e}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500


# =============================================================================
# Vercel Blob Upload Authorization
# =============================================================================

@app.route('/api/upload/authorize', methods=['POST'])
@require_auth
def authorize_upload():
    """
    Authorize Vercel Blob upload (proxy for frontend)
    
    Since the frontend is Vite/React (not Next.js), we need a backend endpoint
    to securely provide the blob token for client-side uploads.
    
    The frontend will use this endpoint to get authorization, then upload
    directly to Vercel Blob using @vercel/blob SDK.
    """
    try:
        blob_token = os.getenv('BLOB_READ_WRITE_TOKEN')
        if not blob_token:
            logger.warning("BLOB_READ_WRITE_TOKEN not configured")
            return jsonify({
                'error': 'Blob storage not configured',
                'message': 'BLOB_READ_WRITE_TOKEN environment variable is required'
            }), 500
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        filename = data.get('filename')
        content_type = data.get('contentType', 'application/octet-stream')
        
        if not filename:
            return jsonify({'error': 'filename is required'}), 400
        
        # Validate file type
        allowed_icon_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
        allowed_model_types = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
        allowed_types = allowed_icon_types + allowed_model_types
        
        if content_type not in allowed_types:
            # Try to infer from extension
            ext = filename.lower().split('.')[-1]
            if ext in ['png', 'jpg', 'jpeg', 'svg']:
                content_type = f'image/{ext}' if ext != 'svg' else 'image/svg+xml'
            elif ext in ['glb', 'gltf']:
                content_type = 'model/gltf-binary' if ext == 'glb' else 'model/gltf+json'
            else:
                return jsonify({
                    'error': 'Invalid file type',
                    'allowed_types': allowed_types,
                    'received': content_type
                }), 400
        
        # Validate file size (will be checked on upload, but we can warn here)
        max_size_mb = 2 if content_type.startswith('image/') else 10
        file_size_mb = data.get('fileSize', 0) / (1024 * 1024) if data.get('fileSize') else 0
        
        if file_size_mb > max_size_mb:
            return jsonify({
                'error': f'File too large',
                'max_size_mb': max_size_mb,
                'received_mb': round(file_size_mb, 2)
            }), 400
        
        # Generate unique filename with tenant prefix for organization
        tenant_id = g.tenant
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{tenant_id}/{timestamp}_{filename}"
        
        # Return authorization info
        # The frontend will use @vercel/blob SDK with this token
        return jsonify({
            'token': blob_token,  # Frontend will use this with @vercel/blob
            'filename': unique_filename,
            'contentType': content_type,
            'maxSizeBytes': max_size_mb * 1024 * 1024,
            'tenant': tenant_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error authorizing upload: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


# =============================================================================
# Asset Service - MinIO-based 3D Models and Icons Storage
# =============================================================================
# Replaces Vercel Blob with local MinIO storage
# Bucket: assets-3d/{tenant_id}/{asset_type}/{asset_id}.{ext}
# =============================================================================

ASSETS_BUCKET = os.getenv('ASSETS_BUCKET', 'assets-3d')
PUBLIC_ASSETS_PREFIX = 'public'
PUBLIC_ASSETS_PREFIX = 'public'
ASSETS_URL_EXPIRATION = int(os.getenv('ASSETS_URL_EXPIRATION', '86400'))  # 24 hours default

def get_assets_s3_client():
    """Get boto3 S3 client configured for MinIO assets bucket"""
    s3_endpoint = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
    s3_access_key = os.getenv('S3_ACCESS_KEY')
    s3_secret_key = os.getenv('S3_SECRET_KEY')
    s3_region = os.getenv('S3_REGION', 'us-east-1')
    
    if not s3_access_key or not s3_secret_key:
        return None
    
    return boto3.client(
        's3',
        endpoint_url=s3_endpoint,
        aws_access_key_id=s3_access_key,
        aws_secret_access_key=s3_secret_key,
        region_name=s3_region,
        config=boto3.session.Config(signature_version='s3v4')
    )


@app.route('/api/assets/upload', methods=['POST'])
@app.route('/entity-manager/api/assets/upload', methods=['POST'])
@require_auth(require_hmac=False)
def upload_asset():
    """
    Upload a 3D model or icon directly to MinIO.
    
    Replaces Vercel Blob upload with local MinIO storage.
    
    Request: multipart/form-data with:
      - file: The file to upload
      - asset_type: 'model' or 'icon'
    
    Response: {
      "url": "https://...",
      "asset_id": "uuid",
      "size": bytes,
      "content_type": "..."
    }
    """
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        asset_type = request.form.get('asset_type', 'model')
        if asset_type not in ['model', 'icon']:
            return jsonify({'error': 'asset_type must be "model" or "icon"'}), 400
        
        # Validate file type
        filename = file.filename.lower()
        if asset_type == 'model':
            allowed_extensions = ['.glb', '.gltf']
            max_size_mb = 50  # 50MB for 3D models
            content_type = 'model/gltf-binary' if filename.endswith('.glb') else 'model/gltf+json'
        else:  # icon
            allowed_extensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp']
            max_size_mb = 5  # 5MB for icons
            ext = filename.split('.')[-1]
            content_type = f'image/{ext}' if ext != 'svg' else 'image/svg+xml'
        
        if not any(filename.endswith(ext) for ext in allowed_extensions):
            return jsonify({
                'error': f'Invalid file type for {asset_type}',
                'allowed_extensions': allowed_extensions
            }), 400
        
        # Read file to check size
        file_data = file.read()
        file_size = len(file_data)
        
        if file_size > max_size_mb * 1024 * 1024:
            return jsonify({
                'error': f'File too large. Max {max_size_mb}MB for {asset_type}',
                'size_mb': round(file_size / (1024 * 1024), 2)
            }), 400
        
        # Generate asset ID and path
        asset_id = str(uuid.uuid4())
        extension = '.' + filename.split('.')[-1]
        s3_key = f"{tenant_id}/{asset_type}/{asset_id}{extension}"
        
        # Get S3 client
        s3_client = get_assets_s3_client()
        if not s3_client:
            logger.error("MinIO credentials not configured for asset upload")
            return jsonify({'error': 'Asset storage not configured'}), 503
        
        # Upload to MinIO
        try:
            s3_client.put_object(
                Bucket=ASSETS_BUCKET,
                Key=s3_key,
                Body=file_data,
                ContentType=content_type,
                Metadata={
                    'tenant_id': tenant_id,
                    'asset_type': asset_type,
                    'original_filename': file.filename
                }
            )
            logger.info(f"Uploaded asset to MinIO: {ASSETS_BUCKET}/{s3_key}")
        except ClientError as e:
            logger.error(f"Failed to upload asset to MinIO: {e}")
            return jsonify({'error': 'Failed to upload asset'}), 500
        
        # Generate presigned URL for access
        # Using public bucket, so we can use direct URL
        s3_endpoint = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
        # For internal access, use internal endpoint
        # For external access, use the public endpoint
        public_endpoint = os.getenv('ASSETS_PUBLIC_URL', s3_endpoint)
        direct_url = f"{public_endpoint}/{ASSETS_BUCKET}/{s3_key}"
        
        return jsonify({
            'url': direct_url,
            'asset_id': asset_id,
            'key': s3_key,
            'size': file_size,
            'content_type': content_type,
            'tenant_id': tenant_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error uploading asset: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/assets/<asset_id>', methods=['GET'])
@require_auth(require_hmac=False)
def get_asset_url(asset_id):
    """
    Get a presigned URL for an asset.
    
    Query params:
      - type: 'model' or 'icon' (required)
      - extension: file extension (default: .glb for model, .png for icon)
    """
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        asset_type = request.args.get('type', 'model')
        if asset_type == 'model':
            extension = request.args.get('extension', '.glb')
        else:
            extension = request.args.get('extension', '.png')
        
        s3_key = f"{tenant_id}/{asset_type}/{asset_id}{extension}"
        
        s3_client = get_assets_s3_client()
        if not s3_client:
            return jsonify({'error': 'Asset storage not configured'}), 503
        
        # Check if object exists
        try:
            s3_client.head_object(Bucket=ASSETS_BUCKET, Key=s3_key)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return jsonify({'error': 'Asset not found'}), 404
            raise
        
        # Generate presigned URL
        try:
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': ASSETS_BUCKET, 'Key': s3_key},
                ExpiresIn=ASSETS_URL_EXPIRATION
            )
            return jsonify({
                'url': url,
                'expires_in': ASSETS_URL_EXPIRATION,
                'asset_id': asset_id
            }), 200
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return jsonify({'error': 'Failed to generate URL'}), 500
            
    except Exception as e:
        logger.error(f"Error getting asset URL: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/assets/<asset_id>', methods=['DELETE'])
@require_auth(require_hmac=False)
def delete_asset(asset_id):
    """
    Delete an asset from MinIO.
    
    Query params:
      - type: 'model' or 'icon' (required)
      - extension: file extension
    """
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        asset_type = request.args.get('type', 'model')
        if asset_type == 'model':
            extension = request.args.get('extension', '.glb')
        else:
            extension = request.args.get('extension', '.png')
        
        s3_key = f"{tenant_id}/{asset_type}/{asset_id}{extension}"
        
        s3_client = get_assets_s3_client()
        if not s3_client:
            return jsonify({'error': 'Asset storage not configured'}), 503
        
        try:
            s3_client.delete_object(Bucket=ASSETS_BUCKET, Key=s3_key)
            logger.info(f"Deleted asset from MinIO: {ASSETS_BUCKET}/{s3_key}")
            return jsonify({
                'deleted': True,
                'asset_id': asset_id
            }), 200
        except ClientError as e:
            logger.error(f"Failed to delete asset: {e}")
            return jsonify({'error': 'Failed to delete asset'}), 500
            
    except Exception as e:
        logger.error(f"Error deleting asset: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@app.route('/api/assets/public', methods=['GET'])
@app.route('/entity-manager/api/assets/public', methods=['GET'])
@require_auth(require_hmac=False)
def list_public_assets():
    """
    List all public (global) assets.
    """
    try:
        s3_client = get_assets_s3_client()
        if not s3_client:
            return jsonify({'error': 'Asset storage not configured'}), 503

        prefix = f"{PUBLIC_ASSETS_PREFIX}/"
        
        try:
            response = s3_client.list_objects_v2(Bucket=ASSETS_BUCKET, Prefix=prefix)
            assets = []
            
            s3_endpoint = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
            public_endpoint = os.getenv('ASSETS_PUBLIC_URL', s3_endpoint)

            for obj in response.get('Contents', []):
                key = obj['Key']
                # Skip folders
                if key.endswith('/'):
                    continue
                    
                # Parse metadata from key: public/{type}/{filename}
                parts = key.split('/')
                if len(parts) < 3:
                     continue
                
                asset_type = parts[1] # 'model' or 'icon'
                filename = parts[-1]
                
                # Get metadata (head_object) to get meaningful name if possible
                # For performance, we might skip this or cache it, but for now we do it
                try:
                    head = s3_client.head_object(Bucket=ASSETS_BUCKET, Key=key)
                    meta = head.get('Metadata', {})
                    original_name = meta.get('original_filename', filename)
                except:
                    original_name = filename

                url = f"{public_endpoint}/{ASSETS_BUCKET}/{key}"
                
                assets.append({
                    'key': key,
                    'url': url,
                    'type': asset_type,
                    'filename': original_name,
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat()
                })
                
            return jsonify({'assets': assets}), 200

        except ClientError as e:
            logger.error(f"Failed to list public assets: {e}")
            return jsonify({'error': 'Failed to list assets'}), 500

    except Exception as e:
        logger.error(f"Error listing public assets: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/assets/public', methods=['POST'])
@app.route('/entity-manager/api/assets/public', methods=['POST'])
@require_auth(require_hmac=False)
def upload_public_asset():
    """
    Upload a GLOBAL/PUBLIC asset to MinIO (Platform Admin only).
    """
    try:
        # Use g.roles directly (set by auth middleware) or fallback to current_user
        user_roles = getattr(g, 'roles', [])
        if not user_roles and hasattr(g, 'current_user'):
            user_roles = g.current_user.get('realm_access', {}).get('roles', [])
             
        if 'PlatformAdmin' not in user_roles:
            return jsonify({'error': 'Only Platform Admin can upload global assets'}), 403

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'No filename provided'}), 400
            
        asset_type = request.form.get('asset_type', 'model')
        if asset_type not in ['model', 'icon']:
             return jsonify({'error': 'Invalid asset type'}), 400
             
        filename = file.filename.lower()
        if asset_type == 'model':
            allowed_extensions = ['.glb', '.gltf']
            content_type = 'model/gltf-binary' if filename.endswith('.glb') else 'model/gltf+json'
        else:
            allowed_extensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp']
            ext = filename.split('.')[-1]
            content_type = f'image/{ext}' if ext != 'svg' else 'image/svg+xml'

        if not any(filename.endswith(ext) for ext in allowed_extensions):
            return jsonify({'error': 'Invalid file extension'}), 400
            
        file_data = file.read()
        
        safe_filename = "".join([c for c in file.filename if c.isalpha() or c.isdigit() or c in ['.', '-', '_']]).strip()
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        s3_key = f"{PUBLIC_ASSETS_PREFIX}/{asset_type}/{timestamp}_{safe_filename}"
        
        s3_client = get_assets_s3_client()
        if not s3_client:
            return jsonify({'error': 'Storage not configured'}), 503
            
        s3_client.put_object(
            Bucket=ASSETS_BUCKET,
            Key=s3_key,
            Body=file_data,
            ContentType=content_type,
            Metadata={
                'original_filename': file.filename,
                'is_public': 'true'
            }
        )
        
        s3_endpoint = os.getenv('S3_ENDPOINT_URL', 'http://minio-service:9000')
        public_endpoint = os.getenv('ASSETS_PUBLIC_URL', s3_endpoint)
        url = f"{public_endpoint}/{ASSETS_BUCKET}/{s3_key}"
        
        return jsonify({
            'success': True,
            'url': url,
            'key': s3_key,
            'filename': safe_filename
        }), 201

    except Exception as e:
        logger.error(f"Error uploading public asset: {e}")
        return jsonify({'error': str(e)}), 500





@app.route('/api/assets/public/<path:filename>', methods=['DELETE'])
@app.route('/entity-manager/api/assets/public/<path:filename>', methods=['DELETE'])
@require_auth
def delete_public_asset(filename):
    """Delete a public asset (Platform Admin only)"""
    try:
        # Use g.roles directly (set by auth middleware) or fallback to current_user
        user_roles = getattr(g, 'roles', [])
        if not user_roles and hasattr(g, 'current_user'):
            user_roles = g.current_user.get('realm_access', {}).get('roles', [])
             
        if 'PlatformAdmin' not in user_roles:
            return jsonify({'error': 'Only Platform Admin can delete global assets'}), 403
            
        # Reconstruct key from URL param (which might be just filename or partial path)
        # We expect the client to send the full key or enough info.
        # Ideally, the client sends the 'key' field returned by list.
        # But here we capture <path:filename> so it handles slashes.
        
        # Security check: ensure it starts with public/
        if not filename.startswith(f"{PUBLIC_ASSETS_PREFIX}/"):
            # If the user sent just "model/foo.glb", prepend public/
            s3_key = f"{PUBLIC_ASSETS_PREFIX}/{filename}"
        else:
            s3_key = filename
            
        s3_client = get_assets_s3_client()
        if not s3_client:
             return jsonify({'error': 'Storage not configured'}), 503
             
        s3_client.delete_object(Bucket=ASSETS_BUCKET, Key=s3_key)
        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error deleting public asset: {e}")
        return jsonify({'error': str(e)}), 500



# Heartbeat / Connection Status Check
# =============================================================================

@app.route('/api/heartbeat/check', methods=['GET'])
@require_auth
def check_entity_heartbeat():
    """
    Check if an entity (sensor, robot, device) has connected and sent data.
    
    Query params:
      - entity_id: The device/sensor external ID or entity URN
      - entity_type: 'sensor', 'robot', or 'device'
    
    Returns:
      - connected: boolean indicating if data has been received
      - last_seen: ISO timestamp of last data received
      - first_seen: ISO timestamp of first data received
    """
    try:
        tenant_id = g.tenant
        if not tenant_id:
            return jsonify({'error': 'Tenant not found'}), 401
        
        entity_id = request.args.get('entity_id')
        entity_type = request.args.get('entity_type', 'sensor')
        
        if not entity_id:
            return jsonify({'error': 'entity_id is required'}), 400
        
        # Extract device_id from URN if provided
        device_id = entity_id
        if entity_id.startswith('urn:ngsi-ld:'):
            # Format: urn:ngsi-ld:Type:tenant:device_id
            parts = entity_id.split(':')
            if len(parts) >= 5:
                device_id = parts[-1]
        
        conn = None
        try:
            postgres_url = os.getenv('DATABASE_URL') or os.getenv('POSTGRES_URL')
            if not postgres_url:
                return jsonify({'error': 'Database not configured'}), 503
            
            conn = psycopg2.connect(postgres_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check telemetry_events table for any data from this device
            cur.execute("""
                SELECT 
                    MIN(observed_at) as first_seen,
                    MAX(observed_at) as last_seen,
                    COUNT(*) as event_count
                FROM telemetry_events
                WHERE tenant_id = %s 
                  AND (device_id = %s OR device_id LIKE %s)
                LIMIT 1
            """, (tenant_id, device_id, f'%{device_id}%'))
            
            row = cur.fetchone()
            cur.close()
            conn.close()
            
            if row and row['event_count'] and row['event_count'] > 0:
                return jsonify({
                    'connected': True,
                    'first_seen': row['first_seen'].isoformat() if row['first_seen'] else None,
                    'last_seen': row['last_seen'].isoformat() if row['last_seen'] else None,
                    'event_count': row['event_count']
                }), 200
            else:
                # No events found - check if we can query Orion-LD for entity status
                return jsonify({
                    'connected': False,
                    'first_seen': None,
                    'last_seen': None
                }), 200
                
        except Exception as db_error:
            logger.error(f"Database error checking heartbeat: {db_error}")
            if conn:
                conn.close()
            return jsonify({'connected': False}), 200
            
    except Exception as e:
        logger.error(f"Error checking heartbeat: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


# =============================================================================
# Module Federation Registry Endpoints
# =============================================================================

@app.route('/api/modules/me', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def get_tenant_modules():
    """
    Get active modules for the current tenant.
    Returns list of modules with remote entry URLs and federation configuration.
    """
    tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
    # Extract roles from multiple possible sources
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        # Try to extract from current_user payload (set by common.auth_middleware)
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    logger.info(f"[get_tenant_modules] tenant_id={tenant_id}, user_roles={user_roles}")
    
    try:
        with get_db_connection_with_tenant(tenant_id) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Query: Get enabled modules for tenant, filtered by user roles
            # Includes new columns route_path, label, is_local with fallback to metadata
            # PlatformAdmin can see all modules regardless of required_roles
            is_platform_admin = 'PlatformAdmin' in user_roles
            
            if is_platform_admin:
                # PlatformAdmin sees all installed modules
                query = """
                    SELECT DISTINCT
                        mm.id,
                        mm.name,
                        mm.display_name,
                        mm.remote_entry_url as "remoteEntry",
                        mm.scope,
                        mm.exposed_module as "module",
                        mm.version,
                        mm.icon_url,
                        mm.route_path,
                        mm.label,
                        mm.module_type,
                        COALESCE(mm.is_local, false) as is_local,
                        mm.metadata,
                        tim.is_enabled,
                        tim.configuration as tenant_config
                    FROM marketplace_modules mm
                    INNER JOIN tenant_installed_modules tim ON mm.id = tim.module_id
                    WHERE tim.tenant_id = %s
                        AND tim.is_enabled = true
                        AND mm.is_active = true
                    ORDER BY mm.display_name
                """
                cur.execute(query, (tenant_id,))
            else:
                # Regular users see modules filtered by required_roles
                query = """
                    SELECT DISTINCT
                        mm.id,
                        mm.name,
                        mm.display_name,
                        mm.remote_entry_url as "remoteEntry",
                        mm.scope,
                        mm.exposed_module as "module",
                        mm.version,
                        mm.icon_url,
                        mm.route_path,
                        mm.label,
                        mm.module_type,
                        COALESCE(mm.is_local, false) as is_local,
                        mm.metadata,
                        tim.is_enabled,
                        tim.configuration as tenant_config
                    FROM marketplace_modules mm
                    INNER JOIN tenant_installed_modules tim ON mm.id = tim.module_id
                    WHERE tim.tenant_id = %s
                        AND tim.is_enabled = true
                        AND mm.is_active = true
                        AND (
                            mm.required_roles IS NULL 
                            OR mm.required_roles = '{}'::text[]
                            OR mm.required_roles && %s::text[]
                        )
                    ORDER BY mm.display_name
                """
                cur.execute(query, (tenant_id, user_roles))
            rows = cur.fetchall()
            
            # Transform to expected format
            modules = []
            for row in rows:
                metadata = row.get('metadata') or {}
                tenant_config = row.get('tenant_config') or {}
                
                # Use explicit columns with fallback to metadata for backwards compatibility
                route_path = row.get('route_path') or metadata.get('routePath') or tenant_config.get('routePath') or f"/{row['name']}"
                label = row.get('label') or metadata.get('label') or row['display_name']
                icon = metadata.get('icon') or row.get('icon_url')
                
                module_data = {
                    'id': row['id'],
                    'name': row['name'],
                    'displayName': row['display_name'],
                    'isLocal': row.get('is_local', False),
                    'remoteEntry': row.get('remoteEntry') or None,
                    'scope': row.get('scope') or None,
                    'module': row.get('module') or None,
                    'version': row.get('version') or '1.0.0',
                    'routePath': route_path,
                    'label': label,
                    'icon': icon,
                    'moduleType': row.get('module_type', 'ADDON_FREE'),
                    'metadata': metadata,
                    'tenantConfig': tenant_config
                }
                
                # Add navigation items if present in metadata
                if 'navigationItems' in metadata:
                    module_data['navigationItems'] = metadata['navigationItems']
                
                modules.append(module_data)
            
            cur.close()
        
        logger.info(f"Returning {len(modules)} modules for tenant {tenant_id}")
        return jsonify(modules), 200
        
    except Exception as e:
        logger.error(f"Error fetching tenant modules: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/modules/<module_id>/toggle', methods=['POST'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def toggle_module(module_id):
    """
    Toggle module installation for current tenant.
    Only TenantAdmin and PlatformAdmin can manage modules.
    """
    tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Log user roles for debugging
    logger.info(f"[toggle_module] Initial check - tenant_id={tenant_id}, user_roles={user_roles}, has_PlatformAdmin={'PlatformAdmin' in user_roles}")
    
    # Check permissions
    if 'TenantAdmin' not in user_roles and 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. TenantAdmin or PlatformAdmin required.'}), 403
    
    try:
        data = request.json or {}
        is_enabled = data.get('enabled', True)
        username = getattr(g, 'user', None) or getattr(g, 'current_user', {}).get('preferred_username', 'unknown')
        
        with get_db_connection_with_tenant(tenant_id) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get module details with governance fields
            cur.execute("""
                SELECT id, name, display_name, module_type, required_plan_type, 
                       pricing_tier, is_active
                FROM marketplace_modules 
                WHERE id = %s
            """, (module_id,))
            module = cur.fetchone()
            
            if not module:
                cur.close()
                return jsonify({'error': 'Module not found'}), 404
            
            # Check if module is active
            if not module['is_active']:
                cur.close()
                return jsonify({'error': 'Module is not active in marketplace'}), 403
            
            # Validate tenant can install this module (if installing, not uninstalling)
            if is_enabled:
                # Get tenant plan_type
                limits = get_limits_for_tenant(tenant_id) or {}
                tenant_plan_type = limits.get('planType') or 'basic'
                
                # Fallback to PostgreSQL - check tenant plan
                cur.execute("SELECT plan_type FROM tenants WHERE tenant_id = %s", (tenant_id,))
                tenant_row = cur.fetchone()
                if tenant_row and tenant_row.get('plan_type'):
                    tenant_plan_type = tenant_row['plan_type']
                
                # CORE modules are always available
                # PlatformAdmin can install any module regardless of plan requirements
                is_platform_admin = 'PlatformAdmin' in user_roles
                logger.info(f"[toggle_module] module_id={module_id}, user_roles={user_roles}, is_platform_admin={is_platform_admin}, module_type={module['module_type']}, required_plan={module.get('required_plan_type')}, tenant_plan={tenant_plan_type}")
                
                if module['module_type'] != 'CORE' and not is_platform_admin:
                    # Check required_plan_type
                    required_plan = module.get('required_plan_type')
                    if required_plan:
                        plan_hierarchy = {'basic': 1, 'premium': 2, 'enterprise': 3}
                        tenant_level = plan_hierarchy.get(tenant_plan_type, 0)
                        required_level = plan_hierarchy.get(required_plan, 999)
                        
                        if tenant_level < required_level:
                            cur.close()
                            # Improved error message with actionable information
                            plan_names = {'basic': 'Básico', 'premium': 'Premium', 'enterprise': 'Enterprise'}
                            required_plan_display = plan_names.get(required_plan, required_plan)
                            current_plan_display = plan_names.get(tenant_plan_type, tenant_plan_type)
                            
                            return jsonify({
                                'error': f'Plan insuficiente para instalar este módulo',
                                'error_en': f'Insufficient plan to install this module',
                                'message': f'Este módulo requiere un plan {required_plan_display}, pero tu tenant tiene plan {current_plan_display}. Contacta con el administrador de la plataforma para actualizar tu plan.',
                                'message_en': f'This module requires a {required_plan_display} plan, but your tenant has a {current_plan_display} plan. Contact the platform administrator to upgrade your plan.',
                                'reason': f'Tu plan actual ({current_plan_display}) no cumple el requisito del módulo ({required_plan_display})',
                                'reason_en': f'Your current plan ({current_plan_display}) does not meet the module requirement ({required_plan_display})',
                                'required_plan': required_plan,
                                'current_plan': tenant_plan_type,
                                'action_required': 'upgrade_plan',
                                'help_text': 'Para instalar este módulo, necesitas actualizar tu plan. Si eres administrador de plataforma, deberías poder instalar módulos sin restricciones.',
                                'help_text_en': 'To install this module, you need to upgrade your plan. If you are a platform administrator, you should be able to install modules without restrictions.'
                            }), 403
            
            # Check if installation exists
            cur.execute("""
                SELECT id, is_enabled FROM tenant_installed_modules
                WHERE tenant_id = %s AND module_id = %s
            """, (tenant_id, module_id))
            installation = cur.fetchone()
            
            if installation:
                # Update existing installation
                cur.execute("""
                    UPDATE tenant_installed_modules
                    SET is_enabled = %s, updated_at = NOW()
                    WHERE tenant_id = %s AND module_id = %s
                    RETURNING id
                """, (is_enabled, tenant_id, module_id))
            else:
                # Create new installation
                cur.execute("""
                    INSERT INTO tenant_installed_modules (tenant_id, module_id, is_enabled, installed_by)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (tenant_id, module_id, is_enabled, username))
            
            conn.commit()
            cur.close()
        
        # Audit log
        if AUDIT_LOGGER_AVAILABLE:
            try:
                # Get tenant_plan_type if available (only set when enabling)
                plan_type = None
                if is_enabled:
                    try:
                        limits = get_limits_for_tenant(tenant_id) or {}
                        plan_type = limits.get('planType') or 'basic'
                    except:
                        pass
                
                log_module_toggle(
                    module_id=module_id,
                    enabled=is_enabled,
                    tenant_plan_type=plan_type,
                )
            except Exception as audit_err:
                logger.warning(f"Failed to log audit event: {audit_err}")
        
        action = 'enabled' if is_enabled else 'disabled'
        logger.info(f"Module {module_id} {action} for tenant {tenant_id} by {username}")
        
        return jsonify({
            'message': f'Module {action} successfully',
            'moduleId': module_id,
            'enabled': is_enabled
        }), 200
        
    except Exception as e:
        logger.error(f"Error toggling module: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/modules/marketplace', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def get_marketplace_modules():
    """
    Get all available modules from marketplace.
    PlatformAdmin can see all, others see only active modules.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    is_platform_admin = 'PlatformAdmin' in user_roles
    
    logger.info(f"[get_marketplace_modules] user_roles={user_roles}, is_platform_admin={is_platform_admin}")
    
    try:
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # PlatformAdmin sees all, others see only active
        if is_platform_admin:
            query = """
                SELECT id, name, display_name, description, version, author, 
                       category, icon_url, is_active, required_roles, metadata,
                       module_type, required_plan_type, pricing_tier, installation_restrictions,
                       created_at, updated_at
                FROM marketplace_modules
                ORDER BY display_name
            """
            cur.execute(query)
        else:
            query = """
                SELECT id, name, display_name, description, version, author,
                       category, icon_url, is_active, required_roles, metadata,
                       module_type, required_plan_type, pricing_tier
                FROM marketplace_modules
                WHERE is_active = true
                ORDER BY display_name
            """
            cur.execute(query)
        
        modules = cur.fetchall()
        cur.close()
        return_db_connection(conn)
        
        return jsonify([dict(m) for m in modules]), 200
        
    except Exception as e:
        logger.error(f"Error fetching marketplace modules: {e}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/modules/<module_id>/activate', methods=['POST'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def activate_marketplace_module(module_id):
    """
    Activate or deactivate a module in the marketplace.
    Only PlatformAdmin can activate/deactivate modules globally.
    This controls module visibility for all tenants.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        data = request.json or {}
        is_active = data.get('active', True)
        
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if module exists
        cur.execute("""
            SELECT id, name, display_name, is_active FROM marketplace_modules 
            WHERE id = %s
        """, (module_id,))
        module = cur.fetchone()
        
        if not module:
            cur.close()
            return_db_connection(conn)
            return jsonify({'error': 'Module not found'}), 404
        
        # Update is_active status
        cur.execute("""
            UPDATE marketplace_modules
            SET is_active = %s, updated_at = NOW()
            WHERE id = %s
            RETURNING id, name, display_name, is_active
        """, (is_active, module_id))
        
        updated_module = cur.fetchone()
        conn.commit()
        cur.close()
        return_db_connection(conn)
        
        action = 'activated' if is_active else 'deactivated'
        username = getattr(g, 'current_user', {}).get('preferred_username', 'unknown') if hasattr(g, 'current_user') else 'unknown'
        logger.info(f"Module {module_id} ({updated_module['display_name']}) {action} in marketplace by {username}")
        
        return jsonify({
            'message': f'Module {action} successfully',
            'moduleId': module_id,
            'active': is_active,
            'module': dict(updated_module)
        }), 200
        
    except Exception as e:
        logger.error(f"Error activating/deactivating marketplace module: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/modules/<module_id>/can-install', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def can_install_module(module_id):
    """
    Check if current tenant can install a module.
    Validates:
    1. Module exists and is active
    2. Tenant plan_type meets required_plan_type
    3. Module type restrictions (CORE always available, etc.)
    
    Returns: {can_install: bool, reason: str, module: {...}}
    """
    tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    try:
        # Get tenant plan_type from Orion-LD (source of truth for limits)
        limits = get_limits_for_tenant(tenant_id) or {}
        tenant_plan_type = limits.get('planType') or 'basic'  # Default to basic if not set
        
        # Get tenant plan_type from PostgreSQL as fallback
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT plan_type FROM tenants WHERE tenant_id = %s", (tenant_id,))
        tenant_row = cur.fetchone()
        if tenant_row and tenant_row.get('plan_type'):
            tenant_plan_type = tenant_row['plan_type']
        
        # Get module details
        cur.execute("""
            SELECT id, name, display_name, module_type, required_plan_type, 
                   pricing_tier, is_active, category
            FROM marketplace_modules
            WHERE id = %s
        """, (module_id,))
        module = cur.fetchone()
        cur.close()
        return_db_connection(conn)
        
        if not module:
            return jsonify({
                'can_install': False,
                'reason': 'Module not found',
                'module': None
            }), 404
        
        # Module is not active
        if not module['is_active']:
            return jsonify({
                'can_install': False,
                'reason': 'Module is not active in marketplace',
                'module': dict(module)
            }), 200
        
        # Get user roles for PlatformAdmin check
        user_roles = []
        if hasattr(g, 'current_user'):
            payload = g.current_user
            realm_access = payload.get('realm_access', {})
            user_roles = realm_access.get('roles', [])
        is_platform_admin = 'PlatformAdmin' in user_roles
        
        # CORE modules are always available
        # PlatformAdmin can install any module regardless of plan requirements
        if module['module_type'] == 'CORE' or is_platform_admin:
            return jsonify({
                'can_install': True,
                'reason': 'CORE module - always available' if module['module_type'] == 'CORE' else 'PlatformAdmin - can install any module',
                'module': dict(module),
                'tenant_plan': tenant_plan_type
            }), 200
        
        # Check required_plan_type
        required_plan = module.get('required_plan_type')
        if required_plan:
            # Plan hierarchy: basic < premium < enterprise
            plan_hierarchy = {'basic': 1, 'premium': 2, 'enterprise': 3}
            tenant_level = plan_hierarchy.get(tenant_plan_type, 0)
            required_level = plan_hierarchy.get(required_plan, 999)
            
            if tenant_level < required_level:
                plan_names = {'basic': 'Básico', 'premium': 'Premium', 'enterprise': 'Enterprise'}
                required_plan_display = plan_names.get(required_plan, required_plan)
                current_plan_display = plan_names.get(tenant_plan_type, tenant_plan_type)
                
                return jsonify({
                    'can_install': False,
                    'reason': f'El módulo requiere plan {required_plan_display}, el tenant tiene plan {current_plan_display}',
                    'reason_en': f'Module requires {required_plan_display} plan, tenant has {current_plan_display} plan',
                    'message': f'Para instalar este módulo necesitas actualizar tu plan de {current_plan_display} a {required_plan_display}. Contacta con el administrador de la plataforma.',
                    'message_en': f'To install this module you need to upgrade your plan from {current_plan_display} to {required_plan_display}. Contact the platform administrator.',
                    'module': dict(module),
                    'tenant_plan': tenant_plan_type,
                    'required_plan': required_plan,
                    'action_required': 'upgrade_plan'
                }), 200
        
        # All checks passed
        return jsonify({
            'can_install': True,
            'reason': 'Module can be installed',
            'module': dict(module),
            'tenant_plan': tenant_plan_type
        }), 200
        
    except Exception as e:
        logger.error(f"Error checking module installation eligibility: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


# =============================================================================
# Module Upload Endpoint
# =============================================================================

try:
    from module_upload_service import ModuleUploadService
    MODULE_UPLOAD_SERVICE_AVAILABLE = True
    # Import K8S namespace from module_upload_service
    from module_upload_service import K8S_NAMESPACE
except ImportError as e:
    logger.warning(f"ModuleUploadService not available: {e}")
    MODULE_UPLOAD_SERVICE_AVAILABLE = False
    K8S_NAMESPACE = os.getenv('K8S_NAMESPACE', 'nekazari')

@app.route('/api/modules/upload', methods=['POST'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def upload_module():
    """
    Upload a module ZIP file for validation and registration.
    
    Only PlatformAdmin can upload modules.
    
    Request:
        - Content-Type: multipart/form-data
        - Body: ZIP file with key 'file'
        
    Returns:
        {
            'upload_id': str,
            'status': 'pending',
            'message': str,
            'module_id': str,
            'version': str
        }
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    if not MODULE_UPLOAD_SERVICE_AVAILABLE:
        return jsonify({
            'error': 'Module upload service not available',
            'message': 'ModuleUploadService could not be initialized'
        }), 503
    
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided', 'message': 'ZIP file is required'}), 400
        
        file = request.files['file']
        
        # Check if file was selected
        if file.filename == '':
            return jsonify({'error': 'No file selected', 'message': 'Please select a ZIP file'}), 400
        
        # Validate file extension
        if not file.filename.lower().endswith('.zip'):
            return jsonify({
                'error': 'Invalid file type',
                'message': 'Only ZIP files are allowed'
            }), 400
        
        # Validate file size (max 50MB)
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({
                'error': 'File too large',
                'message': f'Maximum file size is {MAX_FILE_SIZE / (1024*1024):.0f}MB'
            }), 400
        
        # Initialize upload service
        try:
            upload_service = ModuleUploadService()
        except Exception as e:
            logger.error(f"Failed to initialize ModuleUploadService: {e}")
            return jsonify({
                'error': 'Service initialization failed',
                'message': 'Could not initialize upload service'
            }), 500
        
        # Generate unique upload ID
        upload_id = str(uuid.uuid4())
        
        # Get user info
        username = getattr(g, 'user', None) or getattr(g, 'current_user', {}).get('preferred_username', 'unknown')
        
        # Record upload in tracking table
        try:
            conn = get_db_connection_simple()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO module_uploads (upload_id, status, uploaded_by, metadata)
                VALUES (%s, 'pending', %s, %s::jsonb)
            """, (upload_id, username, json.dumps({'filename': file.filename, 'size': file_size})))
            conn.commit()
            cur.close()
            return_db_connection(conn)
        except Exception as e:
            logger.warning(f"Failed to record upload in tracking table: {e}")
            # Don't fail the upload if tracking fails
        
        # Read file into BytesIO
        file_content = BytesIO(file.read())
        
        # Extract and validate ZIP structure and manifest
        manifest_data, error, error_message = upload_service.extract_and_validate_zip(file_content)
        
        if error or not manifest_data:
            return jsonify({
                'error': 'Validation failed',
                'message': error_message or 'Unknown validation error'
            }), 400
        
        # Get module info from manifest
        module_id = manifest_data['id']
        module_version = manifest_data['version']
        
        # Check if module with same ID already exists
        conn = get_db_connection_simple()
        cur = conn.cursor()
        cur.execute("SELECT id FROM marketplace_modules WHERE id = %s", (module_id,))
        existing = cur.fetchone()
        cur.close()
        return_db_connection(conn)
        
        if existing:
            logger.info(f"Module {module_id} already exists, will be updated after validation")
        
        # Upload ZIP to MinIO
        try:
            file_content.seek(0)  # Reset file pointer
            minio_object_name = upload_service.upload_to_minio(file_content, upload_id)
            logger.info(f"Uploaded module ZIP to MinIO: {minio_object_name}")
        except Exception as e:
            logger.error(f"Failed to upload to MinIO: {e}")
            return jsonify({
                'error': 'Upload failed',
                'message': f'Failed to upload file to storage: {str(e)}'
            }), 500
        
        # Create validation job in Kubernetes
        try:
            job_created = upload_service.create_validation_job(upload_id, module_id, module_version)
            if not job_created:
                return jsonify({
                    'error': 'Validation job creation failed',
                    'message': 'Could not create validation job'
                }), 500
        except Exception as e:
            logger.error(f"Failed to create validation job: {e}")
            return jsonify({
                'error': 'Validation job creation failed',
                'message': f'Could not create validation job: {str(e)}'
            }), 500
        
        # Store upload metadata temporarily (could use Redis in the future)
        # For now, the validation job will call a webhook endpoint when complete
        
        logger.info(f"Module upload initiated: {module_id} v{module_version}, upload_id={upload_id}")
        
        return jsonify({
            'upload_id': upload_id,
            'status': 'pending',
            'message': 'Module uploaded successfully. Validation in progress.',
            'module_id': module_id,
            'version': module_version
        }), 200
        
    except Exception as e:
        logger.error(f"Error uploading module: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e),
            'details': 'See server logs for more information'
        }), 500


@app.route('/api/modules/<upload_id>/validation-status', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def get_validation_status(upload_id):
    """
    Get validation status for an uploaded module.
    
    Only PlatformAdmin can check status.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        if not MODULE_UPLOAD_SERVICE_AVAILABLE:
            return jsonify({
                'error': 'Module upload service not available'
            }), 503
        
        upload_service = ModuleUploadService()
        
        # Check Kubernetes job status
        job_name = f"module-validation-{upload_id[:8]}"
        try:
            from kubernetes.client.rest import ApiException
            job = upload_service.k8s_batch_api.read_namespaced_job(
                name=job_name,
                namespace=K8S_NAMESPACE
            )
            
            # Determine status from job conditions
            if job.status.succeeded:
                status = 'completed'
                message = 'Validation completed successfully'
            elif job.status.failed:
                status = 'failed'
                message = 'Validation failed. Check job logs for details.'
            elif job.status.active:
                status = 'running'
                message = 'Validation in progress...'
            else:
                status = 'pending'
                message = 'Validation job created, waiting to start...'
            
            return jsonify({
                'upload_id': upload_id,
                'status': status,
                'message': message,
                'job_name': job_name
            }), 200
            
        except Exception as e:
            # Check if it's a 404 ApiException
            error_str = str(e)
            if '404' in error_str or 'Not Found' in error_str:
                return jsonify({
                    'upload_id': upload_id,
                    'status': 'not_found',
                    'message': 'Validation job not found'
                }), 404
            else:
                logger.error(f"Error checking job status: {e}")
                raise
        
    except Exception as e:
        logger.error(f"Error checking validation status: {e}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/api/internal/modules/register-validated', methods=['POST'])
def register_validated_module():
    """
    Internal endpoint for validation jobs to register validated modules.
    
    Authenticated via INTERNAL_SERVICE_SECRET header (shared secret for internal services).
    """
    # Internal service authentication
    internal_secret = request.headers.get('X-Internal-Service-Secret')
    expected_secret = os.getenv('INTERNAL_SERVICE_SECRET', '')
    
    if not expected_secret or internal_secret != expected_secret:
        logger.warning(f"Invalid internal service secret from {request.remote_addr}")
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        upload_id = data.get('upload_id')
        manifest_data = data.get('manifest_data')
        
        if not upload_id or not manifest_data:
            return jsonify({
                'error': 'Missing required fields',
                'message': 'upload_id and manifest_data are required'
            }), 400
        
        if not MODULE_UPLOAD_SERVICE_AVAILABLE:
            return jsonify({
                'error': 'Module upload service not available'
            }), 503
        
        # Get database connection
        conn = get_db_connection_simple()
        
        try:
            upload_service = ModuleUploadService()
            success = upload_service.register_module_in_database(
                manifest_data,
                upload_id,
                conn
            )
            
            if success:
                module_id = manifest_data.get('id')
                logger.info(f"Module {module_id} registered successfully after validation")
                
                # Update tracking status to completed
                try:
                    upload_id = data.get('upload_id')
                    cur = conn.cursor()
                    cur.execute("""
                        UPDATE module_uploads 
                        SET status = 'completed', validated_at = NOW(), updated_at = NOW()
                        WHERE upload_id = %s
                    """, (upload_id,))
                    conn.commit()
                    cur.close()
                except Exception as e:
                    logger.warning(f"Failed to update upload tracking to completed: {e}")
                
                return jsonify({
                    'success': True,
                    'message': 'Module registered successfully',
                    'module_id': module_id
                }), 200
            else:
                return jsonify({
                    'error': 'Registration failed',
                    'message': 'Failed to register module in database'
                }), 500
                
        finally:
            return_db_connection(conn)
        
    except Exception as e:
        logger.error(f"Error in register_validated_module: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/api/modules/<module_id>/deploy', methods=['POST'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def deploy_module(module_id):
    """
    Deploy module assets to modules-server.
    
    Only PlatformAdmin can deploy modules.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    if not MODULE_UPLOAD_SERVICE_AVAILABLE:
        return jsonify({
            'error': 'Module upload service not available'
        }), 503
    
    try:
        data = request.json or {}
        upload_id = data.get('upload_id')
        
        if not upload_id:
            return jsonify({'error': 'upload_id is required'}), 400
        
        upload_service = ModuleUploadService()
        success, message = upload_service.deploy_module_assets_to_server(upload_id, module_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'module_id': module_id
            }), 200
        else:
            return jsonify({
                'error': 'Deployment failed',
                'message': message
            }), 500
        
    except Exception as e:
        logger.error(f"Error deploying module: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/api/modules/<upload_id>/logs', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def get_validation_logs(upload_id):
    """
    Get logs from validation job.
    
    Only PlatformAdmin can view logs.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        if not MODULE_UPLOAD_SERVICE_AVAILABLE:
            return jsonify({
                'error': 'Module upload service not available'
            }), 503
        
        upload_service = ModuleUploadService()
        
        # Find job and pod
        job_name = f"module-validation-{upload_id[:8]}"
        try:
            from kubernetes.client.rest import ApiException
            job = upload_service.k8s_batch_api.read_namespaced_job(
                name=job_name,
                namespace=K8S_NAMESPACE
            )
            
            # Get pods for this job
            pods = upload_service.k8s_core_api.list_namespaced_pod(
                namespace=K8S_NAMESPACE,
                label_selector=f"job-name={job_name}"
            )
            
            if not pods.items:
                return jsonify({
                    'upload_id': upload_id,
                    'job_name': job_name,
                    'logs': [],
                    'message': 'No pods found for validation job'
                }), 404
            
            # Get logs from first pod
            pod_name = pods.items[0].metadata.name
            logs = upload_service.k8s_core_api.read_namespaced_pod_log(
                name=pod_name,
                namespace=K8S_NAMESPACE,
                tail_lines=500  # Last 500 lines
            )
            
            return jsonify({
                'upload_id': upload_id,
                'job_name': job_name,
                'pod_name': pod_name,
                'logs': logs.split('\n') if logs else []
            }), 200
            
        except ApiException as e:
            if e.status == 404:
                return jsonify({
                    'upload_id': upload_id,
                    'error': 'Validation job not found'
                }), 404
            else:
                raise
        
    except Exception as e:
        logger.error(f"Error getting validation logs: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/api/modules/uploads', methods=['GET'])
@require_auth(require_hmac=False)  # Frontend endpoint, no HMAC required
def get_module_uploads():
    """
    Get list of module uploads with their status.
    
    Only PlatformAdmin can view uploads.
    """
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get uploads, optionally filtered by status
        status_filter = request.args.get('status')
        if status_filter:
            cur.execute("""
                SELECT upload_id, module_id, version, status, uploaded_by, 
                       uploaded_at, validated_at, error_message, metadata, updated_at
                FROM module_uploads
                WHERE status = %s
                ORDER BY uploaded_at DESC
                LIMIT 100
            """, (status_filter,))
        else:
            cur.execute("""
                SELECT upload_id, module_id, version, status, uploaded_by, 
                       uploaded_at, validated_at, error_message, metadata, updated_at
                FROM module_uploads
                ORDER BY uploaded_at DESC
                LIMIT 100
            """)
        
        uploads = cur.fetchall()
        cur.close()
        return_db_connection(conn)
        
        return jsonify([dict(upload) for upload in uploads]), 200
        
    except Exception as e:
        logger.error(f"Error fetching module uploads: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/api/admin/tenants/<tenant_id>/governance', methods=['GET'])
@require_auth
def get_tenant_governance(tenant_id):
    """
    Get tenant governance configuration (administrative fields).
    Only PlatformAdmin can view.
    """
    user_roles = g.roles or []
    
    # Check permissions
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get tenant governance data
        cur.execute("""
            SELECT tenant_id, tenant_name, plan_type, status, contract_end_date,
                   billing_email, notes, sales_contact, support_level,
                   created_at, updated_at, expires_at, email
            FROM tenants
            WHERE tenant_id = %s
        """, (tenant_id,))
        tenant = cur.fetchone()
        
        if not tenant:
            cur.close()
            return_db_connection(conn)
            return jsonify({'error': 'Tenant not found'}), 404
        
        # Get limits from Orion-LD
        limits = get_limits_for_tenant(tenant_id) or {}
        
        cur.close()
        return_db_connection(conn)
        
        return jsonify({
            'tenant_id': tenant['tenant_id'],
            'tenant_name': tenant['tenant_name'],
            'governance': {
                'plan_type': tenant['plan_type'],
                'contract_end_date': tenant['contract_end_date'].isoformat() if tenant['contract_end_date'] else None,
                'billing_email': tenant['billing_email'],
                'notes': tenant['notes'],
                'sales_contact': tenant['sales_contact'],
                'support_level': tenant['support_level'],
                'status': tenant['status'],
                'email': tenant['email'],
                'expires_at': tenant['expires_at'].isoformat() if tenant['expires_at'] else None,
            },
            'limits': {
                'maxUsers': int(limits.get('maxUsers') or 0) if limits.get('maxUsers') is not None else None,
                'maxRobots': int(limits.get('maxRobots') or 0) if limits.get('maxRobots') is not None else None,
                'maxSensors': int(limits.get('maxSensors') or 0) if limits.get('maxSensors') is not None else None,
                'maxAreaHectares': float(limits.get('maxAreaHectares') or 0.0) if limits.get('maxAreaHectares') is not None else None,
            },
            'plan_type': limits.get('planType') or tenant['plan_type']
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting tenant governance: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/admin/tenants/<tenant_id>/governance', methods=['PUT'])
@require_auth
def update_tenant_governance(tenant_id):
    """
    Update tenant governance configuration (administrative fields).
    Only PlatformAdmin can modify.
    
    Updates: plan_type, contract_end_date, billing_email, notes, sales_contact, support_level
    Note: Limits (max_users, max_robots, etc.) remain in Orion-LD and should be updated separately.
    """
    user_roles = g.roles or []
    
    # Check permissions
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    try:
        data = request.json or {}
        
        # Validate tenant exists
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT tenant_id, plan_type FROM tenants WHERE tenant_id = %s", (tenant_id,))
        tenant = cur.fetchone()
        
        if not tenant:
            cur.close()
            return_db_connection(conn)
            return jsonify({'error': 'Tenant not found'}), 404
        
        # Build update query dynamically
        updates = []
        values = []
        old_values = dict(tenant)
        
        # Allowed fields to update
        allowed_fields = {
            'plan_type': data.get('plan_type'),
            'contract_end_date': data.get('contract_end_date'),
            'billing_email': data.get('billing_email'),
            'notes': data.get('notes'),
            'sales_contact': data.get('sales_contact'),
            'support_level': data.get('support_level')
        }
        
        # Validate plan_type if provided
        if 'plan_type' in allowed_fields and allowed_fields['plan_type']:
            plan = allowed_fields['plan_type']
            if plan not in ('basic', 'premium', 'enterprise'):
                cur.close()
                return_db_connection(conn)
                return jsonify({'error': f'Invalid plan_type: {plan}. Must be basic, premium, or enterprise'}), 400
        
        # Validate support_level if provided
        if 'support_level' in allowed_fields and allowed_fields['support_level']:
            level = allowed_fields['support_level']
            if level not in ('standard', 'priority', 'enterprise'):
                cur.close()
                return_db_connection(conn)
                return jsonify({'error': f'Invalid support_level: {level}'}), 400
        
        # Build update statement
        for field, value in allowed_fields.items():
            if value is not None:
                updates.append(f"{field} = %s")
                values.append(value)
        
        if not updates:
            cur.close()
            return_db_connection(conn)
            return jsonify({'error': 'No fields to update'}), 400
        
        # Add updated_at
        updates.append("updated_at = NOW()")
        values.append(tenant_id)
        
        # Execute update
        query = f"UPDATE tenants SET {', '.join(updates)} WHERE tenant_id = %s RETURNING *"
        cur.execute(query, values)
        updated_tenant = cur.fetchone()
        
        # If plan_type changed, sync with Orion-LD
        if 'plan_type' in allowed_fields and allowed_fields['plan_type']:
            new_plan = allowed_fields['plan_type']
            if old_values.get('plan_type') != new_plan:
                limits_update = {'planType': new_plan}
                upsert_limits_in_orion(tenant_id, limits_update)
                # Invalidate cache
                _limits_cache.pop(tenant_id, None)
                _limits_cache_ts.pop(tenant_id, None)
        
        # Log audit trail
        try:
            cur.execute("""
                INSERT INTO tenant_governance_audit 
                (tenant_id, changed_by, change_type, old_values, new_values, notes)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                tenant_id,
                g.username,
                'governance_update',
                json.dumps(old_values),
                json.dumps(dict(updated_tenant)),
                data.get('audit_notes')
            ))
        except Exception as audit_err:
            logger.warning(f"Failed to write audit log: {audit_err}")
        
        conn.commit()
        cur.close()
        return_db_connection(conn)
        
        logger.info(f"Tenant {tenant_id} governance updated by {g.username}")
        
        return jsonify({
            'message': 'Tenant governance updated successfully',
            'tenant_id': tenant_id,
            'updated_fields': list(allowed_fields.keys()),
            'tenant': dict(updated_tenant)
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating tenant governance: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/api/tenants/me/limits', methods=['GET'])
@require_auth
def get_tenant_limits_with_usage():
    """
    Get tenant limits and current usage.
    Returns limits from Orion-LD (source of truth) and current consumption.
    """
    tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
    
    try:
        # Get limits from Orion-LD
        limits = get_limits_for_tenant(tenant_id) or {}
        
        # Get current usage
        usage = _gather_usage_for_tenant(tenant_id)
        
        # Get plan_type from PostgreSQL as fallback
        conn = get_db_connection_simple()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT plan_type FROM tenants WHERE tenant_id = %s", (tenant_id,))
        tenant_row = cur.fetchone()
        cur.close()
        return_db_connection(conn)
        
        plan_type = limits.get('planType') or (tenant_row['plan_type'] if tenant_row else 'basic')
        
        # Build response with limits and usage
        result = {
            'tenant_id': tenant_id,
            'plan_type': plan_type,
            'limits': {
                'maxUsers': int(limits.get('maxUsers') or 0) if limits.get('maxUsers') is not None else None,
                'maxRobots': int(limits.get('maxRobots') or 0) if limits.get('maxRobots') is not None else None,
                'maxSensors': int(limits.get('maxSensors') or 0) if limits.get('maxSensors') is not None else None,
                'maxAreaHectares': float(limits.get('maxAreaHectares') or 0.0) if limits.get('maxAreaHectares') is not None else None,
            },
            'usage': usage,
            'percentages': {}
        }
        
        # Calculate percentages
        max_robots = result['limits']['maxRobots'] or 0
        max_sensors = result['limits']['maxSensors'] or 0
        max_area = result['limits']['maxAreaHectares'] or 0.0
        
        if max_robots > 0:
            result['percentages']['robots'] = min(100.0, (usage.get('robots', 0) / max_robots) * 100)
        if max_sensors > 0:
            result['percentages']['sensors'] = min(100.0, (usage.get('sensors', 0) / max_sensors) * 100)
        if max_area > 0:
            result['percentages']['areaHectares'] = min(100.0, (usage.get('areaHectares', 0) / max_area) * 100)
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error getting tenant limits with usage: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


# =============================================================================
# Module Health Check Endpoints
# =============================================================================

@app.route('/api/modules/<module_id>/health', methods=['GET'])
@require_auth(require_hmac=False)
def module_health_check(module_id):
    """
    Health check endpoint for a specific module.
    Returns health status including database tables, endpoints, and dependencies.
    """
    if not MODULE_HEALTH_AVAILABLE:
        return jsonify({
            'module_id': module_id,
            'status': 'unknown',
            'error': 'Module health checks not available',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }), 503
    
    if not POSTGRES_URL:
        return jsonify({
            'module_id': module_id,
            'status': 'unhealthy',
            'error': 'Database not configured',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }), 503
    
    try:
        tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
        health_status = get_module_health(module_id, tenant_id, POSTGRES_URL)
        status_code = 200 if health_status['status'] == 'healthy' else 503
        return jsonify(health_status), status_code
    except Exception as e:
        logger.error(f"Error checking module health for {module_id}: {e}")
        return jsonify({
            'module_id': module_id,
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }), 500


# =============================================================================
# Admin Audit Logs Endpoint
# =============================================================================

@app.route('/api/admin/audit-logs', methods=['GET'])
@require_auth(require_hmac=False)
def get_audit_logs():
    """
    Get audit logs with filtering and pagination.
    Only accessible to PlatformAdmin.
    """
    tenant_id = getattr(g, 'tenant_id', None) or getattr(g, 'tenant', None)
    user_roles = getattr(g, 'roles', None) or getattr(g, 'user_roles', None) or []
    if not user_roles:
        payload = getattr(g, 'current_user', {}) or {}
        realm_access = payload.get('realm_access', {})
        user_roles = realm_access.get('roles', [])
    
    # Check permissions - only PlatformAdmin
    if 'PlatformAdmin' not in user_roles:
        return jsonify({'error': 'Insufficient permissions. PlatformAdmin required.'}), 403
    
    if not POSTGRES_URL:
        return jsonify({'error': 'Database not configured'}), 503
    
    # Parse query parameters
    filter_tenant = request.args.get('tenant_id')
    filter_module = request.args.get('module_id')
    filter_user = request.args.get('user_id')
    filter_action = request.args.get('action')
    filter_event_type = request.args.get('event_type')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    # Pagination
    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 50)), 500)  # Max 500 per page
    offset = (page - 1) * per_page
    
    try:
        with get_db_connection_with_tenant(tenant_id or filter_tenant or 'bootstrap') as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if sys_audit_logs table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public'
                    AND table_name = 'sys_audit_logs'
                )
            """)
            table_exists = cursor.fetchone()['exists']
            
            if not table_exists:
                # Table doesn't exist, return empty result
                logger.warning("sys_audit_logs table does not exist, returning empty audit logs")
                cursor.close()
                return jsonify({
                    'logs': [],
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total': 0,
                        'pages': 0,
                    },
                    'filters': {
                        'tenant_id': filter_tenant,
                        'module_id': filter_module,
                        'user_id': filter_user,
                        'action': filter_action,
                        'event_type': filter_event_type,
                        'date_from': date_from,
                        'date_to': date_to,
                    }
                }), 200
            
            # Build WHERE clause
            where_conditions = []
            params = []
            
            if filter_tenant:
                where_conditions.append("tenant_id = %s")
                params.append(filter_tenant)
            
            if filter_module:
                where_conditions.append("module_id = %s")
                params.append(filter_module)
            
            if filter_user:
                where_conditions.append("user_id = %s")
                params.append(filter_user)
            
            if filter_action:
                where_conditions.append("action = %s")
                params.append(filter_action)
            
            if filter_event_type:
                where_conditions.append("event_type = %s")
                params.append(filter_event_type)
            
            if date_from:
                where_conditions.append("created_at >= %s")
                params.append(date_from)
            
            if date_to:
                where_conditions.append("created_at <= %s")
                params.append(date_to)
            
            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            # Count total (for pagination)
            count_query = f"SELECT COUNT(*) as total FROM sys_audit_logs {where_clause}"
            cursor.execute(count_query, params)
            total = cursor.fetchone()['total']
            
            # Get logs
            query = f"""
                SELECT 
                    id, tenant_id, user_id, username, module_id,
                    event_type, action, resource_type, resource_id,
                    success, error, ip_address, user_agent,
                    metadata, created_at
                FROM sys_audit_logs
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([per_page, offset])
            cursor.execute(query, params)
            rows = cursor.fetchall()
            cursor.close()
        
        # Format results
        logs = []
        for row in rows:
            log = dict(row)
            log['createdAt'] = log['created_at'].isoformat() if log.get('created_at') else None
            log.pop('created_at', None)
            logs.append(log)
        
        return jsonify({
            'logs': logs,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page,
            },
            'filters': {
                'tenant_id': filter_tenant,
                'module_id': filter_module,
                'user_id': filter_user,
                'action': filter_action,
                'event_type': filter_event_type,
                'date_from': date_from,
                'date_to': date_to,
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to fetch audit logs', 'details': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = LOG_LEVEL == 'DEBUG'
    
    logger.info(f"Starting Entity Manager API on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)

