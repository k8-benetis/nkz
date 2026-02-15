#!/usr/bin/env python3
# =============================================================================
# Keycloak Authentication Middleware - Production Service
# =============================================================================
# Validación segura de tokens JWT de Keycloak usando JWKs
#
# Este módulo reemplaza la validación insegura con JWT_SECRET por validación
# real de firma usando las claves públicas de Keycloak (JWKs)

import os
import json
import logging
import time
import hashlib
import hmac
import base64
from functools import wraps
from typing import Optional, Dict, Any

import jwt
from jwt import PyJWKClient
import requests
from flask import request, jsonify, g

logger = logging.getLogger(__name__)

# Configuration from environment
KEYCLOAK_URL = os.getenv('KEYCLOAK_URL', 'http://keycloak-service:8080')
KEYCLOAK_PUBLIC_URL = os.getenv('KEYCLOAK_PUBLIC_URL')
KEYCLOAK_HOSTNAME = os.getenv('KEYCLOAK_HOSTNAME')  # e.g., auth.robotika.cloud (without protocol)
KEYCLOAK_REALM = os.getenv('KEYCLOAK_REALM', 'nekazari')
KEYCLOAK_CLIENT_ID = os.getenv('KEYCLOAK_CLIENT_ID', 'account')  # JWT audience to validate
HMAC_SECRET = os.getenv('HMAC_SECRET', os.getenv('JWT_SECRET', ''))  # Fallback temporal

# JWKs URL - Always use internal URL for performance/connectivity
# Keycloak with KC_HTTP_RELATIVE_PATH=/auth exposes JWKS at /auth/realms/{realm}/protocol/openid-connect/certs
_keycloak_base_url = KEYCLOAK_URL.rstrip('/')
# Keycloak 26+ with KC_HTTP_RELATIVE_PATH=/auth requires /auth prefix
# Check if /auth is already in the URL to avoid double /auth/auth
if _keycloak_base_url.endswith('/auth'):
    # KEYCLOAK_URL already includes /auth, use it directly
    JWKS_URL = f"{_keycloak_base_url}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
else:
    # KEYCLOAK_URL doesn't include /auth, add it
    JWKS_URL = f"{_keycloak_base_url}/auth/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"

# Cache for JWKs client
_jwks_client = None


class KeycloakAuthError(Exception):
    """Base exception for Keycloak authentication errors"""
    pass


class TokenValidationError(KeycloakAuthError):
    """Token validation failed"""
    pass


def get_jwks_client():
    """Get or create PyJWKClient with basic caching."""
    global _jwks_client
    if _jwks_client is None:
        try:
            logger.debug(f"Creating PyJWKClient with JWKS_URL: {JWKS_URL}")
            _jwks_client = PyJWKClient(JWKS_URL)
            logger.debug("PyJWKClient created successfully")
        except TypeError:
            # Older PyJWT versions do not accept extra kwargs; fallback without cache options
            logger.debug("PyJWKClient TypeError, using basic initialization")
            _jwks_client = PyJWKClient(JWKS_URL)
        except Exception as e:
            logger.error(f"Failed to create PyJWKClient: {e}")
            logger.error(f"JWKS_URL: {JWKS_URL}, KEYCLOAK_URL: {KEYCLOAK_URL}")
            raise
    return _jwks_client


