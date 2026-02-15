#!/bin/bash
# =============================================================================
# Add Group Attribute Mapper to Keycloak Client
# =============================================================================
# This script adds the group-tenant-attributes-mapper to the nekazari-frontend
# client in Keycloak via Admin API.
# =============================================================================

set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service:8080/auth}"
REALM="${REALM:-nekazari}"
CLIENT_ID="${CLIENT_ID:-nekazari-frontend}"
ADMIN_USER="${KEYCLOAK_ADMIN}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
    echo "ERROR: KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD must be set"
    exit 1
fi

# Get admin token
echo "Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASS}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "ERROR: Failed to get admin token"
    exit 1
fi

echo "✓ Admin token obtained"

# Get client UUID
echo "Finding client ${CLIENT_ID}..."
CLIENT_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}")

CLIENT_UUID=$(echo "$CLIENT_RESPONSE" | jq -r '.[0].id // empty')

if [ -z "$CLIENT_UUID" ]; then
    echo "ERROR: Client ${CLIENT_ID} not found"
    exit 1
fi

echo "✓ Client found: ${CLIENT_UUID}"

# Check if mapper already exists
echo "Checking for existing mapper..."
MAPPERS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models")

EXISTING_MAPPER=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.name == "group-tenant-attributes-mapper") | .id // empty')

if [ -n "$EXISTING_MAPPER" ]; then
    echo "⚠️  Mapper already exists, removing it first..."
    curl -s -X DELETE -H "Authorization: Bearer ${TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models/${EXISTING_MAPPER}"
    echo "✓ Old mapper removed"
fi

# Create the mapper
echo "Creating group-tenant-attributes-mapper..."

MAPPER_JSON='{
  "name": "group-tenant-attributes-mapper",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-script-based-protocol-mapper",
  "consentRequired": false,
  "config": {
    "script": "var groups = user.getGroups();\nvar tenantId = null;\nvar tenantType = null;\n\n// Iterate through user'\''s groups to find tenant attributes\nfor (var i = 0; i < groups.size(); i++) {\n    var group = groups.get(i);\n    var attributes = group.getAttributes();\n    \n    // Check for tenant_id attribute\n    if (attributes.containsKey(\"tenant_id\")) {\n        var tenantIdValues = attributes.get(\"tenant_id\");\n        if (tenantIdValues != null && tenantIdValues.size() > 0) {\n            tenantId = tenantIdValues.get(0);\n        }\n    }\n    \n    // Check for tenant_type attribute\n    if (attributes.containsKey(\"tenant_type\")) {\n        var tenantTypeValues = attributes.get(\"tenant_type\");\n        if (tenantTypeValues != null && tenantTypeValues.size() > 0) {\n            tenantType = tenantTypeValues.get(0);\n        }\n    }\n    \n    // If we found tenant_id, we can break (or continue to find highest priority)\n    // For now, take from first group that has tenant_id\n    if (tenantId != null) {\n        break;\n    }\n}\n\n// Add claims to token if found\nif (tenantId != null) {\n    token.setOtherClaims(\"tenant_id\", tenantId);\n}\nif (tenantType != null) {\n    token.setOtherClaims(\"tenant_type\", tenantType);\n}",
    "token.claim.name": "tenant_id",
    "access.token.claim": "true",
    "id.token.claim": "true",
    "userinfo.token.claim": "true",
    "jsonType.label": "String"
  }
}'

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$MAPPER_JSON" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models")

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "201" ]; then
    echo "✓ Mapper created successfully"
    exit 0
else
    echo "ERROR: Failed to create mapper (HTTP $HTTP_CODE)"
    echo "Response: $(echo "$CREATE_RESPONSE" | head -5)"
    exit 1
fi
































