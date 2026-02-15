#!/bin/bash
# =============================================================================
# Keycloak: Ensure 'basic' client scope is assigned to nekazari-frontend client
# =============================================================================
# This script ensures the 'basic' client scope is assigned to ensure OIDC compliance.
# In Keycloak 21+, the 'sub' claim is included via the 'basic' client scope.
# This is the standard approach (better than custom protocol mappers).

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service:8080}"
REALM="${REALM:-nekazari}"
CLIENT_ID="${CLIENT_ID:-nekazari-frontend}"

# Get credentials from Kubernetes secret or environment
if [ -z "$KEYCLOAK_ADMIN" ] || [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
    print_info "Attempting to get credentials from Kubernetes secret..."
    
    if command -v kubectl > /dev/null 2>&1; then
        NAMESPACE="${NAMESPACE:-nekazari}"
        KEYCLOAK_ADMIN=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
        KEYCLOAK_ADMIN_PASSWORD=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
    fi
    
    if [ -z "$KEYCLOAK_ADMIN" ] || [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        print_error "KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD must be set"
        print_info "Either set as environment variables or ensure kubectl can access the secret"
        print_info "Example: export KEYCLOAK_ADMIN=admin && export KEYCLOAK_ADMIN_PASSWORD=yourpassword"
        exit 1
    fi
fi

print_header "Ensuring 'basic' client scope is assigned (includes 'sub' claim)"

# Wait for Keycloak to be ready
print_info "Waiting for Keycloak to be ready..."
for i in $(seq 1 30); do
    if curl -f -s "${KEYCLOAK_URL}/realms/master" >/dev/null 2>&1; then
        print_success "Keycloak is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Keycloak is not available after 5 minutes"
        exit 1
    fi
    echo -n "."
    sleep 10
done
echo ""

# Get admin token
print_info "Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "username=${KEYCLOAK_ADMIN}" \
    --data-urlencode "password=${KEYCLOAK_ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    "${KEYCLOAK_URL}/auth/realms/master/protocol/openid-connect/token")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    print_error "Failed to get admin token"
    ERROR_MSG=$(echo "$TOKEN_RESPONSE" | jq -r '.error_description // .error // "Unknown error"' 2>/dev/null || echo "$TOKEN_RESPONSE")
    print_error "Error: $ERROR_MSG"
    exit 1
fi

print_success "Admin token obtained"

# Get client UUID
print_info "Getting client UUID for '${CLIENT_ID}'..."
CLIENT_UUID=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" | \
    jq -r '.[0].id // empty')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
    print_error "Client '${CLIENT_ID}' not found in realm '${REALM}'"
    exit 1
fi

print_success "Client UUID: ${CLIENT_UUID}"

# Check if 'basic' client scope exists and is assigned
print_info "Checking for 'basic' client scope..."
BASIC_SCOPE_ID=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/client-scopes" | \
    jq -r '.[] | select(.name == "basic") | .id // empty')

if [ -z "$BASIC_SCOPE_ID" ]; then
    print_error "'basic' client scope not found in realm '${REALM}'"
    print_warning "This may indicate a Keycloak configuration issue"
    print_info "The 'basic' scope should exist by default in Keycloak"
    exit 1
fi

print_success "Found 'basic' client scope: ${BASIC_SCOPE_ID}"

# Get current default client scopes
print_info "Checking current default client scopes..."
CURRENT_DEFAULT_SCOPES=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/clients/${CLIENT_UUID}/default-client-scopes" | \
    jq -r '.[] | .id')

# Check if basic scope is already assigned
SCOPE_ASSIGNED=$(echo "$CURRENT_DEFAULT_SCOPES" | grep -q "$BASIC_SCOPE_ID" && echo "yes" || echo "no")

if [ "$SCOPE_ASSIGNED" = "no" ]; then
    print_info "Assigning 'basic' client scope to '${CLIENT_ID}'..."
    
    ASSIGN_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/clients/${CLIENT_UUID}/default-client-scopes/${BASIC_SCOPE_ID}")
    
    HTTP_CODE=$(echo "$ASSIGN_RESPONSE" | tail -1)
    if [ "$HTTP_CODE" = "204" ]; then
        print_success "'basic' client scope assigned successfully"
        print_info "This ensures the 'sub' claim is included in access tokens"
    else
        print_error "Failed to assign 'basic' scope (HTTP $HTTP_CODE)"
        ERROR_MSG=$(echo "$ASSIGN_RESPONSE" | head -1 | jq -r '.errorMessage // .error // "Unknown error"' 2>/dev/null || echo "$ASSIGN_RESPONSE")
        print_error "Error: $ERROR_MSG"
        exit 1
    fi
else
    print_success "'basic' client scope already assigned"
fi

# Verify the scope is assigned
print_info "Verifying scope assignment..."
FINAL_DEFAULT_SCOPES=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/clients/${CLIENT_UUID}/default-client-scopes" | \
    jq -r '.[] | select(.name == "basic") | .name // empty')

if [ "$FINAL_DEFAULT_SCOPES" = "basic" ]; then
    print_success "Verification successful: 'basic' scope is assigned"
    print_info "Scope includes the 'sub' claim mapper (standard OIDC)"
else
    print_error "Failed to verify 'basic' scope assignment"
    exit 1
fi

print_header "✅ SUCCESS: 'basic' client scope configured"

print_warning "IMPORTANT: Users must log out and log back in to get new tokens with 'sub' claim"
print_info "Existing tokens will NOT have the 'sub' claim until users re-authenticate"
