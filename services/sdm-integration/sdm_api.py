#!/usr/bin/env python3
# =============================================================================
# SDM Integration API - Production Service
# =============================================================================

import os
import sys
import json
import logging
import secrets
import hashlib
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import requests
from datetime import datetime
import pymongo
from pymongo import MongoClient

# Add common directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'common'))
from auth_middleware import require_auth, inject_fiware_headers, log_entity_operation, require_entity_ownership

# Configure logging to stdout for kubernetes
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

app = Flask(__name__)
CORS(app)

# Register Device Profiles blueprint
from device_profiles import device_profiles_bp
app.register_blueprint(device_profiles_bp)

# Configuration - All environment variables are REQUIRED for security
ORION_URL = os.getenv('ORION_URL')
if not ORION_URL:
    raise ValueError("ORION_URL environment variable is required")

MONGODB_URL = os.getenv('MONGODB_URL')
if not MONGODB_URL:
    raise ValueError("MONGODB_URL environment variable is required")

LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# IoT Agent Configuration for device provisioning
IOT_AGENT_URL = os.getenv('IOT_AGENT_URL', 'http://iot-agent-json-service:4041')
MQTT_HOST = os.getenv('MQTT_EXTERNAL_HOST', 'mqtt.robotika.cloud')  # External hostname for devices
MQTT_PORT = int(os.getenv('MQTT_EXTERNAL_PORT', '8883'))  # External TLS port
MQTT_INTERNAL_HOST = os.getenv('MQTT_HOST', 'mosquitto-service')

# Types that require IoT provisioning
# Types that require IoT provisioning
# Types that require IoT provisioning
IOT_ENTITY_TYPES = {'Device', 'AgriSensor', 'Sensor', 'Actuator', 'WeatherStation', 'AgriculturalTractor', 'LivestockAnimal', 'AgriculturalMachine'}

# Tenant Limits
MAX_SENSORS_PER_TENANT = int(os.getenv('MAX_SENSORS_PER_TENANT', '100'))
MAX_ROBOTS_PER_TENANT = int(os.getenv('MAX_ROBOTS_PER_TENANT', '5'))


# Set logging level
logging.getLogger().setLevel(getattr(logging, LOG_LEVEL))

def get_mongodb_connection():
    """Get MongoDB connection"""
    try:
        client = MongoClient(MONGODB_URL)
        return client
    except Exception as e:
        logger.error(f"MongoDB connection error: {e}")
        return None


def generate_iot_api_key(tenant_id: str, device_id: str) -> str:
    """Generate a unique API key for IoT device authentication"""
    # Create a unique key: nkz_iot_<random>
    random_part = secrets.token_hex(16)
    return f"nkz_iot_{random_part}"


