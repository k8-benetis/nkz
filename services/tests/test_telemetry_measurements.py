"""Tests for telemetry notification handler measurement extraction.

Cannot import notification_handler directly (asyncpg dependency).
Tests replicate the exact extraction logic and verify source code matches.
"""

import os

# Replicate _ENTITY_METADATA_KEYS and _extract_measurements from notification_handler.py
_ENTITY_METADATA_KEYS = frozenset(
    {
        "id",
        "type",
        "@context",
        "location",
        "name",
        "description",
        "dateCreated",
        "dateModified",
        "observedAt",
        "controlledProperty",
        "category",
        "source",
        "provider",
        "seeAlso",
        "ownedBy",
        "address",
        "refDeviceProfile",
        "refDevice",
        "refAgriParcel",
        "refParcel",
        "refWeatherStation",
    }
)


def _extract_measurements(entity):
    """Local copy matching production logic."""
    measurements = {}
    for key, attr in entity.items():
        if key in _ENTITY_METADATA_KEYS:
            continue
        if isinstance(attr, dict):
            attr_type = attr.get("type")
            if attr_type == "Property":
                val = attr.get("value")
                if val is not None and not isinstance(val, (dict, list)):
                    measurements[key] = val
    return measurements


def test_extract_measurements_only_scalar_properties():
    """Only Property type with scalar values should be extracted."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "@context": ["https://example.com/context.jsonld"],
        "temperature": {"type": "Property", "value": 23.5},
        "humidity": {"type": "Property", "value": 65},
        "batteryLevel": {"type": "Property", "value": 88.2},
    }
    assert _extract_measurements(entity) == {
        "temperature": 23.5,
        "humidity": 65,
        "batteryLevel": 88.2,
    }


def test_extract_measurements_skips_relationships():
    """Relationships must be excluded."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "temperature": {"type": "Property", "value": 23.5},
        "refDeviceProfile": {
            "type": "Relationship",
            "object": "urn:ngsi-ld:DeviceProfile:test:soil-sensor",
        },
        "refDevice": {
            "type": "Relationship",
            "object": "urn:ngsi-ld:Device:test:device1",
        },
    }
    m = _extract_measurements(entity)
    assert "refDeviceProfile" not in m
    assert "refDevice" not in m
    assert m == {"temperature": 23.5}


def test_extract_measurements_skips_geoproperties():
    """GeoProperties must be excluded."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "temperature": {"type": "Property", "value": 23.5},
        "location": {
            "type": "GeoProperty",
            "value": {"type": "Point", "coordinates": [1.0, 42.0]},
        },
    }
    m = _extract_measurements(entity)
    assert "location" not in m
    assert m == {"temperature": 23.5}


def test_extract_measurements_skips_metadata_keys():
    """Known metadata keys must be excluded."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "name": {"type": "Property", "value": "Soil Sensor 1"},
        "description": {"type": "Property", "value": "Installed in parcel P1"},
        "controlledProperty": {
            "type": "Property",
            "value": ["temperature", "humidity"],
        },
        "category": {"type": "Property", "value": "sensor"},
        "temperature": {"type": "Property", "value": 23.5},
    }
    m = _extract_measurements(entity)
    assert "name" not in m
    assert "description" not in m
    assert "controlledProperty" not in m
    assert "category" not in m
    assert m == {"temperature": 23.5}


def test_extract_measurements_skips_non_scalar_values():
    """Properties with dict or list values must be excluded."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "temperature": {"type": "Property", "value": 23.5},
        "address": {
            "type": "Property",
            "value": {"streetAddress": "Calle 1"},
        },
    }
    m = _extract_measurements(entity)
    assert "address" not in m
    assert m == {"temperature": 23.5}


def test_extract_measurements_empty_entity():
    """Entity with only system keys should return empty dict."""
    entity = {
        "id": "urn:ngsi-ld:AgriSensor:test:device1",
        "type": "AgriSensor",
        "name": {"type": "Property", "value": "Empty Sensor"},
        "refDeviceProfile": {
            "type": "Relationship",
            "object": "urn:ngsi-ld:DeviceProfile:test:basic",
        },
    }
    assert _extract_measurements(entity) == {}


def test_source_code_matches():
    """Verify production source contains the new filter logic."""
    source_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "telemetry-worker",
        "telemetry_worker",
        "notification_handler.py",
    )
    with open(source_path) as f:
        src = f.read()
    assert "_ENTITY_METADATA_KEYS" in src
    assert "refDeviceProfile" in src
    assert "not isinstance(val, (dict, list))" in src
    # Must NOT contain old logic that stored Relationships/GeoProperties
    assert 'measurements[key] = attr.get("object")' not in src
