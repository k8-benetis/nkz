#!/bin/bash
# =============================================================================
# Keycloak Multi-Tenant Architecture Audit Script
# =============================================================================
# This script performs a read-only audit of Keycloak configuration to validate
# multi-tenant architecture compliance with industry standards.
#
# Usage:
#   ./scripts/keycloak-audit.sh
#
# Environment Variables Required (from K8s):
#   - KEYCLOAK_ADMIN: Admin username
#   - KEYCLOAK_ADMIN_PASSWORD: Admin password
#   - KEYCLOAK_URL: Keycloak base URL (default: http://keycloak-service:8080/auth)
#   - REALM: Realm name (default: nekazari)
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service:8080/auth}"
REALM="${REALM:-nekazari}"
ADMIN_USER="${KEYCLOAK_ADMIN}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"

# Audit artifacts
AUDIT_TEMP_GROUP="AUDIT_TEMP_GROUP"
AUDIT_TEMP_USER="audit_temp_user"
AUDIT_TEMP_PASSWORD="AuditTemp123!"
AUDIT_REPORT_FILE="/tmp/keycloak-audit-report.json"

# Logging functions
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

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Cleanup function (always runs)
cleanup() {
    log_section "PHASE 4: CLEANUP"
    
    if [ -z "${ADMIN_TOKEN:-}" ]; then
        log_warning "No admin token available for cleanup. Attempting to obtain one..."
        get_admin_token
    fi
    
    # Delete temporary user
    if [ -n "${AUDIT_USER_ID:-}" ]; then
        log_info "Deleting temporary user: ${AUDIT_TEMP_USER}"
        HTTP_CODE=$(curl -s -w "\n%{http_code}" -X DELETE \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" \
            "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${AUDIT_USER_ID}" \
            | tail -1)
        
        if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "404" ]; then
            log_success "Temporary user deleted"
        else
            log_error "Failed to delete user (HTTP $HTTP_CODE)"
        fi
    fi
    
    # Delete temporary group
    if [ -n "${AUDIT_GROUP_ID:-}" ]; then
        log_info "Deleting temporary group: ${AUDIT_TEMP_GROUP}"
        HTTP_CODE=$(curl -s -w "\n%{http_code}" -X DELETE \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" \
            "${KEYCLOAK_URL}/admin/realms/${REALM}/groups/${AUDIT_GROUP_ID}" \
            | tail -1)
        
        if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "404" ]; then
            log_success "Temporary group deleted"
        else
            log_error "Failed to delete group (HTTP $HTTP_CODE)"
        fi
    fi
}

trap cleanup EXIT

# Function to get admin token
get_admin_token() {
    log_info "Obtaining admin token..."
    
    TOKEN_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        -d "password=${ADMIN_PASS}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" 2>&1)
    
    ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')
    
    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        log_error "Failed to obtain admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
    fi
    
    log_success "Admin token obtained"
}

# =============================================================================
# PHASE 1: EXTRACTION & AUTHENTICATION
# =============================================================================
log_section "PHASE 1: EXTRACTION & AUTHENTICATION"

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
    log_error "KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD must be set"
    exit 1
fi

get_admin_token

# Wait for Keycloak to be ready
log_info "Verifying Keycloak availability..."
if ! curl -f -s "${KEYCLOAK_URL}/realms/${REALM}" >/dev/null 2>&1; then
    log_error "Keycloak realm ${REALM} is not available"
    exit 1
fi
log_success "Keycloak is available"

# =============================================================================
# PHASE 2: INSPECTION (Read-Only)
# =============================================================================
log_section "PHASE 2: INSPECTION - Mappers & Configuration"

# Get client ID for nekazari-frontend
log_info "Finding nekazari-frontend client..."
CLIENT_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=nekazari-frontend")

CLIENT_ID=$(echo "$CLIENT_RESPONSE" | jq -r '.[0].id // empty')

if [ -z "$CLIENT_ID" ]; then
    log_error "Client nekazari-frontend not found"
    exit 1
fi

log_success "Client found: ${CLIENT_ID}"

# Get all protocol mappers for the client
log_info "Inspecting protocol mappers..."
MAPPERS_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}/protocol-mappers/models")

