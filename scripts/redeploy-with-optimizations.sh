#!/bin/bash

set -e

echo "========================================="
echo "Redeploy with Resource Optimizations"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd ~/nekazari-enterprise

echo "Step 1: Pulling latest changes..."
git pull origin feature/plan-v2-implementation

echo ""
echo "Step 2: Applying resource reductions..."
kubectl apply -f k8s/k3s-optimized/keycloak-deployment.yaml
echo -e "${GREEN}✓${NC} Keycloak updated"
sleep 2

# CrateDB: ELIMINADO - No se usa actualmente
# kubectl apply -f k8s/k3s-optimized/cratedb-deployment.yaml
# echo -e "${GREEN}✓${NC} CrateDB updated"
# sleep 2

kubectl apply -f k8s/k3s-optimized/mongodb-deployment.yaml
echo -e "${GREEN}✓${NC} MongoDB updated"
sleep 2

# QuantumLeap: ELIMINADO - No se usa actualmente
# kubectl apply -f k8s/k3s-optimized/quantumleap-deployment.yaml
# echo -e "${GREEN}✓${NC} QuantumLeap updated"
echo ""

echo "Step 3: Waiting for pods to restart (60 seconds)..."
sleep 60

echo ""
echo "Step 4: Checking pod status..."
kubectl get pods -n nekazari

echo ""
echo "Step 5: Deleting old GeoServer deployment..."
kubectl delete deployment geoserver -n nekazari 2>/dev/null || echo "No existing GeoServer deployment"
sleep 5

echo ""
echo "Step 6: Deploying GeoServer with optimized resources..."
kubectl apply -f k8s/services/geoserver-deployment.yaml

echo ""
echo -e "${YELLOW}Step 7: Monitoring GeoServer startup...${NC}"
echo "Press Ctrl+C to stop monitoring (GeoServer will continue starting)"
echo ""
sleep 5

# Watch pods
timeout 180 kubectl get pods -n nekazari -w 2>/dev/null || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Check GeoServer status with:"
echo "  kubectl get pods -n nekazari | grep geoserver"
echo ""
echo "View GeoServer logs with:"
echo "  kubectl logs -n nekazari -l app=geoserver -f"
echo ""

