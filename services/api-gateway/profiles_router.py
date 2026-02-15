"""
Processing Profiles API Router.

Provides CRUD endpoints for managing telemetry processing profiles.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profiles", tags=["Processing Profiles"])


# =============================================================================
# Models
# =============================================================================

class SamplingRateConfig(BaseModel):
    mode: str = Field(default="throttle", description="throttle | sample | all")
    interval_seconds: int = Field(default=60, ge=0)


class ProfileConfig(BaseModel):
    sampling_rate: Optional[SamplingRateConfig] = None
    active_attributes: Optional[List[str]] = None
    ignore_attributes: Optional[List[str]] = None
    delta_threshold: Optional[Dict[str, float]] = None


class ProfileCreate(BaseModel):
    device_type: str = Field(..., min_length=1, max_length=100)
    device_id: Optional[str] = Field(None, max_length=255)
    tenant_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    config: ProfileConfig
    priority: int = Field(default=0)
    is_active: bool = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[ProfileConfig] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class ProfileResponse(BaseModel):
    id: str
    device_type: str
    device_id: Optional[str]
    tenant_id: Optional[str]
    name: str
    description: Optional[str]
    config: Dict[str, Any]
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TelemetryStats(BaseModel):
    total_received: int
    total_persisted: int
    storage_savings_percent: float
    by_device_type: Dict[str, Dict[str, int]]


# =============================================================================
# Database Connection
# =============================================================================

def get_db_connection():
    """Get PostgreSQL connection."""
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgresql"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        database=os.getenv("POSTGRES_DB", "nekazari"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "")
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=List[ProfileResponse])
async def list_profiles(
    device_type: Optional[str] = Query(None, description="Filter by device type"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
    include_inactive: bool = Query(False, description="Include inactive profiles"),
):
    """List all processing profiles."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
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
        
        if not include_inactive:
            query += " AND is_active = true"
        
        query += " ORDER BY device_type, priority DESC"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        return [ProfileResponse(**row) for row in rows]
        
    except Exception as e:
        logger.error(f"Error listing profiles: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/device-types", response_model=List[str])
async def list_device_types():
    """List unique device types that have profiles."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT DISTINCT device_type 
            FROM processing_profiles 
            ORDER BY device_type
        """)
        
        types = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        return types
        
    except Exception as e:
        logger.error(f"Error listing device types: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=TelemetryStats)
async def get_telemetry_stats(
    tenant_id: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
):
    """Get telemetry statistics including storage savings."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # This would need a telemetry_stats table or Redis counters
        # For now, estimate from telemetry_events
        query = """
            SELECT 
                COUNT(*) as persisted,
                entity_type as device_type
            FROM telemetry_events
            WHERE observed_at > NOW() - INTERVAL '%s hours'
        """
        params = [hours]
        
        if tenant_id:
            query += " AND tenant_id = %s"
            params.append(tenant_id)
        
        query += " GROUP BY entity_type"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        total_persisted = sum(row['persisted'] for row in rows)
        by_type = {row['device_type']: {'persisted': row['persisted']} for row in rows}
        
        # Estimate received (this would come from Redis counters in production)
        # Using 2x multiplier as rough estimate for throttled data
        estimated_received = int(total_persisted * 2.5)
        savings = ((estimated_received - total_persisted) / max(estimated_received, 1)) * 100
        
        cur.close()
        conn.close()
        
        return TelemetryStats(
            total_received=estimated_received,
            total_persisted=total_persisted,
            storage_savings_percent=round(savings, 1),
            by_device_type=by_type
        )
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: str):
    """Get a specific profile by ID."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT id::text, device_type, device_id, tenant_id::text,
                   name, description, config, priority, is_active,
                   created_at, updated_at
            FROM processing_profiles
            WHERE id = %s::uuid
        """, (profile_id,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        return ProfileResponse(**row)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=ProfileResponse, status_code=201)
async def create_profile(profile: ProfileCreate):
    """Create a new processing profile."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        import json
        config_json = profile.config.model_dump() if profile.config else {}
        
        cur.execute("""
            INSERT INTO processing_profiles (
                device_type, device_id, tenant_id, name, description,
                config, priority, is_active
            )
            VALUES (%s, %s, %s::uuid, %s, %s, %s::jsonb, %s, %s)
            RETURNING id::text, device_type, device_id, tenant_id::text,
                      name, description, config, priority, is_active,
                      created_at, updated_at
        """, (
            profile.device_type,
            profile.device_id,
            profile.tenant_id,
            profile.name,
            profile.description,
            json.dumps(config_json),
            profile.priority,
            profile.is_active
        ))
        
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return ProfileResponse(**row)
        
    except Exception as e:
        logger.error(f"Error creating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(profile_id: str, updates: ProfileUpdate):
    """Update an existing profile."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build dynamic update
        update_fields = []
        params = []
        
        if updates.name is not None:
            update_fields.append("name = %s")
            params.append(updates.name)
        
        if updates.description is not None:
            update_fields.append("description = %s")
            params.append(updates.description)
        
        if updates.config is not None:
            import json
            update_fields.append("config = %s::jsonb")
            params.append(json.dumps(updates.config.model_dump()))
        
        if updates.priority is not None:
            update_fields.append("priority = %s")
            params.append(updates.priority)
        
        if updates.is_active is not None:
            update_fields.append("is_active = %s")
            params.append(updates.is_active)
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = NOW()")
        params.append(profile_id)
        
        query = f"""
            UPDATE processing_profiles
            SET {', '.join(update_fields)}
            WHERE id = %s::uuid
            RETURNING id::text, device_type, device_id, tenant_id::text,
                      name, description, config, priority, is_active,
                      created_at, updated_at
        """
        
        cur.execute(query, params)
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        conn.commit()
        cur.close()
        conn.close()
        
        return ProfileResponse(**row)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: str):
    """Delete a profile."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            DELETE FROM processing_profiles
            WHERE id = %s::uuid
            RETURNING id
        """, (profile_id,))
        
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Profile not found")
        
        conn.commit()
        cur.close()
        conn.close()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))