echo ""
log_info "=== PROTOCOL MAPPERS FOUND ==="
echo "$MAPPERS_RESPONSE" | jq -r '.[] | "\(.name) [\(.protocolMapper)] → \(.config."claim.name" // "N/A")"'

# Check for specific mappers
GROUP_MEMBERSHIP_MAPPER=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.protocolMapper == "oidc-group-membership-mapper") | .name // empty')
GROUP_ATTRIBUTE_MAPPER=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.protocolMapper == "oidc-group-attribute-mapper") | .name // empty')
USER_ATTRIBUTE_MAPPER=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.name == "tenant-id-mapper") | .name // empty')

echo ""
log_info "=== MAPPER STATUS ==="
if [ -n "$GROUP_MEMBERSHIP_MAPPER" ]; then
    log_success "✓ Group Membership Mapper: EXISTS"
    MAPPER_CONFIG=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.protocolMapper == "oidc-group-membership-mapper")')
    CLAIM_NAME=$(echo "$MAPPER_CONFIG" | jq -r '.config."claim.name" // "N/A"')
    log_info "  Claim name: ${CLAIM_NAME}"
else
    log_error "✗ Group Membership Mapper: MISSING"
fi

if [ -n "$GROUP_ATTRIBUTE_MAPPER" ]; then
    log_success "✓ Group Attribute Mapper: EXISTS"
    MAPPER_CONFIG=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.protocolMapper == "oidc-group-attribute-mapper")')
    CLAIM_NAME=$(echo "$MAPPER_CONFIG" | jq -r '.config."claim.name" // "N/A"')
    GROUP_ATTR=$(echo "$MAPPER_CONFIG" | jq -r '.config."group.attribute" // "N/A"')
    log_info "  Claim name: ${CLAIM_NAME}"
    log_info "  Group attribute: ${GROUP_ATTR}"
else
    log_warning "✗ Group Attribute Mapper: MISSING (Critical for group-based multi-tenancy)"
fi

if [ -n "$USER_ATTRIBUTE_MAPPER" ]; then
    log_success "✓ User Attribute Mapper (tenant-id): EXISTS"
    MAPPER_CONFIG=$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.name == "tenant-id-mapper")')
    CLAIM_NAME=$(echo "$MAPPER_CONFIG" | jq -r '.config."claim.name" // "N/A"')
    USER_ATTR=$(echo "$MAPPER_CONFIG" | jq -r '.config."user.attribute" // "N/A"')
    log_info "  Claim name: ${CLAIM_NAME}"
    log_info "  User attribute: ${USER_ATTR}"
else
    log_warning "✗ User Attribute Mapper (tenant-id): MISSING"
fi

# Inspect Default Client Scopes
log_info "Inspecting default client scopes..."
SCOPES_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/default-default-client-scopes")

echo ""
log_info "=== DEFAULT CLIENT SCOPES ==="
echo "$SCOPES_RESPONSE" | jq -r '.[].name' | while read -r scope; do
    echo "  - ${scope}"
done

# Get realm roles
log_info "Inspecting realm roles..."
ROLES_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/roles")

echo ""
log_info "=== REALM ROLES ==="
echo "$ROLES_RESPONSE" | jq -r '.[] | "\(.name) - \(.description // "No description")"'

# Check for PlatformAdmin role
PLATFORM_ADMIN=$(echo "$ROLES_RESPONSE" | jq -r '.[] | select(.name == "PlatformAdmin") | .name // empty')
if [ -n "$PLATFORM_ADMIN" ]; then
    log_success "✓ PlatformAdmin role: EXISTS"
else
    log_warning "✗ PlatformAdmin role: NOT FOUND"
fi

# =============================================================================
# PHASE 3: SANDBOX TESTING
# =============================================================================
log_section "PHASE 3: SANDBOX TESTING"

# Create temporary group
log_info "Creating temporary group: ${AUDIT_TEMP_GROUP}"
GROUP_CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"${AUDIT_TEMP_GROUP}\",
        \"attributes\": {
            \"tenant_type\": [\"audit_premium\"],
            \"tenant_id\": [\"audit_temp\"]
        }
    }" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/groups")

