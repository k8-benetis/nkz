#!/bin/bash
# =============================================================================
# Verify Keycloak Configuration: Compare Server vs Repository
# =============================================================================
# This script verifies that the deployed Keycloak configuration matches
# what's in the repository (GitOps validation).
#
# Usage:
#   ./scripts/verify-keycloak-config.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Check if we're on the server or need SSH
if [ -f "/var/run/secrets/kubernetes.io/serviceaccount/token" ] || command -v kubectl &> /dev/null && kubectl cluster-info &> /dev/null; then
    # We're on the server or have kubectl access
    USE_SSH=false
    KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service:8080/auth}"
else
    # Need SSH
    USE_SSH=true
    SERVER="${NKZ_SERVER:-user@your-server-ip}"
    KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service:8080/auth}"
    log_info "Will use SSH to connect to ${SERVER}"
fi

# Get admin credentials
if [ "$USE_SSH" = true ]; then
    log_info "Getting admin credentials via SSH..."
    ADMIN_USER=$(ssh "$SERVER" "sudo kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-username}' | base64 -d" 2>/dev/null || echo "")
    ADMIN_PASS=$(ssh "$SERVER" "sudo kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' | base64 -d" 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
        log_error "Failed to get credentials via SSH"
        log_info "Trying alternative method..."
        ADMIN_USER=$(ssh "$SERVER" "kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d" || echo "")
        ADMIN_PASS=$(ssh "$SERVER" "kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d" || echo "")
    fi
else
    ADMIN_USER=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-username}' | base64 -d)
    ADMIN_PASS=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' | base64 -d)
fi

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
    log_error "Cannot retrieve admin credentials"
    exit 1
fi

log_success "Credentials obtained"

# Get admin token
log_info "Getting admin token..."
if [ "$USE_SSH" = true ]; then
    TOKEN_RESPONSE=$(ssh "$SERVER" "curl -s -X POST \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -d 'username=${ADMIN_USER}' \
        -d 'password=${ADMIN_PASS}' \
        -d 'grant_type=password' \
        -d 'client_id=admin-cli' \
        '${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token'")
else
    TOKEN_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        -d "password=${ADMIN_PASS}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token")
fi

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

log_success "Admin token obtained"

REALM="nekazari"

log_section "VERIFICATION: Repository vs Deployed"

# Get deployed client configuration
log_info "Fetching deployed client configuration..."
if [ "$USE_SSH" = true ]; then
    CLIENT_RESPONSE=$(ssh "$SERVER" "curl -s -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
        '${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=nekazari-frontend'")
    DEPLOYED_MAPPERS=$(ssh "$SERVER" "CLIENT_ID=\$(echo '${CLIENT_RESPONSE}' | jq -r '.[0].id'); \
        curl -s -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
        '${KEYCLOAK_URL}/admin/realms/${REALM}/clients/\${CLIENT_ID}/protocol-mappers/models'")
else
    CLIENT_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=nekazari-frontend")
    CLIENT_ID=$(echo "$CLIENT_RESPONSE" | jq -r '.[0].id')
    DEPLOYED_MAPPERS=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}/protocol-mappers/models")
fi

# Read repository configuration
REPO_REALM_FILE="${PROJECT_ROOT}/k8s/keycloak/nekazari-realm.json"
if [ ! -f "$REPO_REALM_FILE" ]; then
    log_error "Repository realm file not found: ${REPO_REALM_FILE}"
    exit 1
fi

log_info "Reading repository configuration..."

# Extract mappers from repo
REPO_MAPPERS=$(jq -r '.clients[] | select(.clientId == "nekazari-frontend") | .protocolMappers // []' "$REPO_REALM_FILE")

echo ""
log_info "=== DEPLOYED MAPPERS (Server) ==="
if [ "$USE_SSH" = true ]; then
    echo "$DEPLOYED_MAPPERS" | ssh "$SERVER" "jq -r '.[] | \"\(.name) [\(.protocolMapper)]\"" 2>/dev/null || echo "$DEPLOYED_MAPPERS" | jq -r '.[] | "\(.name) [\(.protocolMapper)]"'
else
    echo "$DEPLOYED_MAPPERS" | jq -r '.[] | "\(.name) [\(.protocolMapper)]"'
fi

echo ""
log_info "=== REPOSITORY MAPPERS (Expected) ==="
echo "$REPO_MAPPERS" | jq -r '.[] | "\(.name) [\(.protocolMapper)]"'

# Compare
echo ""
log_section "COMPARISON RESULTS"

DEPLOYED_NAMES=$(echo "$DEPLOYED_MAPPERS" | jq -r '.[].name' | sort)
REPO_NAMES=$(echo "$REPO_MAPPERS" | jq -r '.[].name' | sort)

MISSING_IN_DEPLOYED=$(comm -23 <(echo "$REPO_NAMES") <(echo "$DEPLOYED_NAMES"))
EXTRA_IN_DEPLOYED=$(comm -13 <(echo "$REPO_NAMES") <(echo "$DEPLOYED_NAMES"))

if [ -n "$MISSING_IN_DEPLOYED" ]; then
    log_warning "Mappers in repository but NOT deployed:"
    echo "$MISSING_IN_DEPLOYED" | while read -r name; do
        echo "  - $name"
    done
else
    log_success "✓ All repository mappers are deployed"
fi

if [ -n "$EXTRA_IN_DEPLOYED" ]; then
    log_warning "Mappers deployed but NOT in repository:"
    echo "$EXTRA_IN_DEPLOYED" | while read -r name; do
        echo "  - $name"
    done
else
    log_success "✓ No extra mappers in deployment"
fi

# Check Keycloak features
log_section "KEYCLOAK FEATURES CHECK"

if [ "$USE_SSH" = true ]; then
    DEPLOYMENT_ENV=$(ssh "$SERVER" "sudo kubectl get deployment keycloak -n nekazari -o jsonpath='{.spec.template.spec.containers[0].env}'" 2>/dev/null || \
                     ssh "$SERVER" "kubectl get deployment keycloak -n nekazari -o jsonpath='{.spec.template.spec.containers[0].env}'" 2>/dev/null || echo "[]")
else
    DEPLOYMENT_ENV=$(kubectl get deployment keycloak -n nekazari -o jsonpath='{.spec.template.spec.containers[0].env}')
fi

if echo "$DEPLOYMENT_ENV" | jq -e '.[] | select(.name == "KC_FEATURES")' >/dev/null 2>&1; then
    FEATURES=$(echo "$DEPLOYMENT_ENV" | jq -r '.[] | select(.name == "KC_FEATURES") | .value')
    log_info "KC_FEATURES: ${FEATURES}"
    if echo "$FEATURES" | grep -q "scripts"; then
        log_success "✓ Script Mappers are ENABLED"
    else
        log_warning "⚠ Script Mappers are NOT enabled (scripts feature missing)"
    fi
else
    log_warning "⚠ KC_FEATURES not set - Script Mappers are DISABLED by default"
fi

# Summary
log_section "SUMMARY"

if [ -z "$MISSING_IN_DEPLOYED" ] && [ -z "$EXTRA_IN_DEPLOYED" ]; then
    log_success "✓ Configuration matches between repository and deployment"
    exit 0
else
    log_warning "⚠ Configuration differences found"
    exit 1
fi
































