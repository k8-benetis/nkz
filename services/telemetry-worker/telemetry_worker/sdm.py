"""
SDM digestion pipeline with batch processing support.

Implements high-performance telemetry ingestion with:
- Batch updates to Orion-LD using entityOperations/update
- Direct writes to TimescaleDB for raw historical data
- Redis caching for API key validation
"""

from __future__ import annotations

import os
import logging
import json
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
import requests
import redis

from .config import Settings
from .models import TelemetryPayload, Measurement

logger = logging.getLogger(__name__)

# Redis client for API key caching
_redis_client: Optional[redis.Redis] = None


def get_redis_client(settings: Settings) -> redis.Redis:
    """Get or create Redis client for caching"""
    global _redis_client
    if _redis_client is None:
        redis_url = getattr(settings, 'redis_url', os.getenv('REDIS_URL', 'redis://redis-service:6379'))
        _redis_client = redis.from_url(redis_url, decode_responses=True)
    return _redis_client


async def process_payload(
    payload: TelemetryPayload,
    *,
    api_key: str,
    settings: Settings,
) -> None:
    """
    Process telemetry payload: normalize measurements into SDM entities and persist.
    
    Steps:
      1. Resolve tenant from API key
      2. Lookup sensor profile mapping (sensor_profiles table)
      3. Build NGSI-LD entities and push to Orion-LD
      4. Insert event into telemetry_events table for audit
    """
    logger.info(
        "Processing telemetry payload device=%s profile=%s count=%d",
        payload.deviceId,
        payload.profile,
        len(payload.measurements),
    )
    
    try:
        # Step 1: Resolve tenant from API key
        tenant_id = await _resolve_tenant_from_api_key(api_key, settings)
        if not tenant_id:
            logger.error("Could not resolve tenant from API key")
            raise ValueError("Invalid API key")
        
        # Step 2: Lookup sensor profile
        profile_mapping = await _get_sensor_profile_mapping(payload.profile, tenant_id, settings)
        if not profile_mapping:
            logger.warning(f"Profile {payload.profile} not found, using defaults")
            profile_mapping = {
                'sdm_entity_type': 'AgriSensor',
                'mapping': {'measurements': []}
            }
        
        # Step 3: Build NGSI-LD entity update
        entity_id = f"urn:ngsi-ld:{profile_mapping['sdm_entity_type']}:{tenant_id}:{payload.deviceId}"
        entity_updates = _build_ngsi_ld_updates(payload, profile_mapping)
        
        # Step 4: Update entity in Orion-LD
        await _update_orion_entity(tenant_id, entity_id, entity_updates, settings)
        
        # Step 5: Persist to telemetry_events
        await _persist_telemetry_event(
            tenant_id,
            payload,
            profile_mapping,
            entity_id,
            settings
        )
        
        logger.info(f"Successfully processed telemetry for device {payload.deviceId}")
        
    except Exception as e:
        logger.error(f"Error processing telemetry payload: {e}", exc_info=True)
        raise


async def _resolve_tenant_from_api_key(api_key: str, settings: Settings) -> str | None:
    """Resolve tenant_id from API key hash"""
    import hashlib
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    try:
        # Try activation_codes_db first (where API keys are stored)
        postgres_url = settings.postgres_url
        # Extract connection details
        if 'activation_codes_db' not in postgres_url:
            # Try to connect to activation_codes_db
            # Replace database name in connection string
            if '@' in postgres_url and '/' in postgres_url:
                parts = postgres_url.split('/')
                base_url = '/'.join(parts[:-1])
                postgres_url = f"{base_url}/activation_codes_db"
        
        conn = psycopg2.connect(postgres_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT tenant_id FROM api_keys
            WHERE key_hash = %s AND is_active = true
        """, (key_hash,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        return row['tenant_id'] if row else None
    except Exception as e:
        logger.error(f"Error resolving tenant from API key: {e}")
        return None


async def _get_sensor_profile_mapping(profile_code: str, tenant_id: str, settings: Settings) -> Dict[str, Any] | None:
    """Get sensor profile mapping from database"""
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT sdm_entity_type, mapping
            FROM sensor_profiles
            WHERE code = %s AND (tenant_id IS NULL OR tenant_id = %s)
            ORDER BY tenant_id NULLS LAST
            LIMIT 1
        """, (profile_code, tenant_id))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            return {
                'sdm_entity_type': row['sdm_entity_type'],
                'mapping': row['mapping'] if isinstance(row['mapping'], dict) else {}
            }
        return None
    except Exception as e:
        logger.error(f"Error getting sensor profile: {e}")
        return None


