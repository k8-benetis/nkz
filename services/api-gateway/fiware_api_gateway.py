#!/usr/bin/env python3
# =============================================================================
# FIWARE API Gateway - NGSI-LD Production Service
# =============================================================================

import os
import json
import logging
import sys
from flask import Flask, request, jsonify, make_response
from flask_cors import cross_origin
import jwt
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import time
from collections import defaultdict, deque

# Configure logging FIRST
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS configuration
_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = {o.strip() for o in _cors_env.split(",") if o.strip()}
_cors_origins = list(ALLOWED_ORIGINS)

# Add common directory to path for keycloak_auth and tenant_utils
# Try both relative path (for local dev) and absolute path (for Docker)
common_paths = [os.path.join(os.path.dirname(__file__), "..", "common"), "/common"]
for path in common_paths:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

# Import Keycloak authentication
try:
    from keycloak_auth import (
        validate_keycloak_token,
        TokenValidationError,
        extract_tenant_id,
        generate_hmac_signature,
        get_request_token,
    )

    KEYCLOAK_AUTH_AVAILABLE = True
except ImportError as e:
    logger.error(f"Failed to import keycloak_auth: {e}")
    logger.warning("Falling back to old JWT_SECRET validation")
    KEYCLOAK_AUTH_AVAILABLE = False

    def get_request_token():
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return auth_header.split(" ")[1]
        return request.cookies.get("nkz_token")


try:
    from gateway_pat import (
        is_pat_token,
        obtain_gateway_service_jwt,
        resolve_pat_tenant_id,
    )
except ImportError:
    is_pat_token = lambda t: False  # noqa: E731

    def obtain_gateway_service_jwt():
        return None

    def resolve_pat_tenant_id(raw, base):
        return None


app = Flask(__name__)
# CORS: Handled by Traefik Middleware at infrastructure level

# Configuration - All environment variables are REQUIRED for security
POSTGRES_URL = os.getenv("POSTGRES_URL")
JWT_SECRET = os.getenv("JWT_SECRET")  # Deprecated, kept for fallback
ORION_URL = os.getenv("ORION_URL")
if not ORION_URL:
    raise ValueError("ORION_URL environment variable is required")

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL")
if not KEYCLOAK_URL:
    raise ValueError("KEYCLOAK_URL environment variable is required")

CONTEXT_URL = os.getenv("CONTEXT_URL")
if not CONTEXT_URL:
    raise ValueError("CONTEXT_URL environment variable is required")

GEOSERVER_URL = os.getenv("GEOSERVER_URL", "http://geoserver-service:8080")
TENANT_WEBHOOK_URL = os.getenv("TENANT_WEBHOOK_URL", "http://tenant-webhook:8080")
ENTITY_MANAGER_URL = os.getenv("ENTITY_MANAGER_URL", "http://entity-manager:5000")
NDVI_SERVICE_URL = os.getenv("NDVI_SERVICE_URL", "http://entity-manager:5000")
TENANT_USER_API_URL = os.getenv("TENANT_USER_API_URL", "http://tenant-user-api:5000")
CADASTRAL_API_URL = os.getenv("CADASTRAL_API_URL", "http://cadastral-api-service:5000")
SDM_INTEGRATION_URL = os.getenv(
    "SDM_INTEGRATION_URL", "http://sdm-integration-service:5000"
)
VEGETATION_API_URL = os.getenv(
    "VEGETATION_API_URL", "http://vegetation-prime-api-service:8000"
)
WEATHER_API_URL = os.getenv("WEATHER_API_URL", "http://entity-manager-service:5000")
INTELLIGENCE_API_URL = os.getenv(
    "INTELLIGENCE_API_URL", "http://intelligence-api-service:8000"
)
AGRIENERGY_API_URL = os.getenv(
    "AGRIENERGY_API_URL", "http://agrienergy-api-service:8000"
)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
REQUESTS_PER_MINUTE = int(
    os.getenv("REQUESTS_PER_MINUTE", "120")
)  # Default: 60 req/min per tenant
ALLOW_JWT_FALLBACK = os.getenv("ALLOW_JWT_FALLBACK", "false").lower() == "true"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", ".robotika.cloud")

# CORS whitelist — configured via CORS_ORIGINS env var (comma-separated)
_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = {o.strip() for o in _cors_env.split(",") if o.strip()}

# Set logging level
logging.getLogger().setLevel(getattr(logging, LOG_LEVEL))

# Rate limiting simple por tenant (ventana deslizante en memoria)
tenant_requests = defaultdict(deque)


@app.before_request
def reject_pat_outside_timeseries():
    """ADR 003: PAT (nkz_pat_) is valid only under /api/timeseries (QA case 3)."""
    if request.method == "OPTIONS":
        return None
    p = request.path or ""
    if p.startswith("/api/timeseries"):
        return None
    if p == "/health" or p.startswith("/health"):
        return None
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    tok = auth[7:].strip()
    if tok.startswith("nkz_pat_"):
        return jsonify({"error": "PAT allowed only on /api/timeseries"}), 401
    return None


def rate_limit(tenant: str) -> bool:
    """Devuelve True si permitido, False si excede el límite."""
    if REQUESTS_PER_MINUTE <= 0:
        return True
    now = time.time()
    window_start = now - 60
    q = tenant_requests[tenant]
    # limpiar ventana
    while q and q[0] < window_start:
        q.popleft()
    if len(q) >= REQUESTS_PER_MINUTE:
        return False
    q.append(now)
    return True


def get_cors_origin():
    """Return the validated CORS origin or None if not allowed"""
    origin = request.headers.get("Origin")
    if origin and origin in ALLOWED_ORIGINS:
        return origin
    return None


def set_cors_headers(response, origin=None):
    """Set CORS headers on a response if origin is allowed"""
    cors_origin = origin or get_cors_origin()
    if cors_origin:
        response.headers["Access-Control-Allow-Origin"] = cors_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-ID, Cookie"
        )
        response.headers["Vary"] = "Origin"
    return response


@app.after_request
def add_security_headers(response):
    """Add security + CORS headers to all responses"""
    set_cors_headers(response)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; frame-ancestors 'none'"
    )
    response.headers.pop("Server", None)
    return response


def validate_jwt_token(token):
    """Validate JWT token - uses Keycloak if available, falls back to JWT_SECRET"""
    if KEYCLOAK_AUTH_AVAILABLE:
        try:
            payload = validate_keycloak_token(token)
            return payload
        except TokenValidationError as e:
            logger.warning(f"Keycloak validation failed: {e}")
            if not ALLOW_JWT_FALLBACK:
                logger.error(
                    f"Keycloak validation failed and JWT fallback disabled: {e}"
                )
                return None
        except Exception as e:
            logger.error(f"Unexpected error in keycloak validation: {e}")

    # Fallback to old JWT_SECRET validation
    if not JWT_SECRET:
        logger.error("No JWT_SECRET available for fallback")
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        logger.warning("Using deprecated JWT_SECRET validation (should use Keycloak)")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token (fallback): {e}")
        return None


def inject_fiware_headers(headers, tenant=None):
    """Inject FIWARE service headers for NGSI-LD"""
    if tenant:
        # Normalize tenant ID using common utility function
        # This ensures consistency across all services (PostgreSQL, MongoDB, etc.)
        try:
            # Try importing from common module (works when /common is in sys.path)
            from tenant_utils import normalize_tenant_id

            normalized_tenant = normalize_tenant_id(tenant)
            headers["NGSILD-Tenant"] = normalized_tenant
            headers["Fiware-Service"] = (
                normalized_tenant  # Legacy, remove after 2026-04-02
            )
        except (ImportError, ValueError) as e:
            # Fallback to old behavior if import fails, but log warning
            logger.warning(
                f"Failed to normalize tenant ID '{tenant}': {e}. Using fallback normalization."
            )
            sanitized_tenant = tenant.lower().replace("-", "_").replace(" ", "_")
            # Remove any remaining invalid characters
            import re

            sanitized_tenant = re.sub(r"[^a-z0-9_]", "", sanitized_tenant)
            headers["NGSILD-Tenant"] = sanitized_tenant
            headers["Fiware-Service"] = (
                sanitized_tenant  # Legacy, remove after 2026-04-02
            )

    # NGSI-LD specific headers
    # Check if payload has @context (only for POST/PUT/PATCH with JSON body)
    has_context_in_body = False
    if request.is_json and request.json and "@context" in request.json:
        has_context_in_body = True

    if has_context_in_body:
        # If context is in body, Content-Type MUST be application/ld+json and Link header MUST NOT be present
        headers["Content-Type"] = "application/ld+json"
        # Do not add Link header
    else:
        # If context is NOT in body, use Link header and application/json
        headers["Content-Type"] = "application/json"
        headers["Link"] = (
            f'<{CONTEXT_URL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
        )

    headers["Accept"] = "application/ld+json"

    return headers


@app.route("/api/auth/session", methods=["POST", "OPTIONS"])
def create_session():
    """Set httpOnly cookie with JWT token (BFF session endpoint)"""
    if request.method == "OPTIONS":
        resp = make_response("", 204)
        return set_cors_headers(resp)

    data = request.get_json(silent=True)
    if not data or not data.get("token"):
        return jsonify({"error": "Missing token in request body"}), 400

    token = data["token"]

    # STRICT VALIDATION: Restore JWKS signature and issuer check
    payload = validate_jwt_token(token)
    if not payload:
        logger.warning("Session creation failed: Invalid or expired token")
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract expiration for cookie max_age
    exp = payload.get("exp")
    max_age = max(int(exp - time.time()), 0) if exp else 3600

    resp = make_response(jsonify({"ok": True}))
    resp.set_cookie(
        "nkz_token",
        token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "true").lower() == "true",
        samesite="Strict",  # Standard SOTA for BFF session cookies
        domain=COOKIE_DOMAIN or None,
        path="/",
        max_age=max_age,
    )
    return set_cors_headers(resp)


