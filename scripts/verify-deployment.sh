#!/bin/bash
# =============================================================================
# Deployment Verification Script
# =============================================================================
# Verifies that a deployment is using the correct image and is healthy
# 
# Usage:
#   ./scripts/verify-deployment.sh <deployment-name> <expected-image> [namespace]
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DEPLOYMENT_NAME="$1"
EXPECTED_IMAGE="$2"
NAMESPACE="${3:-nekazari}"

if [ -z "$DEPLOYMENT_NAME" ] || [ -z "$EXPECTED_IMAGE" ]; then
    echo "${RED}❌ Usage: $0 <deployment-name> <expected-image> [namespace]${NC}"
    exit 1
fi

echo "============================================================================="
echo "Verifying Deployment: $DEPLOYMENT_NAME"
echo "============================================================================="
echo "Expected Image: $EXPECTED_IMAGE"
echo "Namespace: $NAMESPACE"
echo ""

# Check deployment exists
if ! kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo "${RED}❌ Deployment not found: $DEPLOYMENT_NAME${NC}"
    exit 1
fi

# Get pods
PODS=$(kubectl get pods -n "$NAMESPACE" -l app="$DEPLOYMENT_NAME" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

if [ -z "$PODS" ]; then
    echo "${RED}❌ No pods found for deployment: $DEPLOYMENT_NAME${NC}"
    exit 1
fi

echo "${BLUE}📋 Found pods:${NC}"
for pod in $PODS; do
    echo "   - $pod"
done
echo ""

# Verify each pod
ALL_VALID=true
for pod in $PODS; do
    echo "${BLUE}🔍 Checking pod: $pod${NC}"
    
    # Get pod status
    STATUS=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    READY=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "false")
    
    echo "   Status: $STATUS"
    echo "   Ready: $READY"
    
    # Get image
    ACTUAL_IMAGE=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
    ACTUAL_IMAGE_ID=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].imageID}' 2>/dev/null || echo "")
    
    echo "   Image: $ACTUAL_IMAGE"
    echo "   Image ID: $ACTUAL_IMAGE_ID"
    
    # Extract tag from expected image
    EXPECTED_TAG=$(echo "$EXPECTED_IMAGE" | sed 's/.*://' || echo "")
    ACTUAL_TAG=$(echo "$ACTUAL_IMAGE" | sed 's/.*://' || echo "")
    
    # Verify image matches
    if [[ "$ACTUAL_IMAGE" == "$EXPECTED_IMAGE" ]] || [[ "$ACTUAL_TAG" == "$EXPECTED_TAG" ]] || [[ "$EXPECTED_TAG" == "latest" ]]; then
        echo "   ${GREEN}✅ Image matches${NC}"
    else
        echo "   ${RED}❌ Image mismatch!${NC}"
        echo "      Expected: $EXPECTED_IMAGE"
        echo "      Actual: $ACTUAL_IMAGE"
        ALL_VALID=false
    fi
    
    # Check if pod is ready
    if [ "$READY" = "true" ] && [ "$STATUS" = "Running" ]; then
        echo "   ${GREEN}✅ Pod is healthy${NC}"
    else
        echo "   ${YELLOW}⚠️  Pod not ready (Status: $STATUS, Ready: $READY)${NC}"
        if [ "$STATUS" != "Running" ]; then
            ALL_VALID=false
        fi
    fi
    
    echo ""
done

# Summary
echo "============================================================================="
if [ "$ALL_VALID" = true ]; then
    echo "${GREEN}✅ Verification Passed${NC}"
    echo "============================================================================="
    exit 0
else
    echo "${RED}❌ Verification Failed${NC}"
    echo "============================================================================="
    echo ""
    echo "Troubleshooting:"
    echo "  kubectl describe deployment $DEPLOYMENT_NAME -n $NAMESPACE"
    echo "  kubectl logs -n $NAMESPACE -l app=$DEPLOYMENT_NAME --tail=100"
    echo "  kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | grep $DEPLOYMENT_NAME"
    exit 1
fi
