#!/usr/bin/env python3
# =============================================================================
# Common Authentication Middleware - Production Service
# =============================================================================

import os
import jwt
import logging
import time
import hashlib
import hmac
from functools import wraps
from flask import request, jsonify, g
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET')  # DEPRECATED, fallback only if enabled
HMAC_SECRET = os.getenv('HMAC_SECRET', JWT_SECRET or '')
ALLOW_JWT_FALLBACK = os.getenv('ALLOW_JWT_FALLBACK', 'false').lower() == 'true'
REQUIRE_HMAC_SIGNATURE = os.getenv('REQUIRE_HMAC_SIGNATURE', 'true').lower() == 'true'

# Try to import Keycloak auth module
try:
    from keycloak_auth import (
        validate_keycloak_token,
        TokenValidationError,
        extract_tenant_id,
        verify_hmac_signature
    )
    KEYCLOAK_AUTH_AVAILABLE = True
    logger.info("Keycloak authentication module loaded successfully")
except ImportError as e:
    logger.warning(f"Keycloak auth not available: {e}, using JWT_SECRET fallback")
    KEYCLOAK_AUTH_AVAILABLE = False
    def verify_hmac_signature(signature_header: str, token: str, tenant_id: str) -> bool:
        if not HMAC_SECRET:
            logger.warning("HMAC secret not configured, skipping signature verification")
            return True
        if not signature_header:
            logger.warning("Missing signature header")
            return False
        parts = signature_header.split(':')
        if len(parts) != 2:
            logger.warning("Invalid signature format")
            return False
        provided_signature, timestamp = parts
        try:
            ts = int(timestamp)
        except ValueError:
            logger.warning("Invalid signature timestamp")
            return False
        if abs(int(time.time()) - ts) > 300:
            logger.warning("Signature timestamp out of range")
            return False
        message = f"{token}|{tenant_id}|{timestamp}"
        expected = hmac.new(HMAC_SECRET.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest()
        return hmac.compare_digest(provided_signature, expected)

def validate_jwt_token(token):
    """Validate JWT token and return payload"""
    # Try Keycloak validation first if available
    if KEYCLOAK_AUTH_AVAILABLE:
        try:
            payload = validate_keycloak_token(token)
            logger.debug("Token validated using Keycloak JWKs")
            return payload
        except TokenValidationError as e:
            logger.warning(f"Keycloak validation failed: {e}")
            if not ALLOW_JWT_FALLBACK:
                logger.error("JWT fallback disabled; rejecting token")
                return None
    
    if not ALLOW_JWT_FALLBACK:
        logger.error("JWT fallback disabled and token not validated")
        return None
    if not JWT_SECRET:
        logger.error("No JWT_SECRET available for fallback validation")
        return None
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        logger.warning("Using deprecated JWT_SECRET validation (fallback)")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        return None
    except jwt.InvalidTokenError:
        logger.warning("Invalid JWT token")
        return None

def get_request_token():
    """Extract JWT token from Authorization header or httpOnly cookie (fallback)"""
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1]
    return request.cookies.get('nkz_token')

def get_current_user():
    """Get current user from JWT token"""
    token = get_request_token()
    if not token:
        return None
    payload = validate_jwt_token(token)
    return payload