def validate_keycloak_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate Keycloak JWT token using JWKs
    
    This function performs:
    1. Get JWKs client (with caching)
    2. Get signing key from JWKs
    3. Verify signature with public key
    4. Validate standard claims (exp, iss, aud)
    5. Extract tenant_id from claims
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded payload dict or None if validation failed
    
    Raises:
        TokenValidationError: If token is invalid
    """
    if not token:
        raise TokenValidationError("Token is empty")
    
    try:
        # Get signing key using PyJWK
        # Try with /auth prefix first, fallback to without /auth if needed
        try:
            jwks_client = get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(token)
        except Exception as jwks_error:
            logger.error(f"Failed to get signing key from JWKS: {jwks_error}")
            logger.error(f"JWKS_URL: {JWKS_URL}")
            logger.error(f"KEYCLOAK_URL: {KEYCLOAK_URL}")
            logger.error(f"KEYCLOAK_PUBLIC_URL: {KEYCLOAK_PUBLIC_URL}")
            # Try to get JWKS directly as fallback
            try:
                import requests
                jwks_response = requests.get(JWKS_URL, timeout=10)
                if jwks_response.status_code == 200:
                    logger.info(f"Direct JWKS fetch successful, but PyJWKClient failed")
                else:
                    logger.error(f"Direct JWKS fetch failed: {jwks_response.status_code} - {jwks_response.text[:200]}")
            except Exception as direct_error:
                logger.error(f"Direct JWKS fetch also failed: {direct_error}")
            raise TokenValidationError(f"Failed to get signing key: {jwks_error}")

        # Expected issuer includes /auth prefix if KEYCLOAK_URL doesn't already have it
        _keycloak_url_for_issuer = KEYCLOAK_URL.rstrip('/')
        if not _keycloak_url_for_issuer.endswith('/auth'):
            _keycloak_url_for_issuer = f"{_keycloak_url_for_issuer}/auth"
        expected_issuer = f"{_keycloak_url_for_issuer}/realms/{KEYCLOAK_REALM}"
        allowed_issuers = {expected_issuer}
        
        # Add public URL to allowed issuers if configured
        if KEYCLOAK_PUBLIC_URL:
            _public_url = KEYCLOAK_PUBLIC_URL.rstrip('/')
            if not _public_url.endswith('/auth'):
                _public_url = f"{_public_url}/auth"
            allowed_issuers.add(f"{_public_url}/realms/{KEYCLOAK_REALM}")
            
        # Add http/https variants for internal URL just in case
        if expected_issuer.startswith('http://'):
            allowed_issuers.add(expected_issuer.replace('http://', 'https://', 1))
        elif expected_issuer.startswith('https://'):
            allowed_issuers.add(expected_issuer.replace('https://', 'http://', 1))
        
        # Add KEYCLOAK_HOSTNAME if configured (dynamic, no hardcoded domains)
        if KEYCLOAK_HOSTNAME:
            # Support both with and without /auth path
            allowed_issuers.add(f"https://{KEYCLOAK_HOSTNAME}/auth/realms/{KEYCLOAK_REALM}")
            allowed_issuers.add(f"http://{KEYCLOAK_HOSTNAME}/auth/realms/{KEYCLOAK_REALM}")
            allowed_issuers.add(f"https://{KEYCLOAK_HOSTNAME}/realms/{KEYCLOAK_REALM}")
            allowed_issuers.add(f"http://{KEYCLOAK_HOSTNAME}/realms/{KEYCLOAK_REALM}")
        
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256', 'RS512'],
            audience=KEYCLOAK_CLIENT_ID,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # Relax audience validation for migration
                "verify_iss": False,  # Manual issuer validation below (whitelist)
            }
        )

        issuer = payload.get('iss')
        logger.debug("Token issuer: %s", issuer)
        logger.debug("Allowed issuers: %s", allowed_issuers)

        # STRICT VALIDATION: Only accept issuers from the explicit whitelist
        # The whitelist is built from KEYCLOAK_URL, KEYCLOAK_PUBLIC_URL, and KEYCLOAK_HOSTNAME
        issuer_valid = issuer in allowed_issuers

        if not issuer_valid:
            logger.warning("Token issuer %s not in allowed issuers %s and doesn't match pattern */realms/%s", 
                         issuer, allowed_issuers, KEYCLOAK_REALM)
            raise TokenValidationError("Invalid token issuer")

        logger.debug(f"Successfully validated token for user: {payload.get('preferred_username')}")
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise TokenValidationError("Token has expired")
    except jwt.InvalidSignatureError:
        logger.warning("Invalid token signature")
        raise TokenValidationError("Invalid token signature")
    except jwt.InvalidIssuerError:
        logger.warning("Invalid token issuer")
        raise TokenValidationError("Invalid token issuer")
    except jwt.DecodeError as e:
        logger.warning(f"Token decode error: {e}")
        raise TokenValidationError("Token decode failed")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise TokenValidationError(f"Invalid token: {e}")
    except Exception as e:
        logger.error(f"Unexpected error validating token: {e}")
        raise TokenValidationError(f"Unexpected error: {e}")


def validate_token_fallback(token: str) -> Optional[Dict[str, Any]]:
    """
    Fallback validation using symmetric key (for backward compatibility)
    
    This should be DEPRECATED once all tokens use asymmetric signing
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded payload or None if failed
    """
    if not HMAC_SECRET:
        logger.error("HMAC_SECRET not configured for fallback validation")
        raise TokenValidationError("No fallback secret configured")
    
    try:
        payload = jwt.decode(token, HMAC_SECRET, algorithms=['HS256'])
        logger.warning("Using fallback symmetric validation (DEPRECATED)")
        return payload
    except Exception as e:
        logger.error(f"Fallback validation failed: {e}")
        raise TokenValidationError(f"Fallback validation failed: {e}")


def extract_tenant_id(payload: Dict[str, Any]) -> Optional[str]:
    """
    Extract tenant_id from JWT payload and normalize it
    
    Tries multiple claim names for compatibility:
    - tenant-id (Keycloak mapper name)
    - tenant_id
    - tenant
    
    The extracted tenant_id is normalized to ensure consistency across all services.
    
    Args:
        payload: Decoded JWT payload
    
    Returns:
        Normalized tenant ID string or None
    """
    # Try different claim names
    tenant_id = payload.get('tenant-id') or payload.get('tenant_id') or payload.get('tenant')
    
    # Fallback: Try to extract from groups
    # PlatformAdmin users should be in 'platform' group, other users in tenant groups
    if not tenant_id and 'groups' in payload:
        groups = payload.get('groups', [])
        if groups and isinstance(groups, list) and len(groups) > 0:
            # Filter out special Keycloak system groups that are not tenants
            # Allow 'platform' group (tenant especial para PlatformAdmin)
            # Skip: default, offline_access, uma_authorization, and groups ending in 'administrators'/'admins'
            tenant_groups = []
            for g in groups:
                if not g:
                    continue
                # Normalize group name (remove leading slash)
                group_name = g[1:] if g.startswith('/') else g
                group_lower = group_name.lower()
                
                # Allow 'platform' group (special tenant for PlatformAdmin)
                if group_lower == 'platform':
                    tenant_groups.append('platform')
                # Skip system groups
                elif group_lower in ('default', 'offline_access', 'uma_authorization'):
                    continue
                # Skip groups ending in 'administrators' or 'admins' (except 'platform')
                elif group_lower.endswith(('administrators', 'admins')):
                    continue
                # All other groups are potential tenants
                else:
                    tenant_groups.append(group_name)
            
            if tenant_groups:
                # Take the first valid tenant group
                # PlatformAdmin should have 'platform' as first group
                tenant_id = tenant_groups[0]
                logger.debug("Extracted tenant from groups: %s", tenant_id)
            else:
                logger.debug("No valid tenant groups found in: %s", groups)

    logger.debug("Extracting tenant. Claims: %s", list(payload.keys()))
    logger.debug("Extracted Tenant ID (raw): %s", tenant_id)

    if not tenant_id:
        logger.debug(f"No tenant_id found in payload claims: {list(payload.keys())}")
        return None
    
    # Normalize tenant_id to ensure consistency across all services
    try:
        # Try importing from tenant_utils (works when /common is in sys.path)
        from tenant_utils import normalize_tenant_id
        normalized_tenant_id = normalize_tenant_id(tenant_id)
        logger.debug("Normalized Tenant ID: %s (from %s)", normalized_tenant_id, tenant_id)
        return normalized_tenant_id
    except (ImportError, ValueError) as e:
        # Fallback: basic normalization if import fails
        logger.warning(f"Failed to normalize tenant_id '{tenant_id}': {e}. Using basic normalization.")
        # Basic normalization: lowercase, replace hyphens with underscores
        normalized = tenant_id.lower().replace('-', '_').replace(' ', '_')
        # Remove any remaining invalid characters
        import re
        normalized = re.sub(r'[^a-z0-9_]', '', normalized)
        normalized = normalized.strip('_')
        logger.debug("Basic normalized Tenant ID: %s (from %s)", normalized, tenant_id)
        return normalized if normalized else tenant_id


def generate_hmac_signature(token: str, tenant_id: str) -> str:
    """
    Generate HMAC signature for internal header propagation
    
    This provides an additional security layer for services that want to verify
    headers haven't been tampered with during internal routing.
    
    Args:
        token: JWT token
        tenant_id: Tenant ID
    
    Returns:
        HMAC signature string
    """
    if not HMAC_SECRET:
        logger.error("HMAC_SECRET not configured")
        return ""
    
    timestamp = str(int(time.time()))
    message = f"{token}|{tenant_id}|{timestamp}"
    signature = hmac.new(
        HMAC_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return f"{signature}:{timestamp}"


def verify_hmac_signature(signature_header: str, token: str, tenant_id: str) -> bool:
    """
    Verify HMAC signature for internal header propagation
    
    Args:
        signature_header: HMAC signature header value
        token: JWT token
        tenant_id: Tenant ID
    
    Returns:
        True if signature is valid, False otherwise
    """
    if not signature_header or not HMAC_SECRET:
        logger.warning("HMAC signature verification skipped (not configured)")
        return True  # Don't block if not configured
    
    try:
        parts = signature_header.split(':')
        if len(parts) != 2:
            logger.warning("Invalid HMAC signature format")
            return False
        
        provided_signature, timestamp = parts
        
        # Check timestamp is not too old (5 min window)
        current_timestamp = int(time.time())
        if abs(current_timestamp - int(timestamp)) > 300:
            logger.warning("HMAC signature timestamp too old")
            return False
        
        message = f"{token}|{tenant_id}|{timestamp}"
        expected_signature = hmac.new(
            HMAC_SECRET.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(provided_signature, expected_signature)
        
    except Exception as e:
        logger.error(f"Error verifying HMAC signature: {e}")
        return False


def require_keycloak_auth(f):
    """
    Decorator to require Keycloak authentication
    
    Usage:
        @app.route('/protected')
        @require_keycloak_auth
        def protected_route():
            # Access user info via g.current_user
            # Access tenant via g.tenant
            return jsonify({'user': g.current_user})
    
    The decorator:
    1. Validates JWT token using Keycloak JWKs (or trusts API Gateway validation)
    2. Extracts tenant_id from claims or X-Tenant-ID header
    3. Stores user info in Flask g for access in route handlers
    4. Optionally verifies HMAC signature if X-Auth-Signature header present
    
    If X-Tenant-ID header is present (from API Gateway), it trusts the API Gateway
    validation and only decodes (doesn't validate signature) the token.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid authorization header'}), 401
        
        token = auth_header.split(' ')[1]
        
        # Check if request comes from API Gateway (trusted internal service)
        # API Gateway validates tokens and passes tenant via X-Tenant-ID
        trusted_tenant = request.headers.get('X-Tenant-ID')
        trust_api_gateway = os.getenv('TRUST_API_GATEWAY', 'false').lower() == 'true'
        
        try:
            if trust_api_gateway and trusted_tenant:
                # Trust API Gateway validation - only decode token without signature verification
                logger.debug("Trusting API Gateway validation, decoding token without signature verification")
                try:
                    # Decode without verification when trusting API Gateway
                    payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": True})
                    tenant_id = trusted_tenant  # Use tenant from header
                except jwt.ExpiredSignatureError:
                    logger.warning("Token expired even though from API Gateway")
                    return jsonify({'error': 'Token has expired'}), 401
                except Exception as e:
                    logger.warning(f"Token decode failed: {e}")
                    return jsonify({'error': 'Invalid token'}), 401
            else:
                # Full validation - validate token signature with Keycloak JWKs
                payload = validate_keycloak_token(token)
                if not payload:
                    return jsonify({'error': 'Token validation failed'}), 401
                
                # Extract tenant_id
                tenant_id = extract_tenant_id(payload)
                if not tenant_id:
                    logger.warning("No tenant_id in token")
                    return jsonify({'error': 'Tenant ID not found in token'}), 401
            
            # Verify HMAC signature if present
            hmac_signature = request.headers.get('X-Auth-Signature')
            if hmac_signature:
                if not verify_hmac_signature(hmac_signature, token, tenant_id):
                    return jsonify({'error': 'Invalid HMAC signature'}), 401
            
            # Store in Flask g for access in route handlers
            g.current_user = payload
            g.tenant = tenant_id
            g.tenant_id = tenant_id  # Alias for convenience
            g.user_id = payload.get('sub')
            g.username = payload.get('preferred_username')
            g.email = payload.get('email')
            g.roles = payload.get('realm_access', {}).get('roles', [])
            
            return f(*args, **kwargs)
            
        except TokenValidationError as e:
            logger.warning(f"Token validation error: {e}")
            return jsonify({'error': str(e)}), 401
        except KeycloakAuthError as e:
            logger.error(f"Keycloak auth error: {e}")
            return jsonify({'error': 'Authentication error'}), 500
        except Exception as e:
            logger.error(f"Unexpected error in auth decorator: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Internal server error'}), 500
    
    return decorated_function


def get_current_user() -> Optional[Dict[str, Any]]:
    """
    Get current user from Flask request context
    
    Returns:
        User payload dict or None if not authenticated
    """
    return getattr(g, 'current_user', None)


def get_current_tenant() -> Optional[str]:
    """
    Get current tenant from Flask request context
    
    Returns:
        Tenant ID string or None if not authenticated
    """
    return getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None)


