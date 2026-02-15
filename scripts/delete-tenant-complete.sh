#!/bin/bash
# Script para eliminar completamente un tenant y todos sus recursos
# Uso: ./scripts/delete-tenant-complete.sh <NEK_CODE> <EMAIL>

set -e

NEK_CODE="${1}"
EMAIL="${2}"

if [ -z "$NEK_CODE" ] || [ -z "$EMAIL" ]; then
    echo "Uso: $0 <NEK_CODE> <EMAIL>"
    echo "Ejemplo: $0 NEK-XXXX-XXXX-XXXX user@example.com"
    exit 1
fi

EMAIL_LOWER=$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')
TENANT_ID=$(echo "$EMAIL_LOWER" | sed 's/@/_at_/g' | sed 's/[^a-z0-9_]//g' | tr '[:upper:]' '[:lower:]')
NAMESPACE="nekazari-tenant-${TENANT_ID}"

echo "=========================================="
echo "Eliminación Completa de Tenant"
echo "=========================================="
echo "NEK Code: $NEK_CODE"
echo "Email: $EMAIL"
echo "Tenant ID: $TENANT_ID"
echo "Namespace: $NAMESPACE"
echo ""

# Confirmación
read -p "¿Estás seguro de que quieres eliminar este tenant y TODOS sus recursos? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Operación cancelada."
    exit 0
fi

echo ""
echo "Iniciando eliminación..."

# 1. Eliminar usuario de Keycloak
echo ""
echo "1. Eliminando usuario de Keycloak..."
KEYCLOAK_ADMIN_PASSWORD=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' | base64 -d)
KEYCLOAK_POD=$(kubectl get pods -n nekazari -l app=keycloak -o jsonpath='{.items[0].metadata.name}')

if [ -n "$KEYCLOAK_POD" ]; then
    # Obtener ID del usuario
    USER_ID=$(kubectl exec -n nekazari "$KEYCLOAK_POD" -- /opt/keycloak/bin/kcadm.sh \
        config credentials --server http://localhost:8080 \
        --realm master \
        --user admin \
        --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null && \
        kubectl exec -n nekazari "$KEYCLOAK_POD" -- /opt/keycloak/bin/kcadm.sh \
        get users -r nekazari --fields id,email \
        | grep -i "$EMAIL_LOWER" | jq -r '.[0].id' 2>/dev/null || echo "")
    
    if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
        echo "  Usuario encontrado: $USER_ID"
        kubectl exec -n nekazari "$KEYCLOAK_POD" -- /opt/keycloak/bin/kcadm.sh \
            delete "users/$USER_ID" -r nekazari 2>/dev/null && \
            echo "  ✅ Usuario eliminado de Keycloak" || \
            echo "  ⚠️  No se pudo eliminar el usuario (puede que no exista)"
    else
        echo "  ⚠️  Usuario no encontrado en Keycloak"
    fi
else
    echo "  ⚠️  Pod de Keycloak no encontrado"
fi

# 2. Eliminar grupo de tenant en Keycloak
echo ""
echo "2. Eliminando grupo de tenant en Keycloak..."
if [ -n "$KEYCLOAK_POD" ]; then
    GROUP_ID=$(kubectl exec -n nekazari "$KEYCLOAK_POD" -- /opt/keycloak/bin/kcadm.sh \
        get groups -r nekazari --fields id,name \
        | jq -r ".[] | select(.name == \"tenant-$TENANT_ID\") | .id" 2>/dev/null || echo "")
    
    if [ -n "$GROUP_ID" ] && [ "$GROUP_ID" != "null" ]; then
        echo "  Grupo encontrado: tenant-$TENANT_ID"
        kubectl exec -n nekazari "$KEYCLOAK_POD" -- /opt/keycloak/bin/kcadm.sh \
            delete "groups/$GROUP_ID" -r nekazari 2>/dev/null && \
            echo "  ✅ Grupo eliminado de Keycloak" || \
            echo "  ⚠️  No se pudo eliminar el grupo"
    else
        echo "  ⚠️  Grupo no encontrado en Keycloak"
    fi
fi

