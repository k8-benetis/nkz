"""
API key validation helpers for the sensor ingestor service.
"""

from __future__ import annotations

import hashlib
import logging
import sys
import os
import time
from dataclasses import dataclass
from threading import RLock
from typing import Dict, Tuple

# Add common directory to path
common_path = os.path.join(os.path.dirname(__file__), '..', '..', 'common')
if os.path.exists(common_path) and common_path not in sys.path:
    sys.path.insert(0, common_path)
# Also try absolute path for Docker
if '/app/common' not in sys.path:
    sys.path.insert(0, '/app/common')

from common.db_helper import get_db_connection_with_tenant

from .config import Settings

logger = logging.getLogger(__name__)


@dataclass
class _CacheEntry:
    valid: bool
    expires_at: float


_api_key_cache: Dict[Tuple[str, str], _CacheEntry] = {}
_cache_lock = RLock()


def _compute_hash(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def validate_api_key(tenant_id: str, api_key: str, settings: Settings) -> bool:
    """
    Validate API key for tenant using cache + database lookup.
    """
    if not tenant_id or not api_key:
        logger.warning("Missing tenant or API key during validation")
        return False

    api_key_hash = _compute_hash(api_key)
    cache_key = (tenant_id, api_key_hash)
    now = time.monotonic()
    ttl = max(settings.api_key_cache_seconds, 0)

    if ttl:
        with _cache_lock:
            cached = _api_key_cache.get(cache_key)
            if cached and cached.expires_at > now:
                return cached.valid

    try:
        with get_db_connection_with_tenant(tenant_id) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 1
                FROM api_keys
                WHERE key_hash = %s
                  AND is_active = TRUE
                LIMIT 1
                """,
                (api_key_hash,),
            )
            row = cursor.fetchone()
            valid = row is not None
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Failed to validate API key for tenant=%s: %s",
            tenant_id,
            exc,
        )
        valid = False

    if ttl:
        expiry = now + ttl
        with _cache_lock:
            _api_key_cache[cache_key] = _CacheEntry(valid=valid, expires_at=expiry)

    if not valid:
        logger.warning("Rejected API key for tenant=%s", tenant_id)

    return valid


def invalidate_api_key_cache(tenant_id: str | None = None) -> None:
    """
    Invalidate cache entries. If tenant_id is provided, only clear keys for that tenant.
    """
    with _cache_lock:
        if tenant_id:
            to_delete = [
                key for key in _api_key_cache.keys() if key[0] == tenant_id
            ]
            for key in to_delete:
                _api_key_cache.pop(key, None)
        else:
            _api_key_cache.clear()

