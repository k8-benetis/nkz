#!/usr/bin/env python3
# =============================================================================
# Device Profiles Module - IoT Data Mapping Management
# =============================================================================
"""
Manages DeviceProfile entities for dynamic IoT data mapping.
Supports multi-tenant profiles (global/private) with JEXL transformations.
"""

import os
import re
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from pymongo import MongoClient
from pymongo.collection import Collection

logger = logging.getLogger(__name__)

# Blueprint for device profiles routes
device_profiles_bp = Blueprint('device_profiles', __name__, url_prefix='/sdm/profiles')

# MongoDB connection (reuse from main app or create new)
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://mongodb-service:27017')

_mongo_client = None
_profiles_collection = None


def get_profiles_collection() -> Collection:
    """Get MongoDB collection for device profiles."""
    global _mongo_client, _profiles_collection
    if _profiles_collection is None:
        _mongo_client = MongoClient(MONGODB_URL)
        db = _mongo_client.nekazari
        _profiles_collection = db.device_profiles
        # Create indexes
        _profiles_collection.create_index([('tenant_id', 1), ('is_public', 1)])
        _profiles_collection.create_index('sdm_entity_type')
    return _profiles_collection


# =============================================================================
# JEXL Validation
# =============================================================================

# Allowed JEXL patterns (simple expressions only)
JEXL_ALLOWED_PATTERNS = [
    r'^val$',                          # Just the value
    r'^val\s*[\+\-\*\/]\s*[\d\.]+$',   # val +/-/*// number
    r'^[\d\.]+\s*[\+\-\*\/]\s*val$',   # number +/-/*// val
    r'^val\s*[\+\-\*\/]\s*[\d\.]+\s*[\+\-\*\/]\s*[\d\.]+$',  # val op num op num
    r'^val\s*>\s*[\d\.]+\s*\?\s*[\d\.]+\s*:\s*val$',  # val > n ? n : val (clamp)
    r'^val\s*<\s*[\d\.]+\s*\?\s*[\d\.]+\s*:\s*val$',  # val < n ? n : val (clamp)
]


def validate_jexl_expression(expr: str) -> tuple[bool, str]:
    """
    Validate a JEXL expression for safety.
    Returns (is_valid, error_message).
    """
    if not expr or expr.strip() == '':
        return True, ''
    
    expr = expr.strip()
    
    # Check for dangerous patterns
    dangerous_patterns = ['import', 'require', 'eval', 'exec', 'function', 
                         'process', 'global', '__', 'constructor']
    for pattern in dangerous_patterns:
        if pattern in expr.lower():
            return False, f"Expresión no permitida: contiene '{pattern}'"
    
    # Check against allowed patterns
    for pattern in JEXL_ALLOWED_PATTERNS:
        if re.match(pattern, expr):
            return True, ''
    
    return False, f"Expresión JEXL no válida. Usa patrones simples como 'val', 'val * 0.1', 'val + 273'"


def validate_mapping(mapping: dict, sdm_attributes: dict) -> tuple[bool, str]:
    """Validate a single mapping entry."""
    required_fields = ['incoming_key', 'target_attribute']
    for field in required_fields:
        if field not in mapping:
            return False, f"Campo requerido: {field}"
    
    # Validate target_attribute against SDM schema
    target = mapping.get('target_attribute')
    if target not in sdm_attributes:
        valid_attrs = ', '.join(sdm_attributes.keys())
        return False, f"Atributo '{target}' no válido para este tipo SDM. Válidos: {valid_attrs}"
    
    # Validate transformation if present
    if 'transformation' in mapping:
        is_valid, error = validate_jexl_expression(mapping['transformation'])
        if not is_valid:
            return False, error
    
    return True, ''


# =============================================================================
# CRUD Endpoints
# =============================================================================

