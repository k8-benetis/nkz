#!/bin/bash
# =============================================================================
# Assign PlatformAdmin Role to User
# =============================================================================

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-https://auth.robotika.cloud/auth}"
REALM="${KEYCLOAK_REALM:-nekazari}"

# Get admin credentials
ADMIN_USER=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.password}' | base64 -d)

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

# Get user email
if [ -z "$1" ]; then
  read -p "Enter user email: " USER_EMAIL
else
  USER_EMAIL="$1"
fi

# Get user ID
USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${USER_EMAIL}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id // empty')

if [ -z "$USER_ID" ]; then
  echo "❌ User not found: ${USER_EMAIL}"
  exit 1
fi

# Get PlatformAdmin role
PLATFORM_ADMIN_ROLE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/PlatformAdmin" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

if [ -z "$(echo "$PLATFORM_ADMIN_ROLE" | jq -r '.id // empty')" ]; then
  echo "❌ PlatformAdmin role does not exist. Creating it..."
  
  # Create PlatformAdmin role
  curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "PlatformAdmin",
      "description": "Platform administrator with full access"
    }'
  
  # Get role again
  PLATFORM_ADMIN_ROLE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/PlatformAdmin" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")
fi

# Assign role to user
ROLE_ID=$(echo "$PLATFORM_ADMIN_ROLE" | jq -r '.id')

echo "Assigning PlatformAdmin role to user ${USER_EMAIL}..."
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "[{
    \"id\": \"${ROLE_ID}\",
    \"name\": \"PlatformAdmin\"
  }]"

echo ""
echo "✅ PlatformAdmin role assigned to ${USER_EMAIL}"
echo ""
echo "⚠️  IMPORTANT: User must logout and login again to get new token with PlatformAdmin role"
echo ""































