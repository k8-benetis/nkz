#!/bin/bash
# =============================================================================
# Check System Status - Nekazari Platform
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

print_header "VERIFICACIÓN DEL SISTEMA NEKAZARI"
echo ""

# 1. Estado de Pods
print_header "1. ESTADO DE PODS"
kubectl get pods -n nekazari -o wide
echo ""

# 2. Servicios
print_header "2. SERVICIOS EXPUESTOS"
kubectl get svc -n nekazari
echo ""

# 3. Ingress
print_header "3. INGRESS ROUTES"
kubectl get ingress -n nekazari
echo ""

# 4. Deployments
print_header "4. DEPLOYMENTS"
kubectl get deployments -n nekazari
echo ""

# 5. Estado de pods críticos
print_header "5. ESTADO DE PODS CRÍTICOS"
echo ""
echo "Frontend:"
kubectl get pod -n nekazari -l app=frontend
echo ""
echo "Keycloak:"
kubectl get pod -n nekazari -l app=keycloak
echo ""
echo "Tenant User API:"
kubectl get pod -n nekazari -l app=tenant-user-api
echo ""
echo "Tenant Webhook:"
kubectl get pod -n nekazari -l app=tenant-webhook
echo ""

# 6. Pods en estado de error
print_header "6. PODS CON ERRORES"
ERROR_PODS=$(kubectl get pods -n nekazari --field-selector=status.phase!=Running,status.phase!=Succeeded --no-headers 2>/dev/null | wc -l)
if [ "$ERROR_PODS" -gt 0 ]; then
    print_error "Hay pods con errores:"
    kubectl get pods -n nekazari --field-selector=status.phase!=Running,status.phase!=Succeeded
else
    print_success "Todos los pods están corriendo correctamente"
fi
echo ""

# 7. Resumen
print_header "RESUMEN"
TOTAL_PODS=$(kubectl get pods -n nekazari --no-headers 2>/dev/null | wc -l)
RUNNING_PODS=$(kubectl get pods -n nekazari --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
ERROR_PODS=$(kubectl get pods -n nekazari --field-selector=status.phase!=Running,status.phase!=Succeeded --no-headers 2>/dev/null | wc -l)

echo "Total de pods: $TOTAL_PODS"
echo "Pods corriendo: $RUNNING_PODS"
echo "Pods con errores: $ERROR_PODS"
echo ""

if [ "$ERROR_PODS" -eq 0 ]; then
    print_success "✅ Sistema funcionando correctamente"
else
    print_warning "⚠️  Hay $ERROR_PODS pod(s) con problemas"
    print_warning "Ejecuta: kubectl describe pod <pod-name> -n nekazari"
fi

echo ""
print_header "ENLACES IMPORTANTES"
echo "Frontend: https://nekazari.robotika.cloud"
echo "Keycloak Admin: https://nekazari.robotika.cloud/auth/admin"
echo "Admin Panel: https://nekazari.robotika.cloud/system-admin"
echo "Grafana: https://nekazari.robotika.cloud/grafana"