def provision_iot_device(entity_id: str, entity_type: str, tenant_id: str, 
                         device_name: str, location: dict = None,
                         controlled_properties: list = None,
                         profile_id: str = None) -> dict:
    """
    Provision an IoT device in the IoT Agent.
    Returns provisioning result with MQTT credentials.
    
    Args:
        profile_id: Optional DeviceProfile ID to use for attribute mapping.
    """
    result = {
        'provisioned': False,
        'api_key': None,
        'mqtt': None,
        'error': None,
        'profile_used': None
    }
    
    try:
        # Generate unique API key for this device
        # Extract device_id from entity_id (e.g., urn:ngsi-ld:AgriSensor:sensor001 -> sensor001)
        device_id = entity_id.split(':')[-1] if ':' in entity_id else entity_id
        api_key = generate_iot_api_key(tenant_id, device_id)
        
        # Build IoT Agent device configuration
        # Topic pattern: /{api_key}/{device_id}/attrs for data
        attributes = []
        
        # Try to load attributes from DeviceProfile if profile_id is provided
        if profile_id:
            try:
                from device_profiles import get_profiles_collection
                from bson import ObjectId
                
                collection = get_profiles_collection()
                profile = collection.find_one({'_id': ObjectId(profile_id)})
                
                if profile and profile.get('mappings'):
                    result['profile_used'] = profile.get('name')
                    for mapping in profile.get('mappings', []):
                        attr = {
                            'object_id': mapping.get('incoming_key', '').lower().replace(' ', '_'),
                            'name': mapping.get('target_attribute'),
                            'type': mapping.get('type', 'Number')
                        }
                        # Add JEXL expression if transformation is defined
                        if mapping.get('transformation') and mapping['transformation'] != 'val':
                            # IoT Agent uses 'expression' field for JEXL
                            expr = mapping['transformation'].replace('val', '${@value}')
                            attr['expression'] = expr
                        attributes.append(attr)
                    logger.info(f"Loaded {len(attributes)} attributes from profile '{profile.get('name')}'")
            except Exception as e:
                logger.warning(f"Failed to load profile {profile_id}: {e}, using defaults")
        
        # If no profile or profile loading failed, use provided properties or defaults
        if not attributes:
            if controlled_properties:
                for prop in controlled_properties:
                    attr = {
                        'object_id': prop.lower().replace(' ', '_'),
                        'name': prop,
                        'type': 'Number'
                    }
                    attributes.append(attr)
            else:
                # Default attributes for sensors
                attributes = [
                    {'object_id': 'v', 'name': 'value', 'type': 'Number'},
                    {'object_id': 't', 'name': 'temperature', 'type': 'Number'},
                    {'object_id': 'h', 'name': 'humidity', 'type': 'Number'},
                    {'object_id': 'b', 'name': 'batteryLevel', 'type': 'Number'}
                ]
        
        device_config = {
            'devices': [{
                'device_id': device_id,
                'entity_name': entity_id,
                'entity_type': entity_type,
                'protocol': 'IoTA-JSON',
                'transport': 'MQTT',
                'apikey': api_key,
                'attributes': attributes,
                'lazy': [],
                'commands': [],
                'static_attributes': []
            }]
        }
        
        # Add location as static attribute if provided
        if location:
            device_config['devices'][0]['static_attributes'].append({
                'name': 'location',
                'type': 'GeoProperty',
                'value': location
            })
        
        # Register device in IoT Agent
        iot_headers = {
            'Content-Type': 'application/json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        logger.info(f"Provisioning device {device_id} in IoT Agent...")
        logger.debug(f"Device config: {json.dumps(device_config, indent=2)}")
        
        iot_response = requests.post(
            f'{IOT_AGENT_URL}/iot/devices',
            json=device_config,
            headers=iot_headers,
            timeout=10
        )
        
        if iot_response.status_code in [200, 201]:
            result['provisioned'] = True
            result['api_key'] = api_key
            result['mqtt'] = {
                'host': MQTT_HOST,
                'port': MQTT_PORT,
                'protocol': 'mqtts' if MQTT_PORT == 8883 else 'mqtt',
                'api_key': api_key,
                'device_id': device_id,
                'topics': {
                    'publish_data': f'/{api_key}/{device_id}/attrs',
                    'publish_data_json': f'/json/{api_key}/{device_id}/attrs',
                    'commands': f'/{api_key}/{device_id}/cmd'
                },
                'example_payload': {
                    'temperature': 22.5,
                    'humidity': 65,
                    'batteryLevel': 85
                },
                'warning': '⚠️ GUARDA ESTA INFORMACIÓN. La API Key no se puede recuperar después.'
            }
            logger.info(f"Successfully provisioned device {device_id}")
        else:
            result['error'] = f"IoT Agent error: {iot_response.status_code} - {iot_response.text[:200]}"
            logger.warning(f"Failed to provision device: {result['error']}")
            
    except requests.exceptions.Timeout:
        result['error'] = "IoT Agent timeout - device not provisioned"
        logger.error(result['error'])
    except requests.exceptions.ConnectionError:
        result['error'] = "Cannot connect to IoT Agent - device not provisioned"
        logger.error(result['error'])
    except Exception as e:
        result['error'] = f"Provisioning error: {str(e)}"
        logger.error(result['error'], exc_info=True)
    
    return result

def _check_tenant_limits(tenant_id: str, entity_type: str) -> bool:
    """Check if tenant has reached the limit for the given entity type"""
    limit = 0
    if entity_type in ['AgriSensor', 'Sensor', 'Device', 'WeatherStation', 'LivestockAnimal']:
        limit = MAX_SENSORS_PER_TENANT
    elif entity_type in ['AgriculturalRobot', 'AgriculturalTractor', 'AgriculturalMachine']:
        limit = MAX_ROBOTS_PER_TENANT
    else:
        # No specific limit for other types
        return True
    
    try:
        # Query Orion-LD count
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {
            'type': entity_type,
            'options': 'count',
            'limit': 1  # We only need the count header
        }
        headers = inject_fiware_headers({}, tenant_id)
        
        response = requests.get(orion_url, params=params, headers=headers, timeout=5)
        
        if response.status_code == 200:
            count = int(response.headers.get('NGSILD-Results-Count', 0))
            if count >= limit:
                logger.warning(f"Tenant {tenant_id} reached limit for {entity_type}: {count}/{limit}")
                return False
            return True
        elif response.status_code == 404:
            # First entity of this type
            return True
        else:
            logger.warning(f"Failed to check limits: {response.status_code}")
            return True # Fail open to avoid blocking reliable users on temporary errors
            
    except Exception as e:
        logger.error(f"Error checking tenant limits: {e}")
        return True

def get_sdm_entities():
    """Get available SDM entities"""
    return {
        "AgriculturalRobot": {
            "description": "A robot used in agricultural operations",
            "attributes": {
                "name": {"type": "Text", "description": "Robot name"},
                "status": {"type": "Text", "description": "Current status"},
                "location": {"type": "geo:json", "description": "Robot location"},
                "batteryLevel": {"type": "Number", "description": "Battery level percentage"},
                "currentTask": {"type": "Text", "description": "Current task being performed"}
            }
        },
        "AgriSensor": {
            "description": "Agricultural sensor device",
            "attributes": {
                "name": {"type": "Text", "description": "Sensor name"},
                "location": {"type": "geo:json", "description": "Sensor location"},
                "sensorType": {"type": "Text", "description": "Type of sensor"},
                "measurement": {"type": "Number", "description": "Current measurement value"},
                "unit": {"type": "Text", "description": "Measurement unit"}
            }
        },
        "AgriParcel": {
            "description": "Agricultural parcel or field",
            "attributes": {
                "name": {"type": "Text", "description": "Parcel name"},
                "location": {"type": "geo:json", "description": "Parcel boundaries"},
                "area": {"type": "Number", "description": "Parcel area"},
                "cropType": {"type": "Text", "description": "Type of crop"},
                "soilType": {"type": "Text", "description": "Type of soil"}
            }
        },
        "AgriOperation": {
            "description": "Agricultural operation or task",
            "attributes": {
                "name": {"type": "Text", "description": "Operation name"},
                "operationType": {"type": "Text", "description": "Type of operation"},
                "status": {"type": "Text", "description": "Operation status"},
                "startDate": {"type": "DateTime", "description": "Operation start date"},
                "endDate": {"type": "DateTime", "description": "Operation end date"},
                "location": {"type": "geo:json", "description": "Operation location"}
            }
        },
        "AgriculturalTractor": {
            "description": "Agricultural tractor or machinery",
            "attributes": {
                "name": {"type": "Text", "description": "Tractor/machine name"},
                "status": {"type": "Text", "description": "Current status"},
                "location": {"type": "geo:json", "description": "Machine location"},
                "operationType": {"type": "Text", "description": "Type of operation"},
                "manufacturer": {"type": "Text", "description": "Manufacturer name"},
                "model": {"type": "Text", "description": "Model name"},
                "serialNumber": {"type": "Text", "description": "Serial number"},
                "isobusCompatible": {"type": "Boolean", "description": "ISOBUS compatibility"}
            }
        },
        "LivestockAnimal": {
            "description": "Livestock animal with GPS tracking",
            "attributes": {
                "name": {"type": "Text", "description": "Animal name"},
                "species": {"type": "Text", "description": "Animal species"},
                "breed": {"type": "Text", "description": "Animal breed"},
                "location": {"type": "geo:json", "description": "Animal location"},
                "activity": {"type": "Text", "description": "Current activity"},
                "herdId": {"type": "Text", "description": "Herd identifier"},
                "birthDate": {"type": "DateTime", "description": "Birth date"},
                "weight": {"type": "Number", "description": "Animal weight"}
            }
        },
        "WeatherObserved": {
            "description": "Weather observation station",
            "attributes": {
                "name": {"type": "Text", "description": "Station name"},
                "location": {"type": "geo:json", "description": "Station location"},
                "temperature": {"type": "Number", "description": "Temperature"},
                "humidity": {"type": "Number", "description": "Humidity percentage"},
                "pressure": {"type": "Number", "description": "Atmospheric pressure"},
                "windSpeed": {"type": "Number", "description": "Wind speed"},
                "windDirection": {"type": "Number", "description": "Wind direction"},
                "precipitation": {"type": "Number", "description": "Precipitation"},
                "observedAt": {"type": "DateTime", "description": "Observation timestamp"}
            }
        },
        # === Additional Entity Types ===
        "Vineyard": {
            "description": "Vineyard agricultural area",
            "attributes": {
                "name": {"type": "Text", "description": "Vineyard name"},
                "location": {"type": "geo:json", "description": "Vineyard boundaries"},
                "area": {"type": "Number", "description": "Area in hectares"},
                "grapeVariety": {"type": "Text", "description": "Grape variety"}
            }
        },
        "OliveGrove": {
            "description": "Olive grove area",
            "attributes": {
                "name": {"type": "Text", "description": "Olive grove name"},
                "location": {"type": "geo:json", "description": "Grove boundaries"},
                "area": {"type": "Number", "description": "Area in hectares"},
                "treeCount": {"type": "Number", "description": "Number of trees"}
            }
        },
        "AgriCrop": {
            "description": "Agricultural crop",
            "attributes": {
                "name": {"type": "Text", "description": "Crop name"},
                "location": {"type": "geo:json", "description": "Crop location"},
                "cropType": {"type": "Text", "description": "Type of crop"},
                "plantingDate": {"type": "DateTime", "description": "Planting date"}
            }
        },
        "AgriTree": {
            "description": "Individual agricultural tree",
            "attributes": {
                "name": {"type": "Text", "description": "Tree identifier"},
                "location": {"type": "geo:json", "description": "Tree location"},
                "species": {"type": "Text", "description": "Tree species"}
            }
        },
        "OliveTree": {
            "description": "Individual olive tree",
            "attributes": {
                "name": {"type": "Text", "description": "Tree identifier"},
                "location": {"type": "geo:json", "description": "Tree location"},
                "age": {"type": "Number", "description": "Tree age in years"}
            }
        },
        "Vine": {
            "description": "Individual vine plant",
            "attributes": {
                "name": {"type": "Text", "description": "Vine identifier"},
                "location": {"type": "geo:json", "description": "Vine location"},
                "variety": {"type": "Text", "description": "Grape variety"}
            }
        },
        "FruitTree": {
            "description": "Fruit tree",
            "attributes": {
                "name": {"type": "Text", "description": "Tree identifier"},
                "location": {"type": "geo:json", "description": "Tree location"},
                "species": {"type": "Text", "description": "Fruit species"}
            }
        },
        "AgriBuilding": {
            "description": "Agricultural building or structure",
            "attributes": {
                "name": {"type": "Text", "description": "Building name"},
                "location": {"type": "geo:json", "description": "Building location"},
                "buildingType": {"type": "Text", "description": "Type of building"},
                "area": {"type": "Number", "description": "Floor area"}
            }
        },
        "WaterSource": {
            "description": "Water source for irrigation",
            "attributes": {
                "name": {"type": "Text", "description": "Source name"},
                "location": {"type": "geo:json", "description": "Source location"},
                "sourceType": {"type": "Text", "description": "Type of source"},
                "capacity": {"type": "Number", "description": "Capacity in liters"}
            }
        },
        "Well": {
            "description": "Water well",
            "attributes": {
                "name": {"type": "Text", "description": "Well name"},
                "location": {"type": "geo:json", "description": "Well location"},
                "depth": {"type": "Number", "description": "Well depth"},
                "flowRate": {"type": "Number", "description": "Flow rate L/min"}
            }
        },
        "IrrigationOutlet": {
            "description": "Irrigation outlet point",
            "attributes": {
                "name": {"type": "Text", "description": "Outlet identifier"},
                "location": {"type": "geo:json", "description": "Outlet location"},
                "outletType": {"type": "Text", "description": "Type of outlet"}
            }
        },
        "Spring": {
            "description": "Natural water spring",
            "attributes": {
                "name": {"type": "Text", "description": "Spring name"},
                "location": {"type": "geo:json", "description": "Spring location"},
                "flowRate": {"type": "Number", "description": "Flow rate L/min"}
            }
        },
        "Pond": {
            "description": "Water pond or reservoir",
            "attributes": {
                "name": {"type": "Text", "description": "Pond name"},
                "location": {"type": "geo:json", "description": "Pond boundaries"},
                "capacity": {"type": "Number", "description": "Capacity in m³"}
            }
        },
        "IrrigationSystem": {
            "description": "Irrigation system",
            "attributes": {
                "name": {"type": "Text", "description": "System name"},
                "location": {"type": "geo:json", "description": "System coverage"},
                "systemType": {"type": "Text", "description": "Type of system"}
            }
        },
        "PhotovoltaicInstallation": {
            "description": "Photovoltaic solar installation",
            "attributes": {
                "name": {"type": "Text", "description": "Installation name"},
                "location": {"type": "geo:json", "description": "Installation location"},
                "capacity": {"type": "Number", "description": "Capacity in kW"},
                "panelCount": {"type": "Number", "description": "Number of panels"}
            }
        },
        "EnergyStorageSystem": {
            "description": "Energy storage system (battery)",
            "attributes": {
                "name": {"type": "Text", "description": "System name"},
                "location": {"type": "geo:json", "description": "System location"},
                "capacity": {"type": "Number", "description": "Capacity in kWh"},
                "technology": {"type": "Text", "description": "Battery technology"}
            }
        },
        "Device": {
            "description": "Generic IoT device",
            "attributes": {
                "name": {"type": "Text", "description": "Device name"},
                "location": {"type": "geo:json", "description": "Device location"},
                "deviceType": {"type": "Text", "description": "Type of device"}
            }
        },
        "LivestockGroup": {
            "description": "Group of livestock animals",
            "attributes": {
                "name": {"type": "Text", "description": "Group name"},
                "location": {"type": "geo:json", "description": "Group location"},
                "species": {"type": "Text", "description": "Animal species"},
                "count": {"type": "Number", "description": "Number of animals"}
            }
        },
        "LivestockFarm": {
            "description": "Livestock farm",
            "attributes": {
                "name": {"type": "Text", "description": "Farm name"},
                "location": {"type": "geo:json", "description": "Farm boundaries"},
                "farmType": {"type": "Text", "description": "Type of farm"}
            }
        },
        "AgriculturalImplement": {
            "description": "Agricultural implement or attachment",
            "attributes": {
                "name": {"type": "Text", "description": "Implement name"},
                "location": {"type": "geo:json", "description": "Implement location"},
                "implementType": {"type": "Text", "description": "Type of implement"}
            }
        }
    }

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'sdm-integration'
    })

