#!/usr/bin/env python3
# =============================================================================
# External API Client - Helper for accessing external APIs with credentials
# =============================================================================
# Retrieves and uses credentials from external_api_credentials table

import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, Any, Optional
import requests
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)

POSTGRES_URL = os.getenv('POSTGRES_URL')


def get_external_api_credential(service_name: str) -> Optional[Dict[str, Any]]:
    """
    Get credential for an external API service
    
    Args:
        service_name: Service identifier (e.g., 'sentinel-hub', 'aemet')
    
    Returns:
        Dict with credential info or None if not found
    """
    if not POSTGRES_URL:
        logger.error("POSTGRES_URL not configured")
        return None
    
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                service_name,
                service_url,
                auth_type,
                username,
                password_encrypted,
                api_key_encrypted,
                additional_params,
                is_active
            FROM external_api_credentials
            WHERE service_name = %s AND is_active = true
        """, (service_name,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            return dict(row)
        return None
        
    except Exception as e:
        logger.error(f"Error getting external API credential: {e}")
        return None


def make_authenticated_request(
    service_name: str,
    endpoint: str,
    method: str = 'GET',
    params: Optional[Dict] = None,
    json_data: Optional[Dict] = None,
    headers: Optional[Dict] = None
) -> Optional[requests.Response]:
    """
    Make authenticated request to external API
    
    Args:
        service_name: Service identifier
        endpoint: API endpoint (relative to service_url)
        method: HTTP method
        params: Query parameters
        json_data: JSON body
        headers: Additional headers
    
    Returns:
        Response object or None if error
    """
    credential = get_external_api_credential(service_name)
    if not credential:
        logger.error(f"Credential not found for service: {service_name}")
        return None
    
    service_url = credential['service_url'].rstrip('/')
    full_url = f"{service_url}/{endpoint.lstrip('/')}"
    
    # Prepare headers
    request_headers = headers or {}
    request_headers['Content-Type'] = 'application/json'
    
    # Add authentication based on auth_type
    auth = None
    if credential['auth_type'] == 'api_key':
        api_key = credential.get('api_key_encrypted')
        if api_key:
            # API key can be in header or query param (check additional_params)
            api_key_header = credential.get('additional_params', {}).get('api_key_header', 'X-API-Key')
            request_headers[api_key_header] = api_key
    elif credential['auth_type'] == 'bearer':
        api_key = credential.get('api_key_encrypted')
        if api_key:
            request_headers['Authorization'] = f"Bearer {api_key}"
    elif credential['auth_type'] == 'basic_auth':
        username = credential.get('username')
        password = credential.get('password_encrypted')
        if username and password:
            auth = HTTPBasicAuth(username, password)
    
    # Add additional headers from additional_params
    additional_headers = credential.get('additional_params', {}).get('headers', {})
    request_headers.update(additional_headers)
    
    try:
        if method.upper() == 'GET':
            response = requests.get(full_url, params=params, headers=request_headers, auth=auth, timeout=30)
        elif method.upper() == 'POST':
            response = requests.post(full_url, params=params, json=json_data, headers=request_headers, auth=auth, timeout=30)
        elif method.upper() == 'PUT':
            response = requests.put(full_url, params=params, json=json_data, headers=request_headers, auth=auth, timeout=30)
        elif method.upper() == 'DELETE':
            response = requests.delete(full_url, params=params, headers=request_headers, auth=auth, timeout=30)
        else:
            logger.error(f"Unsupported HTTP method: {method}")
            return None
        
        # Update last_used_at
        update_last_used(service_name)
        
        return response
        
    except Exception as e:
        logger.error(f"Error making request to {service_name}: {e}")
        return None


def update_last_used(service_name: str):
    """Update last_used_at timestamp for credential"""
    if not POSTGRES_URL:
        return
    
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE external_api_credentials
            SET last_used_at = NOW(),
                last_used_by = current_setting('app.current_user', true)
            WHERE service_name = %s
        """, (service_name,))
        
        conn.commit()
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.warning(f"Error updating last_used_at: {e}")


# Export
__all__ = [
    'get_external_api_credential',
    'make_authenticated_request',
    'update_last_used',
]

