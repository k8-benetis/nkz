#!/bin/bash

# =============================================================================
# Nekazari Platform - Complete Deployment Script
# =============================================================================
# This script deploys the entire Nekazari platform from scratch:
# - Creates namespace
# - Creates all required secrets
# - Deploys infrastructure (PostgreSQL, MongoDB, Redis)
# - Applies database migrations
# - Deploys Keycloak
# - Deploys all services
# - Creates bootstrap admin user and tenant
# 
# Usage:
#   ./scripts/deploy-platform.sh [--non-interactive] [--skip-secrets]
#
# Options:
#   --non-interactive: Use .env file for all secrets (no prompts)
#   --skip-secrets: Skip secret creation (assumes they already exist)
# =============================================================================

set -e  # Exit on error

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
ENV_FILE="$REPO_ROOT/.env"
NAMESPACE="nekazari"
K8S_CORE="$REPO_ROOT/k8s/core"
K8S_COMMON="$REPO_ROOT/k8s/common"
K8S_ADDONS="$REPO_ROOT/k8s/addons"
K8S_MON="$REPO_ROOT/k8s/monitoring"

# Flags
NON_INTERACTIVE=false
SKIP_SECRETS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --skip-secrets)
            SKIP_SECRETS=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--non-interactive] [--skip-secrets]"
            exit 1
            ;;
    esac
done

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking Prerequisites"
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    log_success "kubectl found: $(kubectl version --client --short 2>/dev/null | cut -d' ' -f3)"
    
    # Check k3s/kubectl access
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot access Kubernetes cluster"
        exit 1
    fi
    log_success "Kubernetes cluster accessible"
    
    # Check if .env exists (for non-interactive mode)
    if [ "$NON_INTERACTIVE" = true ] && [ ! -f "$ENV_FILE" ]; then
        log_error ".env file not found. Required for --non-interactive mode"
        log_info "Copy env.example to .env and fill in all values"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Create namespace
create_namespace() {
    log_step "Creating Namespace"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warning "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace "$NAMESPACE"
        log_success "Namespace $NAMESPACE created"
    fi
}

# Create secrets
create_secrets() {
    log_step "Creating Secrets"
    
    if [ "$SKIP_SECRETS" = true ]; then
        log_warning "Skipping secret creation (--skip-secrets flag)"
        return
    fi
    
    if [ "$NON_INTERACTIVE" = true ]; then
        log_info "Creating secrets from .env file (non-interactive mode)"
        if [ -f "$SCRIPT_DIR/create-secrets-from-env.sh" ]; then
            bash "$SCRIPT_DIR/create-secrets-from-env.sh"
        else
            log_error "create-secrets-from-env.sh not found"
            exit 1
        fi
    else
        log_info "Interactive secret creation"
        log_warning "Please create secrets manually using:"
        echo ""
        echo "  # PostgreSQL"
        echo "  kubectl create secret generic postgresql-secret \\"
        echo "    --from-literal=password='YOUR_PASSWORD' \\"
        echo "    --from-literal=postgres-url='postgresql://nekazari:YOUR_PASSWORD@postgresql-service:5432/nekazari' \\"
        echo "    -n $NAMESPACE"
        echo ""
        echo "  # Keycloak"
        echo "  kubectl create secret generic keycloak-secret \\"
        echo "    --from-literal=admin-username='admin' \\"
        echo "    --from-literal=admin-password='YOUR_PASSWORD' \\"
        echo "    -n $NAMESPACE"
        echo ""
        echo "  # Bootstrap (admin user for first login)"
        echo "  kubectl create secret generic bootstrap-secret \\"
        echo "    --from-literal=admin-email='admin@yourdomain.com' \\"
        echo "    --from-literal=admin-password='YOUR_PASSWORD' \\"
        echo "    -n $NAMESPACE"
        echo ""
        echo "  # JWT Secret"
        echo "  kubectl create secret generic jwt-secret \\"
        echo "    --from-literal=secret='YOUR_JWT_SECRET_MIN_32_CHARS' \\"
        echo "    -n $NAMESPACE"
        echo ""
        read -p "Press Enter after creating all secrets..."
    fi
    
    # Verify critical secrets exist
    log_info "Verifying critical secrets..."
    local missing_secrets=()
    
    for secret in postgresql-secret keycloak-secret bootstrap-secret jwt-secret; do
        if ! kubectl get secret "$secret" -n "$NAMESPACE" &> /dev/null; then
            missing_secrets+=("$secret")
        fi
    done
    
    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_error "Missing required secrets: ${missing_secrets[*]}"
        exit 1
    fi
    
    log_success "All required secrets exist"
}

