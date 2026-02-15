#!/bin/bash
# =============================================================================
# Script para verificar qué información devuelve el endpoint /userinfo de Keycloak
# =============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

echo "==================================================================="
echo "Verificar endpoint /userinfo de Keycloak"
echo "==================================================================="
echo ""

# Obtener token de un usuario de prueba
log_info "Para verificar el endpoint /userinfo, necesitas:"
echo ""
echo "1. Obtener un token de acceso de Keycloak para un usuario"
echo "2. Llamar al endpoint /userinfo con ese token"
echo ""
echo "Puedes obtener un token así:"
echo ""
echo "  curl -X POST 'https://nekazari.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/token' \\"
echo "    -d 'client_id=nekazari-frontend' \\"
echo "    -d 'username=TU_EMAIL' \\"
echo "    -d 'password=TU_PASSWORD' \\"
echo "    -d 'grant_type=password'"
echo ""
echo "Luego usa el access_token para llamar a:"
echo ""
echo "  curl 'https://nekazari.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/userinfo' \\"
echo "    -H 'Authorization: Bearer TU_ACCESS_TOKEN'"
echo ""
log_info "Verificando configuración del cliente nekazari-frontend..."

KEYCLOAK_POD=$(sudo k3s kubectl get pods -n nekazari -l app=keycloak -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$KEYCLOAK_POD" ]; then
    log_error "Pod de Keycloak no encontrado"
    exit 1
fi

KEYCLOAK_ADMIN_PASSWORD=$(sudo k3s kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d || echo "")

if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
    # Obtener configuración del cliente
    GET_CLIENT_CMD="/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password '$KEYCLOAK_ADMIN_PASSWORD' >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh get clients -r nekazari --fields id,clientId,defaultClientScopes,optionalClientScopes 2>/dev/null | grep -A 30 'nekazari-frontend'"
    
    CLIENT_CONFIG=$(sudo k3s kubectl exec -n nekazari "$KEYCLOAK_POD" -- /bin/sh -c "$GET_CLIENT_CMD" 2>/dev/null || echo "")
    
    if [ -n "$CLIENT_CONFIG" ]; then
        echo "$CLIENT_CONFIG"
        echo ""
        log_info "Verificando scopes configurados..."
        if echo "$CLIENT_CONFIG" | grep -qi "profile\|email"; then
            log_success "Scopes profile y/o email están configurados en el cliente"
        else
            log_warning "Scopes profile y email pueden no estar configurados en el cliente"
        fi
    fi
fi

echo ""
log_info "El problema podría ser que:"
echo "1. El endpoint /userinfo no devuelve 'email' o 'name' con solo el scope 'openid'"
echo "2. Necesitas los scopes 'profile' y 'email' para obtener esa información"
echo "3. O el usuario no tiene esos atributos configurados en Keycloak"
echo ""


