#!/bin/bash
# =============================================================================
# Script para eliminar un tenant completo por email
# =============================================================================
# Este script busca el código NEK asociado al email y elimina todo el tenant
# Uso: ./scripts/delete-tenant-by-email.sh <EMAIL>

set -e

EMAIL="${1}"

if [ -z "$EMAIL" ]; then
    echo "Uso: $0 <EMAIL>"
    echo "Ejemplo: $0 user@example.com"
    exit 1
fi

EMAIL_LOWER=$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

echo "==================================================================="
echo "Eliminación de Tenant por Email"
echo "==================================================================="
echo "Email: $EMAIL_LOWER"
echo ""

# Obtener pod de PostgreSQL
POSTGRES_POD=$(sudo k3s kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$POSTGRES_POD" ]; then
    log_error "No se encontró el pod de PostgreSQL"
    exit 1
fi

log_info "Pod de PostgreSQL: $POSTGRES_POD"

# 1. Buscar código NEK asociado al email
echo ""
log_info "Buscando código NEK asociado al email..."
NEK_CODE=$(sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -t -c \
    "SELECT code FROM activation_codes WHERE email = '$EMAIL_LOWER' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d ' ' || echo "")

if [ -z "$NEK_CODE" ] || [ "$NEK_CODE" = "" ]; then
    log_warning "No se encontró código NEK para $EMAIL_LOWER"
    log_info "Buscando en tenant activado..."
    # Buscar tenant_id desde la tabla tenants
    TENANT_ID=$(sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -t -c \
        "SELECT tenant_id FROM tenants WHERE email = '$EMAIL_LOWER' LIMIT 1;" 2>/dev/null | tr -d ' ' || echo "")
    
    if [ -z "$TENANT_ID" ] || [ "$TENANT_ID" = "" ]; then
        log_error "No se encontró tenant ni código NEK para $EMAIL_LOWER"
        log_info "Intentando buscar por formato de tenant_id..."
        # Intentar construir tenant_id desde email
        TENANT_ID=$(echo "$EMAIL_LOWER" | sed 's/@/_at_/g' | sed 's/[^a-z0-9_]//g')
        log_info "Tenant ID calculado: $TENANT_ID"
    fi
else
    log_success "Código NEK encontrado: $NEK_CODE"
    # Obtener tenant_id desde farmers o tenants
    TENANT_ID=$(sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -t -c \
        "SELECT tenant_id FROM farmers WHERE email = '$EMAIL_LOWER' LIMIT 1 UNION SELECT tenant_id FROM tenants WHERE email = '$EMAIL_LOWER' LIMIT 1;" 2>/dev/null | tr -d ' ' | head -1 || echo "")
    
    if [ -z "$TENANT_ID" ] || [ "$TENANT_ID" = "" ]; then
        # Calcular tenant_id desde email
        TENANT_ID=$(echo "$EMAIL_LOWER" | sed 's/@/_at_/g' | sed 's/[^a-z0-9_]//g')
        log_info "Tenant ID calculado: $TENANT_ID"
    else
        log_success "Tenant ID encontrado: $TENANT_ID"
    fi
fi

NAMESPACE="nekazari-tenant-${TENANT_ID}"

echo ""
echo "=========================================="
echo "Información del Tenant a Eliminar"
echo "=========================================="
echo "Email: $EMAIL_LOWER"
echo "Código NEK: ${NEK_CODE:-NO_ENCONTRADO}"
echo "Tenant ID: $TENANT_ID"
echo "Namespace: $NAMESPACE"
echo ""

# Confirmación
read -p "¿Estás seguro de que quieres eliminar este tenant y TODOS sus recursos? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    log_info "Operación cancelada."
    exit 0
fi

echo ""
log_info "Iniciando eliminación..."

# 2. Eliminar usuario de Keycloak
echo ""
log_info "1. Eliminando usuario de Keycloak..."
KEYCLOAK_POD=$(sudo k3s kubectl get pods -n nekazari -l app=keycloak -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "$KEYCLOAK_POD" ]; then
    # Obtener admin password
    KEYCLOAK_ADMIN_PASSWORD=$(sudo k3s kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d || echo "")
    
    if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        # Configurar credenciales de kcadm en una sola ejecución
        log_info "  Configurando credenciales de Keycloak..."
        
        # Buscar usuario por email usando kcadm.sh
        # Primero configuramos las credenciales, luego buscamos el usuario
        USER_SEARCH_CMD="/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password '$KEYCLOAK_ADMIN_PASSWORD' >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh get users -r nekazari --fields id,email -q email='$EMAIL_LOWER' 2>/dev/null"
        
        USER_JSON=$(sudo k3s kubectl exec -n nekazari "$KEYCLOAK_POD" -- /bin/sh -c "$USER_SEARCH_CMD" 2>/dev/null || echo "")
        
        if [ -n "$USER_JSON" ] && [ "$USER_JSON" != "[]" ] && [ "$USER_JSON" != "null" ]; then
            # Intentar extraer el ID del usuario
            USER_ID=$(echo "$USER_JSON" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null || echo "")
            
            # Si no funciona con grep, intentar con jq si está disponible
            if [ -z "$USER_ID" ] || [ "$USER_ID" = "" ]; then
                USER_ID=$(echo "$USER_JSON" | jq -r '.[0].id' 2>/dev/null || echo "")
            fi
            
            if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ] && [ "$USER_ID" != "" ] && [ "$USER_ID" != "[]" ]; then
                log_info "  Usuario encontrado: $USER_ID"
                DELETE_USER_CMD="/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password '$KEYCLOAK_ADMIN_PASSWORD' >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh delete users/$USER_ID -r nekazari 2>/dev/null"
                
                if sudo k3s kubectl exec -n nekazari "$KEYCLOAK_POD" -- /bin/sh -c "$DELETE_USER_CMD" 2>/dev/null; then
                    log_success "  Usuario eliminado de Keycloak"
                else
                    log_warning "  No se pudo eliminar el usuario (puede que ya no exista)"
                fi
            else
                log_warning "  No se pudo obtener ID del usuario o usuario no encontrado"
            fi
        else
            log_warning "  Usuario no encontrado en Keycloak (puede que ya haya sido eliminado)"
        fi
        
        # Eliminar grupo de tenant
        log_info "  Buscando grupo de tenant..."
        GROUP_SEARCH_CMD="/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password '$KEYCLOAK_ADMIN_PASSWORD' >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh get groups -r nekazari --fields id,name 2>/dev/null"
        
        ALL_GROUPS=$(sudo k3s kubectl exec -n nekazari "$KEYCLOAK_POD" -- /bin/sh -c "$GROUP_SEARCH_CMD" 2>/dev/null || echo "")
        
        if [ -n "$ALL_GROUPS" ] && [ "$ALL_GROUPS" != "[]" ]; then
            # Buscar grupo que coincida con tenant_id
            GROUP_JSON=$(echo "$ALL_GROUPS" | grep -i "$TENANT_ID" || echo "")
            
            if [ -z "$GROUP_JSON" ]; then
                # Intentar con jq si está disponible
                GROUP_JSON=$(echo "$ALL_GROUPS" | jq -r ".[] | select(.name == \"$TENANT_ID\" or .name == \"tenant-$TENANT_ID\")" 2>/dev/null || echo "")
            fi
            
            if [ -n "$GROUP_JSON" ] && [ "$GROUP_JSON" != "[]" ]; then
                GROUP_ID=$(echo "$GROUP_JSON" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null || echo "")
                
                if [ -z "$GROUP_ID" ]; then
                    GROUP_ID=$(echo "$GROUP_JSON" | jq -r '.id' 2>/dev/null || echo "")
                fi
                
                if [ -n "$GROUP_ID" ] && [ "$GROUP_ID" != "null" ] && [ "$GROUP_ID" != "" ]; then
                    log_info "  Grupo encontrado: $GROUP_ID"
                    DELETE_GROUP_CMD="/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password '$KEYCLOAK_ADMIN_PASSWORD' >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh delete groups/$GROUP_ID -r nekazari 2>/dev/null"
                    
                    if sudo k3s kubectl exec -n nekazari "$KEYCLOAK_POD" -- /bin/sh -c "$DELETE_GROUP_CMD" 2>/dev/null; then
                        log_success "  Grupo eliminado de Keycloak"
                    else
                        log_warning "  No se pudo eliminar el grupo (puede que ya no exista)"
                    fi
                else
                    log_warning "  No se pudo obtener ID del grupo"
                fi
            else
                log_warning "  Grupo no encontrado en Keycloak (puede que ya haya sido eliminado)"
            fi
        else
            log_warning "  No se pudieron obtener grupos de Keycloak"
        fi
    else
        log_warning "  No se pudo obtener la contraseña de admin de Keycloak"
    fi
else
    log_warning "  Pod de Keycloak no encontrado"
fi

# 3. Eliminar namespace de Kubernetes
echo ""
log_info "2. Eliminando namespace de Kubernetes..."
if sudo k3s kubectl get namespace "$NAMESPACE" &>/dev/null; then
    log_info "  Namespace encontrado: $NAMESPACE"
    sudo k3s kubectl delete namespace "$NAMESPACE" --wait=true --timeout=120s 2>/dev/null && \
        log_success "  Namespace eliminado" || \
        log_warning "  Error al eliminar namespace (puede requerir eliminación manual)"
else
    log_warning "  Namespace no encontrado: $NAMESPACE"
fi

# 4. Eliminar recursos de PostgreSQL
echo ""
log_info "3. Eliminando recursos de PostgreSQL..."

if [ -n "$POSTGRES_POD" ]; then
    # Eliminar API keys
    sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
        "DELETE FROM api_keys WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        log_success "  API keys eliminadas" || log_warning "  Error al eliminar API keys o no existían"
    
    # Eliminar farmer activations
    sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
        "DELETE FROM farmer_activations WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        log_success "  Farmer activations eliminadas" || log_warning "  Error al eliminar farmer activations o no existían"
    
    # Eliminar tenant invitations
    sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
        "DELETE FROM tenant_invitations WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        log_success "  Invitaciones eliminadas" || log_warning "  Error al eliminar invitaciones o no existían"
    
    # Revocar o eliminar código de activación
    if [ -n "$NEK_CODE" ] && [ "$NEK_CODE" != "" ]; then
        sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
            "UPDATE activation_codes SET status = 'revoked' WHERE code = '$NEK_CODE';" 2>/dev/null && \
            log_success "  Código de activación revocado" || log_warning "  Error al revocar código"
    else
        log_warning "  No se encontró código NEK para revocar"
    fi
    
    # Eliminar farmers
    sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
        "DELETE FROM farmers WHERE tenant_id = '$TENANT_ID' OR email = '$EMAIL_LOWER';" 2>/dev/null && \
        log_success "  Farmers eliminados" || log_warning "  Error al eliminar farmers o no existían"
    
    # Eliminar tenant
    sudo k3s kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U postgres -d activation_codes_db -c \
        "DELETE FROM tenants WHERE tenant_id = '$TENANT_ID' OR email = '$EMAIL_LOWER';" 2>/dev/null && \
        log_success "  Tenant eliminado de la base de datos" || log_warning "  Error al eliminar tenant o no existía"
else
    log_error "  Pod de PostgreSQL no encontrado"
fi

# 5. Verificar secrets
echo ""
log_info "4. Verificando secrets..."
SECRETS=$(sudo k3s kubectl get secrets -n nekazari 2>/dev/null | grep -i "$TENANT_ID" | awk '{print $1}' || echo "")
if [ -n "$SECRETS" ]; then
    echo "$SECRETS" | while read secret; do
        log_info "  Eliminando secret: $secret"
        sudo k3s kubectl delete secret "$secret" -n nekazari 2>/dev/null && \
            log_success "    Secret eliminado" || log_warning "    Error al eliminar secret"
    done
else
    log_success "  No se encontraron secrets adicionales"
fi

echo ""
echo "=========================================="
log_success "Eliminación completada"
echo "=========================================="
echo ""
echo "Resumen:"
echo "  - Email: $EMAIL_LOWER"
echo "  - Código NEK: ${NEK_CODE:-NO_ENCONTRADO}"
echo "  - Tenant ID: $TENANT_ID"
echo "  - Namespace: $NAMESPACE"
echo ""
log_info "Para recrear el tenant:"
if [ -n "$NEK_CODE" ] && [ "$NEK_CODE" != "" ]; then
    echo "  Usa el mismo código NEK: $NEK_CODE"
    echo "  O genera uno nuevo con: ./scripts/manage-activation-codes.sh"
else
    echo "  Genera un nuevo código NEK con: ./scripts/manage-activation-codes.sh"
fi
echo ""

