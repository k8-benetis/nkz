#!/bin/bash
# =============================================================================
# Fix Platform Admin User - Quick fix script
# =============================================================================
# This script configures a PlatformAdmin user correctly
# Usage: ./fix-platform-admin-user.sh user@example.com

set -e

TARGET_EMAIL="${1:-admin@yourdomain.com}"
KEYCLOAK_URL="https://auth.robotika.cloud/auth"
REALM="nekazari"

echo "=== Fixing PlatformAdmin User: ${TARGET_EMAIL} ==="
echo ""

# Ask for admin credentials (can't use kubectl from script easily)
if [ -z "$KEYCLOAK_ADMIN_USER" ] || [ -z "$KEYCLOAK_ADMIN_PASS" ]; then
  echo "Enter Keycloak Admin Credentials:"
  read -p "Admin Username: " KEYCLOAK_ADMIN_USER
  read -sp "Admin Password: " KEYCLOAK_ADMIN_PASS
  echo ""
fi

# Get admin token
echo "Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN_USER}" \
  -d "password=${KEYCLOAK_ADMIN_PASS}" \
  -d "grant_type=password")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null || echo "")

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Failed to get admin token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Admin token obtained"
echo ""

HEADERS=(-H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json")

# 1. Create/verify platform group
echo "1. Creating/verifying 'platform' group..."
GROUPS_RESPONSE=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/groups" "${HEADERS[@]}")
PLATFORM_GROUP=$(echo "$GROUPS_RESPONSE" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
platform = next((g for g in groups if g.get('name') == 'platform'), None)
print(json.dumps(platform) if platform else '')
")

if [ -z "$PLATFORM_GROUP" ]; then
  echo "   Creating platform group..."
  CREATE_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/groups" "${HEADERS[@]}" \
    -d '{
      "name": "platform",
      "path": "/platform",
      "attributes": {
        "tenant_id": ["platform"],
        "tenant_type": ["system"],
        "plan_type": ["system"]
      }
    }')
  
  # Get created group
  GROUPS_RESPONSE=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/groups" "${HEADERS[@]}")
  PLATFORM_GROUP=$(echo "$GROUPS_RESPONSE" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
platform = next((g for g in groups if g.get('name') == 'platform'), None)
print(json.dumps(platform) if platform else '')
")
  
  if [ -z "$PLATFORM_GROUP" ]; then
    echo "   ❌ Failed to create platform group"
    exit 1
  fi
  echo "   ✅ Platform group created"
else
  echo "   ✅ Platform group already exists"
  # Update attributes
  PLATFORM_GROUP_ID=$(echo "$PLATFORM_GROUP" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
  curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/groups/${PLATFORM_GROUP_ID}" "${HEADERS[@]}" \
    -d '{
      "name": "platform",
      "path": "/platform",
      "attributes": {
        "tenant_id": ["platform"],
        "tenant_type": ["system"],
        "plan_type": ["system"]
      }
    }' >/dev/null
  echo "   ✅ Platform group attributes updated"
fi

PLATFORM_GROUP_ID=$(echo "$PLATFORM_GROUP" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo ""

# 2. Find user
echo "2. Finding user: ${TARGET_EMAIL}..."
USER_RESPONSE=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${TARGET_EMAIL}&exact=true" "${HEADERS[@]}")
USER_DATA=$(echo "$USER_RESPONSE" | python3 -c "
import sys, json
users = json.load(sys.stdin)
user = users[0] if users else None
print(json.dumps(user) if user else '')
")

if [ -z "$USER_DATA" ]; then
  echo "   ❌ User not found: ${TARGET_EMAIL}"
  exit 1
fi

USER_ID=$(echo "$USER_DATA" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "   ✅ User found: ${USER_ID}"
echo ""

# 3. Assign PlatformAdmin role
echo "3. Assigning PlatformAdmin role..."
ROLE_RESPONSE=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/PlatformAdmin" "${HEADERS[@]}")
ROLE_EXISTS=$(echo "$ROLE_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print('ok' if data.get('id') else '')" 2>/dev/null || echo "")

if [ -z "$ROLE_EXISTS" ]; then
  echo "   Creating PlatformAdmin role..."
  curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" "${HEADERS[@]}" \
    -d '{"name": "PlatformAdmin", "description": "Platform administrator with full access"}' >/dev/null
  echo "   ✅ PlatformAdmin role created"
fi

ROLE_RESPONSE=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/PlatformAdmin" "${HEADERS[@]}")
ROLE_ID=$(echo "$ROLE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Assign role
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm" "${HEADERS[@]}" \
  -d "[{\"id\": \"${ROLE_ID}\", \"name\": \"PlatformAdmin\"}]" >/dev/null
echo "   ✅ PlatformAdmin role assigned"
echo ""

# 4. Add user to platform group
echo "4. Adding user to 'platform' group..."
USER_GROUPS=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/groups" "${HEADERS[@]}")
IN_PLATFORM=$(echo "$USER_GROUPS" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
in_platform = any(g['id'] == '${PLATFORM_GROUP_ID}' for g in groups)
print('yes' if in_platform else 'no')
")

if [ "$IN_PLATFORM" != "yes" ]; then
  curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/groups/${PLATFORM_GROUP_ID}" "${HEADERS[@]}" >/dev/null
  echo "   ✅ User added to platform group"
else
  echo "   ✅ User already in platform group"
fi
echo ""

# 5. Remove from tenant groups
echo "5. Removing user from tenant groups..."
TENANT_GROUPS=$(echo "$USER_GROUPS" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
tenant_groups = [
    g for g in groups 
    if g['name'] not in ('platform', 'Platform Administrators', 'default', 'offline_access', 'uma_authorization')
    and not g['name'].lower().endswith(('administrators', 'admins'))
]
for g in tenant_groups:
    print(g['id'] + '|' + g['name'])
")

if [ -n "$TENANT_GROUPS" ]; then
  echo "$TENANT_GROUPS" | while IFS='|' read -r group_id group_name; do
    if [ -n "$group_id" ]; then
      echo "   Removing from group: ${group_name}..."
      curl -s -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/groups/${group_id}" "${HEADERS[@]}" >/dev/null
      echo "   ✅ Removed from ${group_name}"
    fi
  done
else
  echo "   ✅ User not in any tenant groups"
fi
echo ""

echo "=== Summary ==="
echo "✅ PlatformAdmin user configured: ${TARGET_EMAIL}"
echo "✅ User is in 'platform' group"
echo "✅ User has PlatformAdmin role"
echo ""
echo "⚠️  IMPORTANT: User must logout and login again to get new token"
echo "   New token will include: tenant-id='platform' and role='PlatformAdmin'"
echo ""
