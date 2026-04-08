"""Tests for municipality_code on WeatherObserved entities."""

from unittest.mock import patch, MagicMock


def test_create_weather_observed_includes_municipality_code():
    """When municipality_code is provided, entity must include municipalityCode Property."""
    from weather_worker.storage.orion_writer import create_weather_observed_entity

    mock_response = MagicMock()
    mock_response.status_code = 201

    with patch(
        "weather_worker.storage.orion_writer.requests.post", return_value=mock_response
    ) as mock_post:
        result = create_weather_observed_entity(
            parcel_id="urn:ngsi-ld:AgriParcel:test:p1",
            tenant_id="test",
            location=(1.0, 42.0),
            weather_data={"temp_avg": 22.5},
            municipality_code="31012",
        )

    assert result is not None
    call_args = mock_post.call_args
    entity = call_args.kwargs.get("json") or call_args[1].get("json")
    assert "municipalityCode" in entity
    assert entity["municipalityCode"]["type"] == "Property"
    assert entity["municipalityCode"]["value"] == "31012"


def test_create_weather_observed_without_municipality_code():
    """When municipality_code is None, entity must NOT include municipalityCode."""
    from weather_worker.storage.orion_writer import create_weather_observed_entity

    mock_response = MagicMock()
    mock_response.status_code = 201

    with patch(
        "weather_worker.storage.orion_writer.requests.post", return_value=mock_response
    ) as mock_post:
        result = create_weather_observed_entity(
            parcel_id="urn:ngsi-ld:AgriParcel:test:p1",
            tenant_id="test",
            location=(1.0, 42.0),
            weather_data={"temp_avg": 22.5},
            municipality_code=None,
        )

    assert result is not None
    call_args = mock_post.call_args
    entity = call_args.kwargs.get("json") or call_args[1].get("json")
    assert "municipalityCode" not in entity


def test_sync_weather_to_orion_passes_municipality_code():
    """sync_weather_to_orion must forward municipality_code to create_weather_observed_entity."""
    from weather_worker.storage.orion_writer import sync_weather_to_orion

    fake_parcel = {
        "id": "urn:ngsi-ld:AgriParcel:test:p1",
        "type": "AgriParcel",
        "location": {
            "type": "GeoProperty",
            "value": {"type": "Point", "coordinates": [1.0, 42.0]},
        },
    }

    with (
        patch(
            "weather_worker.storage.orion_writer.get_parcels_by_location",
            return_value=[fake_parcel],
        ),
        patch(
            "weather_worker.storage.orion_writer.create_weather_observed_entity",
            return_value="urn:ok",
        ) as mock_create,
    ):
        count = sync_weather_to_orion(
            tenant_id="test",
            latitude=42.0,
            longitude=1.0,
            weather_data={"temp_avg": 20.0},
            municipality_code="31012",
        )

    assert count == 1
    mock_create.assert_called_once()
    call_kwargs = mock_create.call_args.kwargs
    assert call_kwargs.get("municipality_code") == "31012"
