#!/usr/bin/env bash
# =============================================================================
# Keycloak Setup: tenant_id User Attribute Mapper (idempotent)
# =============================================================================
# Creates a protocol mapper on the nekazari-frontend client so that the
# user attribute "tenant_id" appears in ID token, access token, and userinfo.
#
# Usage:
#   ./keycloak-setup-mappers.sh
#
# Environment (defaults work on the K8s cluster):
#   KEYCLOAK_URL        internal Keycloak URL  (default: http://keycloak-service:8080/auth)
#   KEYCLOAK_REALM      realm name             (default: nekazari)
#   KEYCLOAK_CLIENT_ID_TARGET  client to add mapper to (default: nekazari-frontend)
#   KEYCLOAK_ADMIN_USER admin username          (default: admin)
#   KEYCLOAK_ADMIN_PASSWORD admin password       (required)
# =============================================================================

set -euo pipefail

KC_URL="${KEYCLOAK_URL:-http://keycloak-service:8080/auth}"
KC_REALM="${KEYCLOAK_REALM:-nekazari}"
KC_CLIENT="${KEYCLOAK_CLIENT_ID_TARGET:-nekazari-frontend}"
KC_ADMIN="${KEYCLOAK_ADMIN_USER:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"

echo "==> Obtaining admin token..."
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_PASS}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get admin token" >&2
  exit 1
fi
echo "==> Token obtained."

# Get client internal UUID
echo "==> Looking up client '${KC_CLIENT}'..."
CLIENT_ID=$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
  "${KC_URL}/admin/realms/${KC_REALM}/clients?clientId=${KC_CLIENT}" \
  | python3 -c "import sys,json; clients=json.load(sys.stdin); print(clients[0]['id'] if clients else '')")

if [ -z "$CLIENT_ID" ]; then
  echo "ERROR: Client '${KC_CLIENT}' not found in realm '${KC_REALM}'" >&2
  exit 1
fi
echo "==> Client UUID: ${CLIENT_ID}"

# Check if mapper already exists
MAPPER_NAME="tenant_id"
echo "==> Checking if mapper '${MAPPER_NAME}' already exists..."
EXISTING=$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
  "${KC_URL}/admin/realms/${KC_REALM}/clients/${CLIENT_ID}/protocol-mappers/models" \
  | python3 -c "
import sys, json
mappers = json.load(sys.stdin)
for m in mappers:
    if m.get('name') == '${MAPPER_NAME}':
        print(m['id'])
        break
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "==> Mapper '${MAPPER_NAME}' already exists (id: ${EXISTING}). Skipping creation."
  exit 0
fi

# Create the mapper
echo "==> Creating mapper '${MAPPER_NAME}'..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${KC_URL}/admin/realms/${KC_REALM}/clients/${CLIENT_ID}/protocol-mappers/models" \
  -d '{
    "name": "tenant_id",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
      "user.attribute": "tenant_id",
      "claim.name": "tenant_id",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "multivalued": "false",
      "aggregate.attrs": "false"
    }
  }')

if [ "$HTTP_CODE" = "201" ]; then
  echo "==> Mapper '${MAPPER_NAME}' created successfully."
else
  echo "ERROR: Failed to create mapper (HTTP ${HTTP_CODE})" >&2
  exit 1
fi