def require_auth(_func=None, *, require_hmac: bool = None):
    """
    Decorator to require JWT authentication
    
    Supports both:
        @require_auth
        @require_auth(require_hmac=False)
    
    Args:
        _func: The decorated function (when called without parentheses)
        require_hmac: If True, requires HMAC signature. If False, skips HMAC verification.
                     If None (default), uses REQUIRE_HMAC_SIGNATURE setting.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Allow OPTIONS requests for CORS preflight
            if request.method == 'OPTIONS':
                return jsonify({}), 200
            logger.debug(f"[require_auth] Processing request: {request.method} {request.path}")
            token = get_request_token()
            if not token:
                logger.warning(f"[require_auth] Missing or invalid authorization for {request.path}")
                return jsonify({'error': 'Missing or invalid authorization'}), 401

            try:
                payload = validate_jwt_token(token)
            except Exception as e:
                logger.warning(f"[require_auth] Token validation error for {request.path}: {e}")
                payload = None

            if not payload:
                logger.warning(f"[require_auth] Token validation failed for {request.path}")
                return jsonify({'error': 'Invalid or expired token'}), 401

            if KEYCLOAK_AUTH_AVAILABLE:
                tenant = extract_tenant_id(payload)
            else:
                tenant = payload.get('tenant-id') or payload.get('tenant_id') or payload.get('tenant')

            # Fallback for when services (like Ingress) forward X-Tenant-ID but token extraction fails
            if not tenant:
                tenant_header = request.headers.get('X-Tenant-ID')
                if tenant_header:
                    logger.debug(f"Using X-Tenant-ID header fallback: {tenant_header}")
                    tenant = tenant_header
            
            if not tenant:
                logger.warning("No tenant_id present in JWT payload or X-Tenant-ID header")
                return jsonify({'error': 'Tenant ID not found in token'}), 401
            
            # Verify HMAC signature for internal requests when configured
            # Allow skipping HMAC for public read-only endpoints
            should_require_hmac = require_hmac if require_hmac is not None else REQUIRE_HMAC_SIGNATURE
            if should_require_hmac and HMAC_SECRET:
                signature = request.headers.get('X-Auth-Signature')
                if not signature or not verify_hmac_signature(signature, token, tenant):
                    return jsonify({'error': 'Invalid or missing signature'}), 401
            
            # Store user info in Flask g for access in route handlers
            g.current_user = payload
            g.tenant = tenant
            g.farmer_id = payload.get('farmer_id')
            
            return f(*args, **kwargs)
        return decorated_function
    
    # Support both @require_auth and @require_auth(require_hmac=False)
    if _func is not None:
        # Called as @require_auth (without parentheses)
        return decorator(_func)
    else:
        # Called as @require_auth() or @require_auth(require_hmac=False)
        return decorator

def inject_fiware_headers(headers, tenant=None):
    """Inject FIWARE service headers with tenant isolation for NGSI-LD"""
    if tenant:
        headers['Fiware-Service'] = tenant
        headers['Fiware-ServicePath'] = '/'
    
    # NGSI-LD specific headers
    headers['Content-Type'] = 'application/ld+json'
    headers['Accept'] = 'application/ld+json'
    
    return headers

def validate_entity_ownership(entity_id, tenant):
    """Validate that entity belongs to the tenant"""
    # This would typically query Orion to check entity ownership
    # For now, we'll implement a basic check based on entity ID pattern
    # In production, you might want to add an 'owner' attribute to entities
    
    # Basic validation: entity ID should contain tenant info or be accessible via tenant context
    # This is a simplified check - in production you'd query Orion
    return True  # Placeholder - implement proper ownership validation

def validate_entity_ownership_robust(entity_id, tenant, orion_url="http://orion:1026"):
    """Robust validation that entity belongs to the tenant by querying Orion-LD"""
    try:
        import requests
        
        # Query Orion-LD to get the entity
        headers = {
            'Accept': 'application/ld+json',
            'Fiware-Service': tenant,
            'Fiware-ServicePath': '/'
        }
        
        response = requests.get(f"{orion_url}/ngsi-ld/v1/entities/{entity_id}", headers=headers)
        
        if response.status_code == 200:
            # Entity exists and is accessible with this tenant
            return True
        elif response.status_code == 404:
            # Entity not found - could be wrong tenant or doesn't exist
            return False
        else:
            # Other error - assume not accessible
            return False
            
    except Exception as e:
        logger.error(f"Error validating entity ownership: {e}")
        return False

def log_entity_operation(operation, entity_id, entity_type, tenant, farmer_id, details=None):
    """Log entity operations for audit trail"""
    log_entry = {
        'timestamp': datetime.utcnow().isoformat(),
        'operation': operation,
        'entity_id': entity_id,
        'entity_type': entity_type,
        'tenant': tenant,
        'farmer_id': farmer_id,
        'details': details or {}
    }
    
    logger.info(f"Entity operation: {log_entry}")
    # In production, you might want to store this in a dedicated audit database

def require_entity_ownership(f):
    """Decorator to require entity ownership validation"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get entity_id from URL parameters
        entity_id = kwargs.get('entity_id')
        if not entity_id:
            return jsonify({'error': 'Entity ID required'}), 400
        
        # Use robust validation
        if not validate_entity_ownership_robust(entity_id, g.tenant):
            return jsonify({'error': 'Access denied: Entity does not belong to your tenant'}), 403
        
        return f(*args, **kwargs)
    return decorated_function
