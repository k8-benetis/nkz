#!/usr/bin/env python3
# =============================================================================
# Enhanced Tenant Webhook Service - Integration with Activation Codes & WooCommerce
# =============================================================================
# This service handles tenant creation from both Keycloak events and WooCommerce orders
# with activation codes

import os
import sys
import json
import logging
import subprocess
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import errors as psycopg2_errors
from flask import Flask, request, jsonify, g, make_response
from flask_cors import CORS, cross_origin
from typing import Dict, Any, Optional, List, Tuple
from functools import wraps
import time
from datetime import datetime, timedelta
import secrets
import hashlib
from contextlib import suppress
import re
from urllib.parse import urlencode

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add common directory to path for imports
# Try multiple paths: relative (dev) and absolute (container)
common_paths = [
    '/app/common',  # Absolute path (container) - CHECK FIRST
    os.path.join(os.path.dirname(__file__), '..', 'common'),  # Relative path (dev)
    os.path.join(os.path.dirname(__file__), 'common'),  # Same directory
]
common_path_found = None
for common_path in common_paths:
    abs_path = os.path.abspath(common_path)
    if os.path.exists(abs_path) and os.path.isdir(abs_path):
        if abs_path not in sys.path:
            sys.path.insert(0, abs_path)
        common_path_found = abs_path
        logger.info(f"Added common path to sys.path: {abs_path}")
        break

if not common_path_found:
    logger.warning(f"Common directory not found in any of these paths: {common_paths}")

try:
    from keycloak_auth import (
        validate_keycloak_token,
        extract_tenant_id,
        TokenValidationError,
        KeycloakAuthError,
        has_role as check_role
    )
    KEYCLOAK_AUTH_AVAILABLE = True
    logger.info(f"✅ Keycloak authentication module loaded successfully")
except ImportError as e:
    logger.error(f"❌ keycloak_auth module not available - authentication will be limited: {e}")
    logger.error(f"Python path: {sys.path}")
    logger.error(f"Common path exists (/app/common): {os.path.exists('/app/common')}")
    if common_path_found:
        logger.error(f"Common path found but import failed: {common_path_found}")
        try:
            if os.path.exists(common_path_found):
                files = os.listdir(common_path_found)
                logger.error(f"Files in {common_path_found}: {files}")
        except Exception as list_err:
            logger.error(f"Could not list files: {list_err}")
    KEYCLOAK_AUTH_AVAILABLE = False
    TokenValidationError = Exception
    KeycloakAuthError = Exception

# Import Grafana manager
try:
    from grafana_manager import GrafanaOrganizationManager
    GRAFANA_ENABLED = True
except ImportError:
    logger.warning("Grafana manager not available")
    GRAFANA_ENABLED = False

try:
    from kubernetes import client as k8s_client, config as k8s_config
    from kubernetes.client import ApiException
    K8S_ENABLED = True
except ImportError:
    logger.warning("Kubernetes client library not available")
    k8s_client = None  # type: ignore
    k8s_config = None  # type: ignore
    ApiException = Exception  # type: ignore
    K8S_ENABLED = False

app = Flask(__name__)

# Configure CORS — origins configured via CORS_ORIGINS env var (comma-separated)
_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',') if o.strip()]
CORS(app, origins=_cors_origins, supports_credentials=True, allow_headers=["Content-Type", "Authorization", "X-Tenant-ID", "x-tenant-id"])

# =============================================================================
# Authentication decorators
# =============================================================================

def require_platform_admin(f):
    """Decorator to require PlatformAdmin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow OPTIONS requests to pass through WITHOUT authentication
        # Flask-CORS will handle CORS headers automatically
        if request.method == 'OPTIONS':
            return make_response('', 200)
        
        if not KEYCLOAK_AUTH_AVAILABLE:
            # Fallback: allow with webhook secret for backward compatibility
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.replace('Bearer ', '')
                if token == WEBHOOK_SECRET:
                    return f(*args, **kwargs)
            return jsonify({"error": "Authentication required"}), 401
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split(' ')[1]
        
        # Validate token
        try:
            payload = validate_keycloak_token(token)
            if not payload:
                return jsonify({"error": "Token validation failed"}), 401
            
            # Check for PlatformAdmin role - check multiple locations
            roles = payload.get('realm_access', {}).get('roles', []) or []
            # Also check resource_access and root level
            resource_roles = []
            for resource in payload.get('resource_access', {}).values():
                if isinstance(resource, dict) and 'roles' in resource:
                    resource_roles.extend(resource['roles'])
            all_roles = list(set(roles + resource_roles + payload.get('roles', [])))
            
            if 'PlatformAdmin' not in all_roles:
                logger.warning(f"User {payload.get('preferred_username')} ({payload.get('email')}) attempted admin action without PlatformAdmin role. Available roles: {all_roles}. Request: {request.method} {request.path}")
                return jsonify({
                    "error": "Insufficient permissions. PlatformAdmin role required.",
                    "available_roles": all_roles,
                    "user": payload.get('preferred_username')
                }), 403
            
            # Store in Flask g for access in route handlers
            g.current_user = payload
            # PlatformAdmin may not have a tenant - that's OK
            tenant_id = extract_tenant_id(payload)
            g.tenant_id = tenant_id  # Can be None for PlatformAdmin
            g.username = payload.get('preferred_username')
            g.email = payload.get('email')
            g.roles = all_roles  # Store all roles for easy access
            
            # Log for debugging
            is_platform_admin = 'PlatformAdmin' in all_roles
            if not tenant_id and is_platform_admin:
                logger.debug(f"PlatformAdmin user {payload.get('preferred_username')} working without tenant (expected)")
            
            return f(*args, **kwargs)
            
        except TokenValidationError as e:
            logger.warning(f"Token validation error for {request.method} {request.path}: {e}")
            return jsonify({
                "error": "Token validation failed",
                "details": str(e),
                "suggestion": "Your token may have expired. Please refresh the page and try again."
            }), 401
        except KeycloakAuthError as e:
            logger.error(f"Keycloak auth error for {request.method} {request.path}: {e}")
            return jsonify({
                "error": "Authentication error",
                "details": str(e)
            }), 500
        except Exception as e:
            logger.error(f"Unexpected error in auth decorator: {e}")
            return jsonify({"error": "Internal server error"}), 500
    
    return decorated_function

def require_keycloak_auth(f):
    """Decorator to require Keycloak authentication (for tenant users)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not KEYCLOAK_AUTH_AVAILABLE:
            return jsonify({"error": "Keycloak authentication not available"}), 503
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split(' ')[1]
        
        # Validate token
        try:
            payload = validate_keycloak_token(token)
            if not payload:
                return jsonify({"error": "Token validation failed"}), 401
            
            # Store in Flask g for access in route handlers
            g.current_user = payload
            g.tenant_id = extract_tenant_id(payload)
            g.username = payload.get('preferred_username')
            g.email = payload.get('email')
            g.roles = payload.get('realm_access', {}).get('roles', [])
            
            return f(*args, **kwargs)
            
        except TokenValidationError as e:
            logger.warning(f"Token validation error: {e}")
            return jsonify({"error": str(e)}), 401
        except KeycloakAuthError as e:
            logger.error(f"Keycloak auth error: {e}")
            return jsonify({"error": str(e)}), 401
    return decorated_function

# Configuration from environment
KEYCLOAK_URL = os.getenv('KEYCLOAK_URL', 'http://keycloak-service:8080')
KEYCLOAK_REALM = os.getenv('KEYCLOAK_REALM', 'nekazari')
KEYCLOAK_CLIENT_ID = os.getenv('KEYCLOAK_CLIENT_ID', 'nekazari-api-gateway')
KEYCLOAK_CLIENT_SECRET = os.getenv('KEYCLOAK_CLIENT_SECRET', '')
WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET')
WOOCOMMERCE_WEBHOOK_SECRET = os.getenv('WOOCOMMERCE_WEBHOOK_SECRET', '')
POSTGRES_URL = os.getenv('POSTGRES_URL', '')
CREATE_TENANT_SCRIPT = os.getenv('CREATE_TENANT_SCRIPT', '/app/scripts/create-tenant.sh')
CREATE_ROS2_SCRIPT = os.getenv('CREATE_ROS2_SCRIPT', '/app/scripts/create-tenant-ros2.sh')
TENANT_NAMESPACE_PREFIX = os.getenv('TENANT_NAMESPACE_PREFIX', 'nekazari-tenant-')
K8S_API_TIMEOUT = int(os.getenv('K8S_API_TIMEOUT', '15'))

# Import config manager for URL construction
try:
    from common.config_manager import ConfigManager
    PLATFORM_EMAIL = ConfigManager.get_platform_email()
    FRONTEND_URL = ConfigManager.get_frontend_url()
    KEYCLOAK_PUBLIC_URL = ConfigManager.get_keycloak_public_url()
    GRAFANA_PUBLIC_URL = ConfigManager.get_grafana_public_url()
except ImportError:
    # Fallback if config_manager not available
    PRODUCTION_DOMAIN = os.getenv('PRODUCTION_DOMAIN', '')
    PLATFORM_EMAIL = os.getenv('ADMIN_EMAIL') or os.getenv('SMTP_FROM_EMAIL', '')
    FRONTEND_URL = os.getenv('FRONTEND_URL', f'https://{PRODUCTION_DOMAIN}' if PRODUCTION_DOMAIN else '').rstrip('/')
    KEYCLOAK_PUBLIC_URL = os.getenv('KEYCLOAK_PUBLIC_URL', f'https://{PRODUCTION_DOMAIN}/auth' if PRODUCTION_DOMAIN else '').rstrip('/')
    GRAFANA_PUBLIC_URL = os.getenv('GRAFANA_PUBLIC_URL', f'https://{PRODUCTION_DOMAIN}/grafana' if PRODUCTION_DOMAIN else '').rstrip('/')
DEFAULT_TENANT_ROLES: List[str] = [
    # Roles should be assigned to specific users, not the entire tenant group
    # 'PlatformAdmin',  # CRITICAL: Do not assign PlatformAdmin to tenant group
    # 'TenantAdmin',    # Assigned to owner directly
    # 'Farmer'          # Assigned to users directly
]


def get_tenant_namespace(tenant_id: str) -> str:
    """Build namespace name for tenant resources
    
    Args:
        tenant_id: Tenant ID (e.g., 'tenant-test-1' or 'test-1')
        
    Returns:
        Namespace name with prefix (e.g., 'nekazari-tenant-test-1')
    """
    # Normalize tenant_id: remove any existing 'tenant-' prefix to avoid duplication
    # If tenant_id already starts with 'tenant-', remove it before adding prefix
    normalized_id = tenant_id
    if tenant_id.startswith('nekazari-tenant-'):
        normalized_id = tenant_id[len('nekazari-tenant-'):]
        logger.warning(f"Tenant ID '{tenant_id}' already has 'nekazari-tenant-' prefix, using '{normalized_id}'")
    elif tenant_id.startswith('nekazari-'):
        normalized_id = tenant_id[len('nekazari-'):]
        logger.warning(f"Tenant ID '{tenant_id}' already has 'nekazari-' prefix, using '{normalized_id}'")
    
    return f"{TENANT_NAMESPACE_PREFIX}{normalized_id}"

