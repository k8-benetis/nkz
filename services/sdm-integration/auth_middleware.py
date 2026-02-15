import os
import sys
import logging
import jwt
from flask import request, jsonify, g
from functools import wraps

logger = logging.getLogger(__name__)

# Add common directory to path for keycloak_auth
# In Docker container, common is at /app/common; in dev, at ../common
common_paths = [
    os.path.join(os.path.dirname(__file__), 'common'),  # Docker: /app/common
    os.path.join(os.path.dirname(__file__), '..', 'common'),  # Dev: services/common
]
for path in common_paths:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

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

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            # Try Keycloak validation first if available
            if KEYCLOAK_AUTH_AVAILABLE:
                try:
                    payload = validate_keycloak_token(token)
                    g.user = payload.get('preferred_username', 'unknown')
                    g.tenant = extract_tenant_id(payload) or 'master'
                    g.user_id = payload.get('sub')
                    g.farmer_id = payload.get('sub')  # For compatibility
                    return f(*args, **kwargs)
                except TokenValidationError:
                    pass  # Fall through to old validation
            
            # Fallback to old JWT_SECRET validation
            jwt_secret = os.getenv('JWT_SECRET')
            if not jwt_secret:
                raise ValueError("JWT_SECRET not configured")

            data = jwt.decode(token, jwt_secret, algorithms=["HS256"])
            g.user = data.get('user', 'unknown')
            g.tenant = data.get('tenant-id') or data.get('tenant_id') or data.get('tenant', 'master')
            g.farmer_id = data.get('farmer_id')
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token is invalid!'}), 401
        except ValueError as e:
            return jsonify({'message': str(e)}), 500
        except Exception as e:
            return jsonify({'message': 'Authentication error', 'error': str(e)}), 500

        return f(*args, **kwargs)
    return decorated

def inject_fiware_headers(headers, tenant=None):
    """Add FIWARE headers to a dictionary for multi-tenancy"""
    if tenant is None:
        tenant = getattr(g, 'tenant', 'master')
    headers['Fiware-Service'] = tenant
    headers['Fiware-ServicePath'] = '/'
    headers['NGSILD-Tenant'] = tenant
    return headers

def log_entity_operation(operation, entity_id=None, entity_type=None, tenant=None, user_id=None, metadata=None):
    """Log entity operations for audit purposes"""
    tenant = tenant or getattr(g, 'tenant', 'unknown')
    user = user_id or getattr(g, 'user', 'unknown')
    logger.info(f"[AUDIT] {operation} {entity_type or 'unknown'} {entity_id or 'N/A'} by {user} in tenant {tenant}")

def require_entity_ownership(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Check if user owns the entity (simplified implementation)
        # In a real implementation, you would check against the database
        return f(*args, **kwargs)
    return decorated
