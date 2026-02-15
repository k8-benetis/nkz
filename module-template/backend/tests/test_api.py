"""
Tests for MODULE_DISPLAY_NAME Backend
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Test client fixture."""
    return TestClient(app)


class TestHealth:
    """Health endpoint tests."""
    
    def test_health_check(self, client):
        """Test health endpoint returns healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
        assert "version" in data


class TestAPI:
    """API endpoint tests."""
    
    def test_docs_available(self, client):
        """Test OpenAPI docs are available."""
        response = client.get("/api/MODULE_NAME/docs")
        # Should return HTML or redirect
        assert response.status_code in [200, 307]
    
    def test_openapi_schema(self, client):
        """Test OpenAPI schema is generated."""
        response = client.get("/api/MODULE_NAME/openapi.json")
        assert response.status_code == 200
        
        schema = response.json()
        assert "openapi" in schema
        assert "paths" in schema
    
    def test_list_data_requires_auth(self, client):
        """Test that list endpoint requires authentication."""
        response = client.get("/api/MODULE_NAME/data")
        # Should return 403 (no auth) or require token
        assert response.status_code in [401, 403]