class EnhancedTenantWebhookService:
    def __init__(self):
        self.keycloak_token = None
        self.token_expires_at = None
        self.k8s_core_v1 = None
        self.k8s_apps_v1 = None
        self.k8s_initialized = False
        self.keycloak_roles_cache: Dict[str, Dict[str, Any]] = {}
        self.admin_tenant = os.getenv('PLATFORM_ADMIN_TENANT', 'platform')
        
    def get_db_connection(self):
        """Get database connection for activation codes"""
        try:
            return psycopg2.connect(POSTGRES_URL, cursor_factory=RealDictCursor)
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            return None

    # -------------------------------------------------------------------------
    # Tenant helpers
    # -------------------------------------------------------------------------
    def _normalize_tenant_slug(self, value: str) -> str:
        """Normalize a raw identifier into a safe tenant_id slug.
        
        Uses common normalization function to ensure consistency across all services.
        Valid for PostgreSQL, MongoDB, Kubernetes, and other services.
        """
        if not value:
            return 'tenant'
        
        try:
            # Use common normalization function for consistency
            from tenant_utils import normalize_tenant_id
            return normalize_tenant_id(value)
        except (ImportError, ValueError) as e:
            # Fallback to old behavior if import fails
            logger.warning(f"Failed to use common normalization function: {e}. Using fallback.")
            import unicodedata
            # Normalize unicode (NFD) and remove combining characters (accents)
            value_nfd = unicodedata.normalize('NFD', value.lower())
            value_ascii = ''.join(c for c in value_nfd if unicodedata.category(c) != 'Mn')
            # Keep only alphanumeric and hyphens, replace other chars with hyphens
            slug = re.sub(r'[^a-z0-9-]+', '-', value_ascii)
            # Remove multiple consecutive hyphens
            slug = re.sub(r'-+', '-', slug)
            # Remove leading/trailing hyphens
            slug = slug.strip('-')
            # Replace hyphens with underscores for MongoDB compatibility
            slug = slug.replace('-', '_')
            # Ensure it starts with a letter or number (Kubernetes requirement)
            if slug and not slug[0].isalnum():
                slug = 't' + slug
            return slug or 'tenant'

    def _humanize_tenant_name(self, value: str) -> str:
        """Generate a readable tenant name from a slug or email local part."""
        if not value:
            return 'Tenant'
        spaced = re.sub(r'[^a-z0-9]+', ' ', value.lower())
        return spaced.title().strip() or 'Tenant'

    def ensure_tenant_record(
        self,
        conn,
        email: str,
        plan: str,
        limits: Dict[str, Any],
        tenant_name: Optional[str],
        source: str
    ) -> Optional[str]:
        """
        Ensure there's a tenants table record linked to the given email.

        Returns the resolved tenant_id so activation codes and API keys can
        reference it without guessing from the email elsewhere.
        """
        if not conn:
            return None

        email_lower = email.lower()
        desired_name = tenant_name or email_lower.split('@')[0]
        desired_slug = self._normalize_tenant_slug(desired_name)

        metadata_update = json.dumps({
            'primary_email': email_lower,
            'activation_source': source
        })

        cursor = conn.cursor()
        try:
            # Work under platform admin context so RLS allows cross-tenant access
            try:
                self._apply_admin_context(conn)
            except Exception as admin_err:
                conn.rollback()
                logger.error(f"Failed to apply admin context: {admin_err}")
                raise

            # If a tenant already references this email, reuse its tenant_id
            # Use metadata->>'primary_email' since email column may not exist
            # This query is safe and will work regardless of whether email column exists
            cursor.execute(
                """
                SELECT tenant_id, 
                       COALESCE(metadata->>'primary_email', '') as email, 
                       metadata
                FROM tenants
                WHERE (metadata IS NOT NULL AND metadata->>'primary_email' = %s)
                LIMIT 1
                """,
                (email_lower,)
            )
            existing = cursor.fetchone()
            if existing and existing.get('tenant_id'):
                tenant_id = existing['tenant_id']
                tenant_seen = True
            else:
                # Normalize tenant_id using common function to ensure consistency
                try:
                    from tenant_utils import normalize_tenant_id
                    tenant_id = normalize_tenant_id(desired_slug)
                except (ImportError, ValueError) as e:
                    # Fallback: use already normalized slug from _normalize_tenant_slug
                    logger.warning(f"Failed to normalize tenant_id '{desired_slug}': {e}. Using slug as-is.")
                    tenant_id = desired_slug
                
                # Check for uniqueness and add suffix if needed
                suffix = 1
                original_tenant_id = tenant_id
                while True:
                    cursor.execute(
                        "SELECT 1 FROM tenants WHERE tenant_id = %s",
                        (tenant_id,)
                    )
                    if not cursor.fetchone():
                        break
                    suffix += 1
                    tenant_id = f"{original_tenant_id}{suffix}"

            tenant_display_name = tenant_name or self._humanize_tenant_name(desired_name)

            cursor.execute(
                """
                INSERT INTO tenants (
                    tenant_id,
                    tenant_name,
                    plan_type,
                    status,
                    metadata
                )
                VALUES (
                    %s, %s, %s, %s, %s::jsonb
                )
                ON CONFLICT (tenant_id) DO UPDATE
                SET tenant_name = EXCLUDED.tenant_name,
                    plan_type = EXCLUDED.plan_type,
                    metadata = jsonb_strip_nulls(
                        COALESCE(tenants.metadata, '{}'::jsonb) || %s::jsonb
                    ),
                    status = CASE
                        WHEN tenants.status = 'cancelled' THEN tenants.status
                        ELSE EXCLUDED.status
                    END
                RETURNING tenant_id
                """,
                (
                    tenant_id,
                    tenant_display_name,
                    plan,
                    'active',
                    metadata_update,
                    metadata_update,
                )
            )
            resolved = cursor.fetchone()
            conn.commit()
            return resolved['tenant_id'] if resolved and 'tenant_id' in resolved else tenant_id
        except Exception as exc:
            conn.rollback()
            logger.error(f"Failed to ensure tenant record for {email}: {exc}")
            raise
        finally:
            cursor.close()

    def get_latest_activation_for_tenant(self, conn, tenant_id: str) -> Dict[str, Any]:
        """Return most recent activation code metadata for the tenant."""
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT
                    email,
                    code,
                    status,
                    expires_at,
                    created_at,
                    max_users,
                    max_robots,
                    max_sensors
                FROM activation_codes
                WHERE tenant_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (tenant_id,),
            )
            record = cursor.fetchone()
            if not record:
                return {}

            if isinstance(record, dict):
                return record

            return {
                'email': record[0],
                'code': record[1],
                'status': record[2],
                'expires_at': record[3],
                'created_at': record[4],
                'max_users': record[5],
                'max_robots': record[6],
                'max_sensors': record[7],
            }
        except Exception as exc:
            logger.error(f"Failed to fetch activation for tenant {tenant_id}: {exc}")
            return {}
        finally:
            cursor.close()

    def _apply_tenant_context(self, conn, tenant_id: Optional[str]) -> None:
        """Apply tenant context for RLS-aware tables."""
        if not conn or not tenant_id:
            return
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT set_current_tenant(%s)", (tenant_id,))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            logger.error(f"Failed to set tenant context ({tenant_id}): {exc}")
            raise
        finally:
            cursor.close()

    def _apply_admin_context(self, conn) -> None:
        """Apply platform admin context to access cross-tenant data."""
        if not conn:
            return
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT set_current_tenant(%s)", (self.admin_tenant,))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            logger.error(f"Failed to set admin context ({self.admin_tenant}): {exc}")
            raise
        finally:
            cursor.close()
    
    def _get_keycloak_base_url(self) -> str:
        """Get normalized Keycloak base URL (ensures /auth is included for internal URLs)"""
        keycloak_url = KEYCLOAK_URL
        if 'keycloak-service' in keycloak_url and '/auth' not in keycloak_url:
            keycloak_url = f"{keycloak_url.rstrip('/')}/auth"
        return keycloak_url

    def _ensure_kubernetes_client(self) -> bool:
        """Initialise Kubernetes CoreV1 client when running inside the cluster"""
        if self.k8s_initialized:
            return self.k8s_core_v1 is not None

        self.k8s_initialized = True

        if not K8S_ENABLED:
            logger.warning("Kubernetes client library not installed, skipping API key secret creation")
            return False

        try:
            # Prefer in-cluster configuration, fallback to kubeconfig for local testing
            if os.getenv("KUBERNETES_SERVICE_HOST"):
                k8s_config.load_incluster_config()
            else:
                with suppress(Exception):
                    k8s_config.load_kube_config()
            self.k8s_core_v1 = k8s_client.CoreV1Api()
            self.k8s_apps_v1 = k8s_client.AppsV1Api()
            logger.info("Kubernetes client initialised successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialise Kubernetes client: {e}")
            self.k8s_core_v1 = None
            self.k8s_apps_v1 = None
            return False

    def _ensure_namespace_exists(self, namespace: str, tenant_id: str) -> bool:
        """Ensure tenant namespace exists before creating secrets"""
        if not self._ensure_kubernetes_client() or not self.k8s_core_v1:
            return False

        try:
            self.k8s_core_v1.read_namespace(name=namespace, _request_timeout=K8S_API_TIMEOUT)
            return True
        except ApiException as e:
            if getattr(e, "status", None) != 404:
                logger.error(f"Failed to read namespace {namespace}: {e}")
                return False

        # Namespace missing → create it
        metadata = k8s_client.V1ObjectMeta(
            name=namespace,
            labels={
                'tenant-id': tenant_id,
                'app.kubernetes.io/managed-by': 'tenant-webhook'
            }
        )
        namespace_body = k8s_client.V1Namespace(metadata=metadata)

        try:
            self.k8s_core_v1.create_namespace(body=namespace_body, _request_timeout=K8S_API_TIMEOUT)
            logger.info(f"Created namespace {namespace} for tenant {tenant_id}")
            return True
        except ApiException as e:
            if getattr(e, "status", None) == 409:
                logger.info(f"Namespace {namespace} already exists (race condition)")
                return True
            logger.error(f"Failed to create namespace {namespace}: {e}")
            return False
        
    def get_keycloak_token(self) -> Optional[str]:
        """Get access token from Keycloak using admin credentials or service account"""
        if self.keycloak_token and self.token_expires_at and time.time() < self.token_expires_at:
            return self.keycloak_token
            
        try:
            keycloak_url = self._get_keycloak_base_url()
            
            # Try admin credentials first (if available) - more reliable for admin operations
            KEYCLOAK_ADMIN_USER = os.getenv('KEYCLOAK_ADMIN_USER', '')
            KEYCLOAK_ADMIN_PASSWORD = os.getenv('KEYCLOAK_ADMIN_PASSWORD', '')
            
            if KEYCLOAK_ADMIN_USER and KEYCLOAK_ADMIN_PASSWORD:
                # Use admin credentials (master realm)
                token_url = f"{keycloak_url}/realms/master/protocol/openid-connect/token"
                # Use urlencode to properly encode special characters in password
                data_dict = {
                    'grant_type': 'password',
                    'username': KEYCLOAK_ADMIN_USER,
                    'password': KEYCLOAK_ADMIN_PASSWORD,
                    'client_id': 'admin-cli'
                }
                # Encode data as URL-encoded string to handle special characters correctly
                data = urlencode(data_dict)
                logger.debug(f"Requesting admin token from: {token_url}")
            else:
                # Fallback to service account (client credentials)
                token_url = f"{keycloak_url}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
                
                # Validate client secret is not empty
                if not KEYCLOAK_CLIENT_SECRET:
                    logger.error(f"KEYCLOAK_CLIENT_SECRET is empty or not set. Check keycloak-secret secret.")
                    return None
                
                data_dict = {
                    'grant_type': 'client_credentials',
                    'client_id': KEYCLOAK_CLIENT_ID,
                    'client_secret': KEYCLOAK_CLIENT_SECRET
                }
                # Encode data as URL-encoded string to handle special characters correctly
                data = urlencode(data_dict)
                logger.debug(f"Requesting service account token from: {token_url}")
                logger.debug(f"Client ID: {KEYCLOAK_CLIENT_ID}")
            
            # Use data as string with proper Content-Type header for URL-encoded form data
            headers = {'Content-Type': 'application/x-www-form-urlencoded'}
            response = requests.post(token_url, data=data, headers=headers, timeout=10)
            
            if response.status_code == 401:
                logger.error(f"Keycloak authentication failed (401). Check credentials.")
                logger.error(f"Response: {response.text}")
                return None
            
            response.raise_for_status()
            
            token_data = response.json()
            self.keycloak_token = token_data['access_token']
            self.token_expires_at = time.time() + token_data['expires_in'] - 60  # 1 minute buffer
            
            logger.info("Successfully obtained Keycloak token")
            return self.keycloak_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get Keycloak token (network error): {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"Failed to get Keycloak token (unexpected error): {e}")
            return None
    
    def validate_activation_code(self, code: str, email: str) -> Optional[Dict[str, Any]]:
        """Validate activation code and return plan information"""
        conn = self.get_db_connection()
        if not conn:
            return None
            
        try:
            cursor = conn.cursor()
            
            # Find the code
            cursor.execute("""
                SELECT id, code, email, plan, status, max_users, max_robots, max_sensors,
                       expires_at, duration_days, order_id
                FROM activation_codes
                WHERE code = %s AND email = %s
            """, (code.upper(), email.lower()))
            
            code_data = cursor.fetchone()
            
            if not code_data:
                logger.warning(f"Activation code not found: {code} for {email}")
                return None
            
            # Check if already used
            if code_data['status'] != 'pending':
                logger.warning(f"Activation code already used: {code}")
                return None
            
            # Check expiration
            if code_data['expires_at'] and code_data['expires_at'] < datetime.utcnow():
                logger.warning(f"Activation code expired: {code}")
                return None
            
            return {
                'id': code_data['id'],
                'code': code_data['code'],
                'email': code_data['email'],
                'plan': code_data['plan'],
                'max_users': code_data['max_users'],
                'max_robots': code_data['max_robots'],
                'max_sensors': code_data['max_sensors'],
                'expires_at': code_data['expires_at'].isoformat() if code_data['expires_at'] else None,
                'duration_days': code_data['duration_days'],
                'order_id': code_data['order_id']
            }
            
        except Exception as e:
            logger.error(f"Error validating activation code: {e}")
            return None
        finally:
            cursor.close()
            conn.close()
    
    def mark_activation_code_used(self, code_id: int, tenant_id: str) -> bool:
        """Mark activation code as used and link to tenant"""
        conn = self.get_db_connection()
        if not conn:
            return False
            
        try:
            self._apply_tenant_context(conn, tenant_id)
            cursor = conn.cursor()
            
            # Update activation code status
            cursor.execute("""
                UPDATE activation_codes 
                SET status = 'active', activated_at = %s, used_count = used_count + 1
                WHERE id = %s
            """, (datetime.utcnow(), code_id))
            
            # Insert farmer activation record
            cursor.execute("""
                INSERT INTO farmer_activations (farmer_id, activation_code_id, activated_at)
                VALUES (
                    (SELECT id FROM farmers WHERE tenant_id = %s LIMIT 1),
                    %s,
                    %s
                )
            """, (tenant_id, code_id, datetime.utcnow()))
            
            conn.commit()
            logger.info(f"Activation code {code_id} marked as used for tenant {tenant_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking activation code as used: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()
    
    def create_keycloak_user(self, email: str, tenant_id: str, plan_info: Dict[str, Any], password: Optional[str] = None, is_owner: bool = False) -> Dict[str, Any]:
        """Create user in Keycloak with tenant group
        
        Args:
            email: User email
            tenant_id: Tenant ID
            plan_info: Plan information with limits
            password: User password (optional)
            is_owner: If True, assign TenantAdmin role (first farmer/owner), else Farmer role
        """
        token = self.get_keycloak_token()
        if not token:
            return {'success': False, 'error': 'Failed to get Keycloak admin token'}
            
        try:
            keycloak_url = self._get_keycloak_base_url()
            
            # Create user in Keycloak
            user_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users"
            headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
            
            # Extract first and last name from email
            name_parts = email.split('@')[0].split('.')
            first_name = name_parts[0].title() if name_parts else 'User'
            last_name = name_parts[1].title() if len(name_parts) > 1 else ''
            
            # Check if user already exists in Keycloak
            search_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users"
            search_params = {'email': email.lower(), 'exact': 'true'}
            search_response = requests.get(search_url, headers=headers, params=search_params, timeout=10)
            
            if search_response.status_code == 200:
                existing_users = search_response.json()
                if existing_users and len(existing_users) > 0:
                    # User already exists, use existing user_id
                    user_id = existing_users[0]['id']
                    logger.info(f"User {email} already exists in Keycloak, using existing user: {user_id}")
                    
                    # Update user attributes if needed
                    update_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}"
                    user_data = {
                        'username': email,
                        'email': email,
                        'enabled': True,
                        'emailVerified': True,
                        'firstName': first_name,
                        'lastName': last_name,
                        'attributes': {
                            'tenant_id': [tenant_id],
                            'plan': [plan_info['plan']],
                            'max_users': [str(plan_info['max_users'])],
                            'max_robots': [str(plan_info['max_robots'])],
                            'max_sensors': [str(plan_info['max_sensors'])],
                            'activation_code': [plan_info.get('code', '')],
                            'created_by': ['activation_code' if is_owner else 'tenant_admin'],
                            'is_owner': [str(is_owner).lower()]
                        }
                    }
                    update_response = requests.put(update_url, json=user_data, headers=headers, timeout=10)
                    if update_response.status_code in (204, 200):
                        logger.info(f"Updated existing Keycloak user: {email}")
                    else:
                        logger.warning(f"Failed to update existing user: {update_response.status_code} {update_response.text}")
                else:
                    # User doesn't exist, create new one
                    user_data = {
                        'username': email,
                        'email': email,
                        'enabled': True,
                        'emailVerified': True,
                        'firstName': first_name,
                        'lastName': last_name,
                        'attributes': {
                            'tenant_id': [tenant_id],
                            'plan': [plan_info['plan']],
                            'max_users': [str(plan_info['max_users'])],
                            'max_robots': [str(plan_info['max_robots'])],
                            'max_sensors': [str(plan_info['max_sensors'])],
                            'activation_code': [plan_info.get('code', '')],
                            'created_by': ['activation_code' if is_owner else 'tenant_admin'],
                            'is_owner': [str(is_owner).lower()]
                        }
                    }
                    response = requests.post(user_url, json=user_data, headers=headers, timeout=10)
                    if response.status_code == 409:
                        # Conflict - user might have been created between check and create
                        logger.warning(f"User {email} was created by another process, searching again...")
                        search_response = requests.get(search_url, headers=headers, params=search_params, timeout=10)
                        if search_response.status_code == 200:
                            existing_users = search_response.json()
                            if existing_users and len(existing_users) > 0:
                                user_id = existing_users[0]['id']
                                logger.info(f"Found existing user after conflict: {user_id}")
                            else:
                                raise Exception(f"Failed to create user and user not found: {response.text}")
                        else:
                            raise Exception(f"Failed to create user (409) and search failed: {response.text}")
                    else:
                        response.raise_for_status()
                        # Get user ID from location header
                        user_id = response.headers['Location'].split('/')[-1]
            else:
                # Search failed, try to create anyway
                user_data = {
                    'username': email,
                    'email': email,
                    'enabled': True,
                    'emailVerified': True,
                    'firstName': first_name,
                    'lastName': last_name,
                    'attributes': {
                        'tenant_id': [tenant_id],
                        'plan': [plan_info['plan']],
                        'max_users': [str(plan_info['max_users'])],
                        'max_robots': [str(plan_info['max_robots'])],
                        'max_sensors': [str(plan_info['max_sensors'])],
                        'activation_code': [plan_info.get('code', '')],
                        'created_by': ['activation_code' if is_owner else 'tenant_admin'],
                        'is_owner': [str(is_owner).lower()]
                    }
                }
                response = requests.post(user_url, json=user_data, headers=headers, timeout=10)
                if response.status_code == 409:
                    # User exists but search failed, try to find it
                    logger.warning(f"User creation returned 409, attempting to find user...")
                    search_response = requests.get(search_url, headers=headers, params=search_params, timeout=10)
                    if search_response.status_code == 200:
                        existing_users = search_response.json()
                        if existing_users and len(existing_users) > 0:
                            user_id = existing_users[0]['id']
                            logger.info(f"Found existing user after 409: {user_id}")
                        else:
                            raise Exception(f"User creation failed with 409 but user not found in search")
                    else:
                        raise Exception(f"Failed to create user (409) and search failed: {response.text}")
                else:
                    response.raise_for_status()
                    # Get user ID from location header
                    user_id = response.headers['Location'].split('/')[-1]
            
            # Ensure tenant group exists and assign roles
            tenant_group_name = tenant_id
            tenant_group_id = self._ensure_tenant_group(headers, tenant_group_name)
            if tenant_group_id:
                self._ensure_group_has_roles(headers, tenant_group_id)
                self._add_user_to_group(headers, user_id, tenant_group_id, email, tenant_group_name)
                
                # Assign specific role to user (TenantAdmin for owner, Farmer for additional)
                if is_owner:
                    self._assign_role_to_user(headers, user_id, 'TenantAdmin')
                    logger.info(f"Assigned TenantAdmin role to owner: {email}")
                else:
                    self._assign_role_to_user(headers, user_id, 'Farmer')
                    logger.info(f"Assigned Farmer role to user: {email}")
            else:
                logger.warning(f"Couldn't ensure tenant group for {tenant_group_name}, user {email} will miss group assignment")
            
            # Add user to tenant group
            # Set password (use provided password or generate temporary one)
            password_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/reset-password"
            if password:
                password_data = {
                    'type': 'password',
                    'value': password,
                    'temporary': False  # Use provided password, not temporary
                }
            else:
                password_data = {
                    'type': 'password',
                    'value': secrets.token_urlsafe(12),
                    'temporary': True
                }
            
            requests.put(password_url, json=password_data, headers=headers, timeout=10)
            
            logger.info(f"Successfully created Keycloak user: {email}")
            return {
                'success': True,
                'user_id': user_id,
                'email': email,
                'tenant_id': tenant_id
            }
            
        except Exception as e:
            logger.error(f"Failed to create Keycloak user {email}: {e}")
            return {'success': False, 'error': str(e)}
    
    def _fetch_realm_roles(self, headers: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
        """Fetch and cache Keycloak realm roles for quick lookup"""
        if self.keycloak_roles_cache:
            return self.keycloak_roles_cache

        keycloak_url = self._get_keycloak_base_url()
        roles_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/roles"

        try:
            response = requests.get(roles_url, headers=headers, timeout=10)
            response.raise_for_status()
            roles = {role['name']: role for role in response.json()}
            self.keycloak_roles_cache = roles
            return roles
        except Exception as e:
            logger.error(f"Failed to load Keycloak roles: {e}")
            return {}

    def _ensure_tenant_group(self, headers: Dict[str, str], tenant_group_name: str) -> Optional[str]:
        """Ensure tenant group exists, create if missing and return group ID"""
        keycloak_url = self._get_keycloak_base_url()
        groups_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/groups"

        try:
            response = requests.get(groups_url, headers=headers, params={'search': tenant_group_name}, timeout=10)
            response.raise_for_status()
            groups = response.json()
            for group in groups:
                if group.get('name') == tenant_group_name:
                    return group.get('id')
        except Exception as e:
            logger.error(f"Failed to search tenant group {tenant_group_name}: {e}")
            return None

        # Create group
        try:
            create_response = requests.post(
                groups_url,
                headers=headers,
                json={'name': tenant_group_name},
                timeout=10
            )
            create_response.raise_for_status()

            # Fetch again to get ID
            response = requests.get(groups_url, headers=headers, params={'search': tenant_group_name}, timeout=10)
            response.raise_for_status()
            groups = response.json()
            for group in groups:
                if group.get('name') == tenant_group_name:
                    logger.info(f"Created tenant group {tenant_group_name}")
                    return group.get('id')
        except Exception as e:
            logger.error(f"Failed to create tenant group {tenant_group_name}: {e}")

        return None

    def _ensure_group_has_roles(self, headers: Dict[str, str], group_id: str) -> None:
        """Ensure tenant group has default roles assigned"""
        keycloak_url = self._get_keycloak_base_url()
        role_map_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/groups/{group_id}/role-mappings/realm"

        try:
            current_response = requests.get(role_map_url, headers=headers, timeout=10)
            current_response.raise_for_status()
            current_roles = {role.get('name') for role in current_response.json()}
        except Exception as e:
            logger.error(f"Failed to fetch group role mappings: {e}")
            current_roles = set()

        missing_roles = [role for role in DEFAULT_TENANT_ROLES if role not in current_roles]
        if not missing_roles:
            return

        roles_map = self._fetch_realm_roles(headers)
        roles_payload = []
        for role_name in missing_roles:
            role = roles_map.get(role_name)
            if role:
                roles_payload.append({'id': role['id'], 'name': role['name']})
            else:
                logger.warning(f"Role {role_name} not found in Keycloak realm")

        if not roles_payload:
            return

        try:
            assign_response = requests.post(role_map_url, headers=headers, json=roles_payload, timeout=10)
            assign_response.raise_for_status()
            logger.info(f"Assigned roles {missing_roles} to tenant group")
        except Exception as e:
            logger.error(f"Failed to assign roles {missing_roles} to group {group_id}: {e}")

    def _add_user_to_group(self, headers: Dict[str, str], user_id: str, group_id: str, email: str, group_name: str) -> None:
        """Add Keycloak user to the tenant group"""
        keycloak_url = self._get_keycloak_base_url()
        group_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/groups/{group_id}"

        try:
            response = requests.put(group_url, headers=headers, timeout=10)
            if response.status_code in (204, 409):
                logger.info(f"User {email} added to tenant group {group_name}")
            else:
                logger.warning(f"Unexpected response adding user {email} to group {group_name}: {response.status_code} {response.text}")
        except Exception as e:
            logger.error(f"Failed to add user {email} to group {group_name}: {e}")
    
    def _assign_role_to_user(self, headers: Dict[str, str], user_id: str, role_name: str) -> bool:
        """Assign a realm role directly to a user"""
        keycloak_url = self._get_keycloak_base_url()
        roles_map = self._fetch_realm_roles(headers)
        
        role = roles_map.get(role_name)
        if not role:
            logger.warning(f"Role {role_name} not found in Keycloak realm")
            return False
        
        role_mapping_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm"
        role_payload = [{'id': role['id'], 'name': role['name']}]
        
        try:
            response = requests.post(role_mapping_url, headers=headers, json=role_payload, timeout=10)
            if response.status_code in (204, 200):
                logger.info(f"Assigned role {role_name} to user {user_id}")
                return True
            else:
                logger.warning(f"Failed to assign role {role_name} to user {user_id}: {response.status_code} {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error assigning role {role_name} to user {user_id}: {e}")
            return False
    
    def find_keycloak_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Find Keycloak user by email"""
        try:
            token = self.get_keycloak_token()
            if not token:
                return None
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            keycloak_url = self._get_keycloak_base_url()
            # Search user by email
            search_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users"
            params = {'email': email.lower(), 'exact': 'true'}
            
            response = requests.get(search_url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            users = response.json()
            if users and len(users) > 0:
                return {
                    'success': True,
                    'user_id': users[0]['id'],
                    'email': users[0].get('email'),
                    'username': users[0].get('username'),
                    'firstName': users[0].get('firstName', ''),
                    'lastName': users[0].get('lastName', '')
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error finding Keycloak user by email {email}: {e}")
            return None
    
    def create_tenant_resources(self, tenant_id: str, plan_info: Dict[str, Any]) -> bool:
        """Create Kubernetes resources for the tenant with plan limits
        
        CRITICAL: This must succeed for tenant activation to complete.
        Raises exception on failure to prevent incomplete tenant creation.
        """
        try:
            logger.info(f"Creating resources for tenant: {tenant_id} with plan: {plan_info['plan']}")
            
            # Verify script exists
            if not os.path.exists(CREATE_TENANT_SCRIPT):
                error_msg = f"CRITICAL: Tenant creation script not found: {CREATE_TENANT_SCRIPT}"
                logger.error(error_msg)
                raise FileNotFoundError(error_msg)
            
            # Set environment variables for plan limits
            env_vars = {
                'TENANT_ID': tenant_id,
                'PLAN_TYPE': plan_info['plan'],
                'MAX_USERS': str(plan_info['max_users']),
                'MAX_ROBOTS': str(plan_info['max_robots']),
                'MAX_SENSORS': str(plan_info['max_sensors']),
                'ACTIVATION_CODE': plan_info['code']
            }
            
            # Update environment for subprocess
            for key, value in env_vars.items():
                os.environ[key] = value
            
            # Run the tenant creation script
            result = subprocess.run(
                [CREATE_TENANT_SCRIPT, tenant_id],
                capture_output=True,
                text=True,
                timeout=600  # 10 minutes timeout (increased for slow servers)
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully created tenant resources for: {tenant_id}")
                logger.info(f"Script output: {result.stdout}")
                return True
            else:
                error_msg = f"CRITICAL: Failed to create tenant resources for {tenant_id}: {result.stderr}"
                logger.error(error_msg)
                logger.error(f"Script stdout: {result.stdout}")
                raise RuntimeError(error_msg)
                
        except subprocess.TimeoutExpired:
            error_msg = f"CRITICAL: Tenant creation script timed out for: {tenant_id}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        except FileNotFoundError:
            # Re-raise FileNotFoundError as-is
            raise
        except Exception as e:
            error_msg = f"CRITICAL: Error creating tenant resources for {tenant_id}: {e}"
            logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
    def create_ros2_resources(self, tenant_id: str) -> bool:
        """Create ROS2 resources for the tenant
        
        NOTE: This is now OPTIONAL - tenant creation will succeed even if ROS2 fails.
        ROS2 resources can be created/retried later if needed.
        Returns True on success, False on failure (no exceptions raised).
        """
        try:
            logger.info(f"Creating ROS2 resources for tenant: {tenant_id}")
            
            # Verify script exists
            if not os.path.exists(CREATE_ROS2_SCRIPT):
                logger.warning(f"⚠️  ROS2 creation script not found: {CREATE_ROS2_SCRIPT} - skipping ROS2 setup")
                logger.warning(f"Tenant {tenant_id} will be created without ROS2 resources. They can be added later.")
                return False
            
            # Run the ROS2 creation script
            result = subprocess.run(
                [CREATE_ROS2_SCRIPT, tenant_id],
                capture_output=True,
                text=True,
                timeout=180  # 3 minutes timeout
            )
            
            if result.returncode == 0:
                logger.info(f"✅ Successfully created ROS2 resources for: {tenant_id}")
                logger.info(f"Script output: {result.stdout}")
                return True
            else:
                logger.warning(f"⚠️  Failed to create ROS2 resources for {tenant_id}: {result.stderr}")
                logger.warning(f"Script stdout: {result.stdout}")
                logger.warning(f"Tenant {tenant_id} will be created without ROS2 resources. They can be retried later.")
                return False
                
        except subprocess.TimeoutExpired:
            logger.warning(f"⚠️  ROS2 creation script timed out for: {tenant_id}")
            logger.warning(f"Tenant {tenant_id} will be created without ROS2 resources. ROS2 setup can be retried later.")
            return False
        except FileNotFoundError as e:
            logger.warning(f"⚠️  ROS2 creation script not found: {e}")
            logger.warning(f"Tenant {tenant_id} will be created without ROS2 resources.")
            return False
        except Exception as e:
            logger.warning(f"⚠️  Error creating ROS2 resources for {tenant_id}: {e}")
            logger.warning(f"Tenant {tenant_id} will be created without ROS2 resources. ROS2 setup can be retried later.")
            return False
    
    def generate_api_key(self, tenant_id: str) -> Optional[str]:
        """Generate API key for the tenant and store in both Kubernetes Secret and PostgreSQL"""
        try:
            # Generate a secure API key (32 bytes hex)
            api_key = secrets.token_hex(32)
            api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
            namespace = get_tenant_namespace(tenant_id)

            # 1. Store in PostgreSQL api_keys table
            db_success = False
            if POSTGRES_URL:
                try:
                    conn = psycopg2.connect(POSTGRES_URL, cursor_factory=RealDictCursor)
                    cur = conn.cursor()
                    
                    # Check if API key already exists for this tenant
                    cur.execute("""
                        SELECT id FROM api_keys 
                        WHERE tenant_id = %s AND is_active = true
                        LIMIT 1
                    """, (tenant_id,))
                    existing = cur.fetchone()
                    
                    if existing:
                        # Update existing API key
                        cur.execute("""
                            UPDATE api_keys 
                            SET key_hash = %s, updated_at = NOW()
                            WHERE id = %s
                        """, (api_key_hash, existing['id']))
                        logger.info(f"Updated existing API key in database for tenant: {tenant_id}")
                    else:
                        # Create new API key
                        # Check if key_type column exists
                        cur.execute("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name = 'api_keys' AND column_name = 'key_type'
                        """)
                        has_key_type = cur.fetchone() is not None
                        
                        if has_key_type:
                            cur.execute("""
                                INSERT INTO api_keys (key_hash, name, description, tenant_id, key_type, is_active)
                                VALUES (%s, %s, %s, %s, 'tenant', true)
                            """, (
                                api_key_hash,
                                f'API Key for {tenant_id}',
                                f'Auto-generated API key for tenant {tenant_id}',
                                tenant_id
                            ))
                        else:
                            # Fallback for older schema without key_type
                            cur.execute("""
                                INSERT INTO api_keys (key_hash, name, description, tenant_id, is_active)
                                VALUES (%s, %s, %s, %s, true)
                            """, (
                                api_key_hash,
                                f'API Key for {tenant_id}',
                                f'Auto-generated API key for tenant {tenant_id}',
                                tenant_id
                            ))
                        logger.info(f"Created new API key in database for tenant: {tenant_id}")
                    
                    conn.commit()
                    cur.close()
                    conn.close()
                    db_success = True
                except Exception as db_err:
                    logger.error(f"Failed to store API key in database for {tenant_id}: {db_err}")
                    db_success = False
            
            # 2. Store in Kubernetes Secret (optional, don't fail if this doesn't work)
            k8s_success = False
            if not self._ensure_namespace_exists(namespace, tenant_id):
                logger.warning(f"Skipping API key secret creation – namespace {namespace} not available")
            elif not self.k8s_core_v1:
                logger.warning("Kubernetes client unavailable, unable to store API key secret")
            else:
                try:
                    metadata = k8s_client.V1ObjectMeta(
                        name=f"{tenant_id}-api-key",
                        namespace=namespace,
                        labels={
                            'tenant-id': tenant_id,
                            'app.kubernetes.io/managed-by': 'tenant-webhook',
                            'type': 'api-key'
                        }
                    )
                    secret_body = k8s_client.V1Secret(
                        metadata=metadata,
                        string_data={
                            'api_key': api_key,
                            'tenant_id': tenant_id,
                            'created_at': datetime.utcnow().isoformat()
                        },
                        type='Opaque'
                    )

                    try:
                        self.k8s_core_v1.create_namespaced_secret(
                            namespace=namespace,
                            body=secret_body,
                            _request_timeout=K8S_API_TIMEOUT
                        )
                        k8s_success = True
                        logger.info(f"Created API key secret in Kubernetes for tenant: {tenant_id}")
                    except ApiException as e:
                        if getattr(e, "status", None) == 409:
                            logger.info(f"API key secret already exists for {tenant_id}, updating")
                            self.k8s_core_v1.patch_namespaced_secret(
                                name=f"{tenant_id}-api-key",
                                namespace=namespace,
                                body=secret_body,
                                _request_timeout=K8S_API_TIMEOUT
                            )
                            k8s_success = True
                        else:
                            logger.warning(f"Kubernetes API error creating secret for {tenant_id}: {e}")
                except Exception as k8s_err:
                    logger.warning(f"Failed to create Kubernetes secret for {tenant_id}: {k8s_err}")
            
            # Return API key if at least one storage succeeded
            if db_success or k8s_success:
                logger.info(f"Successfully generated API key for tenant: {tenant_id} (DB: {db_success}, K8s: {k8s_success})")
                return api_key
            else:
                logger.error(f"Failed to store API key in both database and Kubernetes for {tenant_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error generating API key for {tenant_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

# Initialize the service
webhook_service = EnhancedTenantWebhookService()

# Initialize Grafana manager if enabled
grafana_manager = None
if GRAFANA_ENABLED:
    grafana_manager = GrafanaOrganizationManager()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'enhanced-tenant-webhook'
    })

