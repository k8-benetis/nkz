#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "Nekazari Platform Status Check"
echo "========================================="
echo ""

# Check namespace
echo "=== Namespace ==="
kubectl get namespace nekazari 2>/dev/null || echo -e "${RED}ERROR: Namespace nekazari not found${NC}"

echo ""
echo "=== All Pods ==="
kubectl get pods -n nekazari -o wide

echo ""
echo "=== Non-Running Pods ==="
FAILED_PODS=$(kubectl get pods -n nekazari --no-headers 2>/dev/null | grep -v Running | grep -v Completed || true)
if [ -z "$FAILED_PODS" ]; then
    echo -e "${GREEN}✓ All pods running${NC}"
else
    echo -e "${RED}✗ Some pods not running:${NC}"
    echo "$FAILED_PODS"
fi

echo ""
echo "=== PostgreSQL ==="
POSTGRES_POD=$(kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$POSTGRES_POD" ]; then
    echo -e "${RED}✗ PostgreSQL pod not found${NC}"
else
    POSTGRES_STATUS=$(kubectl get pod -n nekazari $POSTGRES_POD -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    echo "Pod: $POSTGRES_POD"
    echo "Status: $POSTGRES_STATUS"
    if [ "$POSTGRES_STATUS" != "Running" ]; then
        echo -e "${RED}✗ PostgreSQL not running${NC}"
    else
        echo -e "${GREEN}✓ PostgreSQL running${NC}"
    fi
fi

echo ""
echo "=== API Gateway ==="
GATEWAY_POD=$(kubectl get pods -n nekazari -l app=api-gateway -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$GATEWAY_POD" ]; then
    echo -e "${RED}✗ API Gateway pod not found${NC}"
else
    GATEWAY_STATUS=$(kubectl get pod -n nekazari $GATEWAY_POD -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    echo "Pod: $GATEWAY_POD"
    echo "Status: $GATEWAY_STATUS"
    if [ "$GATEWAY_STATUS" != "Running" ]; then
        echo -e "${RED}✗ API Gateway not running${NC}"
    else
        echo -e "${GREEN}✓ API Gateway running${NC}"
    fi
fi

echo ""
echo "=== Frontend ==="
FRONTEND_POD=$(kubectl get pods -n nekazari -l app=frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$FRONTEND_POD" ]; then
    echo -e "${RED}✗ Frontend pod not found${NC}"
else
    FRONTEND_STATUS=$(kubectl get pod -n nekazari $FRONTEND_POD -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    echo "Pod: $FRONTEND_POD"
    echo "Status: $FRONTEND_STATUS"
    if [ "$FRONTEND_STATUS" != "Running" ]; then
        echo -e "${RED}✗ Frontend not running${NC}"
    else
        echo -e "${GREEN}✓ Frontend running${NC}"
    fi
fi

echo ""
echo "=== Keycloak ==="
KEYCLOAK_POD=$(kubectl get pods -n nekazari -l app=keycloak -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$KEYCLOAK_POD" ]; then
    echo -e "${RED}✗ Keycloak pod not found${NC}"
else
    KEYCLOAK_STATUS=$(kubectl get pod -n nekazari $KEYCLOAK_POD -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    echo "Pod: $KEYCLOAK_POD"
    echo "Status: $KEYCLOAK_STATUS"
    if [ "$KEYCLOAK_STATUS" != "Running" ]; then
        echo -e "${RED}✗ Keycloak not running${NC}"
    else
        echo -e "${GREEN}✓ Keycloak running${NC}"
    fi
fi

echo ""
echo "========================================="
echo "Recent Errors Log"
echo "========================================="

if [ ! -z "$POSTGRES_POD" ]; then
    echo ""
    echo "--- PostgreSQL Logs (last 20 lines with ERROR) ---"
    kubectl logs -n nekazari $POSTGRES_POD --tail=50 2>&1 | grep -i error | tail -10 || echo "No errors found in PostgreSQL"
fi

if [ ! -z "$GATEWAY_POD" ]; then
    echo ""
    echo "--- API Gateway Logs (last 20 lines with ERROR) ---"
    kubectl logs -n nekazari $GATEWAY_POD --tail=50 2>&1 | grep -i error | tail -10 || echo "No errors found in API Gateway"
fi

if [ ! -z "$FRONTEND_POD" ]; then
    echo ""
    echo "--- Frontend Logs (last 20 lines with ERROR) ---"
    kubectl logs -n nekazari $FRONTEND_POD --tail=50 2>&1 | grep -i error | tail -10 || echo "No errors found in Frontend"
fi

echo ""
echo "========================================="
echo "Resource Usage"
echo "========================================="
kubectl top pods -n nekazari 2>/dev/null || echo "Metrics server not available"

echo ""
echo "========================================="
echo "Check Complete"
echo "========================================="