@app.route("/api/auth/session", methods=["DELETE"])
def delete_session():
    """Clear httpOnly session cookie"""
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("nkz_token", domain=COOKIE_DOMAIN or None, path="/")
    return set_cors_headers(resp)


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify(
        {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "service": "fiware-api-gateway",
        }
    )


@app.route(
    "/ngsi-ld/v1/entities/<path:entity_id>", methods=["GET", "PUT", "PATCH", "DELETE"]
)
def entity_by_id(entity_id):
    """Proxy to Orion-LD Context Broker for individual entity operations"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant from JWT payload
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Rate limit por tenant
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Role based access control (Read-Only fallback)
    has_pro_expired = has_role("role_pro_expired", payload)
    if has_pro_expired and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        logger.warning(
            f"Blocked mutation request to {request.path} for user with role_pro_expired"
        )
        return jsonify({"error": "Subscription expired. Read-only mode active."}), 403

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)
    headers["X-Tenant-ID"] = tenant
    signature = generate_hmac_signature(token, tenant)
    if signature:
        headers["X-Auth-Signature"] = signature

    # Forward request to Orion-LD
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
        if request.method == "GET":
            response = requests.get(orion_url, headers=headers, params=request.args)
        elif request.method == "PUT":
            response = requests.put(orion_url, headers=headers, json=request.json)
        elif request.method == "PATCH":
            response = requests.patch(orion_url, headers=headers, json=request.json)
        elif request.method == "DELETE":
            response = requests.delete(orion_url, headers=headers)

        if response.status_code >= 400:
            logger.error(
                f"Orion-LD error {response.status_code} for entity {entity_id}: {response.text}"
            )

        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Error forwarding request to Orion-LD for entity {entity_id}: {e}"
        )
        return jsonify({"error": "Internal server error"}), 500


@app.route("/ngsi-ld/v1/entities", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def entities():
    """Proxy to Orion-LD Context Broker entities endpoint"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant from JWT payload - support multiple claim names
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401
    # Rate limit por tenant
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Role based access control (Read-Only fallback)
    has_pro_expired = has_role("role_pro_expired", payload)
    if has_pro_expired and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        logger.warning(
            f"Blocked mutation request to {request.path} for user with role_pro_expired"
        )
        return jsonify({"error": "Subscription expired. Read-only mode active."}), 403

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)
    headers["X-Tenant-ID"] = tenant
    signature = generate_hmac_signature(token, tenant)
    if signature:
        headers["X-Auth-Signature"] = signature

    # Forward request to Orion-LD
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        if request.method == "GET":
            response = requests.get(orion_url, headers=headers, params=request.args)
        elif request.method == "POST":
            response = requests.post(orion_url, headers=headers, json=request.json)
        elif request.method == "PUT":
            response = requests.put(orion_url, headers=headers, json=request.json)
        elif request.method == "PATCH":
            response = requests.patch(orion_url, headers=headers, json=request.json)
        elif request.method == "DELETE":
            response = requests.delete(orion_url, headers=headers)

        if response.status_code >= 400:
            logger.error(f"Orion-LD error {response.status_code}: {response.text}")

        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to Orion-LD: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route(
    "/ngsi-ld/v1/subscriptions", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
def subscriptions():
    """Proxy to Orion-LD Context Broker subscriptions endpoint"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant from JWT payload - support multiple claim names
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401
    # Rate limit por tenant
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Role based access control (Read-Only fallback)
    has_pro_expired = has_role("role_pro_expired", payload)
    if has_pro_expired and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        logger.warning(
            f"Blocked mutation request to {request.path} for user with role_pro_expired"
        )
        return jsonify({"error": "Subscription expired. Read-only mode active."}), 403

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)
    headers["X-Tenant-ID"] = tenant
    signature = generate_hmac_signature(token, tenant)
    if signature:
        headers["X-Auth-Signature"] = signature

    # Forward request to Orion-LD
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/subscriptions"
        if request.method == "GET":
            response = requests.get(orion_url, headers=headers, params=request.args)
        elif request.method == "POST":
            response = requests.post(orion_url, headers=headers, json=request.json)
        elif request.method == "PUT":
            response = requests.put(orion_url, headers=headers, json=request.json)
        elif request.method == "PATCH":
            response = requests.patch(orion_url, headers=headers, json=request.json)
        elif request.method == "DELETE":
            response = requests.delete(orion_url, headers=headers)

        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to Orion-LD: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/devices/stats", methods=["GET"])
def get_device_stats():
    """Get device statistics (AgriculturalRobot count)"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)

    # Query Orion for AgriculturalRobot count
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {"type": "AgriculturalRobot", "limit": 1, "count": "true"}

        response = requests.get(orion_url, headers=headers, params=params, timeout=10)

        count = 0
        if response.status_code == 200:
            # Check Ngsild-Results-Count header
            count_header = response.headers.get(
                "Ngsild-Results-Count"
            ) or response.headers.get("Content-Range")
            if count_header:
                if "/" in count_header:
                    count = int(count_header.split("/")[-1])
                else:
                    count = int(count_header)

        # AdminPanel expects 'active' for devices
        return jsonify({"active": count}), 200

    except Exception as e:
        logger.error(f"Error getting device stats: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/sensors/stats", methods=["GET"])
def get_sensor_stats():
    """Get sensor statistics (AgriSensor count)"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)

    # Query Orion for AgriSensor count
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {"type": "AgriSensor", "limit": 1, "count": "true"}

        response = requests.get(orion_url, headers=headers, params=params, timeout=10)

        count = 0
        if response.status_code == 200:
            count_header = response.headers.get(
                "Ngsild-Results-Count"
            ) or response.headers.get("Content-Range")
            if count_header:
                if "/" in count_header:
                    count = int(count_header.split("/")[-1])
                else:
                    count = int(count_header)

        return jsonify({"total": count}), 200

    except Exception as e:
        logger.error(f"Error getting sensor stats: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/sensors", methods=["GET"])
def get_sensors():
    """Proxy to Orion-LD for AgriSensor entities (Legacy API support)"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant from JWT payload
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)
    headers["X-Tenant-ID"] = tenant

    # Forward request to Orion-LD
    try:
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities"
        params = {"type": "AgriSensor"}
        # Merge with existing query params
        params.update(request.args)

        response = requests.get(orion_url, headers=headers, params=params)

        if response.status_code >= 400:
            logger.error(f"Orion-LD error {response.status_code}: {response.text}")

        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to Orion-LD: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/devices/<path:device_id>/telemetry/latest", methods=["GET"])
