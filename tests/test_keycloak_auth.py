#!/usr/bin/env python3
# =============================================================================
# Tests for keycloak_auth.py
# =============================================================================

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'common'))

import unittest
from unittest.mock import Mock, patch, MagicMock
from keycloak_auth import (
    validate_keycloak_token,
    extract_tenant_id,
    TokenValidationError,
    KeycloakAuthError
)
import jwt


class TestKeycloakAuth(unittest.TestCase):
    """Tests for Keycloak authentication module"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.test_issuer = "http://keycloak-service:8080/realms/nekazari"
        self.test_tenant_id = "test-tenant-123"
    
    def test_extract_tenant_id(self):
        """Test tenant_id extraction from payload"""
        from keycloak_auth import extract_tenant_id
        
        # Test with tenant-id claim
        payload1 = {'tenant-id': 'tenant-1', 'sub': 'user-1'}
        self.assertEqual(extract_tenant_id(payload1), 'tenant-1')
        
        # Test with tenant_id claim
        payload2 = {'tenant_id': 'tenant-2', 'sub': 'user-2'}
        self.assertEqual(extract_tenant_id(payload2), 'tenant-2')
        
        # Test with tenant claim
        payload3 = {'tenant': 'tenant-3', 'sub': 'user-3'}
        self.assertEqual(extract_tenant_id(payload3), 'tenant-3')
        
        # Test with no tenant
        payload4 = {'sub': 'user-4'}
        self.assertIsNone(extract_tenant_id(payload4))
    
    @patch('keycloak_auth.validate_keycloak_token')
    def test_validate_keycloak_token_mock(self, mock_validate):
        """Test token validation with mock"""
        # Mock successful validation
        mock_validate.return_value = {
            'sub': 'user-123',
            'preferred_username': 'testuser',
            'tenant-id': 'test-tenant',
            'realm_access': {'roles': ['Farmer']},
            'exp': 9999999999,
            'iss': 'http://keycloak-service:8080/realms/nekazari'
        }
        
        result = mock_validate('fake-token')
        self.assertIsNotNone(result)
        self.assertEqual(result['preferred_username'], 'testuser')
    
    def test_extract_tenant_id_priority(self):
        """Test that tenant-id takes priority over tenant_id"""
        from keycloak_auth import extract_tenant_id
        
        # tenant-id should take priority
        payload = {
            'tenant-id': 'priority-tenant',
            'tenant_id': 'secondary-tenant',
            'tenant': 'third-tenant'
        }
        self.assertEqual(extract_tenant_id(payload), 'priority-tenant')


if __name__ == '__main__':
    unittest.main()