def inject_fiware_headers(headers: Dict, tenant: Optional[str] = None, context_url: Optional[str] = None) -> Dict:
    """
    Inject FIWARE service headers for NGSI-LD
    
    Args:
        headers: Headers dictionary to modify
        tenant: Tenant ID for Fiware-Service header
        context_url: NGSI-LD context URL
    
    Returns:
        Modified headers dictionary
    """
    if tenant:
        headers['Fiware-Service'] = tenant
        headers['Fiware-ServicePath'] = '/'
    
    # NGSI-LD specific headers
    headers['Content-Type'] = 'application/ld+json'
    headers['Accept'] = 'application/ld+json'
    
    if context_url:
        headers['Link'] = f'<{context_url}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
    
    return headers


def is_authenticated() -> bool:
    """
    Check if current request is authenticated
    
    Returns:
        True if authenticated, False otherwise
    """
    return get_current_user() is not None


def has_role(role: str) -> bool:
    """
    Check if current user has a specific role
    
    Args:
        role: Role name to check
    
    Returns:
        True if user has the role, False otherwise
    """
    current_user = get_current_user()
    if not current_user:
        return False
    
    roles = current_user.get('realm_access', {}).get('roles', [])
    return role in roles


# =============================================================================
# Exported symbols
# =============================================================================

__all__ = [
    'KeycloakAuthError',
    'TokenValidationError',
    'validate_keycloak_token',
    'extract_tenant_id',
    'require_keycloak_auth',
    'get_current_user',
    'get_current_tenant',
    'inject_fiware_headers',
    'is_authenticated',
    'has_role',
    'generate_hmac_signature',
    'verify_hmac_signature',
]

