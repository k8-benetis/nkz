"""
Tests for services/api-gateway/fiware_api_gateway.py

Focuses on the /health endpoint and authentication enforcement on
protected endpoints.  All external dependencies are mocked.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

# ---------------------------------------------------------------------------
# Ensure imports resolve correctly
# ---------------------------------------------------------------------------
_services_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_common_dir = os.path.join(_services_dir, "common")
_api_gateway_dir = os.path.join(_services_dir, "api-gateway")

for _p in (_services_dir, _common_dir, _api_gateway_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)


# ---------------------------------------------------------------------------
# Fixture: import the API gateway app with all required env vars mocked
# ---------------------------------------------------------------------------
@pytest.fixture
def api_client(monkeypatch):
    """
    Create a Flask test client for the API gateway.

    All mandatory environment variables are set to safe test values so the
    module can be imported without raising ``ValueError``.
    """
    # Set required env vars BEFORE importing the module
    monkeypatch.setenv("ORION_URL", "http://orion-test:1026")
    monkeypatch.setenv("KEYCLOAK_URL", "http://keycloak-test:8080")
    monkeypatch.setenv("CONTEXT_URL", "http://context-test/ngsi-context.jsonld")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-testing-only")
    monkeypatch.setenv("HMAC_SECRET", "test-hmac-secret")
    monkeypatch.setenv("KEYCLOAK_REALM", "nekazari")
    monkeypatch.setenv("TRUST_API_GATEWAY", "false")
    monkeypatch.setenv("ALLOW_JWT_FALLBACK", "false")

    import importlib

    # Reload keycloak_auth first so it picks up the mocked env vars
    import keycloak_auth
    importlib.reload(keycloak_auth)

    # Now import (or reload) the gateway module
    import fiware_api_gateway as gw
    importlib.reload(gw)

    return gw.app.test_client()


# =========================================================================
# 1. /health endpoint
# =========================================================================
class TestHealthEndpoint:
    """The /health endpoint should be publicly accessible and return 200."""

    def test_health_returns_200(self, api_client):
        resp = api_client.get("/health")
        assert resp.status_code == 200

    def test_health_response_contains_status(self, api_client):
        resp = api_client.get("/health")
        data = resp.get_json()
        assert "status" in data
        assert data["status"] == "healthy"

    def test_health_response_contains_service_name(self, api_client):
        resp = api_client.get("/health")
        data = resp.get_json()
        assert data.get("service") == "fiware-api-gateway"

    def test_health_response_contains_timestamp(self, api_client):
        resp = api_client.get("/health")
        data = resp.get_json()
        assert "timestamp" in data


# =========================================================================
# 2. Protected endpoints reject unauthenticated requests
# =========================================================================
class TestProtectedEndpointsAuth:
    """Protected NGSI-LD proxy routes must require a valid Bearer token."""

    def test_entities_without_auth_returns_401(self, api_client):
        """GET /ngsi-ld/v1/entities/<id> without Authorization -> 401."""
        resp = api_client.get("/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1")
        assert resp.status_code == 401
        data = resp.get_json()
        assert "error" in data

    def test_entities_with_invalid_auth_scheme_returns_401(self, api_client):
        """Using Basic auth instead of Bearer -> 401."""
        resp = api_client.get(
            "/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert resp.status_code == 401

    def test_entities_with_garbage_token_returns_401(self, api_client):
        """A Bearer token that is not a valid JWT -> 401."""
        resp = api_client.get(
            "/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1",
            headers={"Authorization": "Bearer not-a-real-jwt-token"},
        )
        assert resp.status_code == 401

    def test_put_entity_without_auth_returns_401(self, api_client):
        """PUT /ngsi-ld/v1/entities/<id> without Authorization -> 401."""
        resp = api_client.put(
            "/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1",
            json={"type": "TestEntity"},
        )
        assert resp.status_code == 401

    def test_patch_entity_without_auth_returns_401(self, api_client):
        """PATCH /ngsi-ld/v1/entities/<id> without Authorization -> 401."""
        resp = api_client.patch(
            "/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1",
            json={"type": "TestEntity"},
        )
        assert resp.status_code == 401

    def test_delete_entity_without_auth_returns_401(self, api_client):
        """DELETE /ngsi-ld/v1/entities/<id> without Authorization -> 401."""
        resp = api_client.delete("/ngsi-ld/v1/entities/urn:ngsi-ld:Entity:1")
        assert resp.status_code == 401
