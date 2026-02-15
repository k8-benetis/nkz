"""
Notification handler for Orion-LD subscriptions.

Receives NGSI-LD entity updates and persists to TimescaleDB
after applying Processing Profiles (throttle, filter, delta).
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, BackgroundTasks, Header
import psycopg2
from psycopg2.extras import RealDictCursor
import json

from .config import Settings
from .profiles import ProfileService, ProcessingProfile

logger = logging.getLogger(__name__)

router = APIRouter()

# Global instances (initialized on first use)
_settings: Optional[Settings] = None
_profile_service: Optional[ProfileService] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def get_profile_service() -> ProfileService:
    global _profile_service
    if _profile_service is None:
        _profile_service = ProfileService(get_settings())
    return _profile_service


async def process_notification_task(
    data: Dict[str, Any],
    tenant_id: Optional[str] = None,
):
    """
    Background task to process Orion-LD notification.
    
    Flow:
    1. Extract entity info (id, type, attributes)
    2. Get processing profile for device type
    3. Apply throttle/delta checks
    4. Filter attributes
    5. Persist to TimescaleDB
    
    NOTE: Does NOT write back to Orion (data comes from Orion subscription)
    """
    settings = get_settings()
    profile_service = get_profile_service()
    
    try:
        entities = data.get("data", [])
        if not entities:
            logger.debug("Empty notification received")
            return
        
        for entity in entities:
            await _process_entity(entity, tenant_id, settings, profile_service)
                
    except Exception as e:
        logger.error(f"Error processing notification: {e}", exc_info=True)


async def _process_entity(
    entity: Dict[str, Any],
    tenant_id: Optional[str],
    settings: Settings,
    profile_service: ProfileService,
) -> None:
    """Process a single NGSI-LD entity."""
    entity_id = entity.get("id", "")
    entity_type = entity.get("type", "")
    
    if not entity_id or not entity_type:
        logger.warning("Entity missing id or type, skipping")
        return
    
    # Extract device_id from entity_id (format: urn:ngsi-ld:Type:tenant:device)
    device_id = entity_id.split(":")[-1] if ":" in entity_id else entity_id
    
    logger.debug(f"Processing entity: {entity_type}/{device_id}")
    
    # Get processing profile
    profile = profile_service.get_profile(
        device_type=entity_type,
        device_id=device_id,
        tenant_id=tenant_id,
    )
    
    # Extract measurements from entity attributes
    measurements = _extract_measurements(entity)
    
    if not measurements:
        logger.debug(f"No measurements in entity {entity_id}")
        return
    
    # Check if should persist (throttle + delta)
    if not profile_service.should_persist(profile, device_id, measurements):
        logger.debug(f"Skipping persistence for {device_id} (throttle/delta)")
        return
    
    # Filter attributes
    filtered = profile_service.filter_attributes(profile, measurements)
    
    if not filtered:
        logger.debug(f"No attributes after filtering for {device_id}")
        return
    
    # Persist to TimescaleDB
    await _persist_to_timescale(
        entity_id=entity_id,
        entity_type=entity_type,
        device_id=device_id,
        tenant_id=tenant_id,
        measurements=filtered,
        raw_entity=entity,
        settings=settings,
    )
    
    # Update last values cache for future delta checks
    profile_service.update_last_values(device_id, measurements)
    
    logger.info(f"Persisted {len(filtered)} attributes for {entity_type}/{device_id}")


def _extract_measurements(entity: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract measurement values from NGSI-LD entity attributes.
    
    NGSI-LD format:
    {
        "temperature": {
            "type": "Property",
            "value": 23.5,
            "observedAt": "2024-01-01T12:00:00Z"
        }
    }
    """
    measurements = {}
    skip_keys = {"id", "type", "@context", "location"}
    
    for key, attr in entity.items():
        if key in skip_keys:
            continue
        
        if isinstance(attr, dict):
            attr_type = attr.get("type")
            
            if attr_type == "Property":
                measurements[key] = attr.get("value")
            elif attr_type == "GeoProperty":
                # Store location as-is for spatial queries
                measurements[key] = attr.get("value")
            elif attr_type == "Relationship":
                # Store relationship object
                measurements[key] = attr.get("object")
    
    return measurements


async def _persist_to_timescale(
    entity_id: str,
    entity_type: str,
    device_id: str,
    tenant_id: Optional[str],
    measurements: Dict[str, Any],
    raw_entity: Dict[str, Any],
    settings: Settings,
) -> None:
    """Persist telemetry data to TimescaleDB."""
    try:
        conn = psycopg2.connect(settings.postgres_url)
        cur = conn.cursor()
        
        observed_at = datetime.utcnow()
        
        # Extract observedAt from entity if available
        for attr in raw_entity.values():
            if isinstance(attr, dict) and "observedAt" in attr:
                try:
                    observed_at = datetime.fromisoformat(
                        attr["observedAt"].replace("Z", "+00:00")
                    )
                    break
                except ValueError:
                    pass
        
        # Insert into telemetry_events table
        cur.execute("""
            INSERT INTO telemetry_events (
                tenant_id, observed_at, device_id, 
                entity_id, entity_type, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        """, (
            tenant_id,
            observed_at,
            device_id,
            entity_id,
            entity_type,
            json.dumps({
                "measurements": measurements,
                "raw": raw_entity,
            })
        ))
        
        conn.commit()
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error persisting to TimescaleDB: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        raise


@router.post("/notify")
async def receive_notification(
    request: Request, 
    background_tasks: BackgroundTasks,
    fiware_service: Optional[str] = Header(None, alias="Fiware-Service"),
):
    """
    Endpoint for Orion-LD notifications.
    
    Accepts NGSI-LD subscription notifications and processes them
    in the background for fast acknowledgment.
    """
    try:
        body = await request.json()
        
        # Extract tenant from Fiware-Service header
        tenant_id = fiware_service
        
        # Fast response - process in background
        background_tasks.add_task(process_notification_task, body, tenant_id)
        
        return {"status": "received"}
        
    except Exception as e:
        logger.error(f"Invalid notification received: {e}")
        return {"error": "invalid payload"}, 400


@router.post("/v2/notify")
async def receive_notification_v2(
    request: Request,
    background_tasks: BackgroundTasks,
    fiware_service: Optional[str] = Header(None, alias="Fiware-Service"),
):
    """
    Alternative endpoint for v2 format notifications.
    Maintains compatibility with older Orion subscriptions.
    """
    return await receive_notification(request, background_tasks, fiware_service)