# 3. Eliminar namespace de Kubernetes (y todos sus recursos)
echo ""
echo "3. Eliminando namespace de Kubernetes..."
if kubectl get namespace "$NAMESPACE" &>/dev/null; then
    echo "  Namespace encontrado: $NAMESPACE"
    kubectl delete namespace "$NAMESPACE" --wait=true --timeout=120s && \
        echo "  ✅ Namespace eliminado" || \
        echo "  ⚠️  Error al eliminar namespace (puede requerir eliminación manual)"
else
    echo "  ⚠️  Namespace no encontrado: $NAMESPACE"
fi

# 4. Eliminar recursos de PostgreSQL
echo ""
echo "4. Eliminando recursos de PostgreSQL..."
POSTGRES_POD=$(kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}')

if [ -n "$POSTGRES_POD" ]; then
    echo "  Eliminando datos del tenant: $TENANT_ID"
    
    # Eliminar API keys
    kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U nekazari -d activation_codes_db -c \
        "DELETE FROM api_keys WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        echo "  ✅ API keys eliminadas" || echo "  ⚠️  Error al eliminar API keys"
    
    # Eliminar farmer activations
    kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U nekazari -d activation_codes_db -c \
        "DELETE FROM farmer_activations WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        echo "  ✅ Farmer activations eliminadas" || echo "  ⚠️  Error al eliminar farmer activations"
    
    # Eliminar activation code (marcar como usado o eliminar)
    kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U nekazari -d activation_codes_db -c \
        "UPDATE activation_codes SET status = 'revoked' WHERE code = '$NEK_CODE';" 2>/dev/null && \
        echo "  ✅ Código de activación revocado" || echo "  ⚠️  Error al revocar código"
    
    # Eliminar farmers
    kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U nekazari -d activation_codes_db -c \
        "DELETE FROM farmers WHERE tenant_id = '$TENANT_ID' OR email = '$EMAIL_LOWER';" 2>/dev/null && \
        echo "  ✅ Farmers eliminados" || echo "  ⚠️  Error al eliminar farmers"
    
    # Eliminar tenant
    kubectl exec -n nekazari "$POSTGRES_POD" -- psql -U nekazari -d activation_codes_db -c \
        "DELETE FROM tenants WHERE tenant_id = '$TENANT_ID' OR email = '$EMAIL_LOWER';" 2>/dev/null && \
        echo "  ✅ Tenant eliminado de la base de datos" || echo "  ⚠️  Error al eliminar tenant"
else
    echo "  ⚠️  Pod de PostgreSQL no encontrado"
fi

# 5. Eliminar organización de Grafana (si existe)
echo ""
echo "5. Verificando organización de Grafana..."
GRAFANA_POD=$(kubectl get pods -n nekazari -l app=grafana -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "$GRAFANA_POD" ]; then
    echo "  ⚠️  Organización de Grafana debe eliminarse manualmente si existe"
    echo "  Buscar organización con nombre: $TENANT_ID"
else
    echo "  ⚠️  Pod de Grafana no encontrado"
fi

# 6. Verificar secrets en namespace default (por si acaso)
echo ""
echo "6. Verificando secrets en namespace nekazari..."
SECRETS=$(kubectl get secrets -n nekazari | grep -i "$TENANT_ID" | awk '{print $1}' || echo "")
if [ -n "$SECRETS" ]; then
    echo "  Secrets encontrados:"
    echo "$SECRETS" | while read secret; do
        echo "    - $secret"
        kubectl delete secret "$secret" -n nekazari 2>/dev/null && \
            echo "      ✅ Eliminado" || echo "      ⚠️  Error al eliminar"
    done
else
    echo "  ✅ No se encontraron secrets adicionales"
fi

echo ""
echo "=========================================="
echo "Eliminación completada"
echo "=========================================="
echo ""
echo "Resumen:"
echo "  - Usuario de Keycloak: Eliminado (si existía)"
echo "  - Grupo de Keycloak: Eliminado (si existía)"
echo "  - Namespace Kubernetes: Eliminado (si existía)"
echo "  - Datos PostgreSQL: Eliminados"
echo "  - Código de activación: Revocado"
echo ""
echo "⚠️  Verificaciones manuales recomendadas:"
echo "  1. Verificar que no queden entidades en Orion-LD para este tenant"
echo "  2. Verificar que no queden datos en QuantumLeap/CrateDB"
echo "  3. Verificar organización de Grafana (eliminar manualmente si existe)"
echo ""
echo "Para recrear el tenant, usa el mismo código NEK: $NEK_CODE"
