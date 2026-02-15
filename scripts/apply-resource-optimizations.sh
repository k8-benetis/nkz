#!/bin/bash
# =============================================================================
# Apply Resource Optimizations for Phase 3
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_header() { echo -e "\n${CYAN}========================================\n$1\n========================================${NC}\n"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

NAMESPACE="nekazari"

log_header "Apply Resource Optimizations V2"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl not found"
    exit 1
fi

# Check namespace
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    log_error "Namespace '$NAMESPACE' not found"
    exit 1
fi

echo ""
log_info "Current resource usage:"
kubectl top pods -n "$NAMESPACE" --no-headers | sort -k3 -h
echo ""

# Apply optimizations
log_info "Applying resource optimizations..."

# GeoServer
log_info "Optimizing GeoServer..."
kubectl patch deployment geoserver -n "$NAMESPACE" -p '{"spec":{"template":{"spec":{"containers":[{"name":"geoserver","resources":{"requests":{"memory":"1.2Gi"},"limits":{"memory":"1.5Gi"}}}]}}}}'
log_success "GeoServer optimized (1.2Gi/1.5Gi)"

# MongoDB
log_info "Optimizing MongoDB..."
kubectl patch deployment mongodb -n "$NAMESPACE" -p '{"spec":{"template":{"spec":{"containers":[{"name":"mongodb","resources":{"requests":{"memory":"256Mi"},"limits":{"memory":"512Mi"}}}]}}}}'
log_success "MongoDB optimized (256Mi/512Mi)"

# CrateDB
log_info "Optimizing CrateDB..."
kubectl get statefulset cratedb -n "$NAMESPACE" && {
    kubectl patch statefulset cratedb -n "$NAMESPACE" -p '{"spec":{"template":{"spec":{"containers":[{"name":"cratedb","env":[{"name":"CRATE_HEAP_SIZE","value":"256m"}],"resources":{"requests":{"memory":"512Mi"},"limits":{"memory":"1Gi"}}}]}}}}'
    log_success "CrateDB optimized (512Mi/1Gi, heap 256m)"
} || log_warning "CrateDB StatefulSet not found, skipping"

echo ""
log_info "Waiting for deployments to stabilize..."
sleep 10

echo ""
log_info "New resource usage:"
kubectl top pods -n "$NAMESPACE" --no-headers | sort -k3 -h

echo ""
log_success "Resource optimizations applied successfully!"
log_info "Total memory freed: ~1.2Gi"
log_info "Ready for NDVI worker deployment (~512Mi required)"
echo ""

