"""
Resolve NGSI-LD entity URNs to Timescale query keys (weather station/municipality or IoT device id).
Read-only: Orion-LD + PostgreSQL (cadastral / catalog). No writes.
Migrated from entity-manager timeseries-location responsibility (Strangler Fig).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import requests
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

ORION_URL = (os.getenv("ORION_URL") or "").rstrip("/")
POSTGRES_URL = os.getenv("POSTGRES_URL")

PARCEL_ENTITY_TYPES = set(
    t.strip()
    for t in os.getenv(
        "PARCEL_ENTITY_TYPES",
        "AgriParcel,Parcel,Vineyard,OliveGrove,vineyard,olive_grove",
    ).split(",")
    if t.strip()
)


def _orion_headers(
    tenant_id: str, extra: Optional[Dict[str, str]] = None
) -> Dict[str, str]:
    h: Dict[str, str] = {"Accept": "application/ld+json"}
    if tenant_id:
        h["NGSILD-Tenant"] = tenant_id
        h["Fiware-Service"] = tenant_id
    if extra:
        h.update(extra)
    return h


def normalize_device_id(entity_id: Optional[str]) -> str:
    if not entity_id:
        return ""
    if ":" in entity_id:
        return entity_id.rsplit(":", 1)[-1]
    return entity_id


def _is_agri_sensor_type(etype: str) -> bool:
    et = (etype or "").strip()
    if not et:
        return False
    if et == "AgriSensor":
        return True
    return et.endswith("/AgriSensor") or "AgriSensor" == et.split("/")[-1]


def fetch_orion_entity(tenant_id: str, entity_id: str) -> Optional[Dict[str, Any]]:
    if not ORION_URL or not entity_id:
        return None
    url = f"{ORION_URL}/ngsi-ld/v1/entities/{entity_id}"
    try:
        r = requests.get(url, headers=_orion_headers(tenant_id), timeout=10)
    except Exception as e:
        logger.warning("Orion request failed for %s: %s", entity_id, e)
        return None
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except json.JSONDecodeError:
        return None


def _municipality_from_parcel_address_entity(
    parcel_entity: Optional[Dict[str, Any]],
) -> Optional[Tuple[str, str]]:
    """
    Match catalog_municipalities.ine_code from Orion parcel address (addressLocality / addressRegion).
    Used when cadastral_parcels has no row (common) or URN has no extractable UUID.
    """
    if not parcel_entity or not POSTGRES_URL:
        return None
    addr = parcel_entity.get("address")
    if isinstance(addr, dict) and "value" in addr:
        addr = addr["value"]
    if not isinstance(addr, dict):
        return None
    loc = addr.get("addressLocality") or addr.get("addressRegion") or ""
    if not isinstance(loc, str) or not loc.strip():
        return None
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT ine_code FROM catalog_municipalities
            WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s))
            LIMIT 1
            """,
            (loc.strip(),),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            return (row["ine_code"], "municipality")
    except Exception as e:
        logger.debug("Catalog lookup for municipality name failed: %s", e)
    return None


