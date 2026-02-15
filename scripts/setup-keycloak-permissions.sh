#!/bin/bash
# =============================================================================
# Setup Keycloak Service Account Permissions
# =============================================================================
# This script ensures that the nekazari-api-gateway Service Account has
# the realm-admin role assigned, allowing it to create users in Keycloak.
# 
# This script should be run after Keycloak deployment to ensure permissions
# are correctly configured. It is idempotent and safe to run multiple times.
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
JOB_NAME="keycloak-service-account-permissions"
JOB_FILE="k8s/keycloak/service-account-permissions-job.yaml"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "Setting up Keycloak Service Account Permissions"
echo "========================================="
echo ""

# Check if Keycloak is ready
echo "Step 1: Checking if Keycloak is ready..."
KEYCLOAK_READY=false
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if kubectl get pods -n "$NAMESPACE" -l app=keycloak -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q "True"; then
    KEYCLOAK_READY=true
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Waiting for Keycloak to be ready... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
  sleep 5
done

if [ "$KEYCLOAK_READY" = false ]; then
  echo -e "${RED}✗${NC} Keycloak is not ready after $MAX_ATTEMPTS attempts"
  echo "Please ensure Keycloak is deployed and running before running this script"
  exit 1
fi

echo -e "${GREEN}✓${NC} Keycloak is ready"
echo ""

# Check if Keycloak Admin API is accessible
echo "Step 2: Verifying Keycloak Admin API is accessible..."
if ! kubectl exec -n "$NAMESPACE" deployment/keycloak -- curl -f -s http://localhost:8080/auth/realms/master > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠${NC} Keycloak Admin API not accessible yet, waiting..."
  sleep 10
  if ! kubectl exec -n "$NAMESPACE" deployment/keycloak -- curl -f -s http://localhost:8080/auth/realms/master > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Keycloak Admin API is not accessible"
    exit 1
  fi
fi

echo -e "${GREEN}✓${NC} Keycloak Admin API is accessible"
echo ""

# Delete existing Job if it exists (to allow re-running)
echo "Step 3: Cleaning up existing Job (if any)..."
if kubectl get job -n "$NAMESPACE" "$JOB_NAME" > /dev/null 2>&1; then
  echo "  Deleting existing Job..."
  kubectl delete job -n "$NAMESPACE" "$JOB_NAME" --ignore-not-found=true
  sleep 2
fi

echo -e "${GREEN}✓${NC} Cleanup complete"
echo ""

# Apply the Job
echo "Step 4: Applying Service Account permissions Job..."
if [ ! -f "$JOB_FILE" ]; then
  echo -e "${RED}✗${NC} Job file not found: $JOB_FILE"
  exit 1
fi

kubectl apply -f "$JOB_FILE"
echo -e "${GREEN}✓${NC} Job applied"
echo ""

# Wait for Job to complete
echo "Step 5: Waiting for Job to complete..."
echo "  This may take a few minutes..."
kubectl wait --for=condition=complete --timeout=300s job/"$JOB_NAME" -n "$NAMESPACE" || {
  echo -e "${RED}✗${NC} Job failed or timed out"
  echo ""
  echo "Job logs:"
  kubectl logs -n "$NAMESPACE" job/"$JOB_NAME" --tail=50
  exit 1
}

echo -e "${GREEN}✓${NC} Job completed successfully"
echo ""

# Show Job logs
echo "Step 6: Job output:"
echo "----------------------------------------"
kubectl logs -n "$NAMESPACE" job/"$JOB_NAME"
echo "----------------------------------------"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✓ Service Account permissions configured successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "The nekazari-api-gateway Service Account now has realm-admin role"
echo "and can create users in Keycloak."
echo ""

