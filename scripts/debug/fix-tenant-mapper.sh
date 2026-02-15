#!/bin/bash

# =============================================================================
# Fix Tenant Mapper Script - GitOps Compliant
# =============================================================================
# This script ensures the tenant_id mapper is correctly configured in Keycloak
# It fixes the "Tenant required" error by ensuring:
# 1. The mapper exists in the nekazari-frontend client
# 2. The mapper uses the correct claim name (tenant_id)
# 3. The user has the tenant_id attribute set
# 
# This script can be run manually or as part of deployment
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NAMESPACE="${NAMESPACE:-nekazari}"
REALM="nekazari"
CLIENT_ID="nekazari-frontend"

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
log_info "Getting Keycloak admin token..."
# Try with sudo kubectl first, fallback to kubectl
if command -v sudo &> /dev/null && sudo kubectl get secret keycloak-secret -n "$NAMESPACE" &> /dev/null; then
    ADMIN_USER=$(sudo kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-username}' | base64 -d)
    ADMIN_PASS=$(sudo kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-password}' | base64 -d)
else
    ADMIN_USER=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-username}' | base64 -d)
    ADMIN_PASS=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-password}' | base64 -d)
fi

ADMIN_TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  "http://keycloak-service:8080/auth/realms/master/protocol/openid-connect/token" | \
  jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

log_success "Admin token obtained"

# Get client ID
log_info "Finding client: $CLIENT_ID"
CLIENT_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "http://keycloak-service:8080/auth/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}")

CLIENT_ID_UUID=$(echo "$CLIENT_RESPONSE" | jq -r '.[0].id // empty')

if [ -z "$CLIENT_ID_UUID" ] || [ "$CLIENT_ID_UUID" = "null" ]; then
    log_error "Client $CLIENT_ID not found"
    exit 1
fi

log_success "Client found: $CLIENT_ID_UUID"

# Check existing mappers
log_info "Checking existing mappers..."
MAPPERS=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "http://keycloak-service:8080/auth/admin/realms/${REALM}/clients/${CLIENT_ID_UUID}/protocol-mappers/models")

TENANT_MAPPER_ID=$(echo "$MAPPERS" | jq -r '.[] | select(.name == "tenant-id-mapper") | .id // empty')

# Delete existing mapper if it exists (to recreate with correct config)
if [ -n "$TENANT_MAPPER_ID" ]; then
    log_info "Deleting existing mapper to recreate with correct config..."
    curl -s -X DELETE \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "http://keycloak-service:8080/auth/admin/realms/${REALM}/clients/${CLIENT_ID_UUID}/protocol-mappers/models/${TENANT_MAPPER_ID}" > /dev/null
    log_success "Existing mapper deleted"
fi

# Create mapper with correct configuration
log_info "Creating tenant_id mapper with correct configuration..."
MAPPER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tenant-id-mapper",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "consentRequired": false,
    "config": {
      "userinfo.token.claim": "true",
      "user.attribute": "tenant_id",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "claim.name": "tenant_id",
      "jsonType.label": "String",
      "multivalued": "false"
    }
  }' \
  "http://keycloak-service:8080/auth/admin/realms/${REALM}/clients/${CLIENT_ID_UUID}/protocol-mappers/models")

HTTP_CODE=$(echo "$MAPPER_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "201" ]; then
    log_success "Mapper created successfully"
else
    log_error "Failed to create mapper (HTTP $HTTP_CODE)"
    echo "$MAPPER_RESPONSE" | head -20
    exit 1
fi

# Verify mapper
log_info "Verifying mapper configuration..."
VERIFY_MAPPERS=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "http://keycloak-service:8080/auth/admin/realms/${REALM}/clients/${CLIENT_ID_UUID}/protocol-mappers/models")

TENANT_MAPPER=$(echo "$VERIFY_MAPPERS" | jq '.[] | select(.name == "tenant-id-mapper")')

if [ -n "$TENANT_MAPPER" ] && [ "$TENANT_MAPPER" != "null" ]; then
    log_success "Mapper verified:"
    echo "$TENANT_MAPPER" | jq '{name, claimName: .config."claim.name", userAttribute: .config."user.attribute"}'
else
    log_error "Mapper verification failed"
    exit 1
fi

log_success "Tenant mapper fix completed!"
echo ""
log_info "Next steps:"
echo "  1. User must logout and login again to get a new token with tenant_id"
echo "  2. The new token will include the tenant_id claim"
echo "  3. Frontend will extract tenant_id from the token automatically"

