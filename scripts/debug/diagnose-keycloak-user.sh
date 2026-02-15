#!/bin/bash
# =============================================================================
# Diagnose Keycloak User - Check roles and groups
# =============================================================================
# This script helps diagnose why a user cannot perform PlatformAdmin actions

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-https://auth.robotika.cloud/auth}"
REALM="${KEYCLOAK_REALM:-nekazari}"

# Get admin credentials from Kubernetes
ADMIN_USER=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret keycloak-admin-credentials -n nekazari -o jsonpath='{.data.password}' | base64 -d)

echo "=== Keycloak User Diagnosis ==="
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

# Get user email from argument or prompt
if [ -z "$1" ]; then
  read -p "Enter user email to diagnose: " USER_EMAIL
else
  USER_EMAIL="$1"
fi

echo "Diagnosing user: ${USER_EMAIL}"
echo ""

# Get user ID
USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${USER_EMAIL}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id // empty')

if [ -z "$USER_ID" ]; then
  echo "❌ User not found: ${USER_EMAIL}"
  exit 1
fi

echo "✅ User found: ${USER_ID}"
echo ""

# Get user details
USER_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "=== USER INFORMATION ==="
echo "Username: $(echo "$USER_DATA" | jq -r '.username')"
echo "Email: $(echo "$USER_DATA" | jq -r '.email')"
echo "Enabled: $(echo "$USER_DATA" | jq -r '.enabled')"
echo ""

# Get user groups
echo "=== USER GROUPS ==="
USER_GROUPS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/groups" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

if [ "$(echo "$USER_GROUPS" | jq 'length')" -eq 0 ]; then
  echo "⚠️  User is NOT in any groups"
else
  echo "$USER_GROUPS" | jq -r '.[] | "  - \(.name) (path: \(.path))"'
fi
echo ""

# Get user realm roles
echo "=== REALM ROLES (Direct) ==="
REALM_ROLES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

if [ "$(echo "$REALM_ROLES" | jq '.mappings | length')" -eq 0 ]; then
  echo "⚠️  User has NO direct realm roles"
else
  echo "$REALM_ROLES" | jq -r '.mappings[] | "  - \(.name)\(if .composite then " (composite)" else "" end)"'
fi
echo ""

# Get all available realm roles
echo "=== ALL REALM ROLES (Available) ==="
ALL_REALM_ROLES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "$ALL_REALM_ROLES" | jq -r '.[] | "  - \(.name)\(if .composite then " (composite)" else "" end)"' | grep -E "(PlatformAdmin|TenantAdmin|Farmer|DeviceManager)" || echo "  (No relevant roles found)"
echo ""

# Check if PlatformAdmin role exists
PLATFORM_ADMIN_EXISTS=$(echo "$ALL_REALM_ROLES" | jq -r '.[] | select(.name == "PlatformAdmin") | .name')
if [ -z "$PLATFORM_ADMIN_EXISTS" ]; then
  echo "❌ PlatformAdmin role does NOT exist in realm!"
  echo "   You need to create it first."
else
  echo "✅ PlatformAdmin role exists in realm"
  
  # Check if user has PlatformAdmin
  USER_HAS_PLATFORM_ADMIN=$(echo "$REALM_ROLES" | jq -r '.mappings[] | select(.name == "PlatformAdmin") | .name')
  if [ -z "$USER_HAS_PLATFORM_ADMIN" ]; then
    echo "❌ User does NOT have PlatformAdmin role assigned"
    echo ""
    echo "To fix this, run:"
    echo "  ./scripts/assign-platform-admin-role.sh ${USER_EMAIL}"
  else
    echo "✅ User HAS PlatformAdmin role assigned"
  fi
fi
echo ""

# Get roles from groups
echo "=== ROLES FROM GROUPS ==="
for group_id in $(echo "$USER_GROUPS" | jq -r '.[].id'); do
  GROUP_NAME=$(echo "$USER_GROUPS" | jq -r ".[] | select(.id == \"$group_id\") | .name")
  GROUP_ROLES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/groups/${group_id}/role-mappings/realm" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")
  
  if [ "$(echo "$GROUP_ROLES" | jq '.mappings | length')" -gt 0 ]; then
    echo "Group: ${GROUP_NAME}"
    echo "$GROUP_ROLES" | jq -r '.mappings[] | "  - \(.name)"'
  fi
done
echo ""

# Simulate token generation (what would be in JWT)
echo "=== SIMULATED JWT TOKEN CONTENTS ==="
echo "To see actual token, login and decode at https://jwt.io"
echo ""
echo "Expected structure:"
echo '{'
echo '  "realm_access": {'
echo '    "roles": ['"$(echo "$REALM_ROLES" | jq -r '.mappings[] | .name' | sed 's/^/      "/' | sed 's/$/",/' | tr '\n' ' ' | sed 's/, $//')"']'
echo '  },'
echo '  "groups": ['"$(echo "$USER_GROUPS" | jq -r '.[] | .path' | sed 's/^/    "/' | sed 's/$/",/' | tr '\n' ' ' | sed 's/, $//')"']'
echo '}'
echo ""

echo "=== RECOMMENDATIONS ==="
echo "1. PlatformAdmin users should NOT be in tenant groups"
echo "2. PlatformAdmin role should be assigned DIRECTLY to user (not via group)"
echo "3. If user is in 'Platform Administrators' group, remove from tenant groups"
echo "4. After changes, user must logout and login again to get new token"
echo ""
