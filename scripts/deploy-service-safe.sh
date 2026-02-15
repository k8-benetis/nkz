#!/bin/bash
# =============================================================================
# Safe Service Deployment Script - Preserves Data and Secrets
# =============================================================================
# Deploys a service safely without touching PVCs, Secrets, or existing data
# 
# Usage:
#   ./scripts/deploy-service-safe.sh <service-name> [tag] [--namespace NAMESPACE]
#
# Examples:
#   ./scripts/deploy-service-safe.sh ndvi-worker vabc123-20251221-120000
#   ./scripts/deploy-service-safe.sh host latest --namespace nekazari
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY="ghcr.io/k8-benetis/nekazari-public"
NAMESPACE="${NAMESPACE:-nekazari}"

# Parse arguments
SERVICE_NAME=""
IMAGE_TAG=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        *)
            if [ -z "$SERVICE_NAME" ]; then
                SERVICE_NAME="$1"
            elif [ -z "$IMAGE_TAG" ]; then
                IMAGE_TAG="$1"
            fi
            shift
            ;;
    esac
done

# Validate service name
if [ -z "$SERVICE_NAME" ]; then
    echo "${RED}❌ Error: Service name required${NC}"
    echo "Usage: $0 <service-name> [tag] [--namespace NAMESPACE]"
    exit 1
fi

# Get tag from file if not provided
if [ -z "$IMAGE_TAG" ]; then
    TAG_FILE="$REPO_ROOT/.deploy/${SERVICE_NAME}-tag.txt"
    if [ -f "$TAG_FILE" ]; then
        IMAGE_TAG=$(cat "$TAG_FILE")
        echo "${BLUE}ℹ️  Using tag from .deploy/${SERVICE_NAME}-tag.txt: $IMAGE_TAG${NC}"
    else
        IMAGE_TAG="latest"
        echo "${YELLOW}⚠️  No tag provided, using 'latest'${NC}"
    fi
fi

IMAGE_NAME="${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}"
DEPLOYMENT_NAME=""

# Map service names to deployment names
case $SERVICE_NAME in
    ndvi-worker)
        DEPLOYMENT_NAME="ndvi-worker"
        ;;
    host|frontend-host)
        DEPLOYMENT_NAME="frontend-host"
        ;;
    entity-manager)
        DEPLOYMENT_NAME="entity-manager"
        ;;
    api-gateway)
        DEPLOYMENT_NAME="api-gateway"
        ;;
    *)
        DEPLOYMENT_NAME="$SERVICE_NAME"
        ;;
esac

echo "============================================================================="
echo "Safe Service Deployment"
echo "============================================================================="
echo "Service: $SERVICE_NAME"
echo "Deployment: $DEPLOYMENT_NAME"
echo "Image: $IMAGE_NAME"
echo "Namespace: $NAMESPACE"
echo ""

# Check if deployment exists
if ! kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo "${RED}❌ Deployment not found: $DEPLOYMENT_NAME in namespace $NAMESPACE${NC}"
    exit 1
fi

# Check if image exists locally (for k3s import)
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "${YELLOW}⚠️  Image not found locally: $IMAGE_NAME${NC}"
    echo "${BLUE}ℹ️  Attempting to import from registry or build...${NC}"
    
    # Try to import from k3s cache first
    if sudo k3s ctr images list | grep -q "$IMAGE_NAME"; then
        echo "${GREEN}✅ Image found in k3s cache${NC}"
    else
        echo "${YELLOW}⚠️  Image not in k3s cache. You may need to:${NC}"
        echo "   1. Build: ./scripts/build-and-tag-images.sh $SERVICE_NAME"
        echo "   2. Import: docker save $IMAGE_NAME | sudo k3s ctr images import -"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Import image to k3s if it exists locally
if docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "${BLUE}📥 Importing image to k3s...${NC}"
    # Check if we can use sudo k3s ctr
    if command -v k3s &>/dev/null && sudo -n true 2>/dev/null; then
        if docker save "$IMAGE_NAME" | sudo k3s ctr images import - 2>&1 | grep -q "Importing\|saved"; then
            echo "${GREEN}✅ Image imported to k3s${NC}"
        else
            echo "${YELLOW}⚠️  Image may already be in k3s cache${NC}"
        fi
    else
        echo "${YELLOW}⚠️  Cannot import to k3s (requires sudo). Image should be imported manually:${NC}"
        echo "   docker save $IMAGE_NAME | sudo k3s ctr images import -"
    fi
fi

# Update deployment with new image
echo ""
echo "${BLUE}🔄 Updating deployment...${NC}"
echo "   This will:"
echo "   ✅ Update the container image"
echo "   ✅ Preserve all PVCs (data safe)"
echo "   ✅ Preserve all Secrets (credentials safe)"
echo "   ✅ Preserve all ConfigMaps"
echo "   ✅ Trigger rolling update"
echo ""

# Use kubectl set image (safe, non-destructive)
if kubectl set image deployment/"$DEPLOYMENT_NAME" \
    "$SERVICE_NAME=$IMAGE_NAME" \
    -n "$NAMESPACE" \
    --record; then
    echo "${GREEN}✅ Deployment updated${NC}"
else
    echo "${RED}❌ Failed to update deployment${NC}"
    exit 1
fi

# Force image pull policy
echo "${BLUE}🔧 Ensuring imagePullPolicy: Always...${NC}"
kubectl patch deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -p '{"spec":{"template":{"spec":{"containers":[{"name":"'$SERVICE_NAME'","imagePullPolicy":"Always"}]}}}}' --type=merge

# Trigger rollout restart to ensure new image is used
echo "${BLUE}🔄 Triggering rollout restart...${NC}"
kubectl rollout restart deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE"

# Wait for rollout
echo ""
echo "${BLUE}⏳ Waiting for rollout to complete...${NC}"
if kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout=300s; then
    echo "${GREEN}✅ Rollout completed successfully${NC}"
else
    echo "${RED}❌ Rollout failed or timed out${NC}"
    echo "${YELLOW}Check status with: kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE${NC}"
    exit 1
fi

# Verify deployment
echo ""
echo "${BLUE}🔍 Verifying deployment...${NC}"
if [ -f "$SCRIPT_DIR/verify-deployment.sh" ]; then
    "$SCRIPT_DIR/verify-deployment.sh" "$DEPLOYMENT_NAME" "$IMAGE_NAME" "$NAMESPACE"
else
    # Basic verification
    POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app="$DEPLOYMENT_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$POD_NAME" ]; then
        POD_IMAGE=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
        echo "   Pod: $POD_NAME"
        echo "   Image: $POD_IMAGE"
        if [[ "$POD_IMAGE" == *"$IMAGE_TAG"* ]] || [[ "$IMAGE_TAG" == "latest" ]]; then
            echo "${GREEN}✅ Pod is using the expected image${NC}"
        else
            echo "${YELLOW}⚠️  Pod image may differ (expected tag: $IMAGE_TAG)${NC}"
        fi
    fi
fi

echo ""
echo "============================================================================="
echo "${GREEN}✅ Deployment Complete${NC}"
echo "============================================================================="
echo "Service: $SERVICE_NAME"
echo "Image: $IMAGE_NAME"
echo "Namespace: $NAMESPACE"
echo ""
echo "Verification:"
echo "  kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT_NAME"
echo "  kubectl logs -n $NAMESPACE -l app=$DEPLOYMENT_NAME --tail=50"
echo ""
