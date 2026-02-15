#!/bin/bash
# =============================================================================
# Build and Import Tenant Webhook Docker Image to K3s
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get project root
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

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running"
    exit 1
fi

print_header "BUILDING TENANT WEBHOOK DOCKER IMAGE"

# Build Docker image
cd "$PROJECT_ROOT/services/tenant-webhook"
print_warning "Building Docker image: nekazari/tenant-webhook:latest"
docker build --no-cache -t nekazari/tenant-webhook:latest .

if [ $? -ne 0 ]; then
    print_error "Docker build failed"
    exit 1
fi

print_success "Docker image built successfully"

# Save image to file
print_warning "Saving Docker image to file..."
docker save nekazari/tenant-webhook:latest -o /tmp/tenant-webhook.tar

if [ $? -ne 0 ]; then
    print_error "Failed to save Docker image"
    exit 1
fi

print_success "Docker image saved to /tmp/tenant-webhook.tar"

# Import image to K3s
print_warning "Importing image to K3s..."
sudo k3s ctr images import /tmp/tenant-webhook.tar

if [ $? -ne 0 ]; then
    print_error "Failed to import image to K3s"
    exit 1
fi

print_success "Image imported to K3s"

# Clean up
rm /tmp/tenant-webhook.tar
print_warning "Temporary file deleted"

# Apply Kubernetes deployment
print_warning "Applying Kubernetes deployment..."
kubectl apply -f "$PROJECT_ROOT/k8s/k3s-optimized/tenant-webhook-deployment.yaml"

if [ $? -ne 0 ]; then
    print_error "Failed to apply deployment"
    exit 1
fi

print_success "Deployment applied successfully"

# Wait for pod to be ready
print_warning "Waiting for pod to be ready..."
kubectl wait --for=condition=ready pod -l app=tenant-webhook -n nekazari --timeout=120s

if [ $? -eq 0 ]; then
    print_success "Tenant Webhook is ready!"
    print_warning "Pod logs:"
    kubectl logs -n nekazari -l app=tenant-webhook --tail=50
else
    print_error "Pod did not become ready in time"
    print_warning "Checking pod status:"
    kubectl get pods -n nekazari -l app=tenant-webhook
    print_warning "Pod logs (last 100 lines):"
    kubectl logs -n nekazari -l app=tenant-webhook --tail=100
fi

print_header "TENANT WEBHOOK DEPLOYMENT COMPLETE"