@app.route('/sdm/entities', methods=['GET'])
@require_auth
def list_sdm_entities():
    """List available SDM entity types"""
    try:
        entities = get_sdm_entities()
        return jsonify({
            'entities': entities,
            'count': len(entities),
            'tenant': g.tenant
        })
    except Exception as e:
        logger.error(f"Error listing SDM entities: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_type>', methods=['GET'])
@require_auth
def get_sdm_entity_schema(entity_type):
    """Get SDM entity schema"""
    try:
        entities = get_sdm_entities()
        if entity_type not in entities:
           return jsonify({'error': 'Entity type not found'}), 404
        
        return jsonify({
            'entityType': entity_type,
            'schema': entities[entity_type],
            'tenant': g.tenant
        })
    except Exception as e:
        logger.error(f"Error getting SDM entity schema: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_type>/instances', methods=['GET'])
@require_auth
def list_entity_instances(entity_type):
    """List instances of a specific entity type"""
    try:
        # Query Orion-LD for entities of this type
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {
            'type': entity_type,
            'options': 'count'
        }
        
        # Add pagination support
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int)
        
        if limit is not None:
            params['limit'] = limit
        if offset is not None:
            params['offset'] = offset
        
        headers = {
            'Accept': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.get(orion_url, params=params, headers=headers, timeout=10)
        
        # Handle tenant not found (404) - return empty list instead of error
        if response.status_code == 404:
            logger.info(f"Tenant {g.tenant} not found in Orion-LD for {entity_type}, returning empty list")
            return jsonify({
                'entityType': entity_type,
                'instances': [],
                'count': 0,
                'tenant': g.tenant
            }), 200
        
        if response.status_code != 200:
            logger.error(f"Failed to query Orion for {entity_type}: {response.status_code} - {response.text}")
            return jsonify({'error': 'Failed to query Orion'}), 500
            
        # Get total count from header
        total_count = int(response.headers.get('NGSILD-Results-Count', 0))
        
        # Get actual entities
        params.pop('options')
        response = requests.get(orion_url, params=params, headers=headers, timeout=10)
        
        # Handle tenant not found (404) - return empty list instead of error
        if response.status_code == 404:
            logger.info(f"Tenant {g.tenant} not found in Orion-LD for {entity_type}, returning empty list")
            return jsonify({
                'entityType': entity_type,
                'instances': [],
                'count': 0,
                'tenant': g.tenant
            }), 200
        
        if response.status_code != 200:
            logger.error(f"Failed to get entities from Orion for {entity_type}: {response.status_code} - {response.text}")
            return jsonify({'error': 'Failed to get entities from Orion'}), 500
        
        entities = response.json()
        
        # Ensure entities is a list (Orion-LD may return a single object or a list)
        if not isinstance(entities, list):
            entities = [entities] if entities else []
        
        # Log the operation
        log_entity_operation('list', None, entity_type, g.tenant, g.farmer_id, 
                           {'count': len(entities)})
        
        return jsonify({
            'entityType': entity_type,
            'instances': entities,
            'count': len(entities),
            'total': total_count,
            'tenant': g.tenant
        })
    
    except requests.exceptions.Timeout:
        logger.error(f"Timeout querying Orion-LD for {entity_type}")
        return jsonify({'error': 'Timeout querying Orion-LD'}), 500
    except Exception as e:
        logger.error(f"Error listing entity instances for {entity_type}: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/sdm/schemas/<entity_type>', methods=['GET'])
@require_auth
def get_entity_schema(entity_type):
    """Get SDM schema for entity type (Mock for now to unblock frontend)"""
    try:
        # Basic schema structure expected by DynamicForm
        schema = {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "title": "Name",
                    "description": f"Name of the {entity_type}"
                },
                "description": {
                    "type": "string",
                    "title": "Description",
                    "description": "Additional details"
                }
            },
            "required": ["name"]
        }
        
        # Add specific fields based on type
        if entity_type in ['Vineyard', 'OliveGrove']:
             schema['properties']['variety'] = {
                 "type": "string",
                 "title": "Variety", 
                 "description": "Variety of the crop"
             }
        
        return jsonify(schema)
    except Exception as e:
        logger.error(f"Error serving schema: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_type>/instances', methods=['POST'])
@require_auth
def create_entity_instance(entity_type):
    """Create a new entity instance using SDM"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate entity type against allowed schemas if necessary, or just rely on Orion
        # if entity_type not in ALLOWED_ENTITY_TYPES: # If we had such a list
        #    return jsonify({'error': 'Entity type not found'}), 404
            
        # Check tenant limits
        if not _check_tenant_limits(g.tenant, entity_type):
            return jsonify({
                'error': f'Tenant limit reached for {entity_type}. Please upgrade your plan.'
            }), 403
        
        # Add type and ID to entity
        entity_id = data.get('id', f"urn:ngsi-ld:{entity_type}:{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")
        
        # Ensure proper URN format
        if not entity_id.startswith('urn:ngsi-ld:'):
            entity_id = f"urn:ngsi-ld:{entity_type}:{entity_id}"
        
        # Build NGSI-LD compliant entity with @context
        entity_data = {
            '@context': [
                'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
                'https://raw.githubusercontent.com/smart-data-models/dataModel.Agrifood/master/context.jsonld'
            ],
            'id': entity_id,
            'type': entity_type
        }
        
        # Add properties from data (convert to NGSI-LD Property format)
        for key, value in data.items():
            if key in ['id', 'type', '@context']:
                continue
            if isinstance(value, dict) and 'type' in value:
                # Already in NGSI-LD format
                entity_data[key] = value
            else:
                # Convert to NGSI-LD Property format
                entity_data[key] = {
                    'type': 'Property',
                    'value': value
                }
        
        # Send to Orion-LD
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        headers = {
            'Content-Type': 'application/ld+json'
        }
        headers = inject_fiware_headers(headers, g.tenant)
        
        logger.info(f"Creating entity {entity_id} of type {entity_type} for tenant {g.tenant}")
        logger.debug(f"Entity data: {entity_data}")
        logger.debug(f"Orion URL: {orion_url}")
        
        response = requests.post(orion_url, json=entity_data, headers=headers)
        logger.info(f"Orion response status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            # Log the operation
            log_entity_operation('create', entity_id, entity_type, g.tenant, g.farmer_id, 
                               {'attributes': list(entity_data.keys())})
            
            # Build response
            response_data = {
                'message': 'Entity created successfully',
                'entity': entity_data,
                'entity_id': entity_id,
                'tenant': g.tenant
            }
            
            # =================================================================
            # IoT PROVISIONING: For Device/Sensor types, provision in IoT Agent
            # =================================================================
            if entity_type in IOT_ENTITY_TYPES:
                logger.info(f"Entity type {entity_type} requires IoT provisioning")
                
                # Extract location if present
                location = None
                if 'location' in data:
                    loc = data['location']
                    if isinstance(loc, dict) and 'coordinates' in loc:
                        location = loc
                    elif isinstance(loc, dict) and 'value' in loc:
                        location = loc['value']
                
                # Extract controlled properties if present
                controlled_props = None
                if 'controlledProperty' in data:
                    cp = data['controlledProperty']
                    if isinstance(cp, list):
                        controlled_props = cp
                    elif isinstance(cp, dict) and 'value' in cp:
                        controlled_props = cp['value'] if isinstance(cp['value'], list) else [cp['value']]
                
                # Get device name
                device_name = data.get('name', entity_id)
                if isinstance(device_name, dict):
                    device_name = device_name.get('value', entity_id)
                
                # Extract Profile ID if present
                profile_id = None
                if 'refDeviceProfile' in data:
                    ref = data['refDeviceProfile']
                    if isinstance(ref, dict) and 'object' in ref:
                         # Extract ID from URN: urn:ngsi-ld:DeviceProfile:123 -> 123
                         ref_obj = ref['object']
                         if ':' in ref_obj:
                             profile_id = ref_obj.split(':')[-1]
                         else:
                             profile_id = ref_obj

                # Provision in IoT Agent
                iot_result = provision_iot_device(
                    entity_id=entity_id,
                    entity_type=entity_type,
                    tenant_id=g.tenant,
                    device_name=device_name,
                    location=location,
                    controlled_properties=controlled_props,
                    profile_id=profile_id
                )
                
                # Add IoT provisioning result to response
                response_data['iot_provisioning'] = {
                    'provisioned': iot_result['provisioned'],
                    'status': 'ready' if iot_result['provisioned'] else 'failed'
                }
                
                if iot_result['provisioned']:
                    # Include MQTT credentials (shown ONLY ONCE)
                    response_data['mqtt_credentials'] = iot_result['mqtt']
                    response_data['message'] = 'Entity created and IoT device provisioned successfully'
                    response_data['mqtt_credentials'] = iot_result['mqtt']
                    # Also include credentials at the top level for easier access in Success Modal
                    response_data['api_key'] = iot_result['api_key']
                    response_data['mqtt_topics'] = iot_result['mqtt']['topics'] if iot_result['mqtt'] else None
                    response_data['message'] = 'Entity created and IoT device provisioned successfully'
                    logger.info(f"IoT provisioning successful for {entity_id}")
                else:
                    response_data['iot_provisioning']['error'] = iot_result['error']
                    response_data['message'] = 'Entity created but IoT provisioning failed'
                    logger.warning(f"IoT provisioning failed for {entity_id}: {iot_result['error']}")
            
            return jsonify(response_data), 201
        else:
            logger.error(f"Orion error: {response.status_code} - {response.text}")
            return jsonify({
                'error': 'Failed to create entity in Orion',
                'orion_status': response.status_code,
                'orion_response': response.text[:500] if response.text else None
            }), 500
    
    except Exception as e:
        logger.error(f"Error creating entity instance: {e}", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/sdm/entities/<entity_type>/instances/<entity_id>', methods=['GET'])
@require_auth
@require_entity_ownership
def get_sdm_entity_instance(entity_type, entity_id):
    """Get specific SDM entity instance"""
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
        logger.error(f"Error getting SDM entity instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_type>/instances/<entity_id>', methods=['PATCH'])
@require_auth
@require_entity_ownership
def update_sdm_entity_instance(entity_type, entity_id):
    """Update specific SDM entity instance attributes"""
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
                'message': 'SDM entity updated successfully',
                'entity_id': entity_id,
                'updated_attributes': list(data.keys()),
                'tenant': g.tenant
            })
        elif response.status_code == 404:
            return jsonify({'error': 'Entity not found'}), 404
        else:
            return jsonify({'error': 'Failed to update entity in Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error updating SDM entity instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_type>/instances/<entity_id>', methods=['DELETE'])
@require_auth
@require_entity_ownership
def delete_sdm_entity_instance(entity_type, entity_id):
    """Delete specific SDM entity instance"""
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        headers = {}
        headers = inject_fiware_headers(headers, g.tenant)
        
        response = requests.delete(orion_url, headers=headers)
        if response.status_code in [200, 204]:
            # Log the operation
            log_entity_operation('delete', entity_id, entity_type, g.tenant, g.farmer_id)
            
            return jsonify({
                'message': 'SDM entity deleted successfully',
                'entity_id': entity_id,
                'tenant': g.tenant
            })
        elif response.status_code == 404:
            return jsonify({'error': 'Entity not found'}), 404
        else:
            return jsonify({'error': 'Failed to delete entity from Orion'}), 500
    
    except Exception as e:
        logger.error(f"Error deleting SDM entity instance: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/migrate', methods=['POST'])
@require_auth
def migrate_to_sdm():
    """Migrate existing entities to SDM format"""
    try:
        data = request.get_json()
        entity_ids = data.get('entityIds', [])
        
        if not entity_ids:
            return jsonify({'error': 'No entity IDs provided'}), 400
        
        migrated = []
        errors = []
        
        for entity_id in entity_ids:
            try:
                # Get entity from Orion-LD
                orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
                headers = {
                    'Accept': 'application/ld+json'
                }
                headers = inject_fiware_headers(headers, g.tenant)
                
                response = requests.get(orion_url, headers=headers)
                
                if response.status_code == 200:
                    entity = response.json()
                    
                    # Update entity with SDM format
                    entity['dateModified'] = datetime.utcnow().isoformat()
                    
                    # Send updated entity back to Orion-LD
                    update_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}/attrs"
                    headers = {
                        'Content-Type': 'application/ld+json'
                    }
                    headers = inject_fiware_headers(headers, g.tenant)
                    
                    update_response = requests.patch(update_url, json=entity, headers=headers)
                    if update_response.status_code in [200, 204]:
                        migrated.append(entity_id)
                        # Log the operation
                        log_entity_operation('migrate', entity_id, entity.get('type', 'unknown'), 
                                           g.tenant, g.farmer_id)
                    else:
                        errors.append(f"Failed to update {entity_id}")
                else:
                    errors.append(f"Entity {entity_id} not found")
            
            except Exception as e:
                errors.append(f"Error migrating {entity_id}: {str(e)}")
        
        return jsonify({
            'migrated': migrated,
            'errors': errors,
            'total': len(entity_ids),
            'success': len(migrated),
            'tenant': g.tenant
        })
    
    except Exception as e:
        logger.error(f"Error in migration: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/version', methods=['GET'])
def version():
    """Get service version"""
    return jsonify({
        'service': 'sdm-integration',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = LOG_LEVEL == 'DEBUG'
    
    logger.info(f"Starting SDM Integration API on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)


@app.route('/sdm/entities/<entity_id>/iot/regenerate-key', methods=['POST'])
@require_auth
@require_entity_ownership
def regenerate_iot_key(entity_id):
    """Regenerate IoT Agent API Key for a device"""
    try:
        # Get entity type from Orion to confirm it's an IoT device
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        headers = inject_fiware_headers({'Accept': 'application/ld+json'}, g.tenant)
        response = requests.get(orion_url, headers=headers)
        
        if response.status_code != 200:
            return jsonify({'error': 'Entity not found'}), 404
            
        entity = response.json()
        entity_type = entity['type']
        
        if entity_type not in IOT_ENTITY_TYPES:
             return jsonify({'error': f'Entity type {entity_type} does not support IoT provisioning'}), 400
             
        # Extract name for device naming consistency
        device_name = entity_id.split(':')[-1]
        if 'name' in entity:
             val = entity['name']
             device_name = val['value'] if isinstance(val, dict) and 'value' in val else val
             
        # Re-provision (this generates a new key)
        result = provision_iot_device(
            entity_id=entity_id,
            entity_type=entity_type,
            tenant_id=g.tenant,
            device_name=device_name
        )
        
        if result['provisioned']:
            return jsonify({
                'message': 'API Key regenerated successfully',
                'api_key': result['api_key'],
                'mqtt': result['mqtt']
            })
        else:
            return jsonify({'error': result['error']}), 500
            
    except Exception as e:
        logger.error(f"Error regenerating key for {entity_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/sdm/entities/<entity_id>/iot/details', methods=['GET'])
@require_auth
@require_entity_ownership
def get_iot_details(entity_id):
    """Get IoT connection details (excluding sensitive key)"""
    try:
        # Generate the topic structure deterministically based on ID
        # Note: We can't show the full topic because we don't know the API Key 
        # (it's hashed in IoTA). We show a placeholder.
        
        device_id = entity_id.split(':')[-1]
        
        return jsonify({
            'mqtt_host': MQTT_HOST,
            'mqtt_port': MQTT_PORT,
            'protocol': 'mqtts' if MQTT_PORT == 8883 else 'mqtt',
            'device_id': device_id,
            'topics': {
                'publish_data': f'/<API_KEY>/{device_id}/attrs',
                'commands': f'/<API_KEY>/{device_id}/cmd'
            },
            'note': 'API Key is hidden. Regenerate if lost.'
        })
    except Exception as e:
        logger.error(f"Error getting IoT details for {entity_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500
