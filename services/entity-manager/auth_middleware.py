import logging
import os
import sys
import jwt
import hashlib
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import request, jsonify, g
from functools import wraps

logger = logging.getLogger(__name__)

# Add common directory to path for keycloak_auth
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'common'))

# Try to import Keycloak auth, fallback to old JWT_SECRET
try:
    from keycloak_auth import (
        validate_keycloak_token,
        TokenValidationError,
        extract_tenant_id
    )
    KEYCLOAK_AUTH_AVAILABLE = True
except ImportError:
    KEYCLOAK_AUTH_AVAILABLE = False

logger = logging.getLogger(__name__)

# API Key validation cache
_API_KEY_CACHE = {}
_CACHE_TIMEOUT = 300  # 5 minutes

def validate_api_key(api_key: str, tenant_id: str = None) -> dict:
    """
    Validate API Key and return tenant info.
    Returns dict with 'tenant_id' and 'valid' keys, or None if invalid.
    """
    if not api_key:
        return None
    
    POSTGRES_URL = os.getenv('POSTGRES_URL')
    if not POSTGRES_URL:
        logger.warning("POSTGRES_URL not set, API key validation disabled")
        return None
    
    # Check cache first
    cache_key = f"{api_key[:16]}..."  # First 16 chars for cache key
    if cache_key in _API_KEY_CACHE:
        cached = _API_KEY_CACHE[cache_key]
        if cached.get('valid'):
            return cached
    
    try:
        # Hash the provided API key
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query to find matching API key
        if tenant_id:
            # If tenant_id provided, check both key_hash and tenant_id
            cur.execute("""
                SELECT tenant_id, key_type, is_active
                FROM api_keys
                WHERE key_hash = %s AND tenant_id = %s AND is_active = true
                LIMIT 1
            """, (api_key_hash, tenant_id))
        else:
            # If no tenant_id, find by key_hash only
            cur.execute("""
                SELECT tenant_id, key_type, is_active
                FROM api_keys
                WHERE key_hash = %s AND is_active = true
                LIMIT 1
            """, (api_key_hash,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            result = {
                'tenant_id': row['tenant_id'],
                'key_type': row['key_type'],
                'valid': True
            }
            # Cache result
            _API_KEY_CACHE[cache_key] = result
            return result
        
        return None
        
    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return None

def require_auth(f):
    """
    Authentication decorator that accepts both JWT tokens and API Keys.
    Priority: JWT Token (Bearer) > API Key (X-API-Key header)
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Try JWT token first (from Authorization header)
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        # If token exists, try JWT validation
        if token:
            try:
                # Try Keycloak validation first if available
                if KEYCLOAK_AUTH_AVAILABLE:
                    try:
                        payload = validate_keycloak_token(token)
                        # Extract user info - try multiple fields
                        g.user = payload.get('preferred_username') or payload.get('username') or payload.get('sub', 'unknown')
                        # Extract email - try multiple fields and formats
                        g.email = (
                            payload.get('email') or
                            payload.get('preferred_username') or
                            payload.get('username') or
                            (payload.get('sub') if '@' in str(payload.get('sub', '')) else None)
                        )
                        # Log payload for debugging if email is missing
                        if not g.email or g.email == 'unknown':
                            logger.warning("Email not found in token payload. Available fields: %s", list(payload.keys()))
                        g.tenant = extract_tenant_id(payload) or 'master'
                        g.user_id = payload.get('sub')
                        g.farmer_id = payload.get('sub')  # For compatibility
                        roles = []
                        if isinstance(payload.get('roles'), list):
                            roles.extend(payload['roles'])
                        realm_access = payload.get('realm_access') or {}
                        if isinstance(realm_access.get('roles'), list):
                            roles.extend(realm_access['roles'])
                        resource_access = payload.get('resource_access') or {}
                        for resource in resource_access.values():
                            if isinstance(resource, dict) and isinstance(resource.get('roles'), list):
                                roles.extend(resource['roles'])
                        # Remove duplicates while preserving order
                        seen_roles = set()
                        ordered_roles = []
                        for role in roles:
                            if role not in seen_roles:
                                seen_roles.add(role)
                                ordered_roles.append(role)
                        g.roles = ordered_roles
                        g.auth_method = 'jwt_keycloak'
                        return f(*args, **kwargs)
                    except TokenValidationError as exc:
                        logger.error(f"Keycloak token validation failed: {exc}")
                        import traceback
                        logger.error(traceback.format_exc())
                        pass  # Fall through to old validation
                
                # Fallback to old JWT_SECRET validation
                jwt_secret = os.getenv('JWT_SECRET')
                if jwt_secret:
                    data = jwt.decode(token, jwt_secret, algorithms=["HS256"])
                    g.user = data.get('user', 'unknown')
                    g.email = data.get('email') or data.get('user')
                    g.tenant = data.get('tenant-id') or data.get('tenant_id') or data.get('tenant', 'master')
                    g.farmer_id = data.get('farmer_id')
                    roles = data.get('roles')
                    if isinstance(roles, list):
                        g.roles = roles
                    g.auth_method = 'jwt_secret'
                    return f(*args, **kwargs)
            except jwt.ExpiredSignatureError:
                return jsonify({'message': 'Token has expired!'}), 401
            except jwt.InvalidTokenError:
                # Token invalid, try API Key fallback
                pass
        
        # Try API Key authentication (from X-API-Key header)
        api_key = request.headers.get('X-API-Key')
        tenant_from_header = request.headers.get('Fiware-Service')
        
        if api_key:
            api_key_info = validate_api_key(api_key, tenant_from_header)
            if api_key_info and api_key_info.get('valid'):
                g.tenant = api_key_info['tenant_id']
                g.user = f"api-key-{api_key_info['key_type']}"
                g.email = None  # API Key doesn't have email
                g.user_id = None
                g.farmer_id = None
                g.roles = []
                g.auth_method = 'api_key'
                logger.info(f"API Key authentication successful for tenant: {g.tenant}")
                return f(*args, **kwargs)
            else:
                return jsonify({
                    'message': 'Invalid API Key or tenant mismatch',
                    'detail': 'The provided API Key is not valid for this tenant'
                }), 401
        
        # No valid authentication found
        return jsonify({
            'message': 'Authentication required',
            'detail': 'Provide either a Bearer token (Authorization header) or an API Key (X-API-Key header with Fiware-Service)'
        }), 401

    return decorated

def inject_fiware_headers(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Inject FIWARE headers for multi-tenancy
        if hasattr(g, 'tenant'):
            request.headers['Fiware-Service'] = g.tenant
            request.headers['Fiware-ServicePath'] = '/'
        return f(*args, **kwargs)
    return decorated

def log_entity_operation(operation, entity_type, entity_id=None):
    """Log entity operations for audit purposes"""
    tenant = getattr(g, 'tenant', 'unknown')
    user = getattr(g, 'user', 'unknown')
    logger.info(f"[AUDIT] {operation} {entity_type} {entity_id or 'N/A'} by {user} in tenant {tenant}")

def require_entity_ownership(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Check if user owns the entity (simplified implementation)
        # In a real implementation, you would check against the database
        return f(*args, **kwargs)
    return decorated
