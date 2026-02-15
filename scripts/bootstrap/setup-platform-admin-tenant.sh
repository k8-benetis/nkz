#!/bin/bash
# =============================================================================
# Setup Platform Admin Tenant Group in Keycloak
# =============================================================================
# Creates the 'platform' group and configures it for PlatformAdmin users
# Migrates existing PlatformAdmin users from tenant groups to 'platform' group

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-https://auth.robotika.cloud/auth}"
REALM="${KEYCLOAK_REALM:-nekazari}"
TARGET_EMAIL="${1:-}"  # Optional: specific user email to configure

# Get admin credentials from Kubernetes (try local kubectl first, then SSH)
if command -v kubectl &> /dev/null; then
  ADMIN_USER=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.username}' 2>/dev/null | base64 -d || echo "")
  ADMIN_PASS=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "")
fi

# Fallback: get from SSH
if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
  echo "Getting admin credentials from server..."
  SERVER="${NKZ_SERVER:-user@your-server-ip}"
  ADMIN_USER=$(ssh "$SERVER" "sudo k3s kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.username}' | base64 -d" 2>/dev/null || echo "")
  ADMIN_PASS=$(ssh "$SERVER" "sudo k3s kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.password}' | base64 -d" 2>/dev/null || echo "")
fi

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
  echo "❌ Could not get admin credentials"
  echo "Please set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD environment variables"
  exit 1
fi

echo "=== Setting up Platform Admin Tenant Group ==="
echo ""

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Admin token obtained"
echo ""

# Check if 'platform' group exists
PLATFORM_GROUP=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/groups?search=platform" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[] | select(.name == "platform") | .id // empty')

if [ -z "$PLATFORM_GROUP" ]; then
  echo "Creating 'platform' group..."
  
  # Create platform group
  CREATE_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/groups" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "platform",
      "path": "/platform"
    }')
  
  # Get group ID
  PLATFORM_GROUP=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/groups?search=platform" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[] | select(.name == "platform") | .id')
  
  if [ -z "$PLATFORM_GROUP" ]; then
    echo "❌ Failed to create platform group"
    exit 1
  fi
  
  echo "✅ Platform group created (ID: ${PLATFORM_GROUP})"
else
  echo "✅ Platform group already exists (ID: ${PLATFORM_GROUP})"
fi
echo ""

# Set group attributes
echo "Setting group attributes..."
curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/groups/${PLATFORM_GROUP}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"platform\",
    \"path\": \"/platform\",
    \"attributes\": {
      \"tenant_id\": [\"platform\"],
      \"tenant_type\": [\"system\"],
      \"plan_type\": [\"system\"]
    }
  }" > /dev/null

echo "✅ Group attributes set:"
echo "   - tenant_id: platform"
echo "   - tenant_type: system"
echo "   - plan_type: system"
echo ""

# List PlatformAdmin users
echo "=== PlatformAdmin Users ==="
USERS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

PLATFORM_ADMINS=()
while IFS= read -r user_id; do
  USER_ROLES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/role-mappings/realm" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")
  
  HAS_PLATFORM_ADMIN=$(echo "$USER_ROLES" | jq -r '.mappings[] | select(.name == "PlatformAdmin") | .name // empty')
  
  if [ -n "$HAS_PLATFORM_ADMIN" ]; then
    USER_EMAIL=$(echo "$USERS" | jq -r ".[] | select(.id == \"$user_id\") | .email")
    PLATFORM_ADMINS+=("$user_id|$USER_EMAIL")
  fi
done < <(echo "$USERS" | jq -r '.[].id')

if [ ${#PLATFORM_ADMINS[@]} -eq 0 ]; then
  echo "⚠️  No PlatformAdmin users found"
else
  echo "Found ${#PLATFORM_ADMINS[@]} PlatformAdmin user(s):"
  for admin in "${PLATFORM_ADMINS[@]}"; do
    IFS='|' read -r user_id email <<< "$admin"
    
    # If TARGET_EMAIL specified, only process that user
    if [ -n "$TARGET_EMAIL" ] && [ "$email" != "$TARGET_EMAIL" ]; then
      continue
    fi
    
    echo "  - ${email} (${user_id})"
    
    # Get user groups
    USER_GROUPS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/groups" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}")
    
    # Check if in platform group
    IN_PLATFORM=$(echo "$USER_GROUPS" | jq -r ".[] | select(.id == \"${PLATFORM_GROUP}\") | .id // empty")
    
    # Find tenant groups (bootstrap, tenant-*, etc.) that user should NOT be in
    TENANT_GROUPS=$(echo "$USER_GROUPS" | jq -r ".[] | select(.name != \"platform\" and .name != \"Platform Administrators\" and .name != \"default\" and .name != \"offline_access\" and .name != \"uma_authorization\") | .id")
    
    if [ -z "$IN_PLATFORM" ]; then
      echo "    → Adding to platform group..."
      curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/groups/${PLATFORM_GROUP}" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" > /dev/null
      echo "    ✅ Added to platform group"
    else
      echo "    ✅ Already in platform group"
    fi
    
    # Remove from tenant groups (PlatformAdmin should only be in 'platform')
    if [ -n "$TENANT_GROUPS" ]; then
      echo "$TENANT_GROUPS" | while read -r tenant_group_id; do
        if [ -n "$tenant_group_id" ]; then
          tenant_group_name=$(echo "$USER_GROUPS" | jq -r ".[] | select(.id == \"$tenant_group_id\") | .name")
          echo "    → Removing from tenant group '${tenant_group_name}' (PlatformAdmin should only be in 'platform')..."
          curl -s -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/groups/${tenant_group_id}" \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" > /dev/null
          echo "    ✅ Removed from '${tenant_group_name}'"
        fi
      done
    fi
  done
fi
echo ""

echo "=== Summary ==="
echo "✅ Platform group created/configured"
echo "✅ PlatformAdmin users added to platform group"
echo ""
echo "⚠️  IMPORTANT: Users must logout and login again to get new token with tenant-id='platform'"
echo ""
