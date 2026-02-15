#!/bin/bash
# =============================================================================
# Build and Tag Images Script - Professional Image Versioning
# =============================================================================
# Builds Docker images with semantic tags for reliable deployments
# 
# Usage:
#   ./scripts/build-and-tag-images.sh [service-name] [--push] [--no-cache]
#
# Examples:
#   ./scripts/build-and-tag-images.sh ndvi-worker --push
#   ./scripts/build-and-tag-images.sh host --push --no-cache
#   ./scripts/build-and-tag-images.sh all --push
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY="ghcr.io/k8-benetis/nekazari-public"

# Generate unique tag: v<commit-sha>-<timestamp>
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
UNIQUE_TAG="v${COMMIT_SHA}-${TIMESTAMP}"

# Flags
PUSH_IMAGES=false
NO_CACHE=false
SERVICE_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH_IMAGES=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        *)
            SERVICE_NAME="$1"
            shift
            ;;
    esac
done

cd "$REPO_ROOT"

echo "============================================================================="
echo "Building Docker Images with Semantic Tags"
echo "============================================================================="
echo "Registry: $REGISTRY"
echo "Unique Tag: $UNIQUE_TAG"
echo "Commit SHA: $COMMIT_SHA"
echo "Push Images: $PUSH_IMAGES"
echo "No Cache: $NO_CACHE"
echo ""

# Build cache flag
CACHE_FLAG=""
if [ "$NO_CACHE" = true ]; then
    CACHE_FLAG="--no-cache"
    echo "${YELLOW}⚠️  Building without cache (slower but clean)${NC}"
fi

# Function to build and tag a service
build_service() {
    local service=$1
    local dockerfile_path=""
    local build_context="."
    
    case $service in
        ndvi-worker)
            dockerfile_path="services/ndvi-worker/Dockerfile"
            ;;
        host|frontend-host)
            dockerfile_path="apps/host/Dockerfile"
            ;;
        entity-manager)
            dockerfile_path="services/entity-manager/Dockerfile"
            ;;
        api-gateway)
            dockerfile_path="services/api-gateway/Dockerfile"
            ;;
        *)
            echo "${RED}❌ Unknown service: $service${NC}"
            return 1
            ;;
    esac
    
    if [ ! -f "$dockerfile_path" ]; then
        echo "${RED}❌ Dockerfile not found: $dockerfile_path${NC}"
        return 1
    fi
    
    local image_name="${REGISTRY}/${service}"
    local unique_image="${image_name}:${UNIQUE_TAG}"
    local latest_image="${image_name}:latest"
    
    echo ""
    echo "${BLUE}📦 Building $service...${NC}"
    echo "   Dockerfile: $dockerfile_path"
    echo "   Unique tag: $unique_image"
    echo "   Latest tag: $latest_image"
    
    # Build with unique tag
    if docker build $CACHE_FLAG -t "$unique_image" -f "$dockerfile_path" "$build_context"; then
        echo "${GREEN}✅ Built: $unique_image${NC}"
        
        # Also tag as latest
        docker tag "$unique_image" "$latest_image"
        echo "${GREEN}✅ Tagged: $latest_image${NC}"
        
        # Push if requested
        if [ "$PUSH_IMAGES" = true ]; then
            echo "${BLUE}📤 Pushing $unique_image...${NC}"
            if docker push "$unique_image"; then
                echo "${GREEN}✅ Pushed: $unique_image${NC}"
            else
                echo "${RED}❌ Failed to push: $unique_image${NC}"
                return 1
            fi
            
            echo "${BLUE}📤 Pushing $latest_image...${NC}"
            if docker push "$latest_image"; then
                echo "${GREEN}✅ Pushed: $latest_image${NC}"
            else
                echo "${YELLOW}⚠️  Failed to push latest (non-critical)${NC}"
            fi
        fi
        
        # Save tag to file for deploy script
        mkdir -p "$REPO_ROOT/.deploy"
        echo "$UNIQUE_TAG" > "$REPO_ROOT/.deploy/${service}-tag.txt"
        echo "${GREEN}✅ Saved tag to .deploy/${service}-tag.txt${NC}"
        
        return 0
    else
        echo "${RED}❌ Failed to build: $service${NC}"
        return 1
    fi
}

# Build services
if [ -z "$SERVICE_NAME" ] || [ "$SERVICE_NAME" = "all" ]; then
    echo "${BLUE}Building all services...${NC}"
    build_service "ndvi-worker"
    build_service "host"
    build_service "entity-manager"
    build_service "api-gateway"
else
    build_service "$SERVICE_NAME"
fi

echo ""
echo "============================================================================="
echo "${GREEN}✅ Build Complete${NC}"
echo "============================================================================="
echo "Unique Tag: $UNIQUE_TAG"
echo ""
echo "Next steps:"
echo "  1. Import to k3s: docker save <image> | sudo k3s ctr images import -"
echo "  2. Deploy: ./scripts/deploy-service-safe.sh <service> $UNIQUE_TAG"
echo ""