def _build_ngsi_ld_updates(payload: TelemetryPayload, profile_mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Build NGSI-LD entity updates from payload and profile mapping"""
    updates = {}
    mapping_data = profile_mapping.get('mapping', {})
    measurements_map = {m.get('type'): m for m in mapping_data.get('measurements', [])}
    
    # Get latest observedAt from measurements
    latest_observed_at = None
    for measurement in payload.measurements:
        if measurement.observedAt:
            if not latest_observed_at or measurement.observedAt > latest_observed_at:
                latest_observed_at = measurement.observedAt
    
    # Map measurements to NGSI-LD attributes
    for measurement in payload.measurements:
        mapping = measurements_map.get(measurement.type, {})
        attr_name = mapping.get('sdmAttribute', measurement.type)
        
        prop = {
            'type': 'Property',
            'value': measurement.value,
            'observedAt': measurement.observedAt.isoformat() if measurement.observedAt else datetime.utcnow().isoformat()
        }
        
        if measurement.unit:
            prop['unitCode'] = measurement.unit
        elif mapping.get('unit'):
            prop['unitCode'] = mapping['unit']
        
        updates[attr_name] = prop
    
    # Add observedAt at entity level
    if latest_observed_at:
        updates['observedAt'] = {
            'type': 'Property',
            'value': latest_observed_at.isoformat()
        }
    
    return updates


async def _update_orion_entity(tenant_id: str, entity_id: str, updates: Dict[str, Any], settings: Settings) -> None:
    """Update entity in Orion-LD"""
    orion_url = settings.orion_url
    
    try:
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        # Use PATCH to update entity
        response = requests.patch(
            f'{orion_url}/ngsi-ld/v1/entities/{entity_id}/attrs',
            json=updates,
            headers=headers,
            timeout=10
        )
        
        if response.status_code not in [200, 204]:
            logger.warning(f"Failed to update Orion-LD entity: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error updating Orion-LD entity: {e}")


async def _persist_telemetry_event(
    tenant_id: str,
    payload: TelemetryPayload,
    profile_mapping: Dict[str, Any],
    entity_id: str,
    settings: Settings
) -> None:
    """Persist telemetry event to telemetry_events table"""
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor()
        
        # Get sensor_id from sensors table
        sensor_id = None
        cur.execute("""
            SELECT id FROM sensors
            WHERE tenant_id = %s AND external_id = %s
            LIMIT 1
        """, (tenant_id, payload.deviceId))
        row = cur.fetchone()
        if row:
            sensor_id = row[0]
        
        # Get latest observedAt
        latest_observed_at = datetime.utcnow()
        for measurement in payload.measurements:
            if measurement.observedAt:
                if measurement.observedAt > latest_observed_at:
                    latest_observed_at = measurement.observedAt
        
        # Build payload JSON
        payload_json = {
            'deviceId': payload.deviceId,
            'profile': payload.profile,
            'measurements': [
                {
                    'type': m.type,
                    'value': m.value,
                    'unit': m.unit,
                    'observedAt': m.observedAt.isoformat() if m.observedAt else None
                }
                for m in payload.measurements
            ],
            'metadata': payload.metadata
        }
        
        # Insert into telemetry_events
        cur.execute("""
            INSERT INTO telemetry_events (
                tenant_id, observed_at, sensor_id, device_id, profile_code, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        """, (
            tenant_id,
            latest_observed_at,
            sensor_id,
            payload.deviceId,
            payload.profile,
            json.dumps(payload_json)
        ))
        
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"Persisted telemetry event for device {payload.deviceId}")
        
    except Exception as e:
        logger.error(f"Error persisting telemetry event: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()


# =============================================================================
# Synchronous API for Worker (process_payload_dict)
# =============================================================================

def process_payload_dict(
    payload_dict: Dict[str, Any],
    *,
    api_key: str,
    settings: Settings,
    task_id: Optional[str] = None,
) -> None:
    """
    Synchronous wrapper for processing telemetry payload.
    Called by the worker for individual message processing.
    """
    # Parse dict to TelemetryPayload
    measurements = []
    for m in payload_dict.get('measurements', []):
        observed_at = None
        if m.get('observedAt'):
            try:
                observed_at = datetime.fromisoformat(m['observedAt'].replace('Z', '+00:00'))
            except:
                observed_at = datetime.utcnow()
        
        measurements.append(Measurement(
            type=m.get('type', 'unknown'),
            value=m.get('value'),
            unit=m.get('unit'),
            observedAt=observed_at
        ))
    
    payload = TelemetryPayload(
        deviceId=payload_dict.get('deviceId', payload_dict.get('device_id', 'unknown')),
        profile=payload_dict.get('profile', 'default'),
        measurements=measurements,
        metadata=payload_dict.get('metadata', {})
    )
    
    # Process synchronously
    _process_payload_sync(payload, api_key=api_key, settings=settings)


def _process_payload_sync(
    payload: TelemetryPayload,
    *,
    api_key: str,
    settings: Settings,
) -> None:
    """Synchronous version of process_payload"""
    logger.info(
        "Processing telemetry payload device=%s profile=%s count=%d",
        payload.deviceId,
        payload.profile,
        len(payload.measurements),
    )
    
    try:
        # Step 1: Resolve tenant from API key (with caching)
        tenant_id = _resolve_tenant_cached(api_key, settings)
        if not tenant_id:
            logger.error("Could not resolve tenant from API key")
            raise ValueError("Invalid API key")
        
        # Step 2: Lookup sensor profile
        profile_mapping = _get_sensor_profile_sync(payload.profile, tenant_id, settings)
        if not profile_mapping:
            logger.warning(f"Profile {payload.profile} not found, using defaults")
            profile_mapping = {
                'sdm_entity_type': 'AgriSensor',
                'mapping': {'measurements': []}
            }
        
        # Step 3: Build NGSI-LD entity update
        entity_id = f"urn:ngsi-ld:{profile_mapping['sdm_entity_type']}:{tenant_id}:{payload.deviceId}"
        entity_updates = _build_ngsi_ld_updates(payload, profile_mapping)
        
        # Step 4: Update entity in Orion-LD
        _update_orion_entity_sync(tenant_id, entity_id, entity_updates, settings)
        
        # Step 5: Persist to TimescaleDB (telemetry hypertable for raw data)
        _persist_to_timescaledb(tenant_id, payload, entity_id, settings)
        
        logger.info(f"Successfully processed telemetry for device {payload.deviceId}")
        
    except Exception as e:
        logger.error(f"Error processing telemetry payload: {e}", exc_info=True)
        raise


def _resolve_tenant_cached(api_key: str, settings: Settings) -> Optional[str]:
    """Resolve tenant from API key with Redis caching"""
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    cache_key = f"tenant_cache:{key_hash}"
    
    # Try cache first
    try:
        redis_client = get_redis_client(settings)
        cached = redis_client.get(cache_key)
        if cached:
            return cached
    except Exception as e:
        logger.debug(f"Redis cache miss or error: {e}")
    
    # Query database
    try:
        postgres_url = settings.postgres_url
        if 'activation_codes_db' not in postgres_url:
            if '@' in postgres_url and '/' in postgres_url:
                parts = postgres_url.split('/')
                base_url = '/'.join(parts[:-1])
                postgres_url = f"{base_url}/activation_codes_db"
        
        conn = psycopg2.connect(postgres_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT tenant_id FROM api_keys
            WHERE key_hash = %s AND is_active = true
        """, (key_hash,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        tenant_id = row['tenant_id'] if row else None
        
        # Cache result for 5 minutes
        if tenant_id:
            try:
                redis_client = get_redis_client(settings)
                redis_client.setex(cache_key, 300, tenant_id)
            except Exception:
                pass
        
        return tenant_id
    except Exception as e:
        logger.error(f"Error resolving tenant from API key: {e}")
        return None


def _get_sensor_profile_sync(profile_code: str, tenant_id: str, settings: Settings) -> Optional[Dict[str, Any]]:
    """Synchronous version of profile lookup"""
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT sdm_entity_type, mapping
            FROM sensor_profiles
            WHERE code = %s AND (tenant_id IS NULL OR tenant_id = %s)
            ORDER BY tenant_id NULLS LAST
            LIMIT 1
        """, (profile_code, tenant_id))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            return {
                'sdm_entity_type': row['sdm_entity_type'],
                'mapping': row['mapping'] if isinstance(row['mapping'], dict) else {}
            }
        return None
    except Exception as e:
        logger.error(f"Error getting sensor profile: {e}")
        return None


def _update_orion_entity_sync(tenant_id: str, entity_id: str, updates: Dict[str, Any], settings: Settings) -> None:
    """Synchronous Orion-LD entity update"""
    orion_url = settings.orion_url
    
    try:
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        response = requests.patch(
            f'{orion_url}/ngsi-ld/v1/entities/{entity_id}/attrs',
            json=updates,
            headers=headers,
            timeout=10
        )
        
        if response.status_code not in [200, 204]:
            logger.warning(f"Failed to update Orion-LD entity: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error updating Orion-LD entity: {e}")


def _persist_to_timescaledb(
    tenant_id: str,
    payload: TelemetryPayload,
    entity_id: str,
    settings: Settings
) -> None:
    """
    Persist raw telemetry directly to TimescaleDB hypertable.
    This bypasses Orion for historical storage, reducing Context Broker load.
    """
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor()
        
        # Prepare batch insert for telemetry hypertable
        rows = []
        for measurement in payload.measurements:
            observed_at = measurement.observedAt or datetime.utcnow()
            rows.append((
                observed_at,
                tenant_id,
                entity_id,
                payload.deviceId,
                measurement.type,
                float(measurement.value) if isinstance(measurement.value, (int, float)) else None,
                str(measurement.value) if not isinstance(measurement.value, (int, float)) else None,
                measurement.unit
            ))
        
        # Batch insert using execute_values
        if rows:
            execute_values(cur, """
                INSERT INTO telemetry (
                    time, tenant_id, entity_id, device_id, 
                    metric_name, value_numeric, value_text, unit
                )
                VALUES %s
                ON CONFLICT DO NOTHING
            """, rows)
        
        conn.commit()
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error persisting to TimescaleDB: {e}")
        if 'conn' in locals():
            try:
                conn.rollback()
                conn.close()
            except:
                pass


# =============================================================================
# Batch Processing API (High Performance)
# =============================================================================

class TelemetryBatch:
    """
    Accumulator for batch telemetry processing.
    
    Usage:
        batch = TelemetryBatch(settings, max_size=100, max_wait_seconds=1.0)
        batch.add(payload_dict, api_key)
        ...
        if batch.is_ready():
            batch.flush()
    """
    
    def __init__(
        self,
        settings: Settings,
        max_size: int = 100,
        max_wait_seconds: float = 1.0
    ):
        self.settings = settings
        self.max_size = max_size
        self.max_wait_seconds = max_wait_seconds
        self._items: List[Tuple[Dict, str]] = []  # (payload_dict, api_key)
        self._first_item_time: Optional[datetime] = None
    
    def add(self, payload_dict: Dict[str, Any], api_key: str) -> bool:
        """Add item to batch. Returns True if batch should be flushed."""
        if not self._items:
            self._first_item_time = datetime.utcnow()
        
        self._items.append((payload_dict, api_key))
        return self.is_ready()
    
    def is_ready(self) -> bool:
        """Check if batch should be flushed"""
        if len(self._items) >= self.max_size:
            return True
        
        if self._first_item_time:
            elapsed = (datetime.utcnow() - self._first_item_time).total_seconds()
            if elapsed >= self.max_wait_seconds:
                return True
        
        return False
    
    def flush(self) -> Tuple[int, int]:
        """
        Process all items in batch.
        Returns (success_count, error_count)
        """
        if not self._items:
            return 0, 0
        
        success_count = 0
        error_count = 0
        
        # Group by tenant for batch Orion updates
        by_tenant: Dict[str, List[Dict]] = {}
        db_rows: List[tuple] = []
        
        for payload_dict, api_key in self._items:
            try:
                # Resolve tenant
                tenant_id = _resolve_tenant_cached(api_key, self.settings)
                if not tenant_id:
                    error_count += 1
                    continue
                
                # Parse payload
                device_id = payload_dict.get('deviceId', payload_dict.get('device_id', 'unknown'))
                profile_code = payload_dict.get('profile', 'default')
                
                # Get profile
                profile = _get_sensor_profile_sync(profile_code, tenant_id, self.settings)
                if not profile:
                    profile = {'sdm_entity_type': 'AgriSensor', 'mapping': {'measurements': []}}
                
                entity_id = f"urn:ngsi-ld:{profile['sdm_entity_type']}:{tenant_id}:{device_id}"
                
                # Build updates
                measurements = []
                for m in payload_dict.get('measurements', []):
                    observed_at = None
                    if m.get('observedAt'):
                        try:
                            observed_at = datetime.fromisoformat(m['observedAt'].replace('Z', '+00:00'))
                        except:
                            observed_at = datetime.utcnow()
                    else:
                        observed_at = datetime.utcnow()
                    
                    measurements.append(Measurement(
                        type=m.get('type', 'unknown'),
                        value=m.get('value'),
                        unit=m.get('unit'),
                        observedAt=observed_at
                    ))
                    
                    # Prepare DB row
                    db_rows.append((
                        observed_at,
                        tenant_id,
                        entity_id,
                        device_id,
                        m.get('type', 'unknown'),
                        float(m['value']) if isinstance(m.get('value'), (int, float)) else None,
                        str(m['value']) if not isinstance(m.get('value'), (int, float)) else None,
                        m.get('unit')
                    ))
                
                if measurements:
                    payload = TelemetryPayload(
                        deviceId=device_id,
                        profile=profile_code,
                        measurements=measurements,
                        metadata=payload_dict.get('metadata', {})
                    )
                    
                    updates = _build_ngsi_ld_updates(payload, profile)
                    
                    # Group for batch Orion update
                    if tenant_id not in by_tenant:
                        by_tenant[tenant_id] = []
                    
                    by_tenant[tenant_id].append({
                        'id': entity_id,
                        **updates
                    })
                
                success_count += 1
                
            except Exception as e:
                logger.error(f"Error processing batch item: {e}")
                error_count += 1
        
        # Batch update Orion-LD per tenant
        for tenant_id, entities in by_tenant.items():
            _batch_update_orion(tenant_id, entities, self.settings)
        
        # Batch insert to TimescaleDB
        if db_rows:
            _batch_insert_timescaledb(db_rows, self.settings)
        
        # Clear batch
        self._items = []
        self._first_item_time = None
        
        logger.info(f"Batch flush completed: {success_count} success, {error_count} errors")
        return success_count, error_count
    
    def __len__(self) -> int:
        return len(self._items)


def _batch_update_orion(tenant_id: str, entities: List[Dict], settings: Settings) -> None:
    """
    Batch update multiple entities in Orion-LD using entityOperations/update.
    Much more efficient than individual PATCH requests.
    """
    if not entities:
        return
    
    orion_url = settings.orion_url
    
    try:
        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        
        # Use batch update endpoint
        response = requests.post(
            f'{orion_url}/ngsi-ld/v1/entityOperations/update',
            json=entities,
            headers=headers,
            timeout=30
        )
        
        if response.status_code not in [200, 204]:
            logger.warning(
                f"Batch Orion update returned {response.status_code}: {response.text[:200]}"
            )
        else:
            logger.debug(f"Batch updated {len(entities)} entities for tenant {tenant_id}")
            
    except Exception as e:
        logger.error(f"Error in batch Orion update: {e}")


def _batch_insert_timescaledb(rows: List[tuple], settings: Settings) -> None:
    """
    Batch insert telemetry rows to TimescaleDB.
    Uses execute_values for high performance.
    """
    if not rows:
        return
    
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor()
        
        execute_values(cur, """
            INSERT INTO telemetry (
                time, tenant_id, entity_id, device_id,
                metric_name, value_numeric, value_text, unit
            )
            VALUES %s
            ON CONFLICT DO NOTHING
        """, rows)
        
        conn.commit()
        cur.close()
        conn.close()
        
        logger.debug(f"Batch inserted {len(rows)} telemetry rows to TimescaleDB")
        
    except Exception as e:
        logger.error(f"Error in batch TimescaleDB insert: {e}")
        if 'conn' in locals():
            try:
                conn.rollback()
                conn.close()
            except:
                pass