def _parcel_urn_to_municipality_code(
    tenant_id: str, parcel_urn: str, parcel_entity: Optional[dict] = None
) -> Optional[Tuple[str, str]]:
    uuid_candidate = None
    parts = parcel_urn.split(":")
    if parts:
        last = parts[-1].strip()
        if re.match(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
            last,
        ):
            uuid_candidate = last
        elif last.startswith("parcel-"):
            uuid_candidate = last[7:].strip()
            if not re.match(r"^[0-9a-fA-F-]{36}$", uuid_candidate):
                uuid_candidate = None
    if not uuid_candidate:
        return _municipality_from_parcel_address_entity(parcel_entity)

    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT twl.municipality_code
            FROM cadastral_parcels cp
            LEFT JOIN tenant_weather_locations twl ON twl.id = cp.weather_location_id
            WHERE cp.id = %s::uuid AND cp.tenant_id = %s
            LIMIT 1
            """,
            (uuid_candidate, tenant_id),
        )
        row = cur.fetchone()
        if row and row.get("municipality_code"):
            cur.close()
            conn.close()
            return (row["municipality_code"], "municipality")
        cur.execute(
            """
            SELECT cm.ine_code
            FROM cadastral_parcels cp
            JOIN catalog_municipalities cm ON LOWER(TRIM(cm.name)) = LOWER(TRIM(cp.municipality))
            WHERE cp.id = %s::uuid AND cp.tenant_id = %s
            LIMIT 1
            """,
            (uuid_candidate, tenant_id),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row.get("ine_code"):
            return (row["ine_code"], "municipality")
    except Exception as e:
        logger.debug("cadastral_parcels lookup failed for %s: %s", uuid_candidate, e)

    # No cadastral row (table often empty): still resolve weather key from Orion address
    return _municipality_from_parcel_address_entity(parcel_entity)


def _resolve_urn_to_weather_key(
    tenant_id: str,
    entity_id: str,
    entity: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[str], str]:
    """
    Mirror entity-manager _resolve_urn_to_timeseries_entity_id for weather_observations keys only.
    Returns (timeseries_entity_id, source) or (None, reason).
    """
    if not entity_id or not isinstance(entity_id, str):
        return None, "not_found"
    entity_id = entity_id.strip()
    if not entity_id.lower().startswith("urn:"):
        return entity_id, "passthrough"

    if not ORION_URL:
        return None, "no_orion"

    if entity is None:
        entity = fetch_orion_entity(tenant_id, entity_id)
    if not entity:
        return None, "not_found"

    etype_raw = entity.get("type") or ""
    etype = etype_raw.strip()
    # JSON-LD may use short name or full URI
    etype_short = etype.split("/")[-1] if "/" in etype else etype

    if etype_short == "WeatherObserved" or etype.endswith("WeatherObserved"):
        # Direct resolution: entity carries its own municipality code
        muni_prop = entity.get("municipalityCode")
        if muni_prop:
            muni_val = (
                muni_prop.get("value") if isinstance(muni_prop, dict) else muni_prop
            )
            if isinstance(muni_val, str) and muni_val.strip():
                return (muni_val.strip(), "municipality")

        # Fallback: legacy chain via refParcel -> parcel -> address
        ref_parcel = entity.get("refParcel")
        if not ref_parcel:
            return None, "no_location"
        parcel_urn = (
            ref_parcel.get("object") if isinstance(ref_parcel, dict) else ref_parcel
        )
        if not parcel_urn:
            return None, "no_location"
        parcel_urn = str(parcel_urn).strip()
        parcel_entity = fetch_orion_entity(tenant_id, parcel_urn)
        if not parcel_entity:
            return None, "no_location"
        res = _parcel_urn_to_municipality_code(tenant_id, parcel_urn, parcel_entity)
        return (None, "no_location") if res is None else res

    if etype_short in PARCEL_ENTITY_TYPES or "parcel" in etype_short.lower():
        res = _parcel_urn_to_municipality_code(tenant_id, entity_id, entity)
        return (None, "no_location") if res is None else res

    return None, "no_location"


def plan_timeseries_read(tenant_id: str, entity_urn: str) -> Dict[str, Any]:
    """
    Decide whether to read telemetry_events (IoT) or weather_observations for this URN.
    """
    eid = (entity_urn or "").strip()
    device_candidates: List[str] = []
    if eid:
        device_candidates.append(eid)
        short = normalize_device_id(eid)
        if short and short != eid:
            device_candidates.append(short)

    if not eid.lower().startswith("urn:"):
        wkey, wsrc = _resolve_urn_to_weather_key(tenant_id, eid)
        if wkey:
            return {
                "mode": "weather",
                "weather_key": wkey,
                "weather_source": wsrc,
                "device_candidates": device_candidates,
            }
        return {
            "mode": "telemetry",
            "weather_key": None,
            "weather_source": "",
            "device_candidates": device_candidates,
        }

    ent = fetch_orion_entity(tenant_id, eid) if ORION_URL else None
    if ent and _is_agri_sensor_type(ent.get("type") or ""):
        return {
            "mode": "telemetry",
            "weather_key": None,
            "weather_source": "",
            "device_candidates": device_candidates,
        }

    wkey, wsrc = _resolve_urn_to_weather_key(tenant_id, eid, entity=ent)
    if wkey:
        return {
            "mode": "weather",
            "weather_key": wkey,
            "weather_source": wsrc,
            "device_candidates": device_candidates,
        }

    return {
        "mode": "telemetry",
        "weather_key": None,
        "weather_source": "",
        "device_candidates": device_candidates,
    }
