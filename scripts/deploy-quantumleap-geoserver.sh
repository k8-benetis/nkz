#!/bin/bash
# =============================================================================
# Complete Deployment Script: QuantumLeap + GeoServer
# =============================================================================
# This script automates the deployment of QuantumLeap and GeoServer
# Run on production server: ssh user@your-server-ip

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=========================================="
echo "QuantumLeap + GeoServer Deployment"
echo "=========================================="
echo ""

# Change to repository directory
cd ~/nekazari-public

# Pull latest changes
log_info "Pulling latest changes from GitHub..."
git pull origin main
log_success "Git pull completed"
echo ""

# Phase 1: Verification
log_info "Phase 1: Running database verification..."
./scripts/verify-database-for-geoserver.sh
echo ""

read -p "Continue with QuantumLeap deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Deployment cancelled by user"
    exit 0
fi

# Phase 2: Deploy QuantumLeap
log_info "Phase 2: Deploying QuantumLeap..."
kubectl apply -f k8s/addons/fiware/quantumleap-deployment.yaml
log_success "QuantumLeap deployment created"
echo ""

log_info "Waiting for QuantumLeap pod to be ready..."
kubectl wait --for=condition=ready pod -l app=quantumleap -n nekazari --timeout=300s || {
    log_error "QuantumLeap pod failed to start"
    kubectl logs -n nekazari -l app=quantumleap --tail=50
    exit 1
}
log_success "QuantumLeap is running"
echo ""

# Verify QuantumLeap health
log_info "Checking QuantumLeap health..."
kubectl exec -n nekazari -it $(kubectl get pod -n nekazari -l app=quantumleap -o jsonpath='{.items[0].metadata.name}') -- curl -s http://localhost:8668/health || {
    log_warning "QuantumLeap health check failed, but continuing..."
}
echo ""

# Phase 3: Create PostGIS Views
log_info "Phase 3: Creating PostGIS views for GeoServer..."
kubectl cp config/timescaledb/migrations/030_geoserver_quantumleap_views.sql \
  nekazari/postgresql-0:/tmp/030_geoserver_quantumleap_views.sql

kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -f /tmp/030_geoserver_quantumleap_views.sql
log_success "PostGIS views created"
echo ""

# Phase 4: Deploy GeoServer
read -p "Continue with GeoServer deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "GeoServer deployment skipped"
    exit 0
fi

log_info "Phase 4: Creating GeoServer secret..."
if kubectl get secret geoserver-secret -n nekazari &>/dev/null; then
    log_warning "GeoServer secret already exists, skipping creation"
else
    GEOSERVER_PASSWORD=$(openssl rand -base64 32)
    kubectl create secret generic geoserver-secret \
      --from-literal=admin-username=admin \
      --from-literal=admin-password="${GEOSERVER_PASSWORD}" \
      -n nekazari
    log_success "GeoServer secret created"
    log_info "GeoServer admin password: ${GEOSERVER_PASSWORD}"
    echo "IMPORTANT: Save this password!"
    echo ""
fi

log_info "Deploying GeoServer..."
kubectl apply -f k8s/addons/visualization/geoserver-deployment.yaml
log_success "GeoServer deployment created"
echo ""

log_info "Waiting for GeoServer pod to be ready (this may take 2-3 minutes)..."
kubectl wait --for=condition=ready pod -l app=geoserver -n nekazari --timeout=300s || {
    log_error "GeoServer pod failed to start"
    kubectl logs -n nekazari -l app=geoserver --tail=50
    exit 1
}
log_success "GeoServer is running"
echo ""

# Phase 5: Configure Orion Subscriptions
log_info "Phase 5: Configuring Orion-LD subscriptions..."
log_warning "Manual step required: Edit k8s/core/services/tenant-webhook-scripts-configmap.yaml"
log_warning "Uncomment lines 194-196 to enable QuantumLeap subscriptions"
echo ""

# Phase 6: Summary
echo "=========================================="
log_success "Deployment Complete!"
echo "=========================================="
echo ""
echo "Services deployed:"
echo "  ✅ QuantumLeap: http://quantumleap-service:8668"
echo "  ✅ GeoServer: http://geoserver-service:8080"
echo ""
echo "Next steps:"
echo "1. Port-forward to GeoServer: kubectl port-forward -n nekazari svc/geoserver-service 8080:8080"
echo "2. Access GeoServer UI: http://localhost:8080/geoserver"
echo "3. Login with admin / (password shown above)"
echo "4. Configure workspace and datastore (see documentation)"
echo "5. Enable QuantumLeap subscriptions in tenant-webhook ConfigMap"
echo ""
echo "Verification commands:"
echo "  - Check QuantumLeap: kubectl logs -n nekazari -l app=quantumleap -f"
echo "  - Check GeoServer: kubectl logs -n nekazari -l app=geoserver -f"
echo "  - List QuantumLeap tables: kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c \"SELECT tablename FROM pg_tables WHERE tablename LIKE 'mt%';\""
