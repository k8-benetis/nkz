#!/bin/bash
# =============================================================================
# Deploy Keycloak with JAR Provider Script Mappers
# =============================================================================
# This script:
# 1. Builds the script mappers JAR
# 2. Builds the custom Keycloak Docker image
# 3. Loads image into K3s
# 4. Applies deployment
#
# Usage:
#   ./scripts/deploy-keycloak-with-jar-provider.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

cd "${PROJECT_ROOT}"

log_section "Deploy Keycloak with JAR Provider"

# Step 1: Build JAR
log_info "Step 1: Building script mappers JAR..."
if [ ! -f "${PROJECT_ROOT}/services/keycloak/build-jar.sh" ]; then
    log_error "build-jar.sh not found"
    exit 1
fi

bash "${PROJECT_ROOT}/services/keycloak/build-jar.sh"

if [ ! -f "${PROJECT_ROOT}/services/keycloak/keycloak-script-mappers.jar" ]; then
    log_error "JAR file not created"
    exit 1
fi

log_success "JAR file created"

# Step 2: Build Docker image
log_section "Step 2: Building Docker image"

IMAGE_NAME="keycloak:26.4.1-custom"
log_info "Building image: ${IMAGE_NAME}"

if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Please install Docker or build manually."
    exit 1
fi

docker build \
    -f services/keycloak/Dockerfile \
    -t "${IMAGE_NAME}" \
    .

if [ $? -eq 0 ]; then
    log_success "Docker image built: ${IMAGE_NAME}"
else
    log_error "Docker build failed"
    exit 1
fi

# Step 3: Load into K3s
log_section "Step 3: Loading image into K3s"

log_info "Saving image as tar..."
docker save "${IMAGE_NAME}" -o /tmp/keycloak-custom.tar

log_info "Importing image to K3s..."
if sudo k3s ctr -n k8s.io images import /tmp/keycloak-custom.tar 2>/dev/null; then
    log_success "Image imported to K3s"
elif sudo k3s ctr images import /tmp/keycloak-custom.tar 2>/dev/null; then
    log_success "Image imported to K3s (alternative method)"
else
    log_warning "Could not import via k3s ctr, trying crictl..."
    sudo crictl pull "${IMAGE_NAME}" 2>/dev/null || \
    log_warning "Manual import may be required"
fi

rm -f /tmp/keycloak-custom.tar

# Step 4: Apply deployment
log_section "Step 4: Applying deployment"

log_info "Applying keycloak-deployment.yaml..."

if command -v kubectl &> /dev/null || command -v k3s &> /dev/null; then
    KUBECTL_CMD="kubectl"
    if command -v k3s &> /dev/null && ! command -v kubectl &> /dev/null; then
        KUBECTL_CMD="sudo k3s kubectl"
    fi
    
    if $KUBECTL_CMD apply -f "${PROJECT_ROOT}/k8s/k3s-optimized/keycloak-deployment.yaml"; then
        log_success "Deployment applied"
        
        log_info "Waiting for rollout (this may take 3-5 minutes)..."
        $KUBECTL_CMD rollout status deployment/keycloak -n nekazari --timeout=300s || true
        
        log_success "Deployment complete!"
    else
        log_error "Failed to apply deployment"
        exit 1
    fi
else
    log_warning "kubectl not found. Please apply deployment manually:"
    echo "  kubectl apply -f k8s/k3s-optimized/keycloak-deployment.yaml"
fi

log_section "Next Steps"

echo "1. Wait for Keycloak to restart and be ready (3-5 minutes)"
echo "2. Verify script mapper is available:"
echo "   ./scripts/keycloak-audit.sh"
echo ""
echo "3. Add mapper to client via API:"
echo "   ./scripts/add-group-mapper-script-based.sh"
echo ""
log_success "Deployment script completed!"
