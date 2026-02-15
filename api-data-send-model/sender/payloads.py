"""
Helpers for building payloads compliant with Smart Data Models.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Iterable, List

from .config import SenderConfig

ISO8601 = "%Y-%m-%dT%H:%M:%SZ"


def _coerce_timestamp(value: Any) -> str:
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).strftime(ISO8601)
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(value, tz=dt.timezone.utc).strftime(ISO8601)
    if isinstance(value, str):
        # Assume already ISO string; fall back to parse
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return parsed.astimezone(dt.timezone.utc).strftime(ISO8601)
        except ValueError:
            raise ValueError(f"Invalid timestamp: {value}")
    raise ValueError(f"Unsupported timestamp type: {type(value)}")


def build_sdm_agri_sensor(config: SenderConfig, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build NGSI-LD AgriSensor entity from measurements.

    Expected `data` keys:
      - measurements: Iterable of dicts with keys
          * type (eg soilMoisture, soilTemperature)
          * value (float/int)
          * unit (string, optional)
          * observedAt (ISO8601 or epoch)
      - metadata: dict with optional keys (parcelId, stationId, location, etc.)
    """
    measurements = data.get("measurements")
    if not isinstance(measurements, Iterable):
        raise ValueError("measurements must be an iterable")

    metadata = config.payload.meta | (data.get("metadata") or {})
    device_id = config.device.id
    tenant_id = config.auth.tenant
    
    # Generate entity ID
    entity_id = f"urn:ngsi-ld:AgriSensor:{tenant_id}:{device_id}"
    
    # Build NGSI-LD entity
    entity = {
        "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
        "id": entity_id,
        "type": "AgriSensor",
        "name": {
            "type": "Property",
            "value": metadata.get("name", f"Sensor {device_id}")
        },
        "deviceId": {
            "type": "Property",
            "value": device_id
        },
        "observedAt": _coerce_timestamp(data.get("observedAt", dt.datetime.now(dt.timezone.utc)))
    }
    
    # Add measurements as properties
    for item in measurements:
        try:
            prop_name = item["type"]
            prop_value = item["value"]
            prop_unit = item.get("unit")
            observed_at = _coerce_timestamp(item.get("observedAt", data.get("observedAt", dt.datetime.now(dt.timezone.utc))))
            
            prop = {
                "type": "Property",
                "value": prop_value,
                "observedAt": observed_at
            }
            
            if prop_unit:
                prop["unitCode"] = prop_unit
            
            entity[prop_name] = prop
            
        except KeyError as exc:
            raise ValueError(f"Missing field in measurement: {exc}") from exc
    
    # Add metadata properties
    if "parcelId" in metadata:
        entity["belongsToParcel"] = {
            "type": "Relationship",
            "object": metadata["parcelId"]
        }
    
    if "stationId" in metadata:
        entity["stationId"] = {
            "type": "Property",
            "value": metadata["stationId"]
        }
    
    if "location" in metadata:
        loc = metadata["location"]
        if isinstance(loc, dict) and "coordinates" in loc:
            entity["location"] = {
                "type": "GeoProperty",
                "value": {
                    "type": "Point",
                    "coordinates": loc["coordinates"]
                }
            }
    
    return entity


SDM_BUILDERS = {
    "sdm_agri_sensor": build_sdm_agri_sensor,
}


def build_payload_from_dict(config: SenderConfig, data: Dict[str, Any]) -> Dict[str, Any]:
    builder_id = config.payload.builder
    builder = SDM_BUILDERS.get(builder_id)
    if not builder:
        raise ValueError(f"Unsupported payload builder: {builder_id}")
    return builder(config, data)