@app.route('/webhook/keycloak', methods=['POST'])
def keycloak_webhook():
    """Handle Keycloak webhook events"""
    try:
        # Verify webhook secret
        auth_header = request.headers.get('Authorization')
        if not auth_header or auth_header != f'Bearer {WEBHOOK_SECRET}':
            logger.warning("Unauthorized webhook request")
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Parse webhook payload
        payload = request.get_json()
        if not payload:
            logger.warning("Empty webhook payload")
            return jsonify({'error': 'Empty payload'}), 400
        
        logger.info(f"Received Keycloak webhook: {json.dumps(payload, indent=2)}")
        
        # Process different event types
        event_type = payload.get('type')
        tenant_id = payload.get('tenant_id') or payload.get('group_name')
        
        if not tenant_id:
            logger.warning("No tenant_id found in webhook payload")
            return jsonify({'error': 'Missing tenant_id'}), 400
        
        if event_type == 'TENANT_CREATED':
            return handle_tenant_created(tenant_id, payload)
        elif event_type == 'TENANT_UPDATED':
            return handle_tenant_updated(tenant_id, payload)
        elif event_type == 'TENANT_DELETED':
            return handle_tenant_deleted(tenant_id, payload)
        else:
            logger.info(f"Unhandled event type: {event_type}")
            return jsonify({'message': 'Event type not handled'}), 200
            
    except Exception as e:
        logger.error(f"Error processing Keycloak webhook: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/webhook/woocommerce', methods=['POST'])
def woocommerce_webhook():
    """Handle WooCommerce order completion and create tenant with activation code"""
    try:
        # Verify webhook secret
        webhook_secret = request.headers.get('X-WooCommerce-Webhook-Secret')
        if WOOCOMMERCE_WEBHOOK_SECRET and webhook_secret != WOOCOMMERCE_WEBHOOK_SECRET:
            logger.warning("Invalid WooCommerce webhook secret")
            return jsonify({'error': 'Invalid webhook secret'}), 401
        
        # Parse webhook payload
        payload = request.get_json()
        if not payload:
            logger.warning("Empty WooCommerce webhook payload")
            return jsonify({'error': 'Empty payload'}), 400
        
        logger.info(f"Received WooCommerce webhook: {json.dumps(payload, indent=2)}")
        
        # Extract order information
        order_id = payload.get('id')
        email = payload.get('billing', {}).get('email')
        status = payload.get('status')
        
        if not email:
            logger.warning("No email found in WooCommerce order")
            return jsonify({'error': 'Email not found in order'}), 400
        
        # Only process completed orders
        if status not in ['completed', 'processing']:
            logger.info(f"Order {order_id} not ready for processing (status: {status})")
            return jsonify({'message': 'Order not ready for processing'}), 200
        
        # Extract product information to determine plan
        line_items = payload.get('line_items', [])
        plan = 'basic'  # Default plan
        
        # Map WooCommerce products to plans
        for item in line_items:
            product_name = item.get('name', '').lower()
            if 'premium' in product_name:
                plan = 'premium'
            elif 'enterprise' in product_name:
                plan = 'enterprise'
        
        # Generate activation code
        activation_code = f"NEK-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        
        # Plan limits
        plan_limits = {
            'basic': {'max_users': 1, 'max_robots': 3, 'max_sensors': 10, 'duration': 30},
            'premium': {'max_users': 5, 'max_robots': 10, 'max_sensors': 50, 'duration': 30},
            'enterprise': {'max_users': 999, 'max_robots': 999, 'max_sensors': 999, 'duration': 365}
        }
        
        limits = plan_limits.get(plan, plan_limits['basic'])
        expires_at = datetime.utcnow() + timedelta(days=limits['duration'])
        
        # Store activation code in database
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({'error': 'Database error'}), 500
        
        try:
            tenant_name = payload.get('billing', {}).get('company') or payload.get('billing', {}).get('first_name')
            tenant_id = webhook_service.ensure_tenant_record(
                conn=conn,
                email=email,
                plan=plan,
                limits=limits,
                tenant_name=tenant_name,
                source='woocommerce'
            )

            cursor = conn.cursor()
            
            # Insert activation code
            cursor.execute("""
                INSERT INTO activation_codes (
                    code, email, plan, status, max_users, max_robots, max_sensors,
                    expires_at, duration_days, generated_by, order_id, tenant_id
                )
                VALUES (%s, %s, %s, 'pending', %s, %s, %s, %s, %s, 'woocommerce', %s, %s)
            """, (
                activation_code, email.lower(), plan,
                limits['max_users'], limits['max_robots'], limits['max_sensors'],
                expires_at, limits['duration'], str(order_id), tenant_id
            ))
            
            conn.commit()
            logger.info(f"WooCommerce: Activation code {activation_code} generated for order {order_id}")
            
            # Send activation email
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                email_response = requests.post(
                    f'{EMAIL_SERVICE_URL}/send/activation',
                    json={
                        'email': email.lower(),
                        'farmer_name': email.split('@')[0],  # Use email prefix as name
                        'activation_code': activation_code
                    },
                    timeout=10
                )
                if email_response.status_code == 200:
                    logger.info(f"WooCommerce: Activation email sent to {email}")
                else:
                    logger.error(f"WooCommerce: Failed to send activation email: {email_response.status_code} - {email_response.text}")
            except requests.exceptions.ConnectionError as e:
                logger.error(f"WooCommerce: Cannot connect to email service at {EMAIL_SERVICE_URL}: {e}")
            except requests.exceptions.Timeout as e:
                logger.error(f"WooCommerce: Email service timeout: {e}")
            except Exception as e:
                logger.error(f"WooCommerce: Error sending activation email: {e}")
                import traceback
                logger.error(traceback.format_exc())
            # Don't fail the request if email fails, but log it clearly
            
            return jsonify({
                'success': True,
                'code': activation_code,
                'email': email,
                'plan': plan,
                'tenant_id': tenant_id,
                'order_id': order_id,
                'expires_at': expires_at.isoformat(),
                'limits': limits
            }), 201
            
        except Exception as e:
            logger.error(f"Error storing activation code: {e}")
            conn.rollback()
            return jsonify({'error': 'Failed to store activation code'}), 500
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        logger.error(f"Error processing WooCommerce webhook: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/generate-code', methods=['POST', 'OPTIONS'])
@app.route('/webhook/admin/generate-code', methods=['POST', 'OPTIONS'])
@cross_origin(origins=_cors_origins, supports_credentials=True)
@require_platform_admin
def generate_activation_code():
    """Generate activation code directly (admin use, without WooCommerce)"""
    try:
        data = request.get_json()
        email = data.get('email')
        plan = data.get('plan', 'basic')
        duration_days = data.get('duration_days', 30)
        notes = data.get('notes', '')
        tenant_name = data.get('tenant_name')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Plan limits
        plan_limits = {
            'basic': {'max_users': 1, 'max_robots': 3, 'max_sensors': 10},
            'premium': {'max_users': 5, 'max_robots': 10, 'max_sensors': 50},
            'enterprise': {'max_users': 999, 'max_robots': 999, 'max_sensors': 999}
        }
        
        limits = plan_limits.get(plan, plan_limits['basic'])
        expires_at = datetime.utcnow() + timedelta(days=duration_days)
        
        # Generate activation code in format NEK-XXXX-XXXX-XXXX
        activation_code = f"NEK-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        
        # Store activation code in database
        if not POSTGRES_URL:
            logger.error("POSTGRES_URL not configured")
            return jsonify({'error': 'Database not configured'}), 500
        
        conn = webhook_service.get_db_connection()
        if not conn:
            logger.error("Failed to establish database connection")
            return jsonify({'error': 'Database connection failed. Please check POSTGRES_URL configuration.'}), 500
        
        cursor = None
        try:
            tenant_id = webhook_service.ensure_tenant_record(
                conn=conn,
                email=email,
                plan=plan,
                limits=limits,
                tenant_name=tenant_name,
                source='admin'
            )

            cursor = conn.cursor()

            # Insert activation code
            cursor.execute("""
                INSERT INTO activation_codes (
                    code, email, plan, status, max_users, max_robots, max_sensors,
                    expires_at, duration_days, generated_by, notes, tenant_id
                )
                VALUES (%s, %s, %s, 'pending', %s, %s, %s, %s, %s, 'admin', %s, %s)
                RETURNING id, code, email, plan, expires_at, tenant_id
            """, (
                activation_code, email.lower(), plan,
                limits['max_users'], limits['max_robots'], limits['max_sensors'],
                expires_at, duration_days, notes, tenant_id
            ))
            
            code_data = cursor.fetchone()
            conn.commit()
            
            logger.info(f"Admin: Activation code {activation_code} generated for {email}")
            
            # Send activation email
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                email_response = requests.post(
                    f'{EMAIL_SERVICE_URL}/send/activation',
                    json={
                        'email': email.lower(),
                        'farmer_name': email.split('@')[0],  # Use email prefix as name
                        'activation_code': activation_code
                    },
                    timeout=10
                )
                if email_response.status_code == 200:
                    logger.info(f"Admin: Activation email sent to {email}")
                else:
                    logger.error(f"Admin: Failed to send activation email: {email_response.status_code} - {email_response.text}")
            except requests.exceptions.ConnectionError as e:
                logger.error(f"Admin: Cannot connect to email service at {EMAIL_SERVICE_URL}: {e}")
            except requests.exceptions.Timeout as e:
                logger.error(f"Admin: Email service timeout: {e}")
            except Exception as e:
                logger.error(f"Admin: Error sending activation email: {e}")
                import traceback
                logger.error(traceback.format_exc())
            # Don't fail the request if email fails, but log it clearly
            
            response = jsonify({
                'success': True,
                'code': activation_code,
                'email': email,
                'plan': plan,
                'tenant_id': tenant_id,
                'expires_at': expires_at.isoformat(),
                'limits': limits
            })
            # Flask-CORS adds headers automatically
            return response, 201
            
        except psycopg2_errors.UniqueViolation as e:
            logger.error(f"Activation code already exists: {e}")
            if conn:
                conn.rollback()
            return jsonify({'error': 'Activation code already exists. Please try again.'}), 409
        except psycopg2_errors.ForeignKeyViolation as e:
            logger.error(f"Foreign key violation: {e}")
            if conn:
                conn.rollback()
            return jsonify({'error': 'Invalid tenant reference. Please check tenant configuration.'}), 400
        except Exception as e:
            logger.error(f"Error storing activation code: {e}")
            import traceback
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
            return jsonify({'error': f'Failed to store activation code: {str(e)}'}), 500
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
            
    except Exception as e:
        logger.error(f"Error generating activation code: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/codes', methods=['GET'])
@app.route('/webhook/admin/codes', methods=['GET'])
@require_platform_admin
def list_activation_codes():
    """List activation codes (admin only)"""
    try:
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        cursor = conn.cursor()
        
        # Get query params
        status = request.args.get('status', 'all')
        limit = request.args.get('limit', 100, type=int)
        
        query = "SELECT id, code, email, plan, status, expires_at, created_at, max_users, max_robots, max_sensors, tenant_id FROM activation_codes WHERE 1=1"
        params = []
        
        if status != 'all':
            query += " AND status = %s"
            params.append(status)
        
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        codes = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        codes_list = []
        for code in codes:
            try:
                # Handle both dict (RealDictCursor) and tuple access
                code_id = code.get('id') if isinstance(code, dict) else (code[0] if len(code) > 0 else None)
                code_value = code.get('code') if isinstance(code, dict) else (code[1] if len(code) > 1 else None)
                email = code.get('email') if isinstance(code, dict) else (code[2] if len(code) > 2 else None)
                plan = code.get('plan') if isinstance(code, dict) else (code[3] if len(code) > 3 else None)
                status = code.get('status') if isinstance(code, dict) else (code[4] if len(code) > 4 else None)
                expires_at = code.get('expires_at') if isinstance(code, dict) else (code[5] if len(code) > 5 else None)
                created_at = code.get('created_at') if isinstance(code, dict) else (code[6] if len(code) > 6 else None)
                max_users = code.get('max_users') if isinstance(code, dict) else (code[7] if len(code) > 7 else None)
                max_robots = code.get('max_robots') if isinstance(code, dict) else (code[8] if len(code) > 8 else None)
                max_sensors = code.get('max_sensors') if isinstance(code, dict) else (code[9] if len(code) > 9 else None)
                tenant_id = code.get('tenant_id') if isinstance(code, dict) else (code[10] if len(code) > 10 else None)
                
                codes_list.append({
                    'id': code_id,
                    'code': code_value,
                    'email': email,
                    'plan': plan,
                    'status': status,
                    'expires_at': expires_at.isoformat() if expires_at and hasattr(expires_at, 'isoformat') else None,
                    'created_at': created_at.isoformat() if created_at and hasattr(created_at, 'isoformat') else None,
                    'tenant_id': tenant_id,
                    'limits': {
                        'max_users': max_users or 0,
                        'max_robots': max_robots or 0,
                        'max_sensors': max_sensors or 0
                    }
                })
            except Exception as code_err:
                logger.error(f"Error processing activation code row: {code_err}, row: {code}")
                continue
        
        return jsonify({
            'success': True,
            'codes': codes_list,
            'count': len(codes_list)
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing activation codes: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/tenant-limits', methods=['GET'])
@app.route('/webhook/admin/tenant-limits', methods=['GET'])
@require_platform_admin
def get_tenant_limits():
    """Get tenant limits for current user"""
    try:
        # Get tenant_id from authenticated user or query param
        tenant_id = getattr(g, 'tenant_id', None) or request.args.get('tenant_id')
        
        if not tenant_id:
            return jsonify({'error': 'tenant_id is required'}), 400
        
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        webhook_service._apply_tenant_context(conn, tenant_id)

        cursor = conn.cursor()
        
        # Get tenant limits from activation_codes or tenants table
        cursor.execute("""
            SELECT plan, max_users, max_robots, max_sensors, expires_at
            FROM activation_codes
            WHERE email = (SELECT email FROM farmers WHERE tenant_id = %s LIMIT 1)
            ORDER BY created_at DESC
            LIMIT 1
        """, (tenant_id,))
        
        code_data = cursor.fetchone()
        
        if not code_data:
            # Try tenants table
            cursor.execute("""
                SELECT plan_type, max_users, max_robots, max_sensors
                FROM tenants
                WHERE tenant_id = %s
                LIMIT 1
            """, (tenant_id,))
            tenant_data = cursor.fetchone()
            
            if tenant_data:
                limits = {
                    'planType': tenant_data['plan_type'],
                    'maxUsers': tenant_data['max_users'],
                    'maxRobots': tenant_data['max_robots'],
                    'maxSensors': tenant_data['max_sensors'],
                    'maxAreaHectares': None  # TODO: Add to schema
                }
            else:
                limits = {
                    'planType': 'basic',
                    'maxUsers': 1,
                    'maxRobots': 3,
                    'maxSensors': 10,
                    'maxAreaHectares': None
                }
        else:
            limits = {
                'planType': code_data['plan'],
                'maxUsers': code_data['max_users'],
                'maxRobots': code_data['max_robots'],
                'maxSensors': code_data['max_sensors'],
                'maxAreaHectares': None  # TODO: Add to schema
            }
        
        cursor.close()
        conn.close()
        
        return jsonify(limits), 200
        
    except Exception as e:
        logger.error(f"Error getting tenant limits: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/tenant-limits', methods=['PATCH'])
@app.route('/webhook/admin/tenant-limits', methods=['PATCH'])
@require_platform_admin
def update_tenant_limits():
    """Update tenant limits (admin only)"""
    try:
        data = request.get_json()
        tenant_id = data.get('tenant_id') or request.args.get('tenant_id')
        
        if not tenant_id:
            return jsonify({'error': 'tenant_id is required'}), 400
        
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        cursor = conn.cursor()
        
        # Update activation_codes limits (latest active code)
        updates = []
        params = []
        
        if 'maxUsers' in data:
            updates.append('max_users = %s')
            params.append(data['maxUsers'])
        if 'maxRobots' in data:
            updates.append('max_robots = %s')
            params.append(data['maxRobots'])
        if 'maxSensors' in data:
            updates.append('max_sensors = %s')
            params.append(data['maxSensors'])
        if 'planType' in data:
            updates.append('plan = %s')
            params.append(data['planType'])
        
        if updates:
            # Find latest code for this tenant
            cursor.execute("""
                SELECT id FROM activation_codes
                WHERE email = (SELECT email FROM farmers WHERE tenant_id = %s LIMIT 1)
                ORDER BY created_at DESC LIMIT 1
            """, (tenant_id,))
            code_row = cursor.fetchone()
            
            if code_row:
                code_id = code_row['id']
                params.append(code_id)
                query = f"UPDATE activation_codes SET {', '.join(updates)}, updated_at = NOW() WHERE id = %s"
                cursor.execute(query, params)
                conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Limits updated successfully'}), 200
        
    except Exception as e:
        logger.error(f"Error updating tenant limits: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/codes/<int:code_id>', methods=['DELETE'])
@app.route('/webhook/admin/codes/<int:code_id>', methods=['DELETE'])
@require_platform_admin
def revoke_activation_code(code_id):
    """Revoke an activation code (admin only)"""
    try:
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection error'}), 500
        
        cursor = conn.cursor()
        
        # Update status to 'revoked'
        cursor.execute(
            "UPDATE activation_codes SET status = 'revoked', updated_at = NOW() WHERE id = %s",
            (code_id,)
        )
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Code not found'}), 404
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"Activation code {code_id} revoked")
        
        return jsonify({
            'success': True,
            'message': 'Code revoked successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error revoking activation code: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/admin/api-keys', methods=['GET'])
@app.route('/api/admin/api-keys', methods=['GET'])
@app.route('/api-keys', methods=['GET'])  # For ingress prefix removal
@require_platform_admin
def list_api_keys():
    """List all API keys (admin use)"""
    if not POSTGRES_URL:
        return jsonify({"error": "Database not configured"}), 500
    
    try:
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({"error": "Database connection error"}), 500
        
        try:
            webhook_service._apply_admin_context(conn)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, tenant_id, name, description, is_active, created_at, updated_at 
                FROM api_keys 
                ORDER BY tenant_id, created_at DESC
            """)
            
            rows = cursor.fetchall()
            cursor.close()
            
            keys = []
            for row in rows:
                # RealDictCursor returns dict-like objects, but also works with tuple access
                # Support both access methods for compatibility
                try:
                    if isinstance(row, dict) or hasattr(row, '__getitem__'):
                        # Try dict access first (RealDictCursor)
                        row_id = row.get('id') if isinstance(row, dict) else row['id']
                        tenant = row.get('tenant_id') if isinstance(row, dict) else row.get('tenant') or row['tenant_id']
                        name = row.get('name') if isinstance(row, dict) else row['name']
                        description = row.get('description') if isinstance(row, dict) else row.get('description')
                        is_active = row.get('is_active') if isinstance(row, dict) else row['is_active']
                        created_at = row.get('created_at') if isinstance(row, dict) else row.get('created_at')
                        updated_at = row.get('updated_at') if isinstance(row, dict) else row.get('updated_at')
                    else:
                        # Fallback to tuple access
                        row_id = row[0]
                        tenant = row[1]
                        name = row[2]
                        description = row[3]
                        is_active = row[4]
                        created_at = row[5]
                        updated_at = row[6]
                except (IndexError, KeyError, TypeError) as e:
                    logger.error(f"Error parsing row: {e}, row type: {type(row)}, row: {row}")
                    continue
                
                keys.append({
                    'id': str(row_id) if row_id else None,
                    'tenant': tenant,
                    'name': name or '',
                    'description': description or '',
                    'is_active': bool(is_active) if is_active is not None else True,
                    'created_at': created_at.isoformat() if created_at else None,
                    'updated_at': updated_at.isoformat() if updated_at else None
                })
            
            # Return as array directly for frontend compatibility
            return jsonify(keys), 200
        finally:
            if conn:
                conn.close()
    except Exception as e:
        logger.error(f"Error listing API keys: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api-keys', methods=['POST'])
@app.route('/api/admin/api-keys', methods=['POST'])
@app.route('/api-keys', methods=['POST'])  # For ingress prefix removal
@require_platform_admin
def create_api_key():
    """Create new API key for tenant (admin use)"""
    if not POSTGRES_URL:
        return jsonify({"error": "Database not configured"}), 500
    
    data = request.get_json()
    if not data or 'tenant' not in data:
        return jsonify({"error": "Missing tenant"}), 400
    
    tenant = data['tenant'].lower().strip()
    if not tenant:
        return jsonify({"error": "Invalid tenant"}), 400
    
    # Generate new API key (32 bytes hex)
    new_api_key = secrets.token_hex(32)
    api_key_hash = hashlib.sha256(new_api_key.encode()).hexdigest()
    
    name = data.get('name', f'API Key for {tenant}')
    description = data.get('description', f'Generated API key for tenant {tenant}')
    
    try:
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({"error": "Database connection error"}), 500
        
        try:
            webhook_service._apply_admin_context(conn)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT tenant_id FROM tenants WHERE tenant_id = %s LIMIT 1",
                (tenant,)
            )
            tenant_exists = cursor.fetchone()
            if not tenant_exists:
                cursor.close()
                conn.close()
                return jsonify({"error": f"Tenant '{tenant}' not found"}), 404
            
            cursor.execute("""
                INSERT INTO api_keys (key_hash, name, description, tenant_id, is_active) 
                VALUES (%s, %s, %s, %s, true)
                RETURNING id, tenant_id, name, is_active, created_at, updated_at
            """, (api_key_hash, name, description, tenant))
            
            result = cursor.fetchone()
            conn.commit()
            cursor.close()
            
            return jsonify({
                "id": str(result[0]),
                "tenant": result[1],
                "name": result[2],
                "api_key": new_api_key,  # Full key ONLY returned on creation
                "is_active": result[3],
                "created_at": result[4].isoformat() if result[4] else None,
                "updated_at": result[5].isoformat() if result[5] else None,
                "warning": "Save this API key securely. It cannot be retrieved later."
            }), 201
        finally:
            if conn:
                conn.close()
        
    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/admin/tenants', methods=['GET'])
@app.route('/api/admin/tenants', methods=['GET'])
@app.route('/tenants', methods=['GET'])  # For ingress prefix removal
@require_platform_admin
def list_tenants():
    """List all tenants with expiration info (admin use)"""
    if not POSTGRES_URL:
        return jsonify({"error": "Database not configured"}), 500
    
    try:
        conn = webhook_service.get_db_connection()
        if not conn:
            return jsonify({"error": "Database connection error"}), 500
        
        try:
            webhook_service._apply_admin_context(conn)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    t.tenant_id,
                    t.tenant_name,
                    COALESCE(t.metadata->>'primary_email', '') AS tenant_email,
                    t.plan_type,
                    t.status,
                    t.created_at,
                    t.updated_at,
                    t.expires_at
                FROM tenants t
                ORDER BY t.created_at DESC NULLS LAST, t.tenant_id ASC
            """)
            tenants_rows = cursor.fetchall()
            cursor.close()
            
            tenants = []
            for row in tenants_rows:
                if not isinstance(row, dict):
                    logger.warning(f"Unexpected row format when listing tenants: {row}")
                    continue
                
                tenant_id = row.get('tenant_id')
                if not tenant_id:
                    continue
                
                activation = webhook_service.get_latest_activation_for_tenant(conn, tenant_id)
                activation_email = activation.get('email') if activation else row.get('tenant_email')
                activation_expires = activation.get('expires_at') if activation else None
                tenant_expires = row.get('expires_at') or activation_expires
                
                if isinstance(tenant_expires, datetime):
                    delta = tenant_expires - datetime.utcnow()
                    days_remaining = max(delta.days, 0)
                    expires_at_iso = tenant_expires.isoformat()
                elif tenant_expires:
                    expires_at_iso = str(tenant_expires)
                    days_remaining = None
                else:
                    expires_at_iso = None
                    days_remaining = None
                
                tenants.append({
                    'id': tenant_id,
                    'tenant': tenant_id,
                    'tenant_id': tenant_id,
                    'email': activation_email,
                    'name': row.get('tenant_name'),
                    'plan': row.get('plan_type') or 'basic',
                    'status': row.get('status') or 'active',
                    'created_at': row.get('created_at').isoformat() if row.get('created_at') else None,
                    'updated_at': row.get('updated_at').isoformat() if row.get('updated_at') else None,
                    'expires_at': expires_at_iso,
                    'days_remaining': days_remaining,
                    'max_users': activation.get('max_users') if activation else None,
                    'max_robots': activation.get('max_robots') if activation else None,
                    'max_sensors': activation.get('max_sensors') if activation else None,
                    'activation': activation
                })
            
            return jsonify({"tenants": tenants}), 200
        finally:
            if conn:
                conn.close()
    except Exception as e:
        logger.error(f"Error listing tenants: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/tenants', methods=['POST'])
@require_platform_admin
def create_tenant_directly():
    """Create a tenant directly without activation code (PlatformAdmin only)"""
    try:
        data = request.get_json()
        tenant_name = data.get('tenant_name')
        email = data.get('email')  # Owner email
        plan = data.get('plan', 'basic')
        password = data.get('password')  # Optional, will generate if not provided
        
        if not tenant_name:
            return jsonify({'error': 'tenant_name is required'}), 400
        
        if not email:
            return jsonify({'error': 'email is required'}), 400
        
        # Normalize tenant ID
        normalized_name = webhook_service._normalize_tenant_slug(tenant_name)
        if not normalized_name or normalized_name == 'tenant':
            fallback = email.split('@')[0].split('.')[0]
            normalized_name = webhook_service._normalize_tenant_slug(fallback) or 'tenant'
        tenant_id = f"tenant-{normalized_name}"
        
        # Plan limits
        plan_limits = {
            'basic': {'max_users': 1, 'max_robots': 3, 'max_sensors': 10},
            'premium': {'max_users': 5, 'max_robots': 10, 'max_sensors': 50},
            'enterprise': {'max_users': 999, 'max_robots': 999, 'max_sensors': 999}
        }
        plan_info = {
            'plan': plan,
            'max_users': plan_limits.get(plan, plan_limits['basic'])['max_users'],
            'max_robots': plan_limits.get(plan, plan_limits['basic'])['max_robots'],
            'max_sensors': plan_limits.get(plan, plan_limits['basic'])['max_sensors'],
            'code': 'ADMIN_CREATED'
        }
        
        # Create tenant resources
        logger.info(f"Creating tenant {tenant_id} directly by admin")
        tenant_resources_success = webhook_service.create_tenant_resources(tenant_id, plan_info)
        if not tenant_resources_success:
            return jsonify({'error': 'Failed to create tenant Kubernetes resources'}), 500
        
        # Generate API key
        api_key = webhook_service.generate_api_key(tenant_id)
        
        # Create tenant record in database
        conn = webhook_service.get_db_connection()
        tenant_record_id = None
        if conn:
            try:
                tenant_record_id = webhook_service.ensure_tenant_record(
                    conn, email, plan, {
                        'max_users': plan_info['max_users'],
                        'max_robots': plan_info['max_robots'],
                        'max_sensors': plan_info['max_sensors']
                    }, tenant_name, 'admin'
                )
            finally:
                conn.close()
        
        # Create Keycloak user if email provided
        user_result = None
        if email:
            user_result = webhook_service.create_keycloak_user(
                email, tenant_id, plan_info, password, is_owner=True
            )
            if not user_result.get('success'):
                logger.warning(f"Failed to create Keycloak user: {user_result.get('error')}")
        
        return jsonify({
            'success': True,
            'tenant_id': tenant_id,
            'tenant_name': tenant_name,
            'namespace': get_tenant_namespace(tenant_id),
            'api_key': api_key,
            'user_created': user_result.get('success') if user_result else False,
            'user_id': user_result.get('user_id') if user_result else None
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating tenant directly: {e}")
        return jsonify({'error': f'Failed to create tenant: {str(e)}'}), 500

@app.route('/api/admin/tenants/<tenant_id>', methods=['DELETE'])
@require_platform_admin
def delete_tenant_directly(tenant_id: str):
    """Delete a tenant and all its resources (PlatformAdmin only)"""
    try:
        logger.info(f"Deleting tenant {tenant_id} by admin")
        
        # Get tenant namespace
        namespace = get_tenant_namespace(tenant_id)
        errors = []
        
        # Delete from Keycloak FIRST (delete users and group)
        try:
            token = webhook_service.get_keycloak_token()
            if token:
                keycloak_url = webhook_service._get_keycloak_base_url()
                headers = {'Authorization': f'Bearer {token}'}
                
                # Find and delete users with this tenant_id
                users_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users"
                users_response = requests.get(users_url, headers=headers, params={'max': 1000}, timeout=10)
                if users_response.status_code == 200:
                    users = users_response.json()
                    for user in users:
                        user_tenant_id = user.get('attributes', {}).get('tenant_id', [])
                        if isinstance(user_tenant_id, list) and tenant_id in user_tenant_id:
                            user_id = user.get('id')
                            delete_user_response = requests.delete(
                                f"{users_url}/{user_id}",
                                headers=headers,
                                timeout=10
                            )
                            if delete_user_response.status_code in [200, 204]:
                                logger.info(f"Deleted user {user.get('email')} from Keycloak")
                            else:
                                errors.append(f"Failed to delete user {user.get('email')}: {delete_user_response.status_code}")
                
                # Find and delete tenant group
                groups_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/groups"
                groups_response = requests.get(groups_url, headers=headers, params={'search': tenant_id}, timeout=10)
                if groups_response.status_code == 200:
                    groups = groups_response.json()
                    for group in groups:
                        if group.get('name') == tenant_id:
                            group_id = group.get('id')
                            delete_response = requests.delete(
                                f"{groups_url}/{group_id}",
                                headers=headers,
                                timeout=10
                            )
                            if delete_response.status_code in [200, 204]:
                                logger.info(f"Deleted tenant group {tenant_id} from Keycloak")
                            else:
                                errors.append(f"Failed to delete group: {delete_response.status_code}")
        except Exception as kc_err:
            error_msg = f"Failed to delete from Keycloak: {str(kc_err)}"
            logger.warning(error_msg)
            errors.append(error_msg)
        
        # Delete Kubernetes namespace (this will cascade delete all resources)
        try:
            import kubernetes
            from kubernetes import client, config
            
            # Try to load kubeconfig
            try:
                config.load_incluster_config()
            except:
                config.load_kube_config()
            
            v1 = client.CoreV1Api()
            v1.delete_namespace(name=namespace, body=client.V1DeleteOptions())
            logger.info(f"Deleted namespace {namespace}")
        except Exception as k8s_err:
            error_msg = f"Failed to delete namespace {namespace}: {str(k8s_err)}"
            logger.warning(error_msg)
            errors.append(error_msg)
        
        # Delete tenant record from database
        conn = webhook_service.get_db_connection()
        if conn:
            try:
                webhook_service._apply_admin_context(conn)
                cursor = conn.cursor()
                cursor.execute("DELETE FROM tenants WHERE tenant_id = %s", (tenant_id,))
                conn.commit()
                cursor.close()
                logger.info(f"Deleted tenant record {tenant_id} from database")
            except Exception as db_err:
                error_msg = f"Failed to delete tenant from database: {str(db_err)}"
                logger.error(error_msg)
                errors.append(error_msg)
            finally:
                conn.close()
        
        if errors:
            return jsonify({
                'success': True,
                'message': f'Tenant {tenant_id} deleted with some warnings',
                'warnings': errors
            }), 200
        
        return jsonify({
            'success': True,
            'message': f'Tenant {tenant_id} deleted successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting tenant: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Failed to delete tenant: {str(e)}'}), 500

@app.route('/api/admin/tenants/<tenant_id>/users', methods=['POST'])
@require_platform_admin
def assign_user_to_tenant(tenant_id: str):
    """Assign an existing user to a tenant (PlatformAdmin only)"""
    try:
        data = request.get_json()
        user_email = data.get('email')
        role = data.get('role', 'Farmer')  # Default role
        
        if not user_email:
            return jsonify({'error': 'email is required'}), 400
        
        # Find user in Keycloak
        keycloak_user = webhook_service.find_keycloak_user_by_email(user_email.lower())
        if not keycloak_user or not keycloak_user.get('success'):
            return jsonify({'error': 'User not found in Keycloak'}), 404
        
        user_id = keycloak_user.get('user_id')
        
        # Get Keycloak token
        token = webhook_service.get_keycloak_token()
        if not token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        keycloak_url = webhook_service._get_keycloak_base_url()
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        
        # Ensure tenant group exists
        tenant_group_id = webhook_service._ensure_tenant_group(headers, tenant_id)
        if not tenant_group_id:
            return jsonify({'error': 'Failed to create tenant group'}), 500
        
        # Add user to group
        webhook_service._add_user_to_group(headers, user_id, tenant_group_id, user_email, tenant_id)
        
        # Assign role
        webhook_service._assign_role_to_user(headers, user_id, role)
        
        # Update user attributes with tenant_id
        update_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}"
        user_data = {
            'attributes': {
                'tenant_id': [tenant_id]
            }
        }
        requests.put(update_url, json=user_data, headers=headers, timeout=10)
        
        return jsonify({
            'success': True,
            'message': f'User {user_email} assigned to tenant {tenant_id}',
            'user_id': user_id,
            'tenant_id': tenant_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error assigning user to tenant: {e}")
        return jsonify({'error': f'Failed to assign user: {str(e)}'}), 500

@app.route('/api/admin/users', methods=['GET'])
@require_platform_admin
def list_all_users():
    """List all users from Keycloak (PlatformAdmin only)"""
    try:
        token = webhook_service.get_keycloak_token()
        if not token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        keycloak_url = webhook_service._get_keycloak_base_url()
        headers = {'Authorization': f'Bearer {token}'}
        
        # Get all users with pagination
        users_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users"
        
        # Get first page
        params = {'max': 100}
        response = requests.get(users_url, headers=headers, params=params, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"Failed to get users from Keycloak: {response.status_code} - {response.text}")
            return jsonify({'error': f'Failed to get users from Keycloak: {response.status_code}'}), 500
        
        all_users = response.json()
        users = []
        
        # Process users in batches to avoid timeout
        for user in all_users:
            try:
                # Get user attributes
                attributes = user.get('attributes', {}) or {}
                tenant_id = None
                if attributes.get('tenant_id'):
                    tenant_id_list = attributes.get('tenant_id')
                    if isinstance(tenant_id_list, list) and len(tenant_id_list) > 0:
                        tenant_id = tenant_id_list[0]
                    elif isinstance(tenant_id_list, str):
                        tenant_id = tenant_id_list
                
                # Get user groups (with timeout protection)
                groups = []
                try:
                    groups_url = f"{users_url}/{user['id']}/groups"
                    groups_response = requests.get(groups_url, headers=headers, timeout=5)
                    if groups_response.status_code == 200:
                        groups = [g.get('name') for g in groups_response.json()]
                except requests.exceptions.Timeout:
                    logger.warning(f"Timeout getting groups for user {user.get('email')}")
                except Exception as e:
                    logger.warning(f"Error getting groups for user {user.get('email')}: {e}")
                
                # Get user roles (with timeout protection)
                roles = []
                try:
                    roles_url = f"{users_url}/{user['id']}/role-mappings/realm"
                    roles_response = requests.get(roles_url, headers=headers, timeout=5)
                    if roles_response.status_code == 200:
                        roles_data = roles_response.json()
                        # Handle both direct list and mappings structure
                        if isinstance(roles_data, list):
                            roles = [r.get('name') for r in roles_data]
                        elif isinstance(roles_data, dict):
                            roles = [r.get('name') for r in roles_data.get('mappings', [])]
                except requests.exceptions.Timeout:
                    logger.warning(f"Timeout getting roles for user {user.get('email')}")
                except Exception as e:
                    logger.warning(f"Error getting roles for user {user.get('email')}: {e}")
                
                users.append({
                    'id': user.get('id'),
                    'email': user.get('email'),
                    'username': user.get('username'),
                    'firstName': user.get('firstName'),
                    'lastName': user.get('lastName'),
                    'enabled': user.get('enabled', True),
                    'tenant_id': tenant_id,
                    'groups': groups,
                    'roles': roles,
                    'createdTimestamp': user.get('createdTimestamp')
                })
            except Exception as user_err:
                logger.error(f"Error processing user {user.get('email', user.get('id'))}: {user_err}")
                # Continue with next user instead of failing completely
                continue
        
        return jsonify({
            'success': True,
            'users': users,
            'total': len(users)
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({'error': f'Failed to list users: {str(e)}'}), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@require_platform_admin
def delete_user_directly(user_id: str):
    """Delete a user from Keycloak (PlatformAdmin only)"""
    try:
        token = webhook_service.get_keycloak_token()
        if not token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        keycloak_url = webhook_service._get_keycloak_base_url()
        headers = {'Authorization': f'Bearer {token}'}
        
        # Get user info first
        user_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}"
        user_response = requests.get(user_url, headers=headers, timeout=10)
        if user_response.status_code != 200:
            return jsonify({'error': 'User not found'}), 404
        
        user_email = user_response.json().get('email')
        
        # Delete from Keycloak
        delete_response = requests.delete(user_url, headers=headers, timeout=10)
        if delete_response.status_code not in [200, 204]:
            return jsonify({'error': 'Failed to delete user from Keycloak'}), 500
        
        # Delete from database if exists
        if user_email:
            conn = webhook_service.get_db_connection()
            if conn:
                try:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM farmers WHERE email = %s", (user_email.lower(),))
                    conn.commit()
                    cursor.close()
                except Exception as db_err:
                    logger.warning(f"Failed to delete user from database: {db_err}")
                finally:
                    conn.close()
        
        logger.info(f"User {user_email} deleted by admin")
        
        return jsonify({
            'success': True,
            'message': f'User {user_email} deleted successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        return jsonify({'error': f'Failed to delete user: {str(e)}'}), 500

@app.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Handle password reset request for tenants"""
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Find user in Keycloak
        user_info = webhook_service.find_keycloak_user_by_email(email.lower())
        if not user_info:
            # Don't reveal if user exists or not (security best practice)
            logger.warning(f"Password reset requested for non-existent email: {email}")
            return jsonify({
                'success': True,
                'message': 'If the email exists, a password reset link has been sent'
            }), 200
        
        # Generate password reset token via Keycloak
        token = webhook_service.get_keycloak_token()
        if not token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        # Send password reset email via Keycloak
        # Keycloak will handle sending the email if SMTP is configured
        keycloak_url = webhook_service._get_keycloak_base_url()
        reset_url = f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_info['user_id']}/execute-actions-email"
        actions = ['UPDATE_PASSWORD']
        
        response = requests.put(
            reset_url,
            json=actions,
            headers=headers,
            params={'lifespan': 3600},  # 1 hour
            timeout=10
        )
        
        if response.status_code == 204:
            logger.info(f"Password reset email sent via Keycloak to {email}")
            
            # Also send custom email using email-service for consistency
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                
                # Generate a reset link that Keycloak will accept
                # Keycloak generates its own token, but we can provide a generic reset URL
                reset_link = f"{KEYCLOAK_PUBLIC_URL}/realms/{KEYCLOAK_REALM}/login-actions/reset-credentials?client_id=nekazari-frontend"
                
                email_response = requests.post(
                    f'{EMAIL_SERVICE_URL}/send/password-reset',
                    json={
                        'email': email.lower(),
                        'farmer_name': f"{user_info.get('firstName', '')} {user_info.get('lastName', '')}".strip() or email.split('@')[0],
                        'reset_token': 'KEYCLOAK_RESET',  # Placeholder, Keycloak handles the actual token
                        'reset_url': reset_link
                    },
                    timeout=10
                )
                
                if email_response.status_code == 200:
                    logger.info(f"Custom password reset email sent to {email}")
            except Exception as e:
                logger.warning(f"Failed to send custom password reset email: {e}")
            
            return jsonify({
                'success': True,
                'message': 'Password reset email sent successfully'
            }), 200
        else:
            logger.error(f"Keycloak password reset failed: {response.status_code} - {response.text}")
            return jsonify({'error': 'Failed to send password reset email'}), 500
            
    except Exception as e:
        logger.error(f"Error in forgot_password endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/activate', methods=['POST'])
@app.route('/webhook/activate', methods=['POST'])
def activate_tenant():
    """Activate tenant using activation code"""
    try:
        data = request.get_json()
        code = data.get('code')
        email = data.get('email')
        tenant_name = data.get('tenant_name', email.split('@')[0])
        password = data.get('password')  # Get password from request
        
        if not code or not email:
            return jsonify({'error': 'Code and email are required'}), 400
        
        if not password:
            return jsonify({'error': 'Password is required'}), 400
        
        # Validate activation code
        plan_info = webhook_service.validate_activation_code(code, email)
        if not plan_info:
            return jsonify({'error': 'Invalid or expired activation code'}), 400
        
        # Generate tenant ID (slugify tenant name) - use the improved normalization method
        normalized_name = webhook_service._normalize_tenant_slug(tenant_name)
        if not normalized_name or normalized_name == 'tenant':
            fallback = email.split('@')[0].split('.')[0]
            normalized_name = webhook_service._normalize_tenant_slug(fallback) or 'tenant'
        tenant_id = f"tenant-{normalized_name}"
        
        # Create tenant resources (CRITICAL - must succeed)
        logger.info(f"Creating complete tenant infrastructure for: {tenant_id}")
        try:
            tenant_resources_success = webhook_service.create_tenant_resources(tenant_id, plan_info)
            if not tenant_resources_success:
                raise RuntimeError(f"Tenant resources creation returned False for {tenant_id}")
            logger.info(f"✅ Tenant Kubernetes resources created successfully for: {tenant_id}")
        except Exception as e:
            error_reason = f"Failed to create tenant Kubernetes resources: {str(e)}"
            logger.error(f"❌ CRITICAL: {error_reason}")
            
            # Send notification email about failure
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                requests.post(
                    f'{EMAIL_SERVICE_URL}/send/activation-failure',
                    json={
                        'user_email': email.lower(),
                        'tenant_name': tenant_name,
                        'activation_code': code,
                        'error_reason': error_reason,
                        'platform_email': PLATFORM_EMAIL
                    },
                    timeout=10
                )
            except Exception as email_err:
                logger.error(f"Failed to send failure notification email: {email_err}")
            
            # Rollback: mark activation code as unused
            try:
                conn = webhook_service.get_db_connection()
                if conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE activation_codes 
                        SET status = 'pending', activated_at = NULL, used_count = GREATEST(used_count - 1, 0)
                        WHERE code = %s
                    """, (code,))
                    conn.commit()
                    cursor.close()
                    conn.close()
            except Exception as rollback_error:
                logger.error(f"Failed to rollback activation code: {rollback_error}")
            return jsonify({
                'error': f'Failed to create tenant infrastructure: {str(e)}',
                'reason': error_reason,
                'details': 'El proceso de creación de recursos del tenant falló. Se ha notificado al administrador.'
            }), 500
        
        # ROS2 and VPN are now OPTIONAL - not created during registration
        # They can be activated later by tenant-admin from Settings panel
        logger.info(f"ℹ️  ROS2 and VPN resources skipped during registration for tenant: {tenant_id}")
        logger.info(f"Tenant-admin can activate these services later from Settings panel")
        
        # Generate API key (optional - don't fail if it doesn't work)
        try:
            api_key = webhook_service.generate_api_key(tenant_id)
            if not api_key:
                logger.warning(f"Failed to generate API key for tenant: {tenant_id} - continuing anyway")
        except Exception as e:
            logger.warning(f"Error generating API key for tenant: {tenant_id}: {e} - continuing anyway")
        
        # Create tenant record in database (if not exists)
        conn = webhook_service.get_db_connection()
        if conn:
            try:
                tenant_record_id = webhook_service.ensure_tenant_record(
                    conn, email, plan_info['plan'], {
                        'max_users': plan_info['max_users'],
                        'max_robots': plan_info['max_robots'],
                        'max_sensors': plan_info['max_sensors']
                    }, tenant_name, 'activation_code'
                )
                if tenant_record_id:
                    logger.info(f"Tenant record ensured: {tenant_record_id}")
            except Exception as e:
                logger.error(f"Failed to ensure tenant record: {e}")
            finally:
                conn.close()
        
        # Create first farmer (owner) in database
        farmer_id = None
        try:
            conn = webhook_service.get_db_connection()
            if conn:
                cursor = conn.cursor()
                # Check if farmer already exists
                cursor.execute("SELECT id FROM farmers WHERE email = %s", (email.lower(),))
                existing_farmer = cursor.fetchone()
                
                if not existing_farmer:
                    # Create first farmer (owner) with tenant_id
                    # Note: farmers table has username, not farm_name
                    username = tenant_name.split()[0] if tenant_name else email.split('@')[0]
                    cursor.execute("""
                        INSERT INTO farmers (
                            email, username, password_hash, first_name, last_name, 
                            tenant_id, is_active, created_at
                        )
                        VALUES (
                            %s, %s, crypt(%s, gen_salt('bf')), %s, %s, %s, true, %s
                        )
                        RETURNING id
                    """, (
                        email.lower(),
                        username,
                        password,
                        tenant_name.split()[0] if tenant_name else email.split('@')[0],
                        ' '.join(tenant_name.split()[1:]) if tenant_name and len(tenant_name.split()) > 1 else '',
                        tenant_id,
                        datetime.utcnow()
                    ))
                    farmer_result = cursor.fetchone()
                    if farmer_result:
                        farmer_id = farmer_result['id']
                        conn.commit()
                        logger.info(f"Created first farmer (owner) in database: {farmer_id} for tenant: {tenant_id}")
                    else:
                        conn.rollback()
                else:
                    farmer_id = existing_farmer['id']
                    logger.info(f"Farmer already exists: {farmer_id}")
                cursor.close()
                conn.close()
        except Exception as e:
            logger.error(f"Failed to create first farmer in database: {e}")
            if conn:
                conn.rollback()
                conn.close()
        
        # Create Keycloak user (CRITICAL - this must succeed)
        # Assign TenantAdmin role to first farmer (owner)
        user_result = webhook_service.create_keycloak_user(email, tenant_id, plan_info, password, is_owner=True)
        user_success = user_result.get('success', False) if isinstance(user_result, dict) else user_result
        if not user_success:
            error_reason = f"Failed to create Keycloak user: {user_result.get('error', 'Unknown error') if isinstance(user_result, dict) else 'Unknown error'}"
            logger.error(f"Failed to create Keycloak user for tenant: {tenant_id}")
            
            # Send notification email about failure
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                requests.post(
                    f'{EMAIL_SERVICE_URL}/send/activation-failure',
                    json={
                        'user_email': email.lower(),
                        'tenant_name': tenant_name,
                        'activation_code': code,
                        'error_reason': error_reason,
                        'platform_email': PLATFORM_EMAIL
                    },
                    timeout=10
                )
            except Exception as email_err:
                logger.error(f"Failed to send failure notification email: {email_err}")
            
            return jsonify({
                'error': 'Failed to create user account',
                'reason': error_reason,
                'details': 'No se pudo crear el usuario en el sistema de autenticación. Se ha notificado al administrador.'
            }), 500
        
        # Create Grafana organization and dashboard for tenant
        grafana_success = False
        if grafana_manager:
            try:
                # Map role based on plan
                grafana_role = 'Viewer'  # Default
                if plan_info['plan'] == 'enterprise':
                    grafana_role = 'Admin'
                elif plan_info['plan'] == 'premium':
                    grafana_role = 'Editor'
                
                grafana_result = grafana_manager.setup_tenant_grafana(
                    tenant_id=tenant_id,
                    tenant_name=tenant_name,
                    user_email=email,
                    user_role=grafana_role
                )
                grafana_success = grafana_result.get('success', False)
                logger.info(f"Grafana setup for tenant {tenant_id}: {grafana_result}")
            except Exception as e:
                logger.error(f"Failed to setup Grafana for tenant {tenant_id}: {e}")
                grafana_success = False
        
        # Mark activation code as used
        code_success = webhook_service.mark_activation_code_used(plan_info['id'], tenant_id)
        if not code_success:
            logger.warning(f"Failed to mark activation code as used for tenant: {tenant_id}")
        
        # Send welcome email to user
        if user_success and api_key:
            try:
                EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
                welcome_response = requests.post(
                    f'{EMAIL_SERVICE_URL}/send/welcome',
                    json={
                        'email': email.lower(),
                        'farmer_name': tenant_name or email.split('@')[0],
                        'farm_name': tenant_name,
                        'tenant_id': tenant_id,
                        'api_key': api_key
                    },
                    timeout=10
                )
                if welcome_response.status_code == 200:
                    logger.info(f"Welcome email sent to {email}")
                else:
                    logger.warning(f"Failed to send welcome email: {welcome_response.status_code}")
            except Exception as e:
                logger.error(f"Error sending welcome email: {e}")
                # Don't fail the request if email fails, just log it
        
        # Send notification email to platform admin and tenant admin about successful registration
        try:
            EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
            requests.post(
                f'{EMAIL_SERVICE_URL}/send/activation-success',
                json={
                    'user_email': email.lower(),
                    'tenant_id': tenant_id,
                    'tenant_name': tenant_name,
                    'plan': plan_info['plan'],
                    'activation_code': code,
                    'platform_email': PLATFORM_EMAIL,
                    'tenant_admin_email': email.lower()  # El primer usuario es el admin del tenant
                },
                timeout=10
            )
        except Exception as e:
            logger.error(f"Error sending activation success notification: {e}")
            # Don't fail the request if notification email fails
        
        logger.info(f"Successfully activated tenant: {tenant_id} with code: {code}")
        
        return jsonify({
            'success': True,
            'tenant_id': tenant_id,
            'namespace': get_tenant_namespace(tenant_id),
            'api_key': api_key,
            'plan': plan_info['plan'],
            'limits': {
                'max_users': plan_info['max_users'],
                'max_robots': plan_info['max_robots'],
                'max_sensors': plan_info['max_sensors']
            },
            'expires_at': plan_info['expires_at'],
            'ros2_configured': False,  # ROS2 is now optional and activated later
            'keycloak_user_created': user_success,
            'grafana_configured': grafana_success,
            'grafana_url': GRAFANA_PUBLIC_URL if grafana_success else None
        }), 200
        
    except Exception as e:
        logger.error(f"Error activating tenant: {e}")
        return jsonify({'error': 'Failed to activate tenant'}), 500

def handle_tenant_created(tenant_id: str, payload: Dict[str, Any]) -> tuple:
    """Handle tenant creation event (legacy Keycloak direct creation)"""
    try:
        logger.info(f"Processing tenant creation for: {tenant_id}")
        
        # For direct Keycloak creation, use basic plan
        plan_info = {
            'plan': 'basic',
            'max_users': 1,
            'max_robots': 3,
            'max_sensors': 10,
            'code': 'KEYCLOAK-DIRECT'
        }
        
        # Create tenant resources
        success = webhook_service.create_tenant_resources(tenant_id, plan_info)
        if not success:
            logger.error(f"Failed to create tenant resources for: {tenant_id}")
            return jsonify({'error': 'Failed to create tenant resources'}), 500
        
        # Create ROS2 resources
        ros2_success = webhook_service.create_ros2_resources(tenant_id)
        if not ros2_success:
            logger.warning(f"Failed to create ROS2 resources for: {tenant_id}")
        
        # Generate API key
        api_key = webhook_service.generate_api_key(tenant_id)
        if not api_key:
            logger.warning(f"Failed to generate API key for: {tenant_id}")
        
        # Create Grafana organization for tenant
        grafana_success = False
        if grafana_manager:
            try:
                grafana_result = grafana_manager.setup_tenant_grafana(
                    tenant_id=tenant_id,
                    tenant_name=tenant_id.replace('tenant-', '').replace('-', ' ').title(),
                    user_email=None,  # No user email in direct Keycloak creation
                    user_role='Admin'
                )
                grafana_success = grafana_result.get('success', False)
            except Exception as e:
                logger.error(f"Failed to setup Grafana for tenant {tenant_id}: {e}")
        
        logger.info(f"Successfully processed tenant creation for: {tenant_id}")
        return jsonify({
            'message': 'Tenant created successfully',
            'tenant_id': tenant_id,
            'namespace': get_tenant_namespace(tenant_id),
            'api_key': api_key,
            'ros2_configured': ros2_success,
            'grafana_configured': grafana_success
        }), 200
        
    except Exception as e:
        logger.error(f"Error handling tenant creation for {tenant_id}: {e}")
        return jsonify({'error': 'Failed to process tenant creation'}), 500

def handle_tenant_updated(tenant_id: str, payload: Dict[str, Any]) -> tuple:
    """Handle tenant update event"""
    logger.info(f"Processing tenant update for: {tenant_id}")
    # TODO: Implement tenant update logic
    return jsonify({'message': 'Tenant update processed'}), 200

@app.route('/api/tenant/services/ros2/activate', methods=['POST'])
@require_keycloak_auth
def activate_ros2_service():
    """Activate ROS2 service for a tenant (called from Settings panel)"""
    try:
        tenant_id = g.tenant_id
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        logger.info(f"Activating ROS2 service for tenant: {tenant_id}")
        
        # Create ROS2 resources
        ros2_success = webhook_service.create_ros2_resources(tenant_id)
        
        if ros2_success:
            return jsonify({
                'success': True,
                'message': 'ROS2 service activated successfully',
                'tenant_id': tenant_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to activate ROS2 service. Please check logs and try again.',
                'tenant_id': tenant_id
            }), 500
            
    except Exception as e:
        logger.error(f"Error activating ROS2 service: {e}")
        return jsonify({'error': f'Failed to activate ROS2 service: {str(e)}'}), 500

@app.route('/api/tenant/services/ros2/status', methods=['GET'])
@require_keycloak_auth
def get_ros2_status():
    """Get ROS2 service status for a tenant"""
    try:
        tenant_id = g.tenant_id
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        namespace = get_tenant_namespace(tenant_id)
        
        # Check if ROS2 resources exist
        ros2_bridge_exists = False
        ros2_config_exists = False
        
        if webhook_service.k8s_core_v1 and webhook_service.k8s_apps_v1:
            try:
                # Check for ROS2 bridge deployment
                deployments = webhook_service.k8s_apps_v1.list_namespaced_deployment(
                    namespace=namespace,
                    label_selector=f"app=ros2-bridge,tenant-id={tenant_id}"
                )
                ros2_bridge_exists = len(deployments.items) > 0
                
                # Check for ROS2 config
                configmaps = webhook_service.k8s_core_v1.list_namespaced_config_map(
                    namespace=namespace,
                    label_selector=f"tenant-id={tenant_id},app=ros2-config"
                )
                ros2_config_exists = len(configmaps.items) > 0
            except Exception as k8s_err:
                logger.warning(f"Error checking ROS2 status: {k8s_err}")
        
        is_active = ros2_bridge_exists and ros2_config_exists
        
        return jsonify({
            'active': is_active,
            'ros2_bridge': ros2_bridge_exists,
            'ros2_config': ros2_config_exists,
            'tenant_id': tenant_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting ROS2 status: {e}")
        return jsonify({'error': f'Failed to get ROS2 status: {str(e)}'}), 500

@app.route('/api/tenant/services/vpn/activate', methods=['POST'])
@require_keycloak_auth
def activate_vpn_service():
    """Activate VPN service for a tenant (called from Settings panel)"""
    try:
        tenant_id = g.tenant_id
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        logger.info(f"Activating VPN service for tenant: {tenant_id}")
        
        namespace = get_tenant_namespace(tenant_id)
        
        # Calculate VPN IP based on tenant ID
        tenant_num = tenant_id.replace('tenant', '').replace('tenant-', '')
        try:
            tenant_num_int = int(tenant_num) if tenant_num.isdigit() else hash(tenant_id) % 100
        except:
            tenant_num_int = hash(tenant_id) % 100
        
        vpn_ip = f"10.8.0.{10 + (tenant_num_int % 240)}"  # Range 10-250
        
        # Create VPN ConfigMap for the tenant
        if webhook_service.k8s_core_v1:
            try:
                # Check if ConfigMap already exists
                try:
                    existing_configmap = webhook_service.k8s_core_v1.read_namespaced_config_map(
                        name=f'{tenant_id}-vpn-config',
                        namespace=namespace,
                        _request_timeout=K8S_API_TIMEOUT
                    )
                    logger.info(f"VPN ConfigMap already exists for tenant {tenant_id}")
                    return jsonify({
                        'success': True,
                        'message': 'VPN service is already activated for this tenant.',
                        'tenant_id': tenant_id,
                        'vpn_ip': vpn_ip,
                        'vpn_config_endpoint': '/entity-manager/api/vpn/generate-client-config'
                    }), 200
                except ApiException as e:
                    if e.status != 404:
                        raise
                
                # Create new ConfigMap
                configmap_body = k8s_client.V1ConfigMap(
                    metadata=k8s_client.V1ObjectMeta(
                        name=f'{tenant_id}-vpn-config',
                        namespace=namespace,
                        labels={
                            'tenant-id': tenant_id,
                            'app': 'vpn-config',
                            'component': 'vpn'
                        }
                    ),
                    data={
                        'tenant-id': tenant_id,
                        'vpn-ip': vpn_ip,
                        'ros-namespace': f'/{tenant_id}',
                        'mqtt-topic-prefix': f'{tenant_id}/',
                        'status': 'active',
                        'activated-at': datetime.utcnow().isoformat() + 'Z'
                    }
                )
                
                webhook_service.k8s_core_v1.create_namespaced_config_map(
                    namespace=namespace,
                    body=configmap_body,
                    _request_timeout=K8S_API_TIMEOUT
                )
                
                logger.info(f"VPN ConfigMap created successfully for tenant {tenant_id}")
                
                return jsonify({
                    'success': True,
                    'message': 'VPN service activated successfully. You can now generate client configurations.',
                    'tenant_id': tenant_id,
                    'vpn_ip': vpn_ip,
                    'vpn_config_endpoint': '/entity-manager/api/vpn/generate-client-config'
                }), 200
                
            except ApiException as k8s_err:
                logger.error(f"Kubernetes API error activating VPN: {k8s_err}")
                return jsonify({
                    'error': f'Failed to create VPN configuration: {k8s_err.reason}'
                }), 500
        else:
            # Fallback if Kubernetes client is not available
            logger.warning("Kubernetes client not available, VPN activation skipped")
            return jsonify({
                'success': True,
                'message': 'VPN service is ready. Use the VPN control panel to generate client configurations.',
                'tenant_id': tenant_id,
                'vpn_config_endpoint': '/entity-manager/api/vpn/generate-client-config',
                'warning': 'Kubernetes client not available - configuration not persisted'
            }), 200
        
    except Exception as e:
        logger.error(f"Error activating VPN service: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Failed to activate VPN service: {str(e)}'}), 500

@app.route('/api/tenant/services/vpn/status', methods=['GET'])
@require_keycloak_auth
def get_vpn_status():
    """Get VPN service status for a tenant"""
    try:
        tenant_id = g.tenant_id
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        namespace = get_tenant_namespace(tenant_id)
        
        # Check if VPN config exists
        vpn_config_exists = False
        
        if webhook_service.k8s_core_v1:
            try:
                configmaps = webhook_service.k8s_core_v1.list_namespaced_config_map(
                    namespace=namespace,
                    label_selector=f"tenant-id={tenant_id},app=vpn-config"
                )
                vpn_config_exists = len(configmaps.items) > 0
            except Exception as k8s_err:
                logger.warning(f"Error checking VPN status: {k8s_err}")
        
        # VPN server is always running (shared infrastructure)
        # This checks if tenant has VPN config and if it's active
        active = False
        vpn_ip = None
        
        if vpn_config_exists and webhook_service.k8s_core_v1:
            try:
                configmap = webhook_service.k8s_core_v1.read_namespaced_config_map(
                    name=f'{tenant_id}-vpn-config',
                    namespace=namespace,
                    _request_timeout=K8S_API_TIMEOUT
                )
                active = configmap.data.get('status') == 'active' if configmap.data else False
                vpn_ip = configmap.data.get('vpn-ip') if configmap.data else None
            except ApiException:
                pass
        
        return jsonify({
            'active': active and vpn_config_exists,
            'vpn_server_available': True,
            'tenant_config_exists': vpn_config_exists,
            'vpn_configured': vpn_config_exists,
            'tenant_id': tenant_id,
            'vpn_ip': vpn_ip
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting VPN status: {e}")
        return jsonify({'error': f'Failed to get VPN status: {str(e)}'}), 500

# =============================================================================
# Tenant User Management Endpoints
# =============================================================================

@app.route('/api/tenant/users/invite', methods=['POST'])
@require_keycloak_auth
def invite_user_to_tenant():
    """Invite a new user to the tenant (only TenantAdmin can invite)"""
    try:
        tenant_id = g.tenant_id
        user_email = g.email
        user_roles = g.roles
        
        # Check if user is TenantAdmin
        if 'TenantAdmin' not in user_roles:
            return jsonify({'error': 'Only TenantAdmin can invite users to the tenant'}), 403
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        invitee_email = data.get('email', '').lower().strip()
        role = data.get('role', 'Farmer')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        
        if not invitee_email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Validate role
        valid_roles = ['Farmer', 'DeviceManager', 'TechnicalConsultant']
        if role not in valid_roles:
            return jsonify({'error': f'Invalid role. Must be one of: {", ".join(valid_roles)}'}), 400
        
        # Check tenant limits
        conn = webhook_service.get_db_connection()
        cursor = conn.cursor()
        
        # Get tenant info
        cursor.execute("""
            SELECT max_users, plan_type FROM tenants WHERE tenant_id = %s
        """, (tenant_id,))
        tenant_info = cursor.fetchone()
        
        if not tenant_info:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Tenant not found'}), 404
        
        max_users, plan_type = tenant_info
        
        # Count current users in tenant
        cursor.execute("""
            SELECT COUNT(*) FROM farmers WHERE tenant_id = %s
        """, (tenant_id,))
        current_users = cursor.fetchone()[0]
        
        if current_users >= max_users:
            cursor.close()
            conn.close()
            return jsonify({
                'error': f'Tenant has reached maximum users limit ({max_users})',
                'current_users': current_users,
                'max_users': max_users
            }), 400
        
        # Check if user already exists in tenant
        cursor.execute("""
            SELECT id FROM farmers WHERE tenant_id = %s AND email = %s
        """, (tenant_id, invitee_email))
        existing_user = cursor.fetchone()
        
        if existing_user:
            cursor.close()
            conn.close()
            return jsonify({'error': 'User already exists in this tenant'}), 400
        
        # Check if there's already a pending invitation
        cursor.execute("""
            SELECT id FROM tenant_invitations 
            WHERE tenant_id = %s AND email = %s AND status = 'pending'
        """, (tenant_id, invitee_email))
        existing_invitation = cursor.fetchone()
        
        if existing_invitation:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Pending invitation already exists for this email'}), 400
        
        # Generate invitation code
        cursor.execute("SELECT generate_invitation_code()")
        invitation_code = cursor.fetchone()[0]
        
        # Set expiration (7 days from now)
        expires_at = datetime.utcnow() + timedelta(days=7)
        
        # Create invitation
        cursor.execute("""
            INSERT INTO tenant_invitations 
            (tenant_id, email, invitation_code, role, invited_by, status, expires_at)
            VALUES (%s, %s, %s, %s, %s, 'pending', %s)
            RETURNING id
        """, (tenant_id, invitee_email, invitation_code, role, user_email, expires_at))
        
        invitation_id = cursor.fetchone()[0]
        conn.commit()
        
        # Get inviter name from Keycloak
        inviter_name = user_email.split('@')[0]
        keycloak_user = webhook_service.find_keycloak_user_by_email(user_email)
        if keycloak_user and keycloak_user.get('success'):
            kc_first = keycloak_user.get('firstName', '')
            kc_last = keycloak_user.get('lastName', '')
            if kc_first or kc_last:
                inviter_name = f"{kc_first} {kc_last}".strip()
        
        # Send invitation email
        try:
            EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
            invitation_url = f"{FRONTEND_URL}/accept-invitation?code={invitation_code}"
            
            email_response = requests.post(
                f'{EMAIL_SERVICE_URL}/send/invitation',
                json={
                    'email': invitee_email,
                    'inviter_name': inviter_name,
                    'tenant_name': tenant_id,
                    'role': role,
                    'invitation_code': invitation_code,
                    'invitation_url': invitation_url,
                    'expires_at': expires_at.isoformat()
                },
                timeout=10
            )
            
            if email_response.status_code == 200:
                logger.info(f"Invitation email sent to {invitee_email}")
            else:
                logger.warning(f"Failed to send invitation email: {email_response.status_code}")
        except Exception as e:
            logger.error(f"Error sending invitation email: {e}")
            # Don't fail the request if email fails
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Invitation sent to {invitee_email}',
            'invitation_code': invitation_code,
            'expires_at': expires_at.isoformat()
        }), 201
        
    except Exception as e:
        logger.error(f"Error inviting user: {e}")
        return jsonify({'error': f'Failed to invite user: {str(e)}'}), 500

@app.route('/api/tenant/users', methods=['GET'])
@require_keycloak_auth
def list_tenant_users():
    """List all users in the tenant"""
    try:
        tenant_id = g.tenant_id
        
        conn = webhook_service.get_db_connection()
        cursor = conn.cursor()
        
        # Get users from farmers table
        cursor.execute("""
            SELECT id, email, first_name, last_name, is_active, created_at
            FROM farmers
            WHERE tenant_id = %s
            ORDER BY created_at DESC
        """, (tenant_id,))
        
        users = []
        for row in cursor.fetchall():
            user_id, email, first_name, last_name, is_active, created_at = row
            
            # Get user role from Keycloak
            keycloak_user = webhook_service.find_keycloak_user_by_email(email)
            roles = []
            if keycloak_user and keycloak_user.get('success'):
                # Get user roles from Keycloak
                token = webhook_service.get_keycloak_token()
                if token:
                    keycloak_url = webhook_service._get_keycloak_base_url()
                    headers = {'Authorization': f'Bearer {token}'}
                    try:
                        user_id_kc = keycloak_user.get('user_id')
                        roles_response = requests.get(
                            f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id_kc}/role-mappings/realm",
                            headers=headers,
                            timeout=10
                        )
                        if roles_response.status_code == 200:
                            roles_data = roles_response.json()
                            roles = [r.get('name') for r in roles_data.get('mappings', [])]
                    except Exception as e:
                        logger.warning(f"Error getting roles for {email}: {e}")
            
            users.append({
                'id': str(user_id),
                'email': email,
                'first_name': first_name or '',
                'last_name': last_name or '',
                'is_active': is_active,
                'roles': roles,
                'created_at': created_at.isoformat() if created_at else None
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'users': users,
            'total': len(users)
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({'error': f'Failed to list users: {str(e)}'}), 500

@app.route('/api/tenant/users/accept-invitation', methods=['POST'])
def accept_invitation():
    """Accept an invitation and create user account"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        invitation_code = data.get('code', '').strip().upper()
        password = data.get('password', '')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        
        if not invitation_code:
            return jsonify({'error': 'Invitation code is required'}), 400
        
        if not password or len(password) < 8:
            return jsonify({'error': 'Password is required and must be at least 8 characters'}), 400
        
        conn = webhook_service.get_db_connection()
        cursor = conn.cursor()
        
        # Get invitation
        cursor.execute("""
            SELECT id, tenant_id, email, role, invited_by, status, expires_at
            FROM tenant_invitations
            WHERE invitation_code = %s
        """, (invitation_code,))
        
        invitation = cursor.fetchone()
        
        if not invitation:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Invalid invitation code'}), 404
        
        inv_id, tenant_id, email, role, invited_by, status, expires_at = invitation
        
        # Check status
        if status != 'pending':
            cursor.close()
            conn.close()
            return jsonify({'error': f'Invitation is {status}'}), 400
        
        # Check expiration
        if expires_at and expires_at < datetime.utcnow():
            cursor.execute("""
                UPDATE tenant_invitations SET status = 'expired' WHERE id = %s
            """, (inv_id,))
            conn.commit()
            cursor.close()
            conn.close()
            return jsonify({'error': 'Invitation has expired'}), 400
        
        # Check if user already exists
        cursor.execute("""
            SELECT id FROM farmers WHERE email = %s
        """, (email,))
        existing_user = cursor.fetchone()
        
        if existing_user:
            cursor.close()
            conn.close()
            return jsonify({'error': 'User already exists'}), 400
        
        # Get tenant info
        cursor.execute("""
            SELECT tenant_name, plan_type, max_users FROM tenants WHERE tenant_id = %s
        """, (tenant_id,))
        tenant_info = cursor.fetchone()
        
        if not tenant_info:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Tenant not found'}), 404
        
        tenant_name, plan_type, max_users = tenant_info
        
        # Check tenant limits
        cursor.execute("""
            SELECT COUNT(*) FROM farmers WHERE tenant_id = %s
        """, (tenant_id,))
        current_users = cursor.fetchone()[0]
        
        if current_users >= max_users:
            cursor.close()
            conn.close()
            return jsonify({
                'error': f'Tenant has reached maximum users limit ({max_users})'
            }), 400
        
        # Create user in farmers table
        import bcrypt
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        cursor.execute("""
            INSERT INTO farmers (tenant_id, email, password_hash, first_name, last_name, is_active, is_verified)
            VALUES (%s, %s, %s, %s, %s, true, true)
            RETURNING id
        """, (tenant_id, email, password_hash, first_name, last_name))
        
        farmer_id = cursor.fetchone()[0]
        
        # Create user in Keycloak
        plan_info = {
            'plan': plan_type,
            'max_users': max_users,
            'max_robots': 3,
            'max_sensors': 10
        }
        
        keycloak_result = webhook_service.create_keycloak_user(
            email=email,
            tenant_id=tenant_id,
            plan_info=plan_info,
            password=password,
            is_owner=False
        )
        
        if not keycloak_result.get('success'):
            cursor.rollback()
            cursor.close()
            conn.close()
            return jsonify({'error': f"Failed to create Keycloak user: {keycloak_result.get('error')}"}), 500
        
        # Assign role to user
        user_id_kc = keycloak_result.get('user_id')
        if user_id_kc:
            webhook_service._assign_role_to_user(
                {'Authorization': f'Bearer {webhook_service.get_keycloak_token()}'},
                user_id_kc,
                role
            )
        
        # Mark invitation as accepted
        cursor.execute("""
            UPDATE tenant_invitations 
            SET status = 'accepted', accepted_at = %s
            WHERE id = %s
        """, (datetime.utcnow(), inv_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"User {email} accepted invitation and joined tenant {tenant_id}")
        
        return jsonify({
            'success': True,
            'message': 'Account created successfully',
            'tenant_id': tenant_id,
            'email': email
        }), 201
        
    except Exception as e:
        logger.error(f"Error accepting invitation: {e}")
        return jsonify({'error': f'Failed to accept invitation: {str(e)}'}), 500

@app.route('/api/tenant/users/<user_id>', methods=['DELETE'])
@require_keycloak_auth
def delete_tenant_user(user_id: str):
    """Delete a user from the tenant (only TenantAdmin)"""
    try:
        tenant_id = g.tenant_id
        user_roles = g.roles
        
        # Check if user is TenantAdmin
        if 'TenantAdmin' not in user_roles:
            return jsonify({'error': 'Only TenantAdmin can delete users'}), 403
        
        conn = webhook_service.get_db_connection()
        cursor = conn.cursor()
        
        # Get user info
        cursor.execute("""
            SELECT id, email FROM farmers WHERE id = %s AND tenant_id = %s
        """, (user_id, tenant_id))
        
        user_info = cursor.fetchone()
        
        if not user_info:
            cursor.close()
            conn.close()
            return jsonify({'error': 'User not found in tenant'}), 404
        
        farmer_id, email = user_info
        
        # Don't allow deleting yourself
        if email.lower() == g.email.lower():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Cannot delete your own account'}), 400
        
        # Delete from Keycloak
        keycloak_user = webhook_service.find_keycloak_user_by_email(email)
        if keycloak_user and keycloak_user.get('success'):
            token = webhook_service.get_keycloak_token()
            if token:
                keycloak_url = webhook_service._get_keycloak_base_url()
                headers = {'Authorization': f'Bearer {token}'}
                try:
                    user_id_kc = keycloak_user.get('user_id')
                    delete_response = requests.delete(
                        f"{keycloak_url}/admin/realms/{KEYCLOAK_REALM}/users/{user_id_kc}",
                        headers=headers,
                        timeout=10
                    )
                    if delete_response.status_code in [200, 204]:
                        logger.info(f"Deleted user {email} from Keycloak")
                except Exception as e:
                    logger.warning(f"Error deleting user from Keycloak: {e}")
        
        # Delete from farmers table
        cursor.execute("DELETE FROM farmers WHERE id = %s", (farmer_id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        logger.info(f"User {email} deleted from tenant {tenant_id}")
        
        return jsonify({
            'success': True,
            'message': f'User {email} deleted from tenant'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        return jsonify({'error': f'Failed to delete user: {str(e)}'}), 500

def handle_tenant_deleted(tenant_id: str, payload: Dict[str, Any]) -> tuple:
    """Handle tenant deletion event"""
    try:
        logger.info(f"Processing tenant deletion for: {tenant_id}")
        
        # Clean up tenant resources
        cleanup_script = f"/app/scripts/cleanup-tenant-{tenant_id}.sh"
        if os.path.exists(cleanup_script):
            result = subprocess.run(
                [cleanup_script],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully cleaned up tenant: {tenant_id}")
            else:
                logger.error(f"Failed to cleanup tenant {tenant_id}: {result.stderr}")
        
        return jsonify({'message': 'Tenant deletion processed'}), 200
        
    except Exception as e:
        logger.error(f"Error handling tenant deletion for {tenant_id}: {e}")
        return jsonify({'error': 'Failed to process tenant deletion'}), 500

if __name__ == '__main__':
    logger.info("Starting Enhanced Tenant Webhook Service")
    logger.info(f"Keycloak URL: {KEYCLOAK_URL}")
    logger.info(f"Keycloak Realm: {KEYCLOAK_REALM}")
    logger.info(f"WooCommerce Integration: {'Enabled' if WOOCOMMERCE_WEBHOOK_SECRET else 'Disabled'}")
    
    # Run the Flask app
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 8080)),
        debug=os.getenv('DEBUG', 'false').lower() == 'true'
    )
