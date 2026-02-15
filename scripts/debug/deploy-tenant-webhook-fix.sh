#!/bin/bash
# =============================================================================
# Deploy Tenant Webhook Authentication Fix (GitOps)
# =============================================================================
# This script applies all fixes for PlatformAdmin authentication issues
# Can be executed on any server following GitOps principles

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header "DEPLOYING TENANT WEBHOOK AUTHENTICATION FIX"

# Step 1: Apply deployment configuration
print_warning "Step 1: Applying tenant-webhook deployment..."
kubectl apply -f "$PROJECT_ROOT/k8s/k3s-optimized/tenant-webhook-deployment.yaml"
if [ $? -eq 0 ]; then
    print_success "Deployment configuration applied"
else
    print_error "Failed to apply deployment"
    exit 1
fi

# Step 2: Rebuild Docker image
print_warning "Step 2: Rebuilding tenant-webhook Docker image..."
cd "$PROJECT_ROOT/services/tenant-webhook"
docker build --no-cache -t nekazari/tenant-webhook:latest .
if [ $? -eq 0 ]; then
    print_success "Docker image built successfully"
else
    print_error "Docker build failed"
    exit 1
fi

# Step 3: Import to K3s
print_warning "Step 3: Importing image to K3s..."
docker save nekazari/tenant-webhook:latest | sudo k3s ctr -n k8s.io images import -
if [ $? -eq 0 ]; then
    print_success "Image imported to K3s"
else
    print_error "Failed to import image"
    exit 1
fi

# Step 4: Restart deployment
print_warning "Step 4: Restarting deployment..."
kubectl rollout restart deployment/tenant-webhook -n nekazari
if [ $? -eq 0 ]; then
    print_success "Deployment restarted"
else
    print_error "Failed to restart deployment"
    exit 1
fi

# Step 5: Wait for pod to be ready
print_warning "Step 5: Waiting for pod to be ready..."
kubectl wait --for=condition=ready pod -l app=tenant-webhook -n nekazari --timeout=120s
if [ $? -eq 0 ]; then
    print_success "Pod is ready"
else
    print_warning "Pod did not become ready in time, checking status..."
    kubectl get pods -n nekazari -l app=tenant-webhook
fi

# Step 6: Verify logs
print_warning "Step 6: Verifying logs..."
kubectl logs -n nekazari -l app=tenant-webhook --tail=30 | grep -E 'Keycloak|error|ERROR|404' || echo "No errors found in logs"

print_header "DEPLOYMENT COMPLETE"

print_warning "Next steps:"
echo "1. Configure PlatformAdmin user: bash scripts/fix-platform-admin-user.sh <email>"
echo "2. Test tenant deletion: Try deleting a tenant from the frontend"
echo "3. Test user listing: Try listing users from the admin panel"

print_success "All fixes deployed following GitOps principles!"
