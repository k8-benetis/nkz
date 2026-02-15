#!/bin/bash
# =============================================================================
# Add Script-Based Group Attribute Mapper to Keycloak Client
# =============================================================================
# This script adds the group-tenant-attributes-mapper using the script-based
# protocol mapper that will be available after building Keycloak with JAR provider.
#
# Usage:
#   ./scripts/add-group-mapper-script-based.sh
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

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get admin token
log_info "Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASS}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

log_success "Admin token obtained"

# Get client UUID
log_info "Finding client ${CLIENT_ID}..."
CLIENT_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}")

CLIENT_UUID=$(echo "$CLIENT_RESPONSE" | jq -r '.[0].id // empty')

if [ -z "$CLIENT_UUID" ]; then
    log_error "Client ${CLIENT_ID} not found"
    exit 1
fi

log_success "Client found: ${CLIENT_UUID}"

# Check available protocol mapper types
log_info "Checking available script-based protocol mappers..."
SERVERINFO=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "${KEYCLOAK_URL}/admin/serverinfo")

# Try to find script-based mapper type
# protocolMapperTypes is an object with protocol names as keys, not an array
SCRIPT_MAPPER_ID=$(echo "$SERVERINFO" | jq -r '.protocolMapperTypes."openid-connect"[]? | select(.id? | contains("script-group-tenant")) | .id' | head -1)

if [ -z "$SCRIPT_MAPPER_ID" ]; then
    log_error "Script mapper 'script-group-tenant-attributes-mapper.js' not found in serverinfo"
    log_info "Available script mappers:"
    echo "$SERVERINFO" | jq -r '.protocolMapperTypes."openid-connect"[]? | select(.id? | contains("script")) | .id' || true
    exit 1
fi

log_info "Using protocol mapper: ${SCRIPT_MAPPER_ID}"

# Check if mapper already exists
log_info "Checking for existing mapper..."
MAPPERS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models")

EXISTING_MAPPER=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.name == "group-tenant-attributes-mapper") | .id // empty')

if [ -n "$EXISTING_MAPPER" ]; then
    log_warning "Mapper already exists, removing it first..."
    curl -s -X DELETE -H "Authorization: Bearer ${TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models/${EXISTING_MAPPER}"
    log_success "Old mapper removed"
fi

# Create the mapper using script-based protocol mapper
log_info "Creating group-tenant-attributes-mapper (script-based)..."

# Use the exact protocolMapper ID from serverinfo
MAPPER_JSON='{
  "name": "group-tenant-attributes-mapper",
  "protocol": "openid-connect",
  "protocolMapper": "script-group-tenant-attributes-mapper.js",
  "consentRequired": false,
  "config": {
    "claim.name": "tenant_id",
    "access.token.claim": "true",
    "id.token.claim": "true",
    "userinfo.token.claim": "true",
    "jsonType.label": "String",
    "multivalued": "false"
  }
}'

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$MAPPER_JSON" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models")

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "201" ]; then
    log_success "Mapper created successfully"
    
    # Verify it was created
    log_info "Verifying mapper..."
    VERIFY_MAPPERS=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models")
    
    NEW_MAPPER=$(echo "$VERIFY_MAPPERS" | jq -r '.[] | select(.name == "group-tenant-attributes-mapper")')
    
    if [ -n "$NEW_MAPPER" ] && [ "$NEW_MAPPER" != "null" ]; then
        log_success "✓ Mapper verified and active"
        echo "$NEW_MAPPER" | jq '{name, protocolMapper, config: .config.script}'
    else
        log_warning "Mapper created but verification failed"
    fi
else
    log_error "Failed to create mapper (HTTP $HTTP_CODE)"
    echo "Response: $(echo "$CREATE_RESPONSE" | head -10)"
    
    if [ "$HTTP_CODE" = "404" ]; then
        log_error "Protocol mapper provider not found"
        log_info "This means the JAR provider may not be loaded yet"
        log_info "Wait for Keycloak to fully restart after image rebuild"
    fi
    
    exit 1
fi

log_success "Mapper configuration complete!"