# Deploy ConfigMaps
deploy_configmaps() {
    log_step "Deploying ConfigMaps"
    
    kubectl apply -f "$K8S_CORE/configmaps/configmaps.yaml"
    kubectl apply -f "$K8S_CORE/configmaps/grafana-configmap.yaml"
    kubectl apply -f "$K8S_CORE/configmaps/prometheus-configmap.yaml"
    
    # Realm Config (avoiding verify-annotation large size issue)
    log_info "Creating Realm ConfigMap..."
    kubectl delete configmap realm-config -n "$NAMESPACE" --ignore-not-found=true
    kubectl create configmap realm-config \
        --from-file="nekazari-realm.json=$K8S_CORE/auth/nekazari-realm.json" \
        -n "$NAMESPACE"
    
    log_success "ConfigMaps deployed"
}

# Deploy infrastructure (PostgreSQL, MongoDB, Redis)
deploy_infrastructure() {
    log_step "Deploying Infrastructure"
    
    # PostgreSQL
    log_info "Deploying PostgreSQL..."
    kubectl apply -f "$K8S_CORE/infrastructure/postgresql-storage.yaml"
    kubectl apply -f "$K8S_CORE/infrastructure/postgresql-service.yaml"
    kubectl apply -f "$K8S_CORE/infrastructure/postgresql-deployment.yaml"
    
    # MongoDB
    log_info "Deploying MongoDB..."
    kubectl apply -f "$K8S_CORE/infrastructure/mongodb-hostpath-pv.yaml"
    kubectl apply -f "$K8S_CORE/infrastructure/mongodb-deployment.yaml"
    
    # Redis
    log_info "Deploying Redis..."
    kubectl apply -f "$K8S_CORE/infrastructure/redis-deployment.yaml"

    # Mosquitto
    log_info "Deploying Mosquitto..."
    kubectl apply -f "$K8S_CORE/infrastructure/mosquitto-deployment.yaml"

    # MinIO
    log_info "Deploying MinIO..."
    kubectl apply -f "$K8S_CORE/infrastructure/minio-deployment.yaml"
    
    log_success "Infrastructure deployments created"
    
    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgresql -n "$NAMESPACE" --timeout=300s || {
        log_error "PostgreSQL failed to become ready"
        exit 1
    }
    log_success "PostgreSQL is ready"
    
    # Wait for MongoDB to be ready
    log_info "Waiting for MongoDB to be ready..."
    kubectl wait --for=condition=ready pod -l app=mongodb -n "$NAMESPACE" --timeout=300s || {
        log_warning "MongoDB failed to become ready (may be optional)"
    }
    log_success "MongoDB is ready"
}

# Apply database migrations
apply_migrations() {
    log_step "Applying Database Migrations"
    
    if [ -f "$SCRIPT_DIR/apply-database-migrations.sh" ]; then
        bash "$SCRIPT_DIR/apply-database-migrations.sh"
    else
        log_warning "Migration script not found, skipping migrations"
        log_info "Run manually: ./scripts/apply-database-migrations.sh"
    fi
}

# Deploy Keycloak
deploy_keycloak() {
    log_step "Deploying Keycloak"
    
    kubectl apply -f "$K8S_CORE/auth/keycloak-rbac.yaml"
    kubectl apply -f "$K8S_CORE/auth/keycloak-deployment.yaml"

    
    log_success "Keycloak deployment created"
    
    # Wait for Keycloak to be ready
    log_info "Waiting for Keycloak to be ready (this may take 2-3 minutes)..."
    kubectl wait --for=condition=ready pod -l app=keycloak -n "$NAMESPACE" --timeout=600s || {
        log_error "Keycloak failed to become ready"
        log_info "Check logs: kubectl logs -l app=keycloak -n $NAMESPACE"
        exit 1
    }
    
    # Keycloak is ready (readiness probe passed)
    log_success "Keycloak is ready"
}

