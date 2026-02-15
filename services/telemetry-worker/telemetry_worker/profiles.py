"""
Processing Profiles Service for Telemetry Worker.

Provides configurable data governance: throttling, filtering, delta thresholds.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
import redis

from .config import Settings

logger = logging.getLogger(__name__)

# Default profile when none found
DEFAULT_PROFILE_CONFIG = {
    "sampling_rate": {"mode": "all", "interval_seconds": 0},
    "active_attributes": None,  # None = all
    "ignore_attributes": [],
    "delta_threshold": {},
}


@dataclass
class ProcessingProfile:
    """Processing profile configuration."""
    
    device_type: str
    config: Dict[str, Any] = field(default_factory=dict)
    device_id: Optional[str] = None
    tenant_id: Optional[str] = None
    
    @property
    def sampling_mode(self) -> str:
        return self.config.get("sampling_rate", {}).get("mode", "all")
    
    @property
    def sampling_interval(self) -> int:
        return self.config.get("sampling_rate", {}).get("interval_seconds", 0)
    
    @property
    def active_attributes(self) -> Optional[List[str]]:
        return self.config.get("active_attributes")
    
    @property
    def ignore_attributes(self) -> List[str]:
        return self.config.get("ignore_attributes", [])
    
    @property
    def delta_thresholds(self) -> Dict[str, float]:
        return self.config.get("delta_threshold", {})


class ProfileService:
    """
    Service for loading and caching processing profiles.
    
    Lookup order:
    1. device_id + tenant_id (most specific)
    2. device_type + tenant_id
    3. device_type + device_id (global)
    4. device_type only (global default)
    5. Fallback to DEFAULT_PROFILE_CONFIG
    """
    
    CACHE_TTL = 300  # 5 minutes
    CACHE_PREFIX = "processing_profile:"
    LAST_VALUE_PREFIX = "telemetry_last:"
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self._redis: Optional[redis.Redis] = None
        self._init_redis()
    
    def _init_redis(self) -> None:
        """Initialize Redis connection."""
        try:
            self._redis = redis.from_url(
                self.settings.redis_url,
                decode_responses=True
            )
            self._redis.ping()
            logger.info("ProfileService connected to Redis")
        except Exception as e:
            logger.warning(f"Redis connection failed, using DB-only mode: {e}")
            self._redis = None
    
    def get_profile(
        self,
        device_type: str,
        device_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> ProcessingProfile:
        """
        Get processing profile for a device.
        
        Uses Redis cache with fallback to PostgreSQL.
        """
        # Try cache first
        cached = self._get_from_cache(device_type, device_id, tenant_id)
        if cached:
            return cached
        
        # Load from database
        profile = self._load_from_db(device_type, device_id, tenant_id)
        
        # Cache the result
        self._cache_profile(profile)
        
        return profile
    
    def _get_cache_key(
        self, 
        device_type: str, 
        device_id: Optional[str], 
        tenant_id: Optional[str]
    ) -> str:
        """Generate cache key."""
        parts = [self.CACHE_PREFIX, device_type]
        if device_id:
            parts.append(device_id)
        if tenant_id:
            parts.append(tenant_id)
        return ":".join(parts)
    
    def _get_from_cache(
        self,
        device_type: str,
        device_id: Optional[str],
        tenant_id: Optional[str],
    ) -> Optional[ProcessingProfile]:
        """Try to get profile from Redis cache."""
        if not self._redis:
            return None
        
        try:
            key = self._get_cache_key(device_type, device_id, tenant_id)
            data = self._redis.get(key)
            if data:
                config = json.loads(data)
                return ProcessingProfile(
                    device_type=device_type,
                    device_id=device_id,
                    tenant_id=tenant_id,
                    config=config,
                )
        except Exception as e:
            logger.debug(f"Cache miss or error: {e}")
        
        return None
    
    def _cache_profile(self, profile: ProcessingProfile) -> None:
        """Cache profile in Redis."""
        if not self._redis:
            return
        
        try:
            key = self._get_cache_key(
                profile.device_type, 
                profile.device_id, 
                profile.tenant_id
            )
            self._redis.setex(
                key,
                self.CACHE_TTL,
                json.dumps(profile.config)
            )
        except Exception as e:
            logger.debug(f"Failed to cache profile: {e}")
    
    def _load_from_db(
        self,
        device_type: str,
        device_id: Optional[str],
        tenant_id: Optional[str],
    ) -> ProcessingProfile:
        """Load profile from PostgreSQL with fallback logic."""
        try:
            conn = psycopg2.connect(self.settings.postgres_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Query with priority ordering
            cur.execute("""
                SELECT device_type, device_id, tenant_id::text, config
                FROM processing_profiles
                WHERE device_type = %s
                  AND is_active = true
                  AND (device_id IS NULL OR device_id = %s)
                  AND (tenant_id IS NULL OR tenant_id = %s::uuid)
                ORDER BY 
                    CASE WHEN device_id = %s AND tenant_id = %s::uuid THEN 0
                         WHEN device_id IS NULL AND tenant_id = %s::uuid THEN 1
                         WHEN device_id = %s AND tenant_id IS NULL THEN 2
                         ELSE 3 END,
                    priority DESC
                LIMIT 1
            """, (device_type, device_id, tenant_id, device_id, tenant_id, tenant_id, device_id))
            
            row = cur.fetchone()
            cur.close()
            conn.close()
            
            if row:
                return ProcessingProfile(
                    device_type=row['device_type'],
                    device_id=row['device_id'],
                    tenant_id=row['tenant_id'],
                    config=row['config'] if isinstance(row['config'], dict) else {},
                )
            
        except Exception as e:
            logger.error(f"Error loading profile from DB: {e}")
        
        # Return default profile
        return ProcessingProfile(
            device_type=device_type,
            device_id=device_id,
            tenant_id=tenant_id,
            config=DEFAULT_PROFILE_CONFIG.copy(),
        )
    
    # =========================================================================
    # Throttling & Delta Logic
    # =========================================================================
    
    def should_persist(
        self,
        profile: ProcessingProfile,
        device_id: str,
        measurements: Dict[str, Any],
    ) -> bool:
        """
        Determine if data should be persisted based on profile rules.
        
        Checks:
        1. Throttle (time-based)
        2. Delta threshold (value change)
        """
        # Mode "all" = always persist
        if profile.sampling_mode == "all":
            return True
        
        # Throttle check
        if profile.sampling_mode == "throttle" and profile.sampling_interval > 0:
            if not self._check_throttle(device_id, profile.sampling_interval):
                # Check delta as fallback - if significant change, persist anyway
                if profile.delta_thresholds:
                    if self._check_delta(device_id, measurements, profile.delta_thresholds):
                        return True
                return False
        
        # Delta check only (no throttle)
        if profile.delta_thresholds:
            return self._check_delta(device_id, measurements, profile.delta_thresholds)
        
        return True
    
    def _check_throttle(self, device_id: str, interval_seconds: int) -> bool:
        """Check if enough time has passed since last save."""
        if not self._redis:
            return True  # No cache, allow all
        
        try:
            key = f"{self.LAST_VALUE_PREFIX}{device_id}:last_save"
            last_save = self._redis.get(key)
            
            if last_save:
                last_time = datetime.fromisoformat(last_save)
                if datetime.utcnow() - last_time < timedelta(seconds=interval_seconds):
                    return False
            
            return True
        except Exception:
            return True
    
    def _check_delta(
        self,
        device_id: str,
        measurements: Dict[str, Any],
        thresholds: Dict[str, float],
    ) -> bool:
        """Check if any measurement exceeds its delta threshold."""
        if not self._redis:
            return True  # No cache, allow all
        
        try:
            for attr, threshold in thresholds.items():
                if attr not in measurements:
                    continue
                
                new_value = measurements[attr]
                if not isinstance(new_value, (int, float)):
                    continue
                
                key = f"{self.LAST_VALUE_PREFIX}{device_id}:{attr}"
                old_value = self._redis.get(key)
                
                if old_value is not None:
                    try:
                        old_val = float(old_value)
                        if abs(new_value - old_val) >= threshold:
                            return True
                    except ValueError:
                        return True
                else:
                    # No previous value, should persist
                    return True
            
            return False
        except Exception:
            return True
    
    def update_last_values(
        self,
        device_id: str,
        measurements: Dict[str, Any],
    ) -> None:
        """Update cached last values after successful persistence."""
        if not self._redis:
            return
        
        try:
            pipe = self._redis.pipeline()
            
            # Update last save time
            save_key = f"{self.LAST_VALUE_PREFIX}{device_id}:last_save"
            pipe.setex(save_key, 3600, datetime.utcnow().isoformat())
            
            # Update attribute values
            for attr, value in measurements.items():
                if isinstance(value, (int, float)):
                    key = f"{self.LAST_VALUE_PREFIX}{device_id}:{attr}"
                    pipe.setex(key, 3600, str(value))
            
            pipe.execute()
        except Exception as e:
            logger.debug(f"Failed to update last values: {e}")
    
    def filter_attributes(
        self,
        profile: ProcessingProfile,
        measurements: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Filter measurements based on active/ignore attributes."""
        result = {}
        
        active = profile.active_attributes
        ignore = set(profile.ignore_attributes)
        
        for key, value in measurements.items():
            # Skip ignored
            if key in ignore:
                continue
            
            # If active list specified, only include those
            if active is not None and key not in active:
                continue
            
            result[key] = value
        
        return result
    
    def invalidate_cache(
        self,
        device_type: Optional[str] = None,
        device_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> None:
        """Invalidate cached profiles (call after updating profiles)."""
        if not self._redis:
            return
        
        try:
            pattern = f"{self.CACHE_PREFIX}*"
            if device_type:
                pattern = f"{self.CACHE_PREFIX}{device_type}*"
            
            keys = self._redis.keys(pattern)
            if keys:
                self._redis.delete(*keys)
                logger.info(f"Invalidated {len(keys)} cached profiles")
        except Exception as e:
            logger.warning(f"Failed to invalidate cache: {e}")
