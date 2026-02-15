#!/bin/bash
# =============================================================================
# Deploy Service Script - Standardized Deployment Process
# =============================================================================
# This script standardizes the deployment process to avoid issues with cached
# images and ensure code is properly deployed.
#
# Usage:
#   ./scripts/deploy-service.sh <service-name> [options]
#
# Examples:
#   ./scripts/deploy-service.sh api-gateway
#   ./scripts/deploy-service.sh entity-manager --no-cache
#   ./scripts/deploy-service.sh api-gateway --verify
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="nekazari"
DOCKER_IMAGE_PREFIX="ghcr.io/k8-benetis/nekazari-public"

# Parse arguments
SERVICE=$1
if [ -z "$SERVICE" ]; then
    echo -e "${RED}Error: Service name is required${NC}"
    echo "Usage: $0 <service-name> [--no-cache] [--verify] [--skip-build]"
    exit 1
fi

NO_CACHE=""
VERIFY=false
SKIP_BUILD=false

shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --verify)
            VERIFY=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Get commit SHA for tagging
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
IMAGE_TAG="${DOCKER_IMAGE_PREFIX}/${SERVICE}:${COMMIT_SHA}"
IMAGE_LATEST="${DOCKER_IMAGE_PREFIX}/${SERVICE}:latest"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying ${SERVICE}${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Service: ${SERVICE}"
echo "Commit: ${COMMIT_SHA}"
echo "Image: ${IMAGE_TAG}"
echo ""

# Step 1: Build Docker image
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}[1/5] Building Docker image...${NC}"
    
    DOCKERFILE="services/${SERVICE}/Dockerfile"
    if [ ! -f "$DOCKERFILE" ]; then
        echo -e "${RED}Error: Dockerfile not found at ${DOCKERFILE}${NC}"
        exit 1
    fi
    
    docker build ${NO_CACHE} \
        -t "${IMAGE_TAG}" \
        -t "${IMAGE_LATEST}" \
        -f "${DOCKERFILE}" \
        . || {
        echo -e "${RED}Error: Docker build failed${NC}"
        exit 1
    }
    
    echo -e "${GREEN}✓ Image built successfully${NC}"
    
    # Step 1.5: Push Docker image
    echo -e "${YELLOW}[1.5/5] Pushing Docker image...${NC}"
    docker push "${IMAGE_TAG}" || {
        echo -e "${RED}Error: Docker push failed${NC}"
        exit 1
    }
    docker push "${IMAGE_LATEST}" || {
        echo -e "${RED}Error: Docker push latest failed${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Image pushed successfully${NC}"
else
    echo -e "${YELLOW}[1/5] Skipping build (--skip-build)${NC}"
fi

# Step 2: Verify image has correct code (optional)
if [ "$VERIFY" = true ]; then
    echo -e "${YELLOW}[2/5] Verifying image...${NC}"
    
    # Try to verify the image (service-specific)
    case $SERVICE in
        api-gateway)
            docker run --rm "${IMAGE_LATEST}" python3 -c "
import sys
import os
os.environ['ORION_URL'] = 'http://test:1026'
os.environ['KEYCLOAK_URL'] = 'http://test:8080/auth'
os.environ['CONTEXT_URL'] = 'http://test/context.json'
sys.path.insert(0, '/app')
from fiware_api_gateway import app
routes = [str(rule) for rule in app.url_map.iter_rules()]
if '/api/weather' in str(routes):
    print('OK')
    sys.exit(0)
else:
    print('FAIL: /api/weather route not found')
    sys.exit(1)
" || {
                echo -e "${RED}Error: Image verification failed${NC}"
                exit 1
            }
            ;;
        *)
            echo -e "${YELLOW}⚠ Verification not implemented for ${SERVICE}${NC}"
            ;;
    esac
    
    echo -e "${GREEN}✓ Image verified${NC}"
else
    echo -e "${YELLOW}[2/5] Skipping verification (use --verify to enable)${NC}"
fi

# Step 3: Update Kubernetes deployment
echo -e "${YELLOW}[3/5] Updating Kubernetes deployment...${NC}"

# Check if deployment exists
if ! kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" &>/dev/null; then
    echo -e "${RED}Error: Deployment ${SERVICE} not found in namespace ${NAMESPACE}${NC}"
    exit 1
fi

# Update image (use commit tag for better tracking)
kubectl set image deployment/"${SERVICE}" \
    "${SERVICE}=${IMAGE_TAG}" \
    -n "${NAMESPACE}" || {
    echo -e "${RED}Error: Failed to update deployment${NC}"
    exit 1
}

echo -e "${GREEN}✓ Deployment updated${NC}"

# Step 4: Force pod recreation
echo -e "${YELLOW}[4/5] Forcing pod recreation...${NC}"

# Delete existing pods to force recreation with new image
kubectl delete pods -n "${NAMESPACE}" -l app="${SERVICE}" --wait=false || true

# Wait for rollout
echo -e "${YELLOW}Waiting for rollout to complete...${NC}"
kubectl rollout status deployment/"${SERVICE}" -n "${NAMESPACE}" --timeout=120s || {
    echo -e "${RED}Error: Rollout failed or timed out${NC}"
    echo "Check logs with: kubectl logs -n ${NAMESPACE} deployment/${SERVICE}"
    exit 1
}

echo -e "${GREEN}✓ Pods recreated and ready${NC}"

# Step 5: Verify deployment
echo -e "${YELLOW}[5/5] Verifying deployment...${NC}"

# Wait a bit for pods to be fully ready
sleep 5

# Check pod status
READY=$(kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
DESIRED=$(kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

if [ "$READY" = "$DESIRED" ] && [ "$READY" != "0" ]; then
    echo -e "${GREEN}✓ Deployment verified: ${READY}/${DESIRED} pods ready${NC}"
else
    echo -e "${RED}✗ Deployment verification failed: ${READY}/${DESIRED} pods ready${NC}"
    echo "Check status with: kubectl get pods -n ${NAMESPACE} -l app=${SERVICE}"
    exit 1
fi

# Service-specific verification
case $SERVICE in
    api-gateway)
        echo -e "${YELLOW}Verifying API Gateway routes...${NC}"
        POD=$(kubectl get pods -n "${NAMESPACE}" -l app="${SERVICE}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [ -n "$POD" ]; then
            kubectl exec -n "${NAMESPACE}" "${POD}" -- python3 -c "
import sys
import os
os.environ['ORION_URL'] = 'http://test:1026'
os.environ['KEYCLOAK_URL'] = 'http://test:8080/auth'
os.environ['CONTEXT_URL'] = 'http://test/context.json'
sys.path.insert(0, '/app')
from fiware_api_gateway import app
routes = [str(rule) for rule in app.url_map.iter_rules()]
if '/api/weather' in str(routes):
    print('OK: /api/weather route found')
    sys.exit(0)
else:
    print('FAIL: /api/weather route not found')
    sys.exit(1)
" && echo -e "${GREEN}✓ API Gateway routes verified${NC}" || {
                echo -e "${RED}✗ API Gateway routes verification failed${NC}"
                exit 1
            }
        fi
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    kubectl logs -n ${NAMESPACE} deployment/${SERVICE} --tail=50 -f"
echo "  Check status: kubectl get pods -n ${NAMESPACE} -l app=${SERVICE}"
echo "  Restart:      kubectl rollout restart deployment/${SERVICE} -n ${NAMESPACE}"