# Deploy all services
deploy_services() {
    log_step "Deploying Services"
    
    # RBAC first
    log_info "Deploying RBAC resources..."
    kubectl apply -f "$K8S_COMMON/rbac/api-gateway-rbac.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_COMMON/rbac/tenant-webhook-rbac.yaml" 2>/dev/null || true
    
    # Core services
    log_info "Deploying core services..."
    kubectl apply -f "$K8S_CORE/services/services-deployments.yaml"
    kubectl apply -f "$K8S_CORE/fiware/orion-ld-deployment.yaml"
    # kubectl apply -f "$K8S_CORE/services/api-validator-deployment.yaml" # Deprecated
    kubectl apply -f "$K8S_CORE/services/tenant-webhook-deployment.yaml"
    kubectl apply -f "$K8S_CORE/services/tenant-user-api-deployment.yaml"
    
    # Monitoring
    log_info "Deploying monitoring..."
    kubectl apply -f "$K8S_MON/monitoring-deployments.yaml"
    
    # Additional services
    log_info "Deploying additional services..."
    kubectl apply -f "$K8S_CORE/services/cadastral-api-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_ADDONS/analytics/risk/risk-api-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/frontend/frontend-static-configmap.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/frontend/frontend-static-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/services/telemetry-worker-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/services/intelligence-service-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_ADDONS/iot/n8n-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/services/sdm-integration-deployment.yaml" 2>/dev/null || true
    kubectl apply -f "$K8S_CORE/fiware/iot-agent-json-deployment.yaml" 2>/dev/null || true
    
    # Ingress
    log_info "Deploying ingress..."
    kubectl apply -f "$K8S_CORE/networking/ingress.yaml"
    
    log_success "All services deployed"
}

# Create bootstrap user and tenant
create_bootstrap() {
    log_step "Creating Bootstrap Admin User and Tenant"
    
    # Create ConfigMap for bootstrap scripts
    log_info "Creating bootstrap scripts ConfigMap..."
    kubectl create configmap bootstrap-scripts \
        --from-file="$REPO_ROOT/scripts/bootstrap/" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Delete existing jobs if they exist
    kubectl delete job bootstrap-tenant-and-admin -n "$NAMESPACE" 2>/dev/null || true
    kubectl delete job populate-municipalities -n "$NAMESPACE" 2>/dev/null || true
    
    # Apply bootstrap job
    log_info "Applying bootstrap tenant and admin job..."
    kubectl apply -f "$REPO_ROOT/k8s/bootstrap/bootstrap-tenant-and-admin-job.yaml"
    
    log_info "Waiting for bootstrap job to complete..."
    kubectl wait --for=condition=complete job/bootstrap-tenant-and-admin -n "$NAMESPACE" --timeout=300s || {
        log_error "Bootstrap job failed"
        log_info "Check logs: kubectl logs -n $NAMESPACE job/bootstrap-tenant-and-admin"
        exit 1
    }
    
    # Show bootstrap credentials
    log_success "Bootstrap job completed"
    echo ""
    log_info "Bootstrap credentials (saved in job logs):"
    kubectl logs -n "$NAMESPACE" job/bootstrap-tenant-and-admin | grep -A 5 "Bootstrap completado" || true

    # Apply municipalities population job
    log_info "Applying municipalities population job..."
    kubectl apply -f "$REPO_ROOT/k8s/bootstrap/municipalities-job.yaml"
    
    # We don't necessarily need to wait for this one to block deployment, but it's good practice
    log_info "Waiting for municipalities population (optional)..."
    kubectl wait --for=condition=complete job/populate-municipalities -n "$NAMESPACE" --timeout=300s || {
        log_warning "Municipalities population job failed or timed out (check logs)"
    }
}

# Verify deployment
verify_deployment() {
    log_step "Verifying Deployment"
    
    log_info "Checking pod status..."
    kubectl get pods -n "$NAMESPACE" -o wide
    
    echo ""
    log_info "Checking services..."
    kubectl get services -n "$NAMESPACE"
    
    echo ""
    log_info "Deployment summary:"
    local total_pods=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
    local ready_pods=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    log_info "Pods: $ready_pods/$total_pods running"
    
    if [ "$ready_pods" -lt "$total_pods" ]; then
        log_warning "Some pods are not ready yet. Check status with: kubectl get pods -n $NAMESPACE"
    else
        log_success "All pods are running"
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                    NEKAZARI PLATFORM DEPLOYMENT                             ║"
    echo "║                    Complete Platform Setup from Scratch                     ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    
    check_prerequisites
    create_namespace
    create_secrets
    deploy_configmaps
    deploy_infrastructure
    apply_migrations
    deploy_keycloak
    deploy_services
    create_bootstrap
    verify_deployment
    
    echo ""
    log_step "Deployment Complete!"
    echo ""
    log_success "Nekazari platform has been deployed successfully"
    echo ""
    log_info "Next steps:"
    echo "  1. Access the platform at: https://nekazari.robotika.cloud"
    echo "  2. Login with bootstrap credentials (check job logs above)"
    echo "  3. Verify all services are running: kubectl get pods -n $NAMESPACE"
    echo ""
    log_info "To view bootstrap credentials:"
    echo "  kubectl logs -n $NAMESPACE job/bootstrap-tenant-and-admin | grep -A 5 'Bootstrap completado'"
    echo ""
}

# Run main
main

