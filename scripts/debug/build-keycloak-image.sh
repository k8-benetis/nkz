#!/bin/bash
# =============================================================================
# Build Custom Keycloak Image with Script Mappers
# =============================================================================
# This script builds a custom Keycloak Docker image that includes:
# - PostgreSQL driver
# - Script Mappers JAR with group tenant attributes mapper
#
# Usage:
#   ./scripts/build-keycloak-image.sh [--push] [--tag TAG]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PUSH="${1:-}"
TAG="${2:-keycloak:26.4.1-custom}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info "Building custom Keycloak image with Script Mappers..."
log_info "Tag: ${TAG}"

# Verify required files exist
if [ ! -f "${PROJECT_ROOT}/services/keycloak/Dockerfile" ]; then
    echo "ERROR: Dockerfile not found"
    exit 1
fi

# Build JAR file first
log_info "Building script mappers JAR..."
if [ ! -f "${PROJECT_ROOT}/services/keycloak/build-jar.sh" ]; then
    echo "ERROR: build-jar.sh not found"
    exit 1
fi

bash "${PROJECT_ROOT}/services/keycloak/build-jar.sh"

if [ ! -f "${PROJECT_ROOT}/services/keycloak/keycloak-script-mappers.jar" ]; then
    echo "ERROR: JAR file not created"
    exit 1
fi

log_success "JAR file ready"

# Build image
log_info "Building Docker image..."
cd "${PROJECT_ROOT}"

docker build \
    -f services/keycloak/Dockerfile \
    -t "${TAG}" \
    .

if [ $? -eq 0 ]; then
    log_success "Image built successfully: ${TAG}"
else
    echo "ERROR: Image build failed"
    exit 1
fi

# Push if requested
if [ "$PUSH" = "--push" ]; then
    log_info "Pushing image..."
    docker push "${TAG}"
    log_success "Image pushed successfully"
fi

log_success "Build complete!"
echo ""
echo "Next steps:"
echo "1. Tag and push to your registry (if not using local):"
echo "   docker tag ${TAG} your-registry/${TAG}"
echo "   docker push your-registry/${TAG}"
echo ""
echo "2. Update keycloak-deployment.yaml with image reference"
echo ""
echo "3. Apply deployment:"
echo "   kubectl apply -f k8s/k3s-optimized/keycloak-deployment.yaml"
