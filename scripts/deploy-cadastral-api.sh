#!/bin/bash
# =============================================================================
# Deploy Cadastral API - Automated Deployment from GitHub Registry
# =============================================================================
# This script deploys cadastral-api from the GitHub Container Registry
# It assumes the image has already been built and pushed by GitHub Actions
#
# Usage:
#   ./scripts/deploy-cadastral-api.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="nekazari"
SERVICE="cadastral-api"
IMAGE="ghcr.io/k8-benetis/nekazari-public/cadastral-api:latest"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying ${SERVICE}${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Service: ${SERVICE}"
echo "Image: ${IMAGE}"
echo "Namespace: ${NAMESPACE}"
echo ""

# Step 1: Verify deployment exists
echo -e "${YELLOW}[1/3] Verifying deployment exists...${NC}"
if ! kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" &>/dev/null; then
    echo -e "${RED}Error: Deployment ${SERVICE} not found in namespace ${NAMESPACE}${NC}"
    echo "Please apply the deployment YAML first:"
    echo "  kubectl apply -f k8s/k3s-optimized/cadastral-api-deployment.yaml"
    exit 1
fi
echo -e "${GREEN}✓ Deployment found${NC}"

# Step 2: Update image (force pull)
echo -e "${YELLOW}[2/3] Updating deployment image...${NC}"
kubectl set image deployment/"${SERVICE}" \
    "${SERVICE}=${IMAGE}" \
    -n "${NAMESPACE}" || {
    echo -e "${RED}Error: Failed to update deployment${NC}"
    exit 1
}

# Force pull by deleting pods (imagePullPolicy: Always will pull new image)
kubectl delete pods -n "${NAMESPACE}" -l app="${SERVICE}" --wait=false || true

echo -e "${GREEN}✓ Deployment updated, pods being recreated${NC}"

# Step 3: Wait for rollout
echo -e "${YELLOW}[3/3] Waiting for rollout to complete...${NC}"
kubectl rollout status deployment/"${SERVICE}" -n "${NAMESPACE}" --timeout=120s || {
    echo -e "${RED}Error: Rollout failed or timed out${NC}"
    echo "Check logs with: kubectl logs -n ${NAMESPACE} deployment/${SERVICE}"
    exit 1
}

echo -e "${GREEN}✓ Rollout completed successfully${NC}"

# Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"
READY=$(kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
DESIRED=$(kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

if [ "$READY" = "$DESIRED" ] && [ "$READY" != "0" ]; then
    echo -e "${GREEN}✓ Deployment verified: ${READY}/${DESIRED} pods ready${NC}"
else
    echo -e "${RED}✗ Deployment verification failed: ${READY}/${DESIRED} pods ready${NC}"
    echo "Check status with: kubectl get pods -n ${NAMESPACE} -l app=${SERVICE}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    kubectl logs -n ${NAMESPACE} deployment/${SERVICE} --tail=50 -f"
echo "  Check status: kubectl get pods -n ${NAMESPACE} -l app=${SERVICE}"
echo "  Restart:      kubectl rollout restart deployment/${SERVICE} -n ${NAMESPACE}"
