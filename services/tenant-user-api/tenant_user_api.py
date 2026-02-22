#!/usr/bin/env python3
# =============================================================================
# Tenant User API - Gestión de Usuarios por TenantAdmin
# =============================================================================
# Permite a TenantAdmin gestionar usuarios de su tenant desde el dashboard

import os
import json
import logging
import requests
import secrets
import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Dict, Any, Optional, List
from functools import wraps

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',') if o.strip()]
CORS(app, origins=_cors_origins, supports_credentials=True)

# Configuration from environment
KEYCLOAK_URL = os.getenv('KEYCLOAK_URL', 'http://keycloak-service:8080')
KEYCLOAK_REALM = os.getenv('KEYCLOAK_REALM', 'nekazari')
KEYCLOAK_CLIENT_ID = os.getenv('KEYCLOAK_CLIENT_ID', 'nekazari-api-gateway')
KEYCLOAK_CLIENT_SECRET = os.getenv('KEYCLOAK_CLIENT_SECRET', '')

# Roles that TenantAdmin can assign
TENANT_ADMIN_ASSIGNABLE_ROLES = ['Farmer', 'TechnicalConsultant', 'DeviceManager']  # DeviceManager kept for backward compatibility
# Roles that only PlatformAdmin can assign
PLATFORM_ONLY_ROLES = ['PlatformAdmin', 'TenantAdmin']


class KeycloakService:
    def __init__(self):
        self.token = None
    
    def get_admin_token(self) -> Optional[str]:
        """Get admin access token from Keycloak"""
        try:
            token_url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
            data = {
                'grant_type': 'client_credentials',
                'client_id': KEYCLOAK_CLIENT_ID,
                'client_secret': KEYCLOAK_CLIENT_SECRET
            }
            
            response = requests.post(token_url, data=data, timeout=10)
            response.raise_for_status()
            
            token_data = response.json()
            self.token = token_data['access_token']
            return self.token
            
        except Exception as e:
            logger.error(f"Failed to get admin token: {e}")
            return None


keycloak = KeycloakService()


def validate_tenant_admin(f):
    """Decorator to validate that the user is a TenantAdmin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        
        token = auth_header.split(' ')[1]
        
        # Validate token and get user info
        try:
            userinfo_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo"
            response = requests.get(userinfo_url, headers={'Authorization': f'Bearer {token}'}, timeout=10)
            response.raise_for_status()
            user_info = response.json()
            
            # Check if user has TenantAdmin or PlatformAdmin role
            # Roles can be in different places in userinfo response
            roles = user_info.get('roles', [])
            if not roles:
                # Try realm_access.roles
                realm_access = user_info.get('realm_access', {})
                roles = realm_access.get('roles', [])
            
            is_tenant_admin = 'TenantAdmin' in roles or 'PlatformAdmin' in roles
            
            if not is_tenant_admin:
                return jsonify({'error': 'Only TenantAdmin or PlatformAdmin can manage users'}), 403
            
            # Get tenant from user attributes (try multiple possible field names)
            tenant = (
                user_info.get('tenant_id') or 
                user_info.get('tenant') or 
                user_info.get('tenant-id') or
                ''
            )
            
            # If tenant is still empty, try to get from user attributes
            if not tenant:
                attributes = user_info.get('attributes', {})
                if isinstance(attributes, dict):
                    tenant = (
                        (attributes.get('tenant_id') or [''])[0] if isinstance(attributes.get('tenant_id'), list) else attributes.get('tenant_id') or
                        (attributes.get('tenant') or [''])[0] if isinstance(attributes.get('tenant'), list) else attributes.get('tenant') or
                        ''
                    )
            
            return f(user_info, tenant, *args, **kwargs)
            
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function


def validate_authenticated_user(f):
    """Decorator to validate that the user is authenticated (any user, not just TenantAdmin)
    
    Decodes JWT token directly without calling userinfo endpoint (which may not be available).
    The token is already validated by the API Gateway before reaching this service.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        
        token = auth_header.split(' ')[1]
        
        try:
            # Decode token directly (token is already validated by API Gateway)
            # We only decode to extract user ID, not to validate (API Gateway already did that)
            decoded = jwt.decode(token, options={"verify_signature": False, "verify_exp": True})
            
            # Log decoded token structure for debugging
            logger.debug(f"Decoded token keys: {list(decoded.keys())}")
            
            # Extract user ID from 'sub' claim (standard JWT claim)
            # Keycloak tokens should always have 'sub', but if missing, try alternatives
            # Note: 'sid' (session ID) is not a reliable user identifier, but we'll use it as last resort
            user_id = decoded.get('sub')
            
            # If sub is missing, this is unusual - log warning
            if not user_id:
                logger.warning(f"Token missing 'sub' claim. Available claims: {list(decoded.keys())}")
                # Try to get user ID from Keycloak Admin API using session info
                # For now, return error - we need 'sub' to identify the user
                logger.error(f"Could not extract user ID (sub) from token. Token structure: {list(decoded.keys())}")
                return jsonify({'error': 'Token missing user identifier. Please log out and log in again.'}), 401
            
            # Create a minimal user_info dict for compatibility with existing code
            user_info = {
                'sub': user_id,
                'id': user_id,
                'email': decoded.get('email', ''),
                'username': decoded.get('preferred_username', ''),
                'firstName': decoded.get('given_name', ''),
                'lastName': decoded.get('family_name', ''),
            }
            
            logger.debug(f"Authenticated user: {user_id}")
            return f(user_info, user_id, *args, **kwargs)
            
        except jwt.ExpiredSignatureError:
            logger.error("Token has expired")
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.DecodeError as e:
            logger.error(f"Token decode error: {e}")
            return jsonify({'error': 'Invalid token format'}), 401
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function