HTTP_CODE=$(echo "$GROUP_CREATE_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "201" ]; then
    AUDIT_GROUP_ID=$(echo "$GROUP_CREATE_RESPONSE" | head -1 | jq -r '.id // empty')
    log_success "Temporary group created: ${AUDIT_GROUP_ID}"
else
    log_error "Failed to create group (HTTP $HTTP_CODE)"
    exit 1
fi

# Create temporary user
log_info "Creating temporary user: ${AUDIT_TEMP_USER}"
USER_CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"${AUDIT_TEMP_USER}\",
        \"email\": \"${AUDIT_TEMP_USER}@audit.local\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"firstName\": \"Audit\",
        \"lastName\": \"Temporary\",
        \"credentials\": [{
            \"type\": \"password\",
            \"value\": \"${AUDIT_TEMP_PASSWORD}\",
            \"temporary\": false
        }]
    }" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users")

HTTP_CODE=$(echo "$USER_CREATE_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "201" ]; then
    # Get user ID
    USER_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${AUDIT_TEMP_USER}&exact=true")
    AUDIT_USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id // empty')
    log_success "Temporary user created: ${AUDIT_USER_ID}"
else
    log_error "Failed to create user (HTTP $HTTP_CODE)"
    exit 1
fi

# Add user to group
log_info "Adding user to temporary group..."
curl -s -X PUT \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${AUDIT_USER_ID}/groups/${AUDIT_GROUP_ID}" >/dev/null
log_success "User added to group"

# Get user token
log_info "Obtaining user token for testing..."
sleep 2  # Wait for user to be fully created

TOKEN_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${AUDIT_TEMP_USER}" \
    -d "password=${AUDIT_TEMP_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=nekazari-frontend" \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    log_error "Failed to obtain user token"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

log_success "User token obtained"

# Decode JWT (basic decoding - payload only)
log_info "Decoding JWT token..."
# Handle base64 padding issues
JWT_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d. -f2)
# Add padding if needed
case $((${#JWT_PAYLOAD} % 4)) in
    2) JWT_PAYLOAD="${JWT_PAYLOAD}==" ;;
    3) JWT_PAYLOAD="${JWT_PAYLOAD}=" ;;
esac
PAYLOAD=$(echo "$JWT_PAYLOAD" | base64 -d 2>/dev/null | jq '.' 2>/dev/null || echo "{\"error\": \"Failed to decode token\"}")

echo ""
log_info "=== TOKEN PAYLOAD (DECODED) ==="
echo "$PAYLOAD" | jq '.'

# Extract key claims
GROUPS_CLAIM=$(echo "$PAYLOAD" | jq -r '.groups // []')
TENANT_ID_CLAIM=$(echo "$PAYLOAD" | jq -r '.tenant_id // "NOT_PRESENT"')
TENANT_TYPE_CLAIM=$(echo "$PAYLOAD" | jq -r '.tenant_type // "NOT_PRESENT"')
REALM_ROLES=$(echo "$PAYLOAD" | jq -r '.realm_access.roles // []')

echo ""
log_info "=== TOKEN CLAIMS ANALYSIS ==="
echo "  groups: ${GROUPS_CLAIM}"
echo "  tenant_id: ${TENANT_ID_CLAIM}"
echo "  tenant_type: ${TENANT_TYPE_CLAIM}"
echo "  realm_access.roles: ${REALM_ROLES}"

# Validation checks
echo ""
log_info "=== VALIDATION CHECKS ==="

if echo "$GROUPS_CLAIM" | jq -e ".[] | select(. == \"${AUDIT_TEMP_GROUP}\")" >/dev/null 2>&1; then
    log_success "✓ Group name appears in token: ${AUDIT_TEMP_GROUP}"
else
    log_error "✗ Group name NOT found in token"
fi

if [ "$TENANT_ID_CLAIM" != "NOT_PRESENT" ] && [ "$TENANT_ID_CLAIM" != "null" ]; then
    if [ "$TENANT_ID_CLAIM" = "audit_temp" ]; then
        log_success "✓ tenant_id claim present and correct: ${TENANT_ID_CLAIM}"
    else
        log_warning "⚠ tenant_id claim present but unexpected value: ${TENANT_ID_CLAIM}"
    fi
else
    log_warning "✗ tenant_id claim NOT present in token"
fi

if [ "$TENANT_TYPE_CLAIM" != "NOT_PRESENT" ] && [ "$TENANT_TYPE_CLAIM" != "null" ]; then
    if [ "$TENANT_TYPE_CLAIM" = "audit_premium" ]; then
        log_success "✓ tenant_type claim present and correct: ${TENANT_TYPE_CLAIM}"
    else
        log_warning "⚠ tenant_type claim present but unexpected value: ${TENANT_TYPE_CLAIM}"
    fi
else
    log_warning "✗ tenant_type claim NOT present in token (group attribute mapper likely missing)"
fi

# Save audit report
log_info "Saving audit report..."
AUDIT_REPORT=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "realm": "${REALM}",
  "client_id": "nekazari-frontend",
  "mappers": {
    "group_membership_mapper": {
      "exists": $([ -n "$GROUP_MEMBERSHIP_MAPPER" ] && echo "true" || echo "false"),
      "claim_name": "$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.protocolMapper == "oidc-group-membership-mapper") | .config."claim.name" // "N/A"')"
    },
    "group_attribute_mapper": {
      "exists": $([ -n "$GROUP_ATTRIBUTE_MAPPER" ] && echo "true" || echo "false")
    },
    "user_attribute_mapper": {
      "exists": $([ -n "$USER_ATTRIBUTE_MAPPER" ] && echo "true" || echo "false"),
      "claim_name": "$(echo "$MAPPERS_RESPONSE" | jq -r '.[] | select(.name == "tenant-id-mapper") | .config."claim.name" // "N/A"')"
    }
  },
  "roles": {
    "platform_admin_exists": $([ -n "$PLATFORM_ADMIN" ] && echo "true" || echo "false"),
    "all_roles": $(echo "$ROLES_RESPONSE" | jq '[.[].name]')
  },
  "token_analysis": {
    "groups_in_token": ${GROUPS_CLAIM},
    "tenant_id_in_token": "$TENANT_ID_CLAIM",
    "tenant_type_in_token": "$TENANT_TYPE_CLAIM",
    "full_payload": $(echo "$PAYLOAD")
  }
}
EOF
)

