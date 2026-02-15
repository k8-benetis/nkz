#!/bin/bash
# =============================================================================
# Script para verificar el estado completo de la plataforma Nekazari
# =============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_header() {
    echo -e "\n${CYAN}===================================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}===================================================================${NC}\n"
}

log_section() {
    echo -e "\n${BLUE}--- $1 ---${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_header "VERIFICACIÓN COMPLETA DE PLATAFORMA NEKAZARI"

# 1. Estado general del cluster
log_section "1. Estado del Cluster Kubernetes"
echo "Nodos:"
sudo k3s kubectl get nodes -o wide
echo ""
echo "Recursos del nodo:"
sudo k3s kubectl describe nodes | grep -A 10 "Allocated resources"

# 2. Estado de todos los pods por namespace
log_section "2. Estado de Pods por Namespace"
for ns in nekazari nekazari-ros2 nekazari-vpn kube-system ingress-nginx-new; do
    if sudo k3s kubectl get namespace $ns &>/dev/null; then
        echo -e "\n${CYAN}Namespace: $ns${NC}"
        sudo k3s kubectl get pods -n $ns -o wide
        # Contar pods por estado
        RUNNING=$(sudo k3s kubectl get pods -n $ns --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l || echo "0")
        PENDING=$(sudo k3s kubectl get pods -n $ns --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l || echo "0")
        FAILED=$(sudo k3s kubectl get pods -n $ns --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l || echo "0")
        CRASHING=$(sudo k3s kubectl get pods -n $ns --no-headers 2>/dev/null | grep -i "CrashLoopBackOff\|Error\|ImagePullBackOff" | wc -l || echo "0")
        echo "  Running: $RUNNING | Pending: $PENDING | Failed: $FAILED | Crashing: $CRASHING"
    fi
done

# 3. Pods problemáticos
log_section "3. Pods Problemáticos"
echo "Pods en CrashLoopBackOff:"
sudo k3s kubectl get pods -A | grep -i "CrashLoopBackOff" || log_success "No hay pods en CrashLoopBackOff"
echo ""
echo "Pods en Pending:"
sudo k3s kubectl get pods -A --field-selector=status.phase=Pending | head -10 || log_success "No hay pods en Pending"
echo ""
echo "Pods con muchos restarts (>5):"
sudo k3s kubectl get pods -A -o json | jq -r '.items[] | select(.status.containerStatuses[]?.restartCount > 5) | "\(.metadata.namespace)\t\(.metadata.name)\t\(.status.containerStatuses[0].restartCount) restarts"' 2>/dev/null | head -10 || log_success "No hay pods con muchos restarts"

# 4. Servicios críticos
log_section "4. Estado de Servicios Críticos"
CRITICAL_SERVICES=(
    "nekazari:keycloak"
    "nekazari:postgresql"
    "nekazari:frontend"
    "nekazari:tenant-webhook"
    "nekazari:entity-manager"
    "nekazari:api-gateway"
    "nekazari:email-service"
    "nekazari:orion-ld"
    "nekazari:quantumleap"
    "nekazari:grafana"
)

for service_info in "${CRITICAL_SERVICES[@]}"; do
    IFS=':' read -r namespace service <<< "$service_info"
    # Buscar deployment por label app en lugar de nombre exacto
    DEPLOYMENT=$(sudo k3s kubectl get deployment -n $namespace -l app=$service -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$DEPLOYMENT" ]; then
        READY=$(sudo k3s kubectl get deployment -n $namespace $DEPLOYMENT -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        DESIRED=$(sudo k3s kubectl get deployment -n $namespace $DEPLOYMENT -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
        if [ "$READY" == "$DESIRED" ] && [ "$READY" != "0" ]; then
            log_success "$namespace/$service: $READY/$DESIRED replicas ready"
        else
            log_error "$namespace/$service: $READY/$DESIRED replicas ready (esperado: $DESIRED)"
        fi
    else
        # Intentar buscar por nombre exacto como fallback
        if sudo k3s kubectl get deployment -n $namespace $service &>/dev/null; then
            READY=$(sudo k3s kubectl get deployment -n $namespace $service -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
            DESIRED=$(sudo k3s kubectl get deployment -n $namespace $service -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
            if [ "$READY" == "$DESIRED" ] && [ "$READY" != "0" ]; then
                log_success "$namespace/$service: $READY/$DESIRED replicas ready"
            else
                log_error "$namespace/$service: $READY/$DESIRED replicas ready (esperado: $DESIRED)"
            fi
        else
            log_warning "$namespace/$service: deployment no encontrado"
        fi
    fi
done

# 5. Conectividad de servicios
log_section "5. Conectividad de Servicios"
echo "Verificando endpoints internos..."

# Keycloak
KEYCLOAK_POD=$(sudo k3s kubectl get pods -n nekazari -l app=keycloak -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$KEYCLOAK_POD" ]; then
    if sudo k3s kubectl exec -n nekazari $KEYCLOAK_POD -- curl -s -f http://localhost:8080/health/ready &>/dev/null; then
        log_success "Keycloak: saludable"
    else
        log_error "Keycloak: no responde a health check"
    fi
fi

# PostgreSQL
POSTGRES_POD=$(sudo k3s kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$POSTGRES_POD" ]; then
    if sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- pg_isready -U postgres &>/dev/null; then
        log_success "PostgreSQL: saludable"
    else
        log_error "PostgreSQL: no responde"
    fi
fi

# Tenant-webhook
WEBHOOK_POD=$(sudo k3s kubectl get pods -n nekazari -l app=tenant-webhook -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$WEBHOOK_POD" ]; then
    if sudo k3s kubectl exec -n nekazari $WEBHOOK_POD -- curl -s -f http://localhost:8080/health &>/dev/null; then
        log_success "Tenant-webhook: saludable"
    else
        log_error "Tenant-webhook: no responde a health check"
    fi
fi

# Frontend
FRONTEND_POD=$(sudo k3s kubectl get pods -n nekazari -l app=frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$FRONTEND_POD" ]; then
    if sudo k3s kubectl exec -n nekazari $FRONTEND_POD -- wget -q -O- http://localhost:80 &>/dev/null; then
        log_success "Frontend: saludable"
    else
        log_error "Frontend: no responde"
    fi
fi

# 6. Estado de bases de datos
log_section "6. Estado de Bases de Datos"
if [ -n "$POSTGRES_POD" ]; then
    echo "Bases de datos existentes:"
    sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- psql -U postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres' ORDER BY datname;" 2>/dev/null | while read db; do
        if [ -n "$db" ]; then
            echo "  - $db"
        fi
    done
    
    echo ""
    echo "Tenants en tabla 'tenants':"
    sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- psql -U postgres -d nekazari -t -c "SELECT tenant_id, owner_email, plan FROM tenants ORDER BY tenant_id;" 2>/dev/null | while read line; do
        if [ -n "$line" ]; then
            echo "  $line"
        fi
    done
    
    echo ""
    echo "Códigos de activación activos:"
    ACTIVE_CODES=$(sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- psql -U postgres -d nekazari -t -c "SELECT COUNT(*) FROM activation_codes WHERE status = 'active';" 2>/dev/null | tr -d ' \n' || echo "0")
    echo "  Códigos activos: $ACTIVE_CODES"
fi

# 7. Estado de Keycloak
log_section "7. Estado de Keycloak"
if [ -n "$KEYCLOAK_POD" ]; then
    echo "Usuarios en Keycloak:"
    # Intentar obtener token y listar usuarios
    KEYCLOAK_ADMIN=$(sudo k3s kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d || echo "admin")
    KEYCLOAK_PASSWORD=$(sudo k3s kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d || echo "admin")
    
    TOKEN=$(sudo k3s kubectl exec -n nekazari $KEYCLOAK_POD -- curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=$KEYCLOAK_ADMIN" \
        -d "password=$KEYCLOAK_PASSWORD" \
        -d "grant_type=password" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 || echo "")
    
    if [ -n "$TOKEN" ]; then
        USER_COUNT=$(sudo k3s kubectl exec -n nekazari $KEYCLOAK_POD -- curl -s -X GET "http://localhost:8080/admin/realms/nekazari/users?max=1000" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -o '"id"' | wc -l || echo "0")
        echo "  Total usuarios: $USER_COUNT"
    else
        log_warning "No se pudo obtener token de Keycloak para contar usuarios"
    fi
fi

# 8. Recursos de red (Ingress, Services)
log_section "8. Recursos de Red"
echo "Ingress rules:"
sudo k3s kubectl get ingress -A -o wide | head -20
echo ""
echo "Services principales:"
sudo k3s kubectl get svc -n nekazari -o wide | grep -E "keycloak|postgresql|frontend|tenant-webhook|entity-manager|api-gateway|email" || echo "No se encontraron servicios principales"

# 9. Logs recientes de errores
log_section "9. Errores Recientes (últimas 2 horas)"
echo "Buscando errores en logs de servicios críticos..."
for service in tenant-webhook entity-manager api-gateway email-service; do
    POD=$(sudo k3s kubectl get pods -n nekazari -l app=$service -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$POD" ]; then
        ERRORS=$(sudo k3s kubectl logs -n nekazari $POD --since=2h 2>/dev/null | grep -i "error\|exception\|failed\|timeout" | tail -5 || echo "")
        if [ -n "$ERRORS" ]; then
            echo -e "\n${YELLOW}Errores en $service:${NC}"
            echo "$ERRORS"
        fi
    fi
done

# 10. Verificación de endpoints externos (si está disponible)
log_section "10. Verificación de Endpoints Externos"
EXTERNAL_URL="https://nekazari.robotika.cloud"
if command -v curl &>/dev/null; then
    echo "Probando endpoints externos..."
    
    # Frontend
    if curl -s -f -o /dev/null -w "%{http_code}" "$EXTERNAL_URL" | grep -q "200"; then
        log_success "Frontend: accesible en $EXTERNAL_URL"
    else
        log_error "Frontend: no accesible en $EXTERNAL_URL"
    fi
    
    # Keycloak
    if curl -s -f -o /dev/null -w "%{http_code}" "$EXTERNAL_URL/auth/realms/nekazari" | grep -q "200"; then
        log_success "Keycloak: accesible en $EXTERNAL_URL/auth"
    else
        log_warning "Keycloak: puede no estar accesible externamente"
    fi
else
    log_warning "curl no disponible, saltando verificación de endpoints externos"
fi

# 11. Resumen de salud general
log_section "11. Resumen de Salud General"
TOTAL_PODS=$(sudo k3s kubectl get pods -A --no-headers 2>/dev/null | wc -l || echo "0")
RUNNING_PODS=$(sudo k3s kubectl get pods -A --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l || echo "0")
PENDING_PODS=$(sudo k3s kubectl get pods -A --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l || echo "0")
FAILED_PODS=$(sudo k3s kubectl get pods -A --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l || echo "0")
CRASHING_PODS=$(sudo k3s kubectl get pods -A --no-headers 2>/dev/null | grep -i "CrashLoopBackOff\|Error\|ImagePullBackOff" | wc -l || echo "0")

echo "Total pods: $TOTAL_PODS"
echo "Running: $RUNNING_PODS"
echo "Pending: $PENDING_PODS"
echo "Failed: $FAILED_PODS"
echo "Crashing: $CRASHING_PODS"

if [ "$PENDING_PODS" -gt 0 ] || [ "$FAILED_PODS" -gt 0 ] || [ "$CRASHING_PODS" -gt 0 ]; then
    log_warning "Hay pods con problemas. Revisa la sección 3 para más detalles."
else
    log_success "Todos los pods están en buen estado"
fi

# 12. Verificación de tenants
log_section "12. Estado de Tenants"
echo "Namespaces de tenants:"
TENANT_NAMESPACES=$(sudo k3s kubectl get namespaces -o json | jq -r '.items[] | select(.metadata.name | startswith("nekazari-tenant-")) | .metadata.name' 2>/dev/null || echo "")
if [ -n "$TENANT_NAMESPACES" ]; then
    echo "$TENANT_NAMESPACES" | while read ns; do
        TENANT_ID=$(echo "$ns" | sed 's/nekazari-tenant-//')
        PODS=$(sudo k3s kubectl get pods -n $ns --no-headers 2>/dev/null | wc -l || echo "0")
        RUNNING_TENANT=$(sudo k3s kubectl get pods -n $ns --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l || echo "0")
        echo "  $ns: $RUNNING_TENANT/$PODS pods running"
    done
else
    log_info "No hay namespaces de tenants creados"
fi

log_header "VERIFICACIÓN COMPLETA FINALIZADA"
echo ""
echo "Para más detalles sobre un servicio específico:"
echo "  sudo k3s kubectl logs -n nekazari -l app=<service-name> --tail=50"
echo ""
echo "Para ver eventos recientes:"
echo "  sudo k3s kubectl get events -A --sort-by='.lastTimestamp' | tail -20"

