#!/usr/bin/env python3
"""
Setup Platform Admin Tenant Group in Keycloak
Creates the 'platform' group and configures PlatformAdmin users
"""
import os
import sys
import json
import requests
import subprocess
import base64

KEYCLOAK_URL = os.getenv('KEYCLOAK_URL', 'https://auth.robotika.cloud/auth')
REALM = os.getenv('KEYCLOAK_REALM', 'nekazari')
TARGET_EMAIL = sys.argv[1] if len(sys.argv) > 1 else None

def get_secret_from_k8s(secret_name, key):
    """Get secret from Kubernetes"""
    try:
        cmd = f"sudo k3s kubectl get secret {secret_name} -n nekazari -o jsonpath='{{.data.{key}}}'"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            decoded = base64.b64decode(result.stdout.strip()).decode('utf-8')
            if decoded:
                return decoded
    except Exception as e:
        print(f"  Warning: Could not get secret via kubectl: {e}")
    return None

def get_admin_token():
    """Get Keycloak admin token"""
    # Try environment variables first
    admin_user = os.getenv('KEYCLOAK_ADMIN') or os.getenv('KEYCLOAK_ADMIN_USERNAME')
    admin_pass = os.getenv('KEYCLOAK_ADMIN_PASSWORD')
    
    # Fallback to Kubernetes secret
    if not admin_user:
        admin_user = get_secret_from_k8s('keycloak-admin-credentials', 'username')
    if not admin_pass:
        admin_pass = get_secret_from_k8s('keycloak-admin-credentials', 'password')
    
    if not admin_user or not admin_pass:
        print("❌ Could not get admin credentials")
        print("   Set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD environment variables")
        print("   Or ensure kubectl access to keycloak-admin-credentials secret")
        sys.exit(1)
    
    url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    data = {
        'client_id': 'admin-cli',
        'username': admin_user,
        'password': admin_pass,
        'grant_type': 'password'
    }
    
    response = requests.post(url, data=data)
    if response.status_code != 200:
        print(f"❌ Failed to get admin token: {response.status_code}")
        sys.exit(1)
    
    return response.json()['access_token']

def main():
    print("=== Setting up Platform Admin Tenant Group ===\n")
    
    token = get_admin_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    # Create or get platform group
    print("Creating/verifying 'platform' group...")
    groups_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/groups"
    groups_response = requests.get(groups_url, headers=headers)
    groups = groups_response.json()
    
    platform_group = next((g for g in groups if g.get('name') == 'platform'), None)
    
    if not platform_group:
        print("  Creating platform group...")
        create_response = requests.post(
            groups_url,
            headers={**headers, 'Content-Type': 'application/json'},
            json={
                'name': 'platform',
                'path': '/platform',
                'attributes': {
                    'tenant_id': ['platform'],
                    'tenant_type': ['system'],
                    'plan_type': ['system']
                }
            }
        )
        if create_response.status_code in (201, 200):
            # Get the created group
            groups_response = requests.get(groups_url, headers=headers)
            platform_group = next((g for g in groups_response.json() if g.get('name') == 'platform'), None)
            print("  ✅ Platform group created")
        else:
            print(f"  ❌ Failed to create platform group: {create_response.status_code}")
            sys.exit(1)
    else:
        print("  ✅ Platform group already exists")
        # Update attributes
        update_response = requests.put(
            f"{groups_url}/{platform_group['id']}",
            headers={**headers, 'Content-Type': 'application/json'},
            json={
                'name': 'platform',
                'path': '/platform',
                'attributes': {
                    'tenant_id': ['platform'],
                    'tenant_type': ['system'],
                    'plan_type': ['system']
                }
            }
        )
        if update_response.status_code in (200, 204):
            print("  ✅ Platform group attributes updated")
    
    platform_group_id = platform_group['id']
    print(f"  Group ID: {platform_group_id}\n")
    
    # Get all users
    print("Finding PlatformAdmin users...")
    users_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/users"
    users_response = requests.get(users_url, headers=headers)
    all_users = users_response.json()
    
    platform_admins = []
    for user in all_users:
        # Get user roles
        roles_url = f"{users_url}/{user['id']}/role-mappings/realm"
        roles_response = requests.get(roles_url, headers=headers)
        roles_data = roles_response.json()
        
        # Check if user has PlatformAdmin role
        has_platform_admin = any(
            role.get('name') == 'PlatformAdmin' 
            for role in (roles_data.get('mappings') or [])
        )
        
        if has_platform_admin:
            email = user.get('email')
            if not TARGET_EMAIL or email == TARGET_EMAIL:
                platform_admins.append((user['id'], email))
    
    if not platform_admins:
        print("⚠️  No PlatformAdmin users found")
        if TARGET_EMAIL:
            print(f"   (Searching for: {TARGET_EMAIL})")
    else:
        print(f"Found {len(platform_admins)} PlatformAdmin user(s):\n")
        
        for user_id, email in platform_admins:
            print(f"  - {email}")
            
            # Get user groups
            user_groups_url = f"{users_url}/{user_id}/groups"
            user_groups_response = requests.get(user_groups_url, headers=headers)
            user_groups = user_groups_response.json()
            
            # Check if in platform group
            in_platform = any(g['id'] == platform_group_id for g in user_groups)
            
            # Find tenant groups (bootstrap, tenant-*, etc.)
            tenant_groups = [
                g for g in user_groups 
                if g['name'] not in ('platform', 'Platform Administrators', 'default', 'offline_access', 'uma_authorization')
                and not g['name'].lower().endswith(('administrators', 'admins'))
            ]
            
            if not in_platform:
                print("    → Adding to platform group...")
                add_response = requests.put(
                    f"{user_groups_url}/{platform_group_id}",
                    headers=headers
                )
                if add_response.status_code in (200, 204):
                    print("    ✅ Added to platform group")
                else:
                    print(f"    ❌ Failed to add to platform group: {add_response.status_code}")
            else:
                print("    ✅ Already in platform group")
            
            # Remove from tenant groups
            for tenant_group in tenant_groups:
                print(f"    → Removing from tenant group '{tenant_group['name']}'...")
                remove_response = requests.delete(
                    f"{user_groups_url}/{tenant_group['id']}",
                    headers=headers
                )
                if remove_response.status_code in (200, 204):
                    print(f"    ✅ Removed from '{tenant_group['name']}'")
    
    print("\n=== Summary ===")
    print("✅ Platform group created/configured")
    print("✅ PlatformAdmin users configured")
    print("\n⚠️  IMPORTANT: Users must logout and login again to get new token with tenant-id='platform'\n")

if __name__ == '__main__':
    main()
