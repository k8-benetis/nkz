#!/bin/bash

# Build and import images for Nekazari services
# Usage: ./scripts/build-images.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }
log_info() { echo "ℹ️  $1"; }

# Services to build
# Format: "dockerfile_path:image_name:tag"
# Note: For monorepo apps (host), dockerfile_path is relative to repo root
SERVICES=(
    # Core API
    "services/api-gateway:api-gateway:latest"
    "services/entity-manager:entity-manager:latest"
    # Auth
    "services/keycloak:keycloak:26.4.1-custom"
    # Workers & Data
    "services/weather-worker:weather-worker:latest"
    "services/telemetry-worker:telemetry-worker:latest"
    "services/timeseries-reader:timeseries-reader:latest"
    # Tenant Management
    "services/tenant-user-api:tenant-user-api:latest"
    "services/tenant-webhook:tenant-webhook:latest"
    # Risk
    "services/risk-api:risk-api:latest"
    "services/risk-orchestrator:risk-orchestrator:latest"
    # Integrations
    "services/sdm-integration:sdm-integration:latest"
    "services/email-service:email-service:latest"
    # Frontend
    "apps/host/Dockerfile:host:latest"
)

GHCR_PREFIX="ghcr.io/k8-benetis/nkz"

build_and_import() {
    local dockerfile_path=$1
    local image=$2
    local tag=$3
    local full_image="$image:$tag"
    local ghcr_image="$GHCR_PREFIX/$image:$tag"

    log_info "Processing $full_image..."

    # Check if it's a Dockerfile path (for monorepo apps like host)
    if [[ "$dockerfile_path" == *"Dockerfile" ]]; then
        # Direct Dockerfile path (e.g., apps/host/Dockerfile)
        if [ ! -f "$dockerfile_path" ]; then
            log_error "Dockerfile $dockerfile_path not found, skipping..."
            return
        fi
        log_info "Building $full_image from $dockerfile_path..."
        docker build -t "$full_image" -f "$dockerfile_path" .
    else
        # Directory path (legacy services)
        local dir=$dockerfile_path
        if [ ! -d "$dir" ]; then
            log_error "Directory $dir not found, skipping..."
            return
        fi
        log_info "Building $full_image from $dir/Dockerfile..."
        docker build -t "$full_image" -f "$dir/Dockerfile" .
    fi

    # Tag with GHCR prefix
    log_info "Tagging as $ghcr_image..."
    docker tag "$full_image" "$ghcr_image"

    log_info "Importing into K3s..."
    # Import both tags to be safe
    docker save "$full_image" "$ghcr_image" | sudo k3s ctr images import -

    log_success "$full_image and $ghcr_image built and imported"
}

# Check for docker and k3s
if ! command -v docker &> /dev/null; then
    log_error "docker not found"
    exit 1
fi

if ! command -v k3s &> /dev/null; then
    log_error "k3s not found"
    exit 1
fi

echo "Starting image build process..."

for service in "${SERVICES[@]}"; do
    IFS=':' read -r dir image tag <<< "$service"
    build_and_import "$dir" "$image" "$tag"
done

log_success "All images processed!"