echo "$AUDIT_REPORT" | jq '.' > "$AUDIT_REPORT_FILE"
log_success "Audit report saved to: ${AUDIT_REPORT_FILE}"

# =============================================================================
# SUMMARY
# =============================================================================
log_section "AUDIT SUMMARY"

echo ""
log_info "=== FINDINGS ==="
echo "1. Group Membership Mapper: $([ -n "$GROUP_MEMBERSHIP_MAPPER" ] && echo "EXISTS ✓" || echo "MISSING ✗")"
echo "2. Group Attribute Mapper: $([ -n "$GROUP_ATTRIBUTE_MAPPER" ] && echo "EXISTS ✓" || echo "MISSING ✗")"
echo "3. User Attribute Mapper: $([ -n "$USER_ATTRIBUTE_MAPPER" ] && echo "EXISTS ✓" || echo "MISSING ✗")"
echo "4. PlatformAdmin Role: $([ -n "$PLATFORM_ADMIN" ] && echo "EXISTS ✓" || echo "MISSING ✗")"
echo ""
echo "5. Group in Token: $(echo "$GROUPS_CLAIM" | jq -e ".[] | select(. == \"${AUDIT_TEMP_GROUP}\")" >/dev/null 2>&1 && echo "YES ✓" || echo "NO ✗")"
echo "6. tenant_id in Token: $([ "$TENANT_ID_CLAIM" != "NOT_PRESENT" ] && echo "YES ($TENANT_ID_CLAIM) ✓" || echo "NO ✗")"
echo "7. tenant_type in Token: $([ "$TENANT_TYPE_CLAIM" != "NOT_PRESENT" ] && echo "YES ($TENANT_TYPE_CLAIM) ✓" || echo "NO ✗")"

echo ""
log_success "Audit completed successfully. Report saved to: ${AUDIT_REPORT_FILE}"
log_info "Full token payload available in report for detailed analysis."
