@device_profiles_bp.route('', methods=['GET'])
def list_profiles():
    """
    List device profiles.
    Returns global profiles + tenant-specific profiles.
    Query params:
    - sdm_entity_type: filter by SDM type
    - include_global: include global profiles (default: true)
    """
    try:
        tenant_id = getattr(g, 'tenant', None)
        sdm_type = request.args.get('sdm_entity_type')
        include_global = request.args.get('include_global', 'true').lower() == 'true'
        
        collection = get_profiles_collection()
        
        # Build query: global OR tenant-specific
        query = {'$or': []}
        if include_global:
            query['$or'].append({'is_public': True})
        if tenant_id:
            query['$or'].append({'tenant_id': tenant_id})
        
        if not query['$or']:
            query = {'is_public': True}  # Fallback
        
        if sdm_type:
            query['sdm_entity_type'] = sdm_type
        
        profiles = list(collection.find(query).sort('name', 1))
        
        # Convert ObjectId to string and format response
        result = []
        for p in profiles:
            result.append({
                'id': str(p.get('_id')),
                'name': p.get('name'),
                'description': p.get('description'),
                'sdm_entity_type': p.get('sdm_entity_type'),
                'is_public': p.get('is_public', False),
                'tenant_id': p.get('tenant_id'),
                'mappings': p.get('mappings', []),
                'created_at': p.get('created_at'),
                'updated_at': p.get('updated_at')
            })
        
        return jsonify({
            'profiles': result,
            'count': len(result)
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing profiles: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@device_profiles_bp.route('/<profile_id>', methods=['GET'])
def get_profile(profile_id: str):
    """Get a specific device profile."""
    try:
        collection = get_profiles_collection()
        
        try:
            profile = collection.find_one({'_id': ObjectId(profile_id)})
        except Exception:
            return jsonify({'error': 'ID de perfil inválido'}), 400
        
        if not profile:
            return jsonify({'error': 'Perfil no encontrado'}), 404
        
        # Check access
        tenant_id = getattr(g, 'tenant', None)
        if not profile.get('is_public') and profile.get('tenant_id') != tenant_id:
            return jsonify({'error': 'Acceso denegado'}), 403
        
        return jsonify({
            'id': str(profile.get('_id')),
            'name': profile.get('name'),
            'description': profile.get('description'),
            'sdm_entity_type': profile.get('sdm_entity_type'),
            'is_public': profile.get('is_public', False),
            'tenant_id': profile.get('tenant_id'),
            'mappings': profile.get('mappings', []),
            'created_at': profile.get('created_at'),
            'updated_at': profile.get('updated_at')
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting profile: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@device_profiles_bp.route('', methods=['POST'])
def create_profile():
    """
    Create a new device profile.
    Body: {name, description, sdm_entity_type, mappings, is_public?}
    """
    try:
        from sdm_api import get_sdm_entities
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        # Required fields
        required = ['name', 'sdm_entity_type', 'mappings']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Campo requerido: {field}'}), 400
        
        # Validate SDM entity type
        sdm_entities = get_sdm_entities()
        sdm_type = data.get('sdm_entity_type')
        if sdm_type not in sdm_entities:
            return jsonify({'error': f'Tipo SDM no válido: {sdm_type}'}), 400
        
        sdm_attributes = sdm_entities[sdm_type].get('attributes', {})
        
        # Validate mappings
        mappings = data.get('mappings', [])
        if not isinstance(mappings, list):
            return jsonify({'error': 'mappings debe ser un array'}), 400
        
        for i, mapping in enumerate(mappings):
            is_valid, error = validate_mapping(mapping, sdm_attributes)
            if not is_valid:
                return jsonify({'error': f'Mapping {i+1}: {error}'}), 400
        
        # Determine tenant/public status
        tenant_id = getattr(g, 'tenant', None)
        user_roles = getattr(g, 'roles', [])
        
        # Only PlatformAdmin can create public profiles
        is_public = data.get('is_public', False)
        if is_public and 'PlatformAdmin' not in user_roles:
            return jsonify({'error': 'Solo PlatformAdmin puede crear perfiles públicos'}), 403
        
        # Build profile document
        now = datetime.utcnow().isoformat()
        profile_doc = {
            'name': data.get('name'),
            'description': data.get('description', ''),
            'sdm_entity_type': sdm_type,
            'is_public': is_public,
            'tenant_id': None if is_public else tenant_id,
            'mappings': mappings,
            'created_at': now,
            'updated_at': now
        }
        
        collection = get_profiles_collection()
        result = collection.insert_one(profile_doc)
        
        logger.info(f"Created device profile: {data.get('name')} (id={result.inserted_id})")
        
        return jsonify({
            'id': str(result.inserted_id),
            'message': 'Perfil creado correctamente'
        }), 201
    
    except Exception as e:
        logger.error(f"Error creating profile: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@device_profiles_bp.route('/<profile_id>', methods=['PUT'])
def update_profile(profile_id: str):
    """Update an existing device profile."""
    try:
        from sdm_api import get_sdm_entities
        
        collection = get_profiles_collection()
        
        try:
            profile = collection.find_one({'_id': ObjectId(profile_id)})
        except Exception:
            return jsonify({'error': 'ID de perfil inválido'}), 400
        
        if not profile:
            return jsonify({'error': 'Perfil no encontrado'}), 404
        
        # Check ownership
        tenant_id = getattr(g, 'tenant', None)
        user_roles = getattr(g, 'roles', [])
        
        if profile.get('is_public'):
            if 'PlatformAdmin' not in user_roles:
                return jsonify({'error': 'Solo PlatformAdmin puede editar perfiles públicos'}), 403
        else:
            if profile.get('tenant_id') != tenant_id:
                return jsonify({'error': 'Acceso denegado'}), 403
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        # Validate SDM type and mappings if provided
        sdm_type = data.get('sdm_entity_type', profile.get('sdm_entity_type'))
        sdm_entities = get_sdm_entities()
        
        if sdm_type not in sdm_entities:
            return jsonify({'error': f'Tipo SDM no válido: {sdm_type}'}), 400
        
        sdm_attributes = sdm_entities[sdm_type].get('attributes', {})
        
        if 'mappings' in data:
            for i, mapping in enumerate(data['mappings']):
                is_valid, error = validate_mapping(mapping, sdm_attributes)
                if not is_valid:
                    return jsonify({'error': f'Mapping {i+1}: {error}'}), 400
        
        # Build update
        update_doc = {'$set': {'updated_at': datetime.utcnow().isoformat()}}
        
        allowed_fields = ['name', 'description', 'sdm_entity_type', 'mappings']
        for field in allowed_fields:
            if field in data:
                update_doc['$set'][field] = data[field]
        
        # Only PlatformAdmin can change is_public
        if 'is_public' in data and 'PlatformAdmin' in user_roles:
            update_doc['$set']['is_public'] = data['is_public']
            if data['is_public']:
                update_doc['$set']['tenant_id'] = None
        
        collection.update_one({'_id': ObjectId(profile_id)}, update_doc)
        
        logger.info(f"Updated device profile: {profile_id}")
        
        return jsonify({'message': 'Perfil actualizado correctamente'}), 200
    
    except Exception as e:
        logger.error(f"Error updating profile: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@device_profiles_bp.route('/<profile_id>', methods=['DELETE'])
def delete_profile(profile_id: str):
    """Delete a device profile."""
    try:
        collection = get_profiles_collection()
        
        try:
            profile = collection.find_one({'_id': ObjectId(profile_id)})
        except Exception:
            return jsonify({'error': 'ID de perfil inválido'}), 400
        
        if not profile:
            return jsonify({'error': 'Perfil no encontrado'}), 404
        
        # Check ownership
        tenant_id = getattr(g, 'tenant', None)
        user_roles = getattr(g, 'roles', [])
        
        if profile.get('is_public'):
            if 'PlatformAdmin' not in user_roles:
                return jsonify({'error': 'Solo PlatformAdmin puede eliminar perfiles públicos'}), 403
        else:
            if profile.get('tenant_id') != tenant_id:
                return jsonify({'error': 'Acceso denegado'}), 403
        
        collection.delete_one({'_id': ObjectId(profile_id)})
        
        logger.info(f"Deleted device profile: {profile_id}")
        
        return jsonify({'message': 'Perfil eliminado correctamente'}), 200
    
    except Exception as e:
        logger.error(f"Error deleting profile: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


# =============================================================================
# Schema Attributes Endpoint
# =============================================================================

@device_profiles_bp.route('/schemas/<entity_type>/attributes', methods=['GET'])
def get_schema_attributes(entity_type: str):
    """
    Get available attributes for an SDM entity type.
    Used by frontend to populate the target attribute dropdown.
    """
    try:
        from sdm_api import get_sdm_entities
        
        sdm_entities = get_sdm_entities()
        
        if entity_type not in sdm_entities:
            return jsonify({'error': f'Tipo SDM no encontrado: {entity_type}'}), 404
        
        entity_def = sdm_entities[entity_type]
        attributes = entity_def.get('attributes', {})
        
        # Format for frontend consumption
        result = []
        for attr_name, attr_def in attributes.items():
            result.append({
                'name': attr_name,
                'type': attr_def.get('type', 'Text'),
                'description': attr_def.get('description', '')
            })
        
        return jsonify({
            'entity_type': entity_type,
            'description': entity_def.get('description', ''),
            'attributes': result
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting schema attributes: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@device_profiles_bp.route('/schemas', methods=['GET'])
def list_schemas():
    """List all available SDM entity types."""
    try:
        from sdm_api import get_sdm_entities
        
        sdm_entities = get_sdm_entities()
        
        result = []
        for type_name, type_def in sdm_entities.items():
            result.append({
                'type': type_name,
                'description': type_def.get('description', ''),
                'attribute_count': len(type_def.get('attributes', {}))
            })
        
        return jsonify({
            'schemas': result,
            'count': len(result)
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing schemas: {e}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500
