#!/bin/bash
# =============================================================================
# Reset Keycloak Realm Script
# =============================================================================
# This script deletes the nekazari realm and reimports it from nekazari-realm.json
# This ensures all roles, clients, and configuration are correctly applied
# 
# WARNING: This will DELETE ALL USERS in the realm!
# Only use this when starting fresh or after a major configuration issue
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service.nekazari.svc.cluster.local:8080}"
REALM="${REALM:-nekazari}"

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

# Get credentials from Kubernetes secret
print_info "Getting Keycloak admin credentials..."
ADMIN_USER=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
ADMIN_PASS=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
    print_error "Could not get Keycloak admin credentials from secret"
    exit 1
fi

print_header "Reset Keycloak Realm: $REALM"

# Wait for Keycloak to be ready
print_info "Waiting for Keycloak to be ready..."
for i in $(seq 1 30); do
    if curl -f -s --max-time 5 "${KEYCLOAK_URL}/auth/realms/master" >/dev/null 2>&1; then
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
TOKEN_RESPONSE=$(curl -s --max-time 10 -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASS}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    "${KEYCLOAK_URL}/auth/realms/master/protocol/openid-connect/token" 2>&1)

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
    print_error "Failed to get admin token"
    echo "Response: $TOKEN_RESPONSE" | head -5
    exit 1
fi

print_success "Admin token obtained"

# Check if realm exists
print_info "Checking if realm exists..."
REALM_CHECK=$(curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}" 2>&1)

if echo "$REALM_CHECK" | grep -q '"realm"'; then
    print_warning "Realm '$REALM' exists. Deleting..."
    
    DELETE_RESPONSE=$(curl -s --max-time 10 -w "\n%{http_code}" -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}" 2>&1)
    
    HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -1)
    if [ "$HTTP_CODE" = "204" ]; then
        print_success "Realm deleted successfully"
        sleep 2  # Wait a moment for deletion to complete
    else
        print_error "Failed to delete realm (HTTP $HTTP_CODE)"
        echo "Response: $(echo "$DELETE_RESPONSE" | head -5)"
        exit 1
    fi
else
    print_info "Realm does not exist, will create it"
fi

# Get realm JSON from ConfigMap or file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REALM_JSON_FILE="${REPO_ROOT}/k8s/keycloak/nekazari-realm.json"

if [ ! -f "$REALM_JSON_FILE" ]; then
    print_error "Realm JSON file not found: $REALM_JSON_FILE"
    exit 1
fi

print_info "Importing realm from: $REALM_JSON_FILE"

# Import realm
IMPORT_RESPONSE=$(curl -s --max-time 30 -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d @"${REALM_JSON_FILE}" \
    "${KEYCLOAK_URL}/auth/admin/realms" 2>&1)

HTTP_CODE=$(echo "$IMPORT_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "201" ]; then
    print_success "Realm imported successfully"
else
    print_error "Failed to import realm (HTTP $HTTP_CODE)"
    echo "Response: $(echo "$IMPORT_RESPONSE" | head -10)"
    exit 1
fi

# Verify roles were created
print_info "Verifying roles were created..."
sleep 2  # Wait a moment for roles to be available

ROLES_RESPONSE=$(curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/roles" 2>&1)

REQUIRED_ROLES=("TenantAdmin" "Farmer" "PlatformAdmin" "TechnicalConsultant" "DashboardViewer")
MISSING_ROLES=()

for role in "${REQUIRED_ROLES[@]}"; do
    if echo "$ROLES_RESPONSE" | grep -q "\"name\":\"${role}\""; then
        print_success "Role $role exists"
    else
        print_error "Role $role is missing!"
        MISSING_ROLES+=("$role")
    fi
done

if [ ${#MISSING_ROLES[@]} -gt 0 ]; then
    print_warning "Some roles are missing: ${MISSING_ROLES[*]}"
    print_info "You may need to create them manually or re-run this script"
else
    print_success "All required roles exist"
fi

print_header "✅ Realm reset completed"
print_warning "All users in the realm have been deleted"
print_info "Next steps:"
echo "  1. Create admin user (if needed): ./scripts/setup-platform-admin.sh"
echo "  2. Users will be created when they register with activation codes"
echo ""
