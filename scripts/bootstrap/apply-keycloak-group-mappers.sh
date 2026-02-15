#!/bin/bash
# =============================================================================
# Apply Keycloak Group Attribute Mappers
# =============================================================================
# This script applies the changes to enable group attribute mapping in Keycloak.
# It follows GitOps principles and ensures safe deployment.
#
# Usage:
#   ./scripts/apply-keycloak-group-mappers.sh [--dry-run]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN="${1:-}"

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

if [ "$DRY_RUN" = "--dry-run" ]; then
    log_info "DRY RUN MODE - No changes will be applied"
fi

log_section "Keycloak Group Attribute Mappers - GitOps Deployment"

# Check if we're in the right directory
if [ ! -f "${PROJECT_ROOT}/k8s/k3s-optimized/keycloak-deployment.yaml" ]; then
    log_error "Keycloak deployment file not found. Are you in the project root?"
    exit 1
fi

# Verify changes are in place
log_section "Pre-Deployment Verification"

# Check 1: KC_FEATURES enabled
if grep -q 'KC_FEATURES' "${PROJECT_ROOT}/k8s/k3s-optimized/keycloak-deployment.yaml" && \
   grep -q 'scripts' "${PROJECT_ROOT}/k8s/k3s-optimized/keycloak-deployment.yaml"; then
    log_success "✓ KC_FEATURES=scripts is configured"
else
    log_error "✗ KC_FEATURES=scripts NOT found in deployment"
    exit 1
fi

# Check 2: Script mapper in nekazari-realm.json
if grep -q 'group-tenant-attributes-mapper' "${PROJECT_ROOT}/k8s/keycloak/nekazari-realm.json" && \
   grep -q 'oidc-script-based-protocol-mapper' "${PROJECT_ROOT}/k8s/keycloak/nekazari-realm.json"; then
    log_success "✓ Script mapper configured in nekazari-realm.json"
else
    log_error "✗ Script mapper NOT found in nekazari-realm.json"
    exit 1
fi

# Check 3: Script mapper in realm-import-job.yaml
if grep -q 'group-tenant-attributes-mapper' "${PROJECT_ROOT}/k8s/keycloak/realm-import-job.yaml" && \
   grep -q 'oidc-script-based-protocol-mapper' "${PROJECT_ROOT}/k8s/keycloak/realm-import-job.yaml"; then
    log_success "✓ Script mapper configured in realm-import-job.yaml"
else
    log_error "✗ Script mapper NOT found in realm-import-job.yaml"
    exit 1
fi

log_section "Deployment Steps"

if [ "$DRY_RUN" = "--dry-run" ]; then
    log_info "Would execute the following steps:"
    echo "1. Commit changes to Git"
    echo "2. Push to repository"
    echo "3. Apply keycloak-deployment.yaml (to enable Script Mappers)"
    echo "4. Wait for Keycloak restart"
    echo "5. Update realm ConfigMap"
    echo "6. Trigger realm import job (if needed)"
    echo "7. Run audit script to verify"
    exit 0
fi

# Step 1: Git status
log_info "Checking Git status..."
cd "$PROJECT_ROOT"
if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warning "Uncommitted changes detected. Review them before deploying."
    git status --short
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted by user"
        exit 0
    fi
fi

# Step 2: Summary of changes
log_section "Changes Summary"
echo "Files modified:"
echo "  - k8s/k3s-optimized/keycloak-deployment.yaml (KC_FEATURES=scripts)"
echo "  - k8s/keycloak/nekazari-realm.json (group-tenant-attributes-mapper)"
echo "  - k8s/keycloak/realm-import-job.yaml (group-tenant-attributes-mapper)"

log_section "Next Steps (Manual)"

echo "To complete the deployment:"
echo ""
echo "1. Review changes:"
echo "   git diff k8s/k3s-optimized/keycloak-deployment.yaml"
echo "   git diff k8s/keycloak/nekazari-realm.json"
echo "   git diff k8s/keycloak/realm-import-job.yaml"
echo ""
echo "2. Commit and push:"
echo "   git add k8s/k3s-optimized/keycloak-deployment.yaml"
echo "   git add k8s/keycloak/nekazari-realm.json"
echo "   git add k8s/keycloak/realm-import-job.yaml"
echo "   git commit -m 'feat(keycloak): Enable Script Mappers and add group attribute mapper'"
echo "   git push"
echo ""
echo "3. Apply deployment changes:"
echo "   kubectl apply -f k8s/k3s-optimized/keycloak-deployment.yaml"
echo "   # Wait for Keycloak to restart (Recreate strategy)"
echo ""
echo "4. Update realm ConfigMap:"
echo "   kubectl create configmap keycloak-realm-config \\"
echo "     --from-file=nekazari-realm.json=k8s/keycloak/nekazari-realm.json \\"
echo "     -n nekazari \\"
echo "     --dry-run=client -o yaml | kubectl apply -f -"
echo ""
echo "5. Verify deployment:"
echo "   ./scripts/keycloak-audit.sh"
echo ""
log_success "Pre-deployment checks completed successfully"

