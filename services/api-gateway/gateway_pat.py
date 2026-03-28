#!/usr/bin/env python3
"""
PAT (Personal Access Token) validation and Keycloak client-credentials helper for api-gateway.
See internal-docs/adr/003-pat-delegated-auth.md
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

PAT_PREFIX = "nkz_pat_"
REDIS_KEY_PREFIX = "nkz:pat:hash:"
PAT_CACHE_TTL_SEC = 300

_redis_client = None
_gateway_jwt_cache: Dict[str, Any] = {"token": None, "exp": 0.0}


def _redis_url() -> str:
    explicit = os.getenv("REDIS_URL", "").strip()
    if explicit:
        return explicit
    password = os.getenv("REDIS_PASSWORD", "").strip()
    if not password:
        return ""
    from urllib.parse import quote

    host = os.getenv("REDIS_HOST", "redis-service.nekazari.svc.cluster.local:6379")
    db = os.getenv("GATEWAY_REDIS_DB", "1")
    return f"redis://:{quote(password, safe='')}@{host}/{db}"


def get_redis_client():
    """Lazy Redis client; None if not configured or import/connect fails."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = _redis_url()
    if not url:
        return None
    try:
        import redis

        _redis_client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        _redis_client.ping()
        return _redis_client
    except Exception as e:
        logger.warning("Gateway Redis unavailable for PAT cache: %s", e)
        _redis_client = None
        return None


def pat_token_hash(raw_pat: str) -> str:
    return hashlib.sha256(raw_pat.encode("utf-8")).hexdigest()


def _keycloak_token_url() -> str:
    base = os.getenv("KEYCLOAK_URL", "http://keycloak-service:8080/auth").rstrip("/")
    realm = os.getenv("KEYCLOAK_REALM", "nekazari")
    return f"{base}/realms/{realm}/protocol/openid-connect/token"


def obtain_gateway_service_jwt() -> Optional[str]:
    """
    Client-credentials token for nkz-api-gateway (cached until ~30s before expiry).
    """
    now = time.time()
    cached = _gateway_jwt_cache.get("token")
    exp = float(_gateway_jwt_cache.get("exp") or 0)
    if cached and exp > now + 30:
        return cached

    client_id = os.getenv("GATEWAY_KEYCLOAK_CLIENT_ID", "").strip()
    client_secret = os.getenv("GATEWAY_KEYCLOAK_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        logger.error("GATEWAY_KEYCLOAK_CLIENT_ID/SECRET not configured; cannot mint service JWT")
        return None

    try:
        resp = requests.post(
            _keycloak_token_url(),
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            logger.error("Keycloak client_credentials failed: %s %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        token = data.get("access_token")
        if not token:
            return None
        expires_in = int(data.get("expires_in") or 300)
        _gateway_jwt_cache["token"] = token
        _gateway_jwt_cache["exp"] = now + max(60, expires_in)
        return token
    except Exception as e:
        logger.error("Keycloak client_credentials error: %s", e)
        return None


def resolve_pat_tenant_id(raw_pat: str, webhook_base: str) -> Optional[str]:
    """
    Resolve tenant_id for a raw PAT using Redis then tenant-webhook internal validate.
    """
    h = pat_token_hash(raw_pat)
    key = f"{REDIS_KEY_PREFIX}{h}"

    r = get_redis_client()
    if r:
        try:
            cached = r.get(key)
            if cached:
                return cached
        except Exception as e:
            logger.warning("Redis GET PAT cache failed (degrading to HTTP): %s", e)

    secret = os.getenv("INTERNAL_PAT_VALIDATE_SECRET", "").strip()
    if not secret:
        logger.error("INTERNAL_PAT_VALIDATE_SECRET not set; cannot validate PAT via webhook")
        return None

    url = f"{webhook_base.rstrip('/')}/internal/validate-pat"
    try:
        resp = requests.post(
            url,
            json={"token_hash": h},
            headers={"X-Internal-Secret": secret},
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        body = resp.json()
        if not body.get("valid"):
            return None
        tenant_id = body.get("tenant_id")
        if not tenant_id or not isinstance(tenant_id, str):
            return None
        if r:
            try:
                r.setex(key, PAT_CACHE_TTL_SEC, tenant_id)
            except Exception as e:
                logger.warning("Redis SET PAT cache failed: %s", e)
        return tenant_id
    except Exception as e:
        logger.warning("validate-pat HTTP failed: %s", e)
        return None


def is_pat_token(token: Optional[str]) -> bool:
    return bool(token and token.startswith(PAT_PREFIX))