def get_device_latest_telemetry(device_id):
    """Get latest telemetry for a device (Proxy to Orion-LD)"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Rate limit
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Prepare headers for Orion-LD
    headers = {}
    headers = inject_fiware_headers(headers, tenant)
    headers["X-Tenant-ID"] = tenant

    # Forward request to Orion-LD (keyValues mode for simple JSON)
    try:
        # Handle URNs properly (pass through as is)
        orion_url = f"{ORION_URL}/ngsi-ld/v1/entities/{device_id}"
        params = {"options": "keyValues"}

        response = requests.get(orion_url, headers=headers, params=params, timeout=10)

        if response.status_code >= 400:
            logger.error(f"Orion-LD error {response.status_code}: {response.text}")

        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to Orion-LD: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/timeseries/<path:path>", methods=["GET", "POST"])
def timeseries_proxy(path):
    """Proxy to Timeseries Reader Service (GET for data/align, POST for export)."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401

    # ADR 003: PAT only on this route; strip any client-supplied delegation header (do not forward).
    if is_pat_token(token):
        delegated_raw = resolve_pat_tenant_id(token, TENANT_WEBHOOK_URL)
        if not delegated_raw:
            return jsonify({"error": "Invalid or expired token"}), 401
        try:
            from tenant_utils import normalize_tenant_id

            tenant = normalize_tenant_id(delegated_raw)
        except (ImportError, ValueError):
            tenant = delegated_raw
        if not rate_limit(tenant):
            return jsonify({"error": "Rate limit exceeded"}), 429
        gw_jwt = obtain_gateway_service_jwt()
        if not gw_jwt:
            return jsonify({"error": "Service authentication not configured"}), 503
        headers = {
            "Authorization": f"Bearer {gw_jwt}",
            "X-Delegated-Tenant-ID": tenant,
            "NGSILD-Tenant": tenant,
            "Fiware-Service": tenant,
            "X-Tenant-ID": tenant,
        }
        if request.method == "POST" and request.is_json:
            headers["Content-Type"] = "application/json"
    else:
        payload = validate_jwt_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        tenant = extract_tenant_id(payload)
        if not tenant:
            return jsonify({"error": "Tenant not present in token"}), 401

        headers = {
            "Authorization": f"Bearer {token}",
            "NGSILD-Tenant": tenant,
            "Fiware-Service": tenant,
            "X-Tenant-ID": tenant,
        }
        if request.method == "POST" and request.is_json:
            headers["Content-Type"] = "application/json"

        has_pro_expired = has_role("role_pro_expired", payload)
        if has_pro_expired and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            logger.warning(
                f"Blocked mutation request to {path} for user with role_pro_expired"
            )
            return jsonify(
                {"error": "Subscription expired. Read-only mode active."}
            ), 403

    # Forward request
    try:
        service_url = f"http://timeseries-reader-service:5000/api/timeseries/{path}"
        if request.method == "GET":
            response = requests.get(
                service_url, headers=headers, params=request.args, timeout=60
            )
        else:
            response = requests.post(
                service_url,
                headers=headers,
                params=request.args,
                json=request.get_json(silent=True) or {},
                timeout=120,
            )
        return make_response(
            response.content, response.status_code, dict(response.headers)
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to timeseries-reader: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/gis/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def geoserver_proxy(path):
    """Proxy to GeoServer with JWT validation and tenant isolation"""
    # Validate JWT token
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant from JWT payload
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    # Rate limit por tenant
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Prepare GeoServer URL
    # Remove /api/gis prefix from path and forward to GeoServer
    geoserver_path = (
        path if not path.startswith("api/gis/") else path.replace("api/gis/", "", 1)
    )

    # Build full GeoServer URL
    geoserver_url = f"{GEOSERVER_URL}/{geoserver_path}"

    # Add tenant_id as parameter for GeoServer filtering
    # GeoServer can use this to filter data by tenant
    params = dict(request.args)
    params["viewparams"] = f"tid:{tenant}"  # Add tenant_id as view parameter

    # Prepare headers for GeoServer
    headers = {
        "X-Tenant-ID": tenant,
        "Content-Type": request.headers.get("Content-Type", "application/json"),
    }

    # Forward request to GeoServer
    try:
        if request.method == "GET":
            response = requests.get(
                geoserver_url, headers=headers, params=params, timeout=30
            )
        elif request.method == "POST":
            response = requests.post(
                geoserver_url,
                headers=headers,
                params=params,
                json=request.json if request.is_json else None,
                data=request.data if not request.is_json else None,
                timeout=30,
            )
        elif request.method == "PUT":
            response = requests.put(
                geoserver_url,
                headers=headers,
                params=params,
                json=request.json if request.is_json else None,
                data=request.data if not request.is_json else None,
                timeout=30,
            )
        elif request.method == "PATCH":
            response = requests.patch(
                geoserver_url,
                headers=headers,
                params=params,
                json=request.json if request.is_json else None,
                data=request.data if not request.is_json else None,
                timeout=30,
            )
        elif request.method == "DELETE":
            response = requests.delete(
                geoserver_url, headers=headers, params=params, timeout=30
            )

        # Forward response from GeoServer
        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.Timeout:
        logger.error(f"Timeout forwarding request to GeoServer: {geoserver_url}")
        return jsonify({"error": "GeoServer request timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding request to GeoServer: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/ngsi-ld-context.json", methods=["GET"])
def get_context():
    """Serve NGSI-LD context file"""
    try:
        # Context file is copied to /config/ngsi-ld-context.json in Dockerfile
        context_file = "/config/ngsi-ld-context.json"
        with open(context_file, "r") as f:
            context = json.load(f)
        return jsonify(context)
    except Exception as e:
        logger.error(f"Error loading context file: {e}")
        return jsonify({"error": "Context file not found"}), 404


@app.route("/api/core/basemap/package", methods=["POST"])
def request_offline_basemap():
    """Enqueue a job to generate a PMTiles offline map package"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.json
    parcel_id = data.get("parcel_id")
    bbox = data.get("bbox")
    max_zoom = data.get("max_zoom", 18)

    if not parcel_id or not bbox or len(bbox) != 4:
        return jsonify({"error": "Missing or invalid parcel_id or bbox"}), 400

    try:
        # Import task queue dynamically to avoid coupling problems
        import importlib.util

        task_queue_file = "/app/task-queue/task_queue.py"
        if os.path.exists(task_queue_file):
            spec = importlib.util.spec_from_file_location("task_queue", task_queue_file)
            task_queue_module = importlib.util.module_from_spec(spec)
            sys.modules["task_queue"] = task_queue_module
            spec.loader.exec_module(task_queue_module)
            TaskQueue = task_queue_module.TaskQueue
            pmtiles_queue = TaskQueue(stream_name="pmtiles:requests")

            task_id = pmtiles_queue.enqueue_task(
                tenant_id=tenant,
                task_type="pmtiles_generation",
                payload={
                    "tenant_id": tenant,
                    "parcel_id": parcel_id,
                    "bbox": bbox,
                    "max_zoom": max_zoom,
                },
                max_retries=1,
            )
            return jsonify(
                {"message": "Packaging task enqueued", "task_id": task_id}
            ), 202
        else:
            logger.error("Task Queue module not found")
            return jsonify({"error": "Task Queue module not found in API Gateway"}), 500

    except Exception as e:
        logger.error(f"Failed to enqueue PMTiles task: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/version", methods=["GET"])
def version():
    """Get service version"""
    return jsonify(
        {
            "service": "fiware-api-gateway",
            "version": "1.0.0",
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


# =============================================================================
# External API Credentials Management Endpoints (PlatformAdmin only)
# =============================================================================


def has_role(role: str, payload: dict = None) -> bool:
    """Check if user has a specific role - checks multiple locations"""
    if not payload:
        return False
    # Check realm_access first
    roles = payload.get("realm_access", {}).get("roles", []) or []
    # Also check resource_access
    resource_roles = []
    for resource in payload.get("resource_access", {}).values():
        if isinstance(resource, dict) and "roles" in resource:
            resource_roles.extend(resource["roles"])
    # Also check root level
    all_roles = list(set(roles + resource_roles + payload.get("roles", [])))
    return role in all_roles


@app.route("/admin/external-api-credentials", methods=["GET"])
def list_external_api_credentials():
    """List all external API credentials (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        # Use global POSTGRES_URL
        if not POSTGRES_URL:
            return jsonify({"error": "POSTGRES_URL not configured"}), 500

        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("""
            SELECT 
                id,
                service_name,
                service_url,
                auth_type,
                username,
                description,
                is_active,
                created_at,
                updated_at,
                last_used_at,
                last_used_by
            FROM external_api_credentials
            ORDER BY service_name
        """)

        credentials = cur.fetchall()
        cur.close()
        conn.close()

        return jsonify({"credentials": [dict(c) for c in credentials]}), 200

    except Exception as e:
        logger.error(f"Error listing credentials: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/admin/external-api-credentials", methods=["POST"])
def create_external_api_credential():
    """Create new external API credential (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        import hashlib

        data = request.json
        # Use global POSTGRES_URL
        if not POSTGRES_URL:
            return jsonify({"error": "POSTGRES_URL not configured"}), 500

        # Validate required fields
        required = ["service_name", "service_url", "auth_type"]
        for field in required:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # Validate auth_type
        if data["auth_type"] not in ["api_key", "bearer", "basic_auth", "none"]:
            return jsonify({"error": "Invalid auth_type"}), 400

        # Encrypt credentials
        def encrypt_credential(plain_text: str) -> str:
            salt = os.getenv(
                "CREDENTIAL_ENCRYPTION_SALT", "default-salt-change-in-production"
            )
            return hashlib.sha256((plain_text + salt).encode()).hexdigest()

        password_encrypted = None
        api_key_encrypted = None

        if data["auth_type"] == "basic_auth":
            if "username" not in data or not data["username"]:
                return jsonify({"error": "Username required for basic_auth"}), 400
            if "password" not in data or not data["password"]:
                return jsonify({"error": "Password required for basic_auth"}), 400
            password_encrypted = encrypt_credential(data["password"])
        elif data["auth_type"] in ["api_key", "bearer"]:
            if "api_key" not in data or not data["api_key"]:
                return jsonify({"error": "API key required"}), 400
            api_key_encrypted = encrypt_credential(data["api_key"])

        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        user_email = payload.get("email") or payload.get(
            "preferred_username", "unknown"
        )

        cur.execute(
            """
            INSERT INTO external_api_credentials (
                service_name,
                service_url,
                auth_type,
                username,
                password_encrypted,
                api_key_encrypted,
                additional_params,
                description,
                is_active,
                created_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """,
            (
                data["service_name"],
                data["service_url"],
                data["auth_type"],
                data.get("username"),
                password_encrypted,
                api_key_encrypted,
                json.dumps(data.get("additional_params", {})),
                data.get("description"),
                data.get("is_active", True),
                user_email,
            ),
        )

        credential_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()

        logger.info(f"Created external API credential: {data['service_name']}")
        return jsonify(
            {"id": credential_id, "message": "Credential created successfully"}
        ), 201

    except psycopg2.IntegrityError:
        return jsonify({"error": "Service name already exists"}), 409
    except Exception as e:
        logger.error(f"Error creating credential: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/admin/external-api-credentials/<credential_id>", methods=["PUT"])
def update_external_api_credential(credential_id):
    """Update external API credential (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        import hashlib

        data = request.json
        # Use global POSTGRES_URL
        if not POSTGRES_URL:
            return jsonify({"error": "POSTGRES_URL not configured"}), 500

        def encrypt_credential(plain_text: str) -> str:
            salt = os.getenv(
                "CREDENTIAL_ENCRYPTION_SALT", "default-salt-change-in-production"
            )
            return hashlib.sha256((plain_text + salt).encode()).hexdigest()

        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Build update query
        updates = []
        values = []

        if "service_url" in data:
            updates.append("service_url = %s")
            values.append(data["service_url"])

        if "auth_type" in data:
            if data["auth_type"] not in ["api_key", "bearer", "basic_auth", "none"]:
                return jsonify({"error": "Invalid auth_type"}), 400
            updates.append("auth_type = %s")
            values.append(data["auth_type"])

        if "username" in data:
            updates.append("username = %s")
            values.append(data["username"])

        if "password" in data and data["password"]:
            updates.append("password_encrypted = %s")
            values.append(encrypt_credential(data["password"]))

        if "api_key" in data and data["api_key"]:
            updates.append("api_key_encrypted = %s")
            values.append(encrypt_credential(data["api_key"]))

        if "additional_params" in data:
            updates.append("additional_params = %s")
            values.append(json.dumps(data["additional_params"]))

        if "description" in data:
            updates.append("description = %s")
            values.append(data["description"])

        if "is_active" in data:
            updates.append("is_active = %s")
            values.append(data["is_active"])

        if not updates:
            return jsonify({"error": "No fields to update"}), 400

        updates.append("updated_at = NOW()")
        values.append(credential_id)

        query = f"""
            UPDATE external_api_credentials
            SET {", ".join(updates)}
            WHERE id = %s
            RETURNING id
        """

        cur.execute(query, values)
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        if not updated:
            return jsonify({"error": "Credential not found"}), 404

        return jsonify({"message": "Credential updated successfully"}), 200

    except Exception as e:
        logger.error(f"Error updating credential: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/admin/external-api-credentials/<credential_id>", methods=["DELETE"])
def delete_external_api_credential(credential_id):
    """Delete external API credential (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        # Use global POSTGRES_URL
        if not POSTGRES_URL:
            return jsonify({"error": "POSTGRES_URL not configured"}), 500

        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            "DELETE FROM external_api_credentials WHERE id = %s RETURNING id",
            (credential_id,),
        )
        deleted = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        if not deleted:
            return jsonify({"error": "Credential not found"}), 404

        logger.info(f"Deleted external API credential: {credential_id}")
        return jsonify({"message": "Credential deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Error deleting credential: {e}")
        return jsonify({"error": "Internal server error"}), 500


# =============================================================================
# Platform API Credentials Management Endpoints (PlatformAdmin only)
# =============================================================================
# Manages platform-wide credentials (Copernicus CDSE, AEMET) stored in Kubernetes secrets


def create_or_update_k8s_secret(secret_name: str, namespace: str, data: dict) -> bool:
    """Create or update Kubernetes secret"""
    try:
        from kubernetes import client as k8s_client, config as k8s_config
        from kubernetes.client import ApiException

        # Load in-cluster config (runs inside Kubernetes)
        try:
            k8s_config.load_incluster_config()
        except Exception:
            # Fallback to kubeconfig (for local development)
            k8s_config.load_kube_config()

        v1 = k8s_client.CoreV1Api()

        # Prepare secret data (base64 encoded)
        import base64

        secret_data = {}
        for key, value in data.items():
            if value:
                secret_data[key] = base64.b64encode(value.encode("utf-8")).decode(
                    "utf-8"
                )

        # Check if secret exists
        try:
            existing = v1.read_namespaced_secret(secret_name, namespace)
            # Update existing secret
            existing.data = secret_data
            v1.replace_namespaced_secret(secret_name, namespace, existing)
            logger.info(f"Updated Kubernetes secret: {secret_name}")
            return True
        except ApiException as e:
            if e.status == 404:
                # Create new secret
                secret = k8s_client.V1Secret(
                    metadata=k8s_client.V1ObjectMeta(name=secret_name),
                    data=secret_data,
                    type="Opaque",
                )
                v1.create_namespaced_secret(namespace, secret)
                logger.info(f"Created Kubernetes secret: {secret_name}")
                return True
            else:
                logger.error(f"Error managing Kubernetes secret: {e}")
                return False
    except ImportError:
        logger.warning("kubernetes library not available, cannot manage secrets")
        return False
    except Exception as e:
        logger.error(f"Error managing Kubernetes secret: {e}")
        return False


@app.route("/api/admin/platform-credentials/copernicus-cdse", methods=["GET"])
def get_copernicus_credentials():
    """Get Copernicus CDSE credentials status (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        from kubernetes import client as k8s_client, config as k8s_config
        import base64

        try:
            k8s_config.load_incluster_config()
        except Exception:
            k8s_config.load_kube_config()

        v1 = k8s_client.CoreV1Api()

        try:
            secret = v1.read_namespaced_secret("copernicus-cdse-secret", "nekazari")
            username = (
                base64.b64decode(secret.data.get("username", "")).decode("utf-8")
                if secret.data.get("username")
                else ""
            )

            return jsonify(
                {
                    "configured": True,
                    "username": username,
                    "url": "https://dataspace.copernicus.eu",
                }
            ), 200
        except Exception as e:
            if "404" in str(e) or "Not Found" in str(e):
                return jsonify(
                    {
                        "configured": False,
                        "username": "",
                        "url": "https://dataspace.copernicus.eu",
                    }
                ), 200
            raise
    except ImportError:
        return jsonify(
            {
                "configured": False,
                "username": "",
                "url": "https://dataspace.copernicus.eu",
            }
        ), 200
    except Exception as e:
        logger.error(f"Error getting Copernicus credentials: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/platform-credentials/copernicus-cdse", methods=["POST"])
def save_copernicus_credentials():
    """Save Copernicus CDSE credentials to Kubernetes secret (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        data = request.json
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        url = data.get("url", "https://dataspace.copernicus.eu").strip()

        if not username:
            return jsonify({"error": "Username (Client ID) is required"}), 400
        if not password:
            return jsonify({"error": "Password (Client Secret) is required"}), 400

        # Save to Kubernetes secret
        secret_data = {"username": username, "password": password}

        if create_or_update_k8s_secret(
            "copernicus-cdse-secret", "nekazari", secret_data
        ):
            # Also save to database for reference
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                import hashlib

                # Use global POSTGRES_URL
                if POSTGRES_URL:
                    conn = psycopg2.connect(POSTGRES_URL)
                    cur = conn.cursor(cursor_factory=RealDictCursor)

                    # Check if exists
                    cur.execute("""
                        SELECT id FROM external_api_credentials
                        WHERE service_name = 'copernicus-cdse'
                    """)
                    existing = cur.fetchone()

                    password_hash = hashlib.sha256(password.encode()).hexdigest()

                    if existing:
                        cur.execute(
                            """
                            UPDATE external_api_credentials
                            SET username = %s, password_encrypted = %s, service_url = %s,
                                updated_at = NOW()
                            WHERE service_name = 'copernicus-cdse'
                        """,
                            (username, password_hash, url),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO external_api_credentials
                            (service_name, service_url, auth_type, username, password_encrypted, is_active)
                            VALUES ('copernicus-cdse', %s, 'basic_auth', %s, %s, true)
                        """,
                            (url, username, password_hash),
                        )

                    conn.commit()
                    cur.close()
                    conn.close()
            except Exception as db_err:
                logger.warning(f"Could not save to database: {db_err}")

            return jsonify(
                {
                    "message": "Copernicus CDSE credentials saved successfully",
                    "configured": True,
                }
            ), 200
        else:
            return jsonify({"error": "Failed to save credentials to Kubernetes"}), 500

    except Exception as e:
        logger.error(f"Error saving Copernicus credentials: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/platform-credentials/aemet", methods=["GET"])
def get_aemet_credentials():
    """Get AEMET credentials status (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        from kubernetes import client as k8s_client, config as k8s_config
        import base64

        try:
            k8s_config.load_incluster_config()
        except Exception:
            k8s_config.load_kube_config()

        v1 = k8s_client.CoreV1Api()

        try:
            secret = v1.read_namespaced_secret("aemet-secret", "nekazari")
            # Check both possible key names
            api_key = ""
            if secret.data.get("api_key"):
                api_key = base64.b64decode(secret.data["api_key"]).decode("utf-8")
            elif secret.data.get("api-key"):
                api_key = base64.b64decode(secret.data["api-key"]).decode("utf-8")

            return jsonify(
                {
                    "configured": bool(api_key),
                    "url": "https://opendata.aemet.es/opendata/api",
                }
            ), 200
        except Exception as e:
            if "404" in str(e) or "Not Found" in str(e):
                return jsonify(
                    {
                        "configured": False,
                        "url": "https://opendata.aemet.es/opendata/api",
                    }
                ), 200
            raise
    except ImportError:
        return jsonify(
            {"configured": False, "url": "https://opendata.aemet.es/opendata/api"}
        ), 200
    except Exception as e:
        logger.error(f"Error getting AEMET credentials: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/platform-credentials/aemet", methods=["POST"])
def save_aemet_credentials():
    """Save AEMET credentials to Kubernetes secret (PlatformAdmin only)"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "Only PlatformAdmin can access this endpoint"}), 403

    try:
        data = request.json
        api_key = data.get("api_key", "").strip()
        url = data.get("url", "https://opendata.aemet.es/opendata/api").strip()

        if not api_key:
            return jsonify({"error": "API Key is required"}), 400

        # Save to Kubernetes secret (use 'api_key' as key name for consistency)
        secret_data = {
            "api_key": api_key,
            "api-key": api_key,  # Also add legacy key name for backward compatibility
        }

        if create_or_update_k8s_secret("aemet-secret", "nekazari", secret_data):
            # Also save to database for reference
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                import hashlib

                # Use global POSTGRES_URL
                if POSTGRES_URL:
                    conn = psycopg2.connect(POSTGRES_URL)
                    cur = conn.cursor(cursor_factory=RealDictCursor)

                    # Check if exists
                    cur.execute("""
                        SELECT id FROM external_api_credentials
                        WHERE service_name = 'aemet'
                    """)
                    existing = cur.fetchone()

                    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

                    if existing:
                        cur.execute(
                            """
                            UPDATE external_api_credentials
                            SET api_key_encrypted = %s, service_url = %s,
                                updated_at = NOW()
                            WHERE service_name = 'aemet'
                        """,
                            (api_key_hash, url),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO external_api_credentials
                            (service_name, service_url, auth_type, api_key_encrypted, is_active)
                            VALUES ('aemet', %s, 'api_key', %s, true)
                        """,
                            (url, api_key_hash),
                        )

                    conn.commit()
                    cur.close()
                    conn.close()
            except Exception as db_err:
                logger.warning(f"Could not save to database: {db_err}")

            return jsonify(
                {"message": "AEMET credentials saved successfully", "configured": True}
            ), 200
        else:
            return jsonify({"error": "Failed to save credentials to Kubernetes"}), 500

    except Exception as e:
        logger.error(f"Error saving AEMET credentials: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/assets/<path:subpath>", methods=["GET", "POST", "DELETE", "OPTIONS"])
@cross_origin(origins=_cors_origins, supports_credentials=True)
def proxy_assets_requests(subpath):
    """Proxy asset management requests to entity-manager"""
    if request.method == "OPTIONS":
        return "", 204

    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing authorization"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid token"}), 401

    target_url = f"{ENTITY_MANAGER_URL}/api/assets/{subpath}"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=request.args, timeout=10
            )
        elif request.method == "POST":
            # Handle multipart upload if present
            if "multipart/form-data" in request.content_type:
                response = requests.post(
                    target_url,
                    headers=headers,
                    data=request.data,
                    files=request.files,
                    timeout=30,
                )
            else:
                response = requests.post(
                    target_url,
                    headers=headers,
                    json=request.get_json(silent=True),
                    timeout=30,
                )
        elif request.method == "DELETE":
            response = requests.delete(target_url, headers=headers, timeout=10)
        else:
            return jsonify({"error": "Method not supported"}), 405

        return (response.content, response.status_code, response.headers.items())
    except Exception as e:
        logger.error(f"Error proxying asset request: {e}")
        return jsonify({"error": "Internal service connection error"}), 502


@app.route("/api/core/sync/vectorial", methods=["GET", "OPTIONS"])
@cross_origin(origins=_cors_origins, supports_credentials=True)
def proxy_vector_sync_requests():
    """Proxy offline vector sync requests to entity-manager"""
    if request.method == "OPTIONS":
        return "", 204

    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing authorization"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid token"}), 401

    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    target_url = f"{ENTITY_MANAGER_URL}/api/core/sync/vectorial"
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant}

    try:
        response = requests.get(
            target_url, headers=headers, params=request.args, timeout=30
        )
        return (response.content, response.status_code, response.headers.items())
    except Exception as e:
        logger.error(f"Error proxying vector sync request: {e}")
        return jsonify({"error": "Internal service connection error"}), 502


@app.route(
    "/api/tenant/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
@cross_origin(origins=_cors_origins, supports_credentials=True)
def proxy_tenant_requests(subpath):
    """Proxy tenant requests to tenant-user-api or tenant-webhook"""
    if request.method == "OPTIONS":
        return "", 204

    # Validate JWT token from header or cookie
    token = get_request_token()
    if not token:
        logger.warning(f"Missing or invalid authorization for /api/tenant/{subpath}")
        return jsonify({"error": "Missing or invalid authorization header"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        logger.warning(f"Token validation failed for /api/tenant/{subpath}")
        return jsonify({"error": "Invalid or expired token"}), 401

    # Route logic:
    # 1. tenant/users -> tenant-user-api-service
    # 2. Everything else -> tenant-webhook-service
    if subpath.startswith("users") or subpath.startswith("profile"):
        target_url = f"{TENANT_USER_API_URL}/api/tenant/{subpath}"
    else:
        target_url = f"{TENANT_WEBHOOK_URL}/api/tenant/{subpath}"

    # Forward request
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.content_type or "application/json",
    }

    # Forward query parameters
    params = dict(request.args)

    try:
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=params, timeout=10
            )
        elif request.method == "POST":
            response = requests.post(
                target_url,
                headers=headers,
                params=params,
                json=request.get_json(silent=True),
                timeout=10,
            )
        elif request.method == "PUT":
            response = requests.put(
                target_url,
                headers=headers,
                params=params,
                json=request.get_json(silent=True),
                timeout=10,
            )
        elif request.method == "PATCH":
            response = requests.patch(
                target_url,
                headers=headers,
                params=params,
                json=request.get_json(silent=True),
                timeout=10,
            )
        elif request.method == "DELETE":
            response = requests.delete(
                target_url, headers=headers, params=params, timeout=10
            )
        else:
            return jsonify({"error": f"Method {request.method} not supported"}), 405

        return (response.content, response.status_code, response.headers.items())

    except Exception as e:
        logger.error(f"Error proxying tenant request to {target_url}: {e}")
        return jsonify({"error": "Failed to connect to internal service"}), 502


@app.route("/api/terms/<language>", methods=["GET", "OPTIONS"])
def public_terms_proxy(language):
    """Public endpoint for terms & conditions (used during registration)."""
    if request.method == "OPTIONS":
        return "", 204
    target_url = f"{ENTITY_MANAGER_URL}/api/admin/terms/{language}"
    try:
        resp = requests.get(target_url, timeout=10)
        return (resp.content, resp.status_code, dict(resp.headers))
    except Exception as e:
        logger.error(f"Error proxying public terms: {e}")
        return jsonify({"content": "", "last_updated": None, "language": language}), 200


@app.route("/api/public/platform-settings", methods=["GET", "OPTIONS"])
def public_platform_settings_proxy():
    """Public endpoint for non-sensitive platform settings used before login."""
    if request.method == "OPTIONS":
        return "", 204
    target_url = f"{ENTITY_MANAGER_URL}/api/public/platform-settings"
    try:
        resp = requests.get(target_url, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        logger.error(f"Error proxying public platform settings: {e}")
        return jsonify({"landing_mode": "standard"}), 200


@app.route(
    "/api/admin/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def proxy_admin_requests(subpath):
    """Proxy administrative requests using a deterministic routing map."""
    if request.method == "OPTIONS":
        return "", 204

    # 1. Enforcement: Only admins can access these routes
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        logger.warning(
            f"Unauthorized admin access attempt by {payload.get('preferred_username')} on /api/admin/{subpath}"
        )
        return jsonify({"error": "PlatformAdmin access required"}), 403

    # 2. Deterministic Routing Map
    # Hostnames match internal Kubernetes service names
    ADMIN_ROUTE_MAP = {
        # ENTITY-MANAGER: Core entity metadata, logs, and assets
        "audit-logs": ENTITY_MANAGER_URL,
        "terms": ENTITY_MANAGER_URL,
        "platform-settings": ENTITY_MANAGER_URL,
        "tenant-usage": ENTITY_MANAGER_URL,
        "assets": ENTITY_MANAGER_URL,
        "parcels": ENTITY_MANAGER_URL,
        # TENANT-WEBHOOK: Marketplace, Tenants, Activations, Limits, and Codes
        "tenants": TENANT_WEBHOOK_URL,
        "activations": TENANT_WEBHOOK_URL,
        "tenant-limits": TENANT_WEBHOOK_URL,
        "api-keys": TENANT_WEBHOOK_URL,
        "users": TENANT_WEBHOOK_URL,
        "platform-credentials": TENANT_WEBHOOK_URL,
    }

    path_parts = subpath.split("/")
    route_key = path_parts[0]

    # Special case: nuclear purge (tenants/ID/purge)
    if route_key == "tenants" and len(path_parts) > 2 and path_parts[2] == "purge":
        target_base_url = ENTITY_MANAGER_URL
    else:
        target_base_url = ADMIN_ROUTE_MAP.get(route_key)

    if not target_base_url:
        logger.error(f"Unmapped admin route: /api/admin/{subpath}")
        return jsonify({"error": f"Admin route /{route_key} is not configured"}), 404

    target_url = f"{target_base_url}/api/admin/{subpath}"

    tenant = extract_tenant_id(payload)

    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": request.content_type or "application/json",
            "X-Tenant-ID": tenant,
        }

        signature = generate_hmac_signature(token, tenant)
        if signature:
            headers["X-Auth-Signature"] = signature

        method = request.method
        params = dict(request.args)
        json_data = (
            request.get_json(silent=True)
            if method in ["POST", "PUT", "PATCH"]
            else None
        )

        response = requests.request(
            method=method,
            url=target_url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=30,
        )

        return (response.content, response.status_code, response.headers.items())

    except Exception as e:
        logger.error(f"Error proxying admin request to {target_url}: {e}")
        return jsonify({"error": "Internal service connection error"}), 502


@app.route(
    "/api/ndvi/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def proxy_ndvi_requests(subpath):
    """Proxy NDVI service requests"""
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response()
        cors_origin = get_cors_origin()
        if cors_origin:
            response.headers["Access-Control-Allow-Origin"] = cors_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-ID, Cookie"
        )
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Vary"] = "Origin"
        return response, 200

    # Validate JWT token
    token = get_request_token()
    if not token:
        logger.warning(f"Missing or invalid authorization for /api/ndvi/{subpath}")
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        logger.warning(f"Token validation failed for /api/ndvi/{subpath}")
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)

    # Check if user is PlatformAdmin (can work without tenant or with specified tenant)
    user_roles = payload.get("realm_access", {}).get("roles", []) or []
    resource_roles = []
    for resource in payload.get("resource_access", {}).values():
        if isinstance(resource, dict) and "roles" in resource:
            resource_roles.extend(resource["roles"])
    all_roles = list(set(user_roles + resource_roles + payload.get("roles", [])))
    is_platform_admin = "PlatformAdmin" in all_roles

    # If no tenant in token, check if PlatformAdmin can use default or request tenant
    if not tenant:
        if is_platform_admin:
            # PlatformAdmin can specify tenant in request header or use default
            tenant = request.headers.get("X-Tenant-ID") or request.args.get("tenant_id")
            if not tenant:
                # For PlatformAdmin, try to get tenant from request body (for POST requests)
                if request.is_json and request.json:
                    tenant = request.json.get("tenant_id") or request.json.get("tenant")

                if not tenant:
                    # Use default platform admin tenant for cross-tenant operations
                    tenant = os.getenv("PLATFORM_ADMIN_TENANT", "platform_admin")
                    logger.info(
                        f"PlatformAdmin user {payload.get('preferred_username')} ({payload.get('email')}) using default tenant: {tenant}"
                    )
                else:
                    logger.info(
                        f"PlatformAdmin user {payload.get('preferred_username')} ({payload.get('email')}) using tenant from request: {tenant}"
                    )
            else:
                logger.info(
                    f"PlatformAdmin user {payload.get('preferred_username')} ({payload.get('email')}) using specified tenant: {tenant}"
                )
        else:
            logger.warning(
                f"No tenant found in token for /api/ndvi/{subpath}. User: {payload.get('preferred_username')}, Payload keys: {list(payload.keys())}, roles: {all_roles}"
            )
            return jsonify(
                {
                    "error": "Tenant not present in token",
                    "suggestion": "Your user account may not have a tenant assigned. Please contact an administrator.",
                    "user": payload.get("preferred_username"),
                    "roles": all_roles,
                }
            ), 401

    # Rate limit
    if not rate_limit(tenant):
        logger.warning(
            f"Rate limit exceeded for tenant {tenant} on /api/ndvi/{subpath}"
        )
        return jsonify({"error": "Rate limit exceeded"}), 429

    logger.info(
        f"NDVI request to /api/ndvi/{subpath} for tenant {tenant} - forwarding to service"
    )

    try:
        # Entity-manager has endpoints at /ndvi/ not /api/ndvi/
        # All subpaths (including download/) are forwarded to entity-manager
        target_url = f"{NDVI_SERVICE_URL}/ndvi/{subpath}"

        # Prepare headers
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": request.content_type or "application/json",
            "X-Tenant-ID": tenant,  # Pass tenant to trusted internal service
        }
        # Generate and add HMAC signature for internal service authentication
        signature = generate_hmac_signature(token, tenant)
        if signature:
            headers["X-Auth-Signature"] = signature

        # Forward query params
        params = dict(request.args)

        # Forward request body for POST/PUT/PATCH
        data = None
        json_data = None
        if request.method in ["POST", "PUT", "PATCH"] and request.is_json:
            json_data = request.get_json(silent=True)
        elif request.data:
            data = request.data

        logger.info(
            f"Forwarding {request.method} request to {target_url} with json_data={json_data is not None}, data={data is not None}, headers={list(headers.keys())}"
        )

        # Forward request to NDVI service
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=params, timeout=30
            )
        elif request.method == "POST":
            response = requests.post(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
            logger.info(
                f"NDVI service response: {response.status_code} - {response.text[:200]}"
            )
            if response.status_code == 404:
                logger.error(
                    f"NDVI endpoint not found. Target URL: {target_url}, Service URL: {NDVI_SERVICE_URL}, Subpath: {subpath}"
                )
        elif request.method == "PUT":
            response = requests.put(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
        elif request.method == "PATCH":
            response = requests.patch(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
        elif request.method == "DELETE":
            response = requests.delete(
                target_url, headers=headers, params=params, timeout=30
            )
            if response.status_code >= 400:
                logger.error(
                    f"NDVI DELETE request failed: {response.status_code} - {response.text[:500]}"
                )
                logger.error(
                    f"Target URL: {target_url}, Subpath: {subpath}, Params: {params}"
                )
        else:
            return jsonify({"error": "Method not allowed"}), 405

        # Return response from NDVI service
        response_headers = dict(response.headers)
        # Remove content-encoding if present to avoid double encoding
        response_headers.pop("Content-Encoding", None)
        response_headers.pop("Transfer-Encoding", None)

        return make_response((response.text, response.status_code, response_headers))

    except requests.exceptions.Timeout:
        logger.error(f"Timeout connecting to NDVI service for /api/ndvi/{subpath}")
        return jsonify({"error": "NDVI service timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error proxying request to NDVI service: {e}")
        return jsonify({"error": f"Failed to connect to NDVI service: {str(e)}"}), 502
    except Exception as e:
        logger.error(f"Error in proxy_ndvi_requests: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route(
    "/api/weather/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def proxy_weather_requests(subpath):
    """Proxy weather service requests to entity-manager"""
    logger.info(f"Weather request received: {request.method} /api/weather/{subpath}")
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response()
        cors_origin = get_cors_origin()
        if cors_origin:
            response.headers["Access-Control-Allow-Origin"] = cors_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-ID, Cookie"
        )
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Vary"] = "Origin"
        return response, 200

    # Validate JWT token (optional for some endpoints like municipalities/search)
    token = get_request_token()
    payload = None
    tenant = None

    if token:
        payload = validate_jwt_token(token)
        if payload:
            tenant = extract_tenant_id(payload)
            logger.info(f"Token validated for /api/weather/{subpath}, tenant: {tenant}")
        else:
            logger.warning(
                f"Token validation failed for /api/weather/{subpath}, but continuing (endpoint may allow unauthenticated)"
            )
    else:
        logger.info(
            f"No authorization header for /api/weather/{subpath}, continuing (endpoint may allow unauthenticated)"
        )

    # For municipalities/search, allow unauthenticated requests (entity-manager will handle auth)
    # For other endpoints, require authentication
    if subpath != "municipalities/search" and not payload:
        logger.warning(
            f"Missing or invalid authorization header for /api/weather/{subpath}"
        )
        return jsonify({"error": "Missing or invalid authorization header"}), 401

    # Use tenant from token if available, otherwise use X-Tenant-ID header or default
    if not tenant:
        tenant = request.headers.get("X-Tenant-ID", "platform")
        logger.info(f"Using tenant from X-Tenant-ID header or default: {tenant}")

    # Rate limit
    if not rate_limit(tenant):
        logger.warning(
            f"Rate limit exceeded for tenant {tenant} on /api/weather/{subpath}"
        )
        return jsonify({"error": "Rate limit exceeded"}), 429

    logger.info(
        f"Weather request to /api/weather/{subpath} for tenant {tenant} - forwarding to entity-manager"
    )

    try:
        # Build target URL
        target_url = f"{ENTITY_MANAGER_URL}/api/weather/{subpath}"

        # Prepare headers for entity-manager
        headers = {
            "Content-Type": request.content_type or "application/json",
            "X-Tenant-ID": tenant,
        }
        # Only add Authorization header if we have a valid token
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # Add HMAC signature if available (entity-manager may require it for some endpoints)
        if KEYCLOAK_AUTH_AVAILABLE:
            try:
                signature = generate_hmac_signature(token, tenant)
                if signature:
                    headers["X-Auth-Signature"] = signature
            except Exception as e:
                logger.warning(f"Failed to generate HMAC signature: {e}")

        # Forward query params
        params = dict(request.args)

        # Forward request body for POST/PUT/PATCH
        json_data = None
        if request.method in ["POST", "PUT", "PATCH"] and request.is_json:
            json_data = request.get_json(silent=True)
        elif request.data:
            json_data = request.get_json(silent=True)

        # Forward request to entity-manager
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=params, timeout=30
            )
        elif request.method == "POST":
            response = requests.post(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "PUT":
            response = requests.put(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "PATCH":
            response = requests.patch(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "DELETE":
            response = requests.delete(
                target_url, headers=headers, params=params, timeout=30
            )
        else:
            return jsonify({"error": "Method not allowed"}), 405

        # Return response from entity-manager
        response_headers = dict(response.headers)
        # Remove content-encoding if present to avoid double encoding
        response_headers.pop("Content-Encoding", None)
        response_headers.pop("Transfer-Encoding", None)

        # Ensure CORS headers are present in the response
        cors_origin = get_cors_origin()
        if cors_origin:
            response_headers["Access-Control-Allow-Origin"] = cors_origin
            response_headers["Access-Control-Allow-Credentials"] = "true"
            response_headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, X-Tenant-ID"
            )
            response_headers["Vary"] = "Origin"

        return make_response((response.text, response.status_code, response_headers))

    except requests.exceptions.Timeout:
        logger.error(f"Timeout connecting to entity-manager for /api/weather/{subpath}")
        return jsonify({"error": "Entity manager service timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error proxying request to entity-manager: {e}")
        return jsonify(
            {"error": f"Failed to connect to entity-manager service: {str(e)}"}
        ), 502
    except Exception as e:
        logger.error(f"Error in proxy_weather_requests: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route(
    "/api/modules/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def proxy_modules_requests(subpath):
    """Proxy modules requests to entity-manager"""
    logger.info(f"Modules request received: {request.method} /api/modules/{subpath}")
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response()
        cors_origin = get_cors_origin()
        if cors_origin:
            response.headers["Access-Control-Allow-Origin"] = cors_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-ID, Cookie"
        )
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Vary"] = "Origin"
        return response, 200

    # Validate JWT token
    token = get_request_token()
    if not token:
        logger.warning(f"Missing or invalid authorization for /api/modules/{subpath}")
        return jsonify({"error": "Missing or invalid authorization"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        logger.warning(f"Token validation failed for /api/modules/{subpath}")
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)
    if not tenant:
        logger.warning(f"No tenant found in token for /api/modules/{subpath}")
        return jsonify({"error": "Tenant not present in token"}), 401

    # Rate limit
    if not rate_limit(tenant):
        logger.warning(
            f"Rate limit exceeded for tenant {tenant} on /api/modules/{subpath}"
        )
        return jsonify({"error": "Rate limit exceeded"}), 429

    logger.info(
        f"Modules request to /api/modules/{subpath} for tenant {tenant} - forwarding to entity-manager"
    )

    try:
        # Build target URL
        target_url = f"{ENTITY_MANAGER_URL}/api/modules/{subpath}"

        # Prepare headers
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": request.content_type or "application/json",
            "X-Tenant-ID": tenant,
        }

        # Add HMAC signature if available
        if KEYCLOAK_AUTH_AVAILABLE:
            try:
                signature = generate_hmac_signature(token, tenant)
                if signature:
                    headers["X-Auth-Signature"] = signature
            except Exception as e:
                logger.warning(f"Failed to generate HMAC signature: {e}")

        # Forward query params
        params = dict(request.args)

        # Forward request body
        json_data = None
        if request.method in ["POST", "PUT", "PATCH"] and request.is_json:
            json_data = request.get_json(silent=True)
        elif request.data:
            json_data = request.get_json(silent=True)

        # Forward request to entity-manager
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=params, timeout=30
            )
        elif request.method == "POST":
            response = requests.post(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "PUT":
            response = requests.put(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "PATCH":
            response = requests.patch(
                target_url, headers=headers, json=json_data, params=params, timeout=30
            )
        elif request.method == "DELETE":
            response = requests.delete(
                target_url, headers=headers, params=params, timeout=30
            )
        else:
            return jsonify({"error": "Method not allowed"}), 405

        # Return response
        response_headers = dict(response.headers)
        response_headers.pop("Content-Encoding", None)
        response_headers.pop("Transfer-Encoding", None)

        # Ensure CORS headers
        cors_origin = get_cors_origin()
        if cors_origin:
            response_headers["Access-Control-Allow-Origin"] = cors_origin
            response_headers["Access-Control-Allow-Credentials"] = "true"
            response_headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, X-Tenant-ID"
            )
            response_headers["Vary"] = "Origin"

        return make_response((response.text, response.status_code, response_headers))

    except requests.exceptions.Timeout:
        logger.error(f"Timeout connecting to entity-manager for /api/modules/{subpath}")
        return jsonify({"error": "Entity manager service timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error proxying request to entity-manager: {e}")
        return jsonify(
            {"error": f"Failed to connect to entity-manager service: {str(e)}"}
        ), 502
    except Exception as e:
        logger.error(f"Error in proxy_modules_requests: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route(
    "/api/cadastral-api/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def proxy_cadastral_api_requests(subpath):
    """Proxy cadastral-api service requests"""
    logger.info(
        f"Cadastral API request received: {request.method} /api/cadastral-api/{subpath}"
    )
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response()
        cors_origin = get_cors_origin()
        if cors_origin:
            response.headers["Access-Control-Allow-Origin"] = cors_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-ID, Cookie"
        )
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Vary"] = "Origin"
        return response, 200

    # Validate JWT token
    token = get_request_token()
    if not token:
        logger.warning(
            f"Missing or invalid authorization for /api/cadastral-api/{subpath}"
        )
        return jsonify({"error": "Missing or invalid authorization"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        logger.warning(f"Token validation failed for /api/cadastral-api/{subpath}")
        return jsonify({"error": "Invalid or expired token"}), 401

    # Extract tenant
    tenant = extract_tenant_id(payload)
    if not tenant:
        logger.warning(f"No tenant found in token for /api/cadastral-api/{subpath}")
        return jsonify({"error": "Tenant not present in token"}), 401

    # Rate limit
    if not rate_limit(tenant):
        logger.warning(
            f"Rate limit exceeded for tenant {tenant} on /api/cadastral-api/{subpath}"
        )
        return jsonify({"error": "Rate limit exceeded"}), 429

    logger.info(
        f"Cadastral API request to /api/cadastral-api/{subpath} for tenant {tenant} - forwarding to cadastral-api service"
    )

    try:
        # Build target URL - cadastral-api service expects paths like /parcels/query-by-coordinates
        target_url = f"{CADASTRAL_API_URL}/{subpath}"

        # Prepare headers
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": request.content_type or "application/json",
            "X-Tenant-ID": tenant,  # Pass tenant to trusted internal service
        }

        # Add HMAC signature if available
        if KEYCLOAK_AUTH_AVAILABLE:
            try:
                signature = generate_hmac_signature(token, tenant)
                if signature:
                    headers["X-Auth-Signature"] = signature
            except Exception as e:
                logger.warning(f"Failed to generate HMAC signature: {e}")

        # Forward query params
        params = dict(request.args)

        # Forward request body for POST/PUT/PATCH
        json_data = None
        if request.method in ["POST", "PUT", "PATCH"] and request.is_json:
            json_data = request.get_json(silent=True)
        elif request.data:
            json_data = request.get_json(silent=True)
        data = request.data if not request.is_json else None

        # Forward request to cadastral-api service
        if request.method == "GET":
            response = requests.get(
                target_url, headers=headers, params=params, timeout=30
            )
        elif request.method == "POST":
            response = requests.post(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
        elif request.method == "PUT":
            response = requests.put(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
        elif request.method == "PATCH":
            response = requests.patch(
                target_url,
                headers=headers,
                params=params,
                json=json_data,
                data=data,
                timeout=30,
            )
        elif request.method == "DELETE":
            response = requests.delete(
                target_url, headers=headers, params=params, timeout=30
            )
        else:
            return jsonify({"error": "Method not allowed"}), 405

        # Log errors
        if response.status_code >= 400:
            logger.warning(
                f"Cadastral API service returned {response.status_code} for /api/cadastral-api/{subpath}: {response.text}"
            )

        # Forward response
        return make_response(
            response.content, response.status_code, dict(response.headers)
        )

    except requests.exceptions.Timeout:
        logger.error(
            f"Timeout forwarding request to cadastral-api service: {target_url}"
        )
        return jsonify({"error": "Cadastral API service request timeout"}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding cadastral-api request: {e}")
        return jsonify({"error": "Internal server error"}), 500
    except Exception as e:
        logger.error(f"Unexpected error in cadastral-api proxy: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# =============================================================================
# Processing Profiles CRUD Endpoints
# =============================================================================


@app.route("/api/v1/profiles", methods=["GET"])
def list_profiles():
    """List all processing profiles."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Only admins can access profiles
    if not has_role("PlatformAdmin", payload) and not has_role("TenantAdmin", payload):
        return jsonify({"error": "Admin access required"}), 403

    try:
        # POSTGRES_URL inherited from global
        if not POSTGRES_URL:
            logger.error("POSTGRES_URL not configured")
            return jsonify({"error": "Database not configured"}), 500

        try:
            conn = psycopg2.connect(POSTGRES_URL)
        except Exception as conn_err:
            logger.error(f"Failed to connect to database: {conn_err}")
            return jsonify({"error": "Database connection failed"}), 500

        cur = conn.cursor(cursor_factory=RealDictCursor)

        device_type = request.args.get("device_type")
        tenant_id = request.args.get("tenant_id")

        query = """
            SELECT id::text, device_type, device_id, tenant_id::text,
                   name, description, config, priority, is_active,
                   created_at, updated_at
            FROM processing_profiles
            WHERE 1=1
        """
        params = []

        if device_type:
            query += " AND device_type = %s"
            params.append(device_type)

        if tenant_id:
            query += " AND (tenant_id = %s::uuid OR tenant_id IS NULL)"
            params.append(tenant_id)

        # If no tenant_id provided and user is not PlatformAdmin, filter by their tenant
        # Note: tenant_id in processing_profiles is UUID, but extract_tenant_id may return a string
        # For non-PlatformAdmin users, we only show profiles with their tenant_id or NULL (global profiles)
        if not tenant_id and not has_role("PlatformAdmin", payload):
            user_tenant_id = extract_tenant_id(payload)
            if user_tenant_id:
                # Try to convert to UUID if it's a valid UUID string, otherwise skip tenant filtering
                try:
                    import uuid

                    # Validate if it's a UUID format
                    uuid.UUID(user_tenant_id)
                    query += " AND (tenant_id = %s::uuid OR tenant_id IS NULL)"
                    params.append(user_tenant_id)
                except (ValueError, AttributeError):
                    # If tenant_id is not a valid UUID (e.g., "platform"), only show global profiles
                    query += " AND tenant_id IS NULL"

        query += " ORDER BY device_type, priority DESC"

        cur.execute(query, params)
        profiles = [dict(row) for row in cur.fetchall()]
        cur.close()
        conn.close()

        # Convert datetime to string for JSON
        for p in profiles:
            if p.get("created_at"):
                p["created_at"] = p["created_at"].isoformat()
            if p.get("updated_at"):
                p["updated_at"] = p["updated_at"].isoformat()

        return jsonify({"profiles": profiles}), 200

    except Exception as e:
        logger.error(f"Error listing profiles: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@app.route("/api/v1/profiles", methods=["POST"])
def create_profile():
    """Create a new processing profile."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload) and not has_role("TenantAdmin", payload):
        return jsonify({"error": "Admin access required"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        data = request.json
        required = ["device_type", "name", "config"]
        for field in required:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # Use global POSTGRES_URL
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            """
            INSERT INTO processing_profiles (
                device_type, device_id, tenant_id, name, description,
                config, priority, is_active
            )
            VALUES (%s, %s, %s::uuid, %s, %s, %s::jsonb, %s, %s)
            RETURNING id::text
        """,
            (
                data["device_type"],
                data.get("device_id"),
                data.get("tenant_id"),
                data["name"],
                data.get("description"),
                json.dumps(data["config"]),
                data.get("priority", 0),
                data.get("is_active", True),
            ),
        )

        profile_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"id": profile_id, "message": "Profile created"}), 201

    except Exception as e:
        logger.error(f"Error creating profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/v1/profiles/<profile_id>", methods=["PUT"])
def update_profile(profile_id):
    """Update a processing profile."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload) and not has_role("TenantAdmin", payload):
        return jsonify({"error": "Admin access required"}), 403

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        data = request.json
        # Use global POSTGRES_URL
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        updates = []
        values = []

        if "name" in data:
            updates.append("name = %s")
            values.append(data["name"])
        if "description" in data:
            updates.append("description = %s")
            values.append(data["description"])
        if "config" in data:
            updates.append("config = %s::jsonb")
            values.append(json.dumps(data["config"]))
        if "priority" in data:
            updates.append("priority = %s")
            values.append(data["priority"])
        if "is_active" in data:
            updates.append("is_active = %s")
            values.append(data["is_active"])

        if not updates:
            return jsonify({"error": "No fields to update"}), 400

        updates.append("updated_at = NOW()")
        values.append(profile_id)

        query = f"""
            UPDATE processing_profiles
            SET {", ".join(updates)}
            WHERE id = %s::uuid
            RETURNING id::text
        """

        cur.execute(query, values)
        if not cur.fetchone():
            return jsonify({"error": "Profile not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Profile updated"}), 200

    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/v1/profiles/<profile_id>", methods=["DELETE"])
def delete_profile(profile_id):
    """Delete a processing profile."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if not has_role("PlatformAdmin", payload):
        return jsonify({"error": "PlatformAdmin access required"}), 403

    try:
        import psycopg2

        # Use global POSTGRES_URL
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor()

        cur.execute(
            """
            DELETE FROM processing_profiles
            WHERE id = %s::uuid
            RETURNING id
        """,
            (profile_id,),
        )

        if not cur.fetchone():
            return jsonify({"error": "Profile not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return "", 204

    except Exception as e:
        logger.error(f"Error deleting profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/v1/profiles/stats", methods=["GET"])
def get_telemetry_stats():
    """Get telemetry statistics including storage savings."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    try:
        # POSTGRES_URL inherited from global
        if not POSTGRES_URL:
            logger.error("POSTGRES_URL not configured")
            return jsonify({"error": "Database not configured"}), 500

        try:
            conn = psycopg2.connect(POSTGRES_URL)
        except Exception as conn_err:
            logger.error(f"Failed to connect to database: {conn_err}")
            return jsonify({"error": "Database connection failed"}), 500

        cur = conn.cursor(cursor_factory=RealDictCursor)

        hours = int(request.args.get("hours", 24))
        tenant_id = extract_tenant_id(payload)

        query = """
            SELECT 
                COUNT(*) as persisted,
                entity_type as device_type
            FROM telemetry_events
            WHERE observed_at > NOW() - INTERVAL '%s hours'
        """
        params = [hours]

        if tenant_id and not has_role("PlatformAdmin", payload):
            query += " AND tenant_id = %s"
            params.append(tenant_id)

        query += " GROUP BY entity_type"

        cur.execute(query, params)
        rows = cur.fetchall()

        total_persisted = sum(row["persisted"] for row in rows)
        by_type = {
            row["device_type"] or "unknown": {"persisted": row["persisted"]}
            for row in rows
        }

        # Estimate received (from profiles throttle settings)
        # Rough estimate: 2.5x multiplier for throttled data
        estimated_received = int(total_persisted * 2.5)
        savings = (
            (estimated_received - total_persisted) / max(estimated_received, 1)
        ) * 100

        cur.close()
        conn.close()

        return jsonify(
            {
                "total_received": estimated_received,
                "total_persisted": total_persisted,
                "storage_savings_percent": round(savings, 1),
                "by_device_type": by_type,
                "period_hours": hours,
            }
        ), 200

    except Exception as e:
        logger.error(f"Error getting telemetry stats: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@app.route("/api/v1/profiles/device-types", methods=["GET"])
def list_device_types():
    """List unique device types that have profiles."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    try:
        # POSTGRES_URL inherited from global
        if not POSTGRES_URL:
            logger.error("POSTGRES_URL not configured")
            return jsonify({"error": "Database not configured"}), 500

        try:
            conn = psycopg2.connect(POSTGRES_URL)
        except Exception as conn_err:
            logger.error(f"Failed to connect to database: {conn_err}")
            return jsonify({"error": "Database connection failed"}), 500

        cur = conn.cursor()

        cur.execute("""
            SELECT DISTINCT device_type 
            FROM processing_profiles 
            ORDER BY device_type
        """)

        types = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()

        return jsonify({"device_types": types}), 200

    except Exception as e:
        logger.error(f"Error listing device types: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


def generic_proxy(target_url, path):
    """Generic proxy handler with auth and tenant isolation"""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401
    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    # Role based access control (Read-Only fallback)
    has_pro_expired = has_role("role_pro_expired", payload)
    if has_pro_expired and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        logger.warning(
            f"Blocked mutation request to {target_url}/{path} for user with role_pro_expired"
        )
        return jsonify({"error": "Subscription expired. Read-only mode active."}), 403

    url = f"{target_url}/{path}"
    headers = {"X-Tenant-ID": tenant, "Authorization": f"Bearer {token}"}
    if request.headers.get("Content-Type"):
        headers["Content-Type"] = request.headers.get("Content-Type")

    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            params=request.args,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False,
            timeout=30,
        )
        return make_response(resp.content, resp.status_code, dict(resp.headers))
    except Exception as e:
        logger.error(f"Proxy error to {url}: {e}")
        return jsonify({"error": "Gateway proxy error", "details": str(e)}), 502


@app.route("/api/vegetation/tiles/<path:path>", methods=["GET"])
def vegetation_tiles_proxy(path):
    """Public proxy for vegetation raster tiles.

    Tile URLs contain a job UUID which acts as an unguessable access token.
    Cesium's UrlTemplateImageryProvider does not send httpOnly cookies,
    so these requests must bypass JWT auth.
    """
    url = f"{VEGETATION_API_URL}/api/vegetation/tiles/{path}"
    try:
        resp = requests.request(
            method="GET",
            url=url,
            params=request.args,
            allow_redirects=False,
            timeout=30,
        )
        response_headers = dict(resp.headers)
        response_headers["Cache-Control"] = "public, max-age=3600"
        return make_response(resp.content, resp.status_code, response_headers)
    except Exception as e:
        logger.error(f"Tile proxy error to {url}: {e}")
        return jsonify({"error": "Gateway proxy error"}), 502


@app.route(
    "/api/vegetation/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
def vegetation_proxy(path):
    return generic_proxy(VEGETATION_API_URL, f"api/vegetation/{path}")


@app.route(
    "/api/weather/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
def weather_proxy(path):
    return generic_proxy(WEATHER_API_URL, f"api/weather/{path}")


@app.route(
    "/api/intelligence/<path:path>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
def intelligence_proxy(path):
    return generic_proxy(INTELLIGENCE_API_URL, f"api/intelligence/{path}")


@app.route(
    "/api/agrienergy/<path:path>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
def agrienergy_proxy(path):
    return generic_proxy(AGRIENERGY_API_URL, f"api/agrienergy/{path}")


# =============================================================================
# IoT MQTT Provisioning
# =============================================================================
MQTT_CREDENTIALS_URL = os.getenv(
    "MQTT_CREDENTIALS_URL", "http://mqtt-credentials-manager-service:5000"
)


@app.route("/api/iot/provision-mqtt", methods=["POST"])
def provision_mqtt_credentials():
    """Provision MQTT credentials for a newly created IoT device."""
    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401
    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401
    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id")
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    try:
        resp = requests.post(
            f"{MQTT_CREDENTIALS_URL}/api/mqtt/credentials/create",
            json={"tenant_id": tenant, "device_id": device_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        return make_response(resp.content, resp.status_code, dict(resp.headers))
    except Exception as e:
        logger.error(f"MQTT provisioning error: {e}")
        return jsonify({"error": "MQTT provisioning failed"}), 502


# =============================================================================
# SDM Integration Proxy (/api/sdm/*)
# =============================================================================


@app.route(
    "/api/sdm/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
@cross_origin(origins=_cors_origins, supports_credentials=True)
def proxy_sdm_integration(subpath):
    """Proxy SDM integration requests (device profiles, schemas)."""
    if request.method == "OPTIONS":
        return "", 204

    token = get_request_token()
    if not token:
        return jsonify({"error": "Missing or invalid authorization"}), 401

    payload = validate_jwt_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    tenant = extract_tenant_id(payload)
    if not tenant:
        return jsonify({"error": "Tenant not present in token"}), 401

    if not rate_limit(tenant):
        return jsonify({"error": "Rate limit exceeded"}), 429

    target_url = f"{SDM_INTEGRATION_URL}/sdm/{subpath}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.content_type or "application/json",
        "X-Tenant-ID": tenant,
    }

    try:
        params = dict(request.args)
        json_data = None
        if request.method in ("POST", "PUT", "PATCH") and request.is_json:
            json_data = request.get_json(silent=True)

        resp = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=30,
        )

        if resp.status_code >= 400:
            logger.warning(
                f"SDM integration returned {resp.status_code} for /api/sdm/{subpath}: {resp.text[:200]}"
            )

        return make_response(resp.content, resp.status_code, dict(resp.headers))

    except requests.exceptions.RequestException as e:
        logger.error(f"Error forwarding SDM integration request: {e}")
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    debug = LOG_LEVEL == "DEBUG"

    logger.info(f"Starting FIWARE API Gateway on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
