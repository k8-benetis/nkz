#!/usr/bin/env python3
# =============================================================================
# External API Credentials Management API
# =============================================================================
# Backend API for managing external API credentials (admin only)

import os
import sys
import logging
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Add common directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'common'))

try:
    from keycloak_auth import require_keycloak_auth, get_current_user, has_role
except ImportError:
    from common.keycloak_auth import require_keycloak_auth, get_current_user, has_role

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
CORS(app, origins=_cors_origins, supports_credentials=True)

POSTGRES_URL = os.getenv('POSTGRES_URL')
if not POSTGRES_URL:
    raise ValueError("POSTGRES_URL environment variable is required")


def _get_fernet():
    """Get Fernet cipher from CREDENTIAL_ENCRYPTION_KEY env var."""
    from cryptography.fernet import Fernet
    key = os.getenv('CREDENTIAL_ENCRYPTION_KEY')
    if not key:
        raise ValueError(
            "CREDENTIAL_ENCRYPTION_KEY not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_credential(plain_text: str) -> str:
    """Encrypt credential using Fernet symmetric encryption."""
    f = _get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_credential(encrypted: str) -> str:
    """Decrypt credential using Fernet symmetric encryption."""
    f = _get_fernet()
    return f.decrypt(encrypted.encode()).decode()


@app.route('/admin/external-api-credentials', methods=['GET'])
@require_keycloak_auth
def list_credentials():
    """List all external API credentials (PlatformAdmin only)"""
    if not has_role('PlatformAdmin'):
        return jsonify({'error': 'Only PlatformAdmin can access this endpoint'}), 403
    
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                id,
                service_name,
                service_url,
                auth_type,
                username,
                description,
                is_active,
                created_at,
                updated_at,
                last_used_at,
                last_used_by
            FROM external_api_credentials
            ORDER BY service_name
        """)
        
        credentials = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({
            'credentials': [dict(c) for c in credentials]
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing credentials: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/admin/external-api-credentials', methods=['POST'])
@require_keycloak_auth
def create_credential():
    """Create new external API credential (PlatformAdmin only)"""
    if not has_role('PlatformAdmin'):
        return jsonify({'error': 'Only PlatformAdmin can access this endpoint'}), 403
    
    try:
        data = request.json
        user = get_current_user()
        
        # Validate required fields
        required = ['service_name', 'service_url', 'auth_type']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Validate auth_type
        if data['auth_type'] not in ['api_key', 'bearer', 'basic_auth', 'none']:
            return jsonify({'error': 'Invalid auth_type'}), 400
        
        # Prepare credential data
        password_encrypted = None
        api_key_encrypted = None
        
        if data['auth_type'] == 'basic_auth':
            if 'username' not in data or not data['username']:
                return jsonify({'error': 'Username required for basic_auth'}), 400
            if 'password' not in data or not data['password']:
                return jsonify({'error': 'Password required for basic_auth'}), 400
            password_encrypted = encrypt_credential(data['password'])
        elif data['auth_type'] in ['api_key', 'bearer']:
            if 'api_key' not in data or not data['api_key']:
                return jsonify({'error': 'API key required'}), 400
            api_key_encrypted = encrypt_credential(data['api_key'])
        
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            INSERT INTO external_api_credentials (
                service_name,
                service_url,
                auth_type,
                username,
                password_encrypted,
                api_key_encrypted,
                additional_params,
                description,
                is_active,
                created_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            data['service_name'],
            data['service_url'],
            data['auth_type'],
            data.get('username'),
            password_encrypted,
            api_key_encrypted,
            json.dumps(data.get('additional_params', {})),
            data.get('description'),
            data.get('is_active', True),
            user.get('preferred_username') or user.get('email')
        ))
        
        credential_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"Created external API credential: {data['service_name']}")
        return jsonify({
            'id': credential_id,
            'message': 'Credential created successfully'
        }), 201
        
    except psycopg2.IntegrityError:
        return jsonify({'error': 'Service name already exists'}), 409
    except Exception as e:
        logger.error(f"Error creating credential: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/admin/external-api-credentials/<credential_id>', methods=['PUT'])
@require_keycloak_auth
def update_credential(credential_id):
    """Update external API credential (PlatformAdmin only)"""
    if not has_role('PlatformAdmin'):
        return jsonify({'error': 'Only PlatformAdmin can access this endpoint'}), 403
    
    try:
        data = request.json
        
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build update query
        updates = []
        values = []
        
        if 'service_url' in data:
            updates.append("service_url = %s")
            values.append(data['service_url'])
        
        if 'auth_type' in data:
            if data['auth_type'] not in ['api_key', 'bearer', 'basic_auth', 'none']:
                return jsonify({'error': 'Invalid auth_type'}), 400
            updates.append("auth_type = %s")
            values.append(data['auth_type'])
        
        if 'username' in data:
            updates.append("username = %s")
            values.append(data['username'])
        
        if 'password' in data and data['password']:
            updates.append("password_encrypted = %s")
            values.append(encrypt_credential(data['password']))
        
        if 'api_key' in data and data['api_key']:
            updates.append("api_key_encrypted = %s")
            values.append(encrypt_credential(data['api_key']))
        
        if 'additional_params' in data:
            updates.append("additional_params = %s")
            values.append(json.dumps(data['additional_params']))
        
        if 'description' in data:
            updates.append("description = %s")
            values.append(data['description'])
        
        if 'is_active' in data:
            updates.append("is_active = %s")
            values.append(data['is_active'])
        
        if not updates:
            return jsonify({'error': 'No fields to update'}), 400
        
        updates.append("updated_at = NOW()")
        values.append(credential_id)
        
        query = f"""
            UPDATE external_api_credentials
            SET {', '.join(updates)}
            WHERE id = %s
            RETURNING id
        """
        
        cur.execute(query, values)
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not updated:
            return jsonify({'error': 'Credential not found'}), 404
        
        return jsonify({'message': 'Credential updated successfully'}), 200
        
    except Exception as e:
        logger.error(f"Error updating credential: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/admin/external-api-credentials/<credential_id>', methods=['DELETE'])
@require_keycloak_auth
def delete_credential(credential_id):
    """Delete external API credential (PlatformAdmin only)"""
    if not has_role('PlatformAdmin'):
        return jsonify({'error': 'Only PlatformAdmin can access this endpoint'}), 403
    
    try:
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("DELETE FROM external_api_credentials WHERE id = %s RETURNING id", (credential_id,))
        deleted = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not deleted:
            return jsonify({'error': 'Credential not found'}), 404
        
        logger.info(f"Deleted external API credential: {credential_id}")
        return jsonify({'message': 'Credential deleted successfully'}), 200
        
    except Exception as e:
        logger.error(f"Error deleting credential: {e}")
        return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