def filter_roles(roles: List[str], user_is_platform_admin: bool) -> List[str]:
    """Filter roles based on user permissions"""
    if user_is_platform_admin:
        return roles
    
    # TenantAdmin can only assign Farmer and DeviceManager
    return [role for role in roles if role in TENANT_ADMIN_ASSIGNABLE_ROLES]


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'tenant-user-api'}), 200


@app.route('/api/tenant/users', methods=['GET'])
@validate_tenant_admin
def list_team_members(user_info: Dict[str, Any], tenant: str):
    """List all users in the tenant"""
    try:
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Get all users from Keycloak realm
        users_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users"
        response = requests.get(
            users_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        response.raise_for_status()
        users = response.json()
        
        # Filter users by tenant
        filtered_users = []
        for user in users:
            user_tenant = user.get('attributes', {}).get('tenant', [''])[0] if user.get('attributes', {}).get('tenant') else ''
            
            # Only show users from the same tenant (or all if PlatformAdmin)
            if user_tenant == tenant or user_info.get('roles', []).__contains__('PlatformAdmin'):
                # Get user's roles
                user_id = user['id']
                roles_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm"
                roles_response = requests.get(
                    roles_url,
                    headers={'Authorization': f'Bearer {admin_token}'},
                    timeout=10
                )
                
                roles = []
                if roles_response.status_code == 200:
                    roles_data = roles_response.json()
                    roles = [r['name'] for r in roles_data]
                
                filtered_users.append({
                    'id': user_id,
                    'email': user.get('email', ''),
                    'firstName': user.get('firstName', ''),
                    'lastName': user.get('lastName', ''),
                    'roles': roles,
                    'createdAt': user.get('createdTimestamp', 0),
                    'enabled': user.get('enabled', False)
                })
        
        return jsonify({'users': filtered_users}), 200
        
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tenant/users', methods=['POST'])
@validate_tenant_admin
def create_user(user_info: Dict[str, Any], tenant: str):
    """Create a new user in the tenant"""
    try:
        data = request.get_json()
        email = data.get('email')
        firstName = data.get('firstName')
        lastName = data.get('lastName')
        password = data.get('password')
        roles = data.get('roles', ['Farmer'])
        temporary = data.get('temporary', True)
        
        if not all([email, password]):
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Filter roles based on permissions
        is_platform_admin = 'PlatformAdmin' in user_info.get('roles', [])
        filtered_roles = filter_roles(roles, is_platform_admin)
        
        if not filtered_roles:
            return jsonify({'error': 'No valid roles specified. You can only assign Farmer and TechnicalConsultant roles.'}), 400
        
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Create user in Keycloak
        create_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users"
        user_data = {
            'email': email,
            'firstName': firstName,
            'lastName': lastName,
            'username': email,
            'enabled': True,
            'emailVerified': False,
            'credentials': [{
                'type': 'password',
                'value': password,
                'temporary': temporary
            }],
            'attributes': {
                'tenant': [tenant]
            }
        }
        
        response = requests.post(
            create_url,
            headers={
                'Authorization': f'Bearer {admin_token}',
                'Content-Type': 'application/json'
            },
            json=user_data,
            timeout=10
        )
        
        if response.status_code != 201:
            error_msg = response.json().get('errorMessage', 'Failed to create user')
            return jsonify({'error': error_msg}), 400
        
        # Get created user ID from Location header
        location = response.headers.get('Location', '')
        user_id = location.split('/')[-1]
        
        # Assign roles to user
        for role_name in filtered_roles:
            # Get role ID
            role_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/roles/{role_name}"
            role_response = requests.get(
                role_url,
                headers={'Authorization': f'Bearer {admin_token}'},
                timeout=10
            )
            
            if role_response.status_code == 200:
                role_data = role_response.json()
                
                # Assign role to user
                mapping_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm"
                requests.post(
                    mapping_url,
                    headers={
                        'Authorization': f'Bearer {admin_token}',
                        'Content-Type': 'application/json'
                    },
                    json=[role_data],
                    timeout=10
                )
        
        return jsonify({
            'success': True,
            'user': {
                'id': user_id,
                'email': email,
                'firstName': firstName,
                'lastName': lastName,
                'roles': filtered_roles,
                'tenant_id': tenant
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tenant/users/<user_id>/roles', methods=['PUT'])
@validate_tenant_admin
def update_user_roles(user_info: Dict[str, Any], tenant: str, user_id: str):
    """Update roles for a user"""
    try:
        data = request.get_json()
        new_roles = data.get('roles', [])
        
        # Filter roles based on permissions
        is_platform_admin = 'PlatformAdmin' in user_info.get('roles', [])
        filtered_roles = filter_roles(new_roles, is_platform_admin)
        
        if not filtered_roles:
            return jsonify({'error': 'No valid roles specified'}), 400
        
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Get current roles
        current_roles_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm"
        current_response = requests.get(
            current_roles_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        
        current_roles = []
        if current_response.status_code == 200:
            current_roles = current_response.json()
        
        # Remove all current roles
        if current_roles:
            requests.delete(
                current_roles_url,
                headers={
                    'Authorization': f'Bearer {admin_token}',
                    'Content-Type': 'application/json'
                },
                json=current_roles,
                timeout=10
            )
        
        # Add new roles
        for role_name in filtered_roles:
            role_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/roles/{role_name}"
            role_response = requests.get(
                role_url,
                headers={'Authorization': f'Bearer {admin_token}'},
                timeout=10
            )
            
            if role_response.status_code == 200:
                role_data = role_response.json()
                mapping_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm"
                requests.post(
                    mapping_url,
                    headers={
                        'Authorization': f'Bearer {admin_token}',
                        'Content-Type': 'application/json'
                    },
                    json=[role_data],
                    timeout=10
                )
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error updating user roles: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tenant/users/<user_id>', methods=['DELETE'])
@validate_tenant_admin
def delete_user(user_info: Dict[str, Any], tenant: str, user_id: str):
    """Delete a user"""
    try:
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Verify user belongs to the same tenant
        user_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}"
        user_response = requests.get(
            user_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        
        if user_response.status_code != 200:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_response.json()
        user_tenant = user_data.get('attributes', {}).get('tenant', [''])[0] if user_data.get('attributes', {}).get('tenant') else ''
        
        # PlatformAdmin can delete any user, TenantAdmin only from their tenant
        is_platform_admin = 'PlatformAdmin' in user_info.get('roles', [])
        if not is_platform_admin and user_tenant != tenant:
            return jsonify({'error': 'Cannot delete users from other tenants'}), 403
        
        # Delete user
        requests.delete(
            user_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tenant/users/<user_id>/reset-password', methods=['POST'])
@validate_tenant_admin
def reset_password(user_info: Dict[str, Any], tenant: str, user_id: str):
    """Reset user password"""
    try:
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Generate temporary password
        temp_password = secrets.token_urlsafe(12)
        
        # Reset password
        reset_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/reset-password"
        reset_data = {
            'type': 'password',
            'value': temp_password,
            'temporary': True
        }
        
        response = requests.put(
            reset_url,
            headers={
                'Authorization': f'Bearer {admin_token}',
                'Content-Type': 'application/json'
            },
            json=reset_data,
            timeout=10
        )
        
        if response.status_code != 204:
            return jsonify({'error': 'Failed to reset password'}), 500
        
        return jsonify({
            'success': True,
            'temporaryPassword': temp_password
        }), 200
        
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tenant/users/me', methods=['PUT'])
@validate_authenticated_user
def update_my_profile(user_info: Dict[str, Any], user_id: str):
    """
    Update current user's profile (firstName, lastName)
    Users can only update their own profile
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        firstName = data.get('firstName')
        lastName = data.get('lastName')
        
        # Validate that at least firstName is provided
        if firstName is None:
            return jsonify({'error': 'firstName is required'}), 400
        
        # Validate data types and length
        if firstName is not None and not isinstance(firstName, str):
            return jsonify({'error': 'firstName must be a string'}), 400
        if lastName is not None and not isinstance(lastName, str):
            return jsonify({'error': 'lastName must be a string'}), 400
        
        # Trim whitespace
        firstName = firstName.strip() if firstName else ''
        lastName = lastName.strip() if lastName else ''
        
        if not firstName:
            return jsonify({'error': 'firstName cannot be empty'}), 400
        
        # Get admin token to update user in Keycloak
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Verify user exists and get current data
        user_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}"
        user_response = requests.get(
            user_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        
        if user_response.status_code != 200:
            logger.error(f"User not found in Keycloak: {user_id}, status: {user_response.status_code}")
            return jsonify({'error': 'User not found'}), 404
        
        # Get current user data to preserve all fields
        current_user_data = user_response.json()
        
        # Keycloak Admin API PUT requires all required fields
        # Prepare update payload preserving all existing data
        update_payload = current_user_data.copy()
        
        # Update only firstName and lastName
        update_payload['firstName'] = firstName
        update_payload['lastName'] = lastName
        
        # Ensure we don't accidentally modify critical fields
        # Remove fields that shouldn't be sent in update (read-only or managed by Keycloak)
        fields_to_remove = ['id', 'createdTimestamp', 'totp', 'notBefore', 'access']
        for field in fields_to_remove:
            update_payload.pop(field, None)
        
        # Update user in Keycloak using PUT
        update_response = requests.put(
            user_url,
            headers={
                'Authorization': f'Bearer {admin_token}',
                'Content-Type': 'application/json'
            },
            json=update_payload,
            timeout=10
        )
        
        if update_response.status_code not in [204, 200]:
            error_msg = 'Failed to update profile'
            try:
                error_data = update_response.json()
                error_msg = error_data.get('errorMessage', error_msg)
            except:
                error_msg = update_response.text or error_msg
            
            logger.error(f"Failed to update user profile in Keycloak: {update_response.status_code} - {error_msg}")
            return jsonify({'error': error_msg}), update_response.status_code
        
        logger.info(f"Successfully updated profile for user {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'user': {
                'id': user_id,
                'firstName': firstName,
                'lastName': lastName
            }
        }), 200
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error updating user profile: {e}")
        return jsonify({'error': f'Failed to update profile: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Error updating user profile: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/tenant/users/stats', methods=['GET'])
@validate_tenant_admin
def get_user_stats(user_info: Dict[str, Any], tenant: str):
    """Get user statistics for the tenant"""
    try:
        admin_token = keycloak.get_admin_token()
        if not admin_token:
            return jsonify({'error': 'Failed to get admin token'}), 500
        
        # Get all users from Keycloak realm
        users_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users"
        response = requests.get(
            users_url,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        response.raise_for_status()
        users = response.json()
        
        count = 0
        for user in users:
            user_tenant = user.get('attributes', {}).get('tenant', [''])[0] if user.get('attributes', {}).get('tenant') else ''
            
            # Only count users from the same tenant (or all if PlatformAdmin)
            if user_tenant == tenant or user_info.get('roles', []).__contains__('PlatformAdmin'):
                count += 1
        
        return jsonify({'total': count}), 200
        
    except Exception as e:
        logger.error(f"Error getting user stats: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

