#!/bin/bash
# =============================================================================
# Script para Verificar/Crear Workspace en GeoServer
# =============================================================================
# Verifica si el workspace 'nekazari' existe en GeoServer
# Si no existe, lo crea mediante REST API
# =============================================================================

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuración
GEOSERVER_URL="${GEOSERVER_URL:-https://nekazari.robotika.cloud/geoserver}"
WORKSPACE="${WORKSPACE:-nekazari}"
GEOSERVER_USER="${GEOSERVER_USER:-admin}"
GEOSERVER_PASSWORD="${GEOSERVER_PASSWORD:-}"

echo "🔍 Verificando Workspace en GeoServer"
echo "======================================"
echo "GeoServer URL: $GEOSERVER_URL"
echo "Workspace: $WORKSPACE"
echo ""

# Obtener credenciales desde secret de Kubernetes si no están definidas
if [ -z "$GEOSERVER_PASSWORD" ]; then
    echo "Obteniendo credenciales desde Kubernetes secret..."
    GEOSERVER_USER=$(sudo k3s kubectl get secret geoserver-secret -n nekazari -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d || echo "admin")
    GEOSERVER_PASSWORD=$(sudo k3s kubectl get secret geoserver-secret -n nekazari -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d || echo "")
    
    if [ -z "$GEOSERVER_PASSWORD" ]; then
        echo -e "${RED}❌ No se pudo obtener la contraseña de GeoServer${NC}"
        echo "   Configura GEOSERVER_PASSWORD manualmente o verifica el secret"
        exit 1
    fi
fi

# Función para verificar si el workspace existe
check_workspace_exists() {
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${GEOSERVER_USER}:${GEOSERVER_PASSWORD}" \
        "${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Función para crear el workspace
create_workspace() {
    echo -n "Creando workspace '${WORKSPACE}'... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${GEOSERVER_USER}:${GEOSERVER_PASSWORD}" \
        -XPOST \
        -H "Content-type: text/xml" \
        -d "<workspace><name>${WORKSPACE}</name></workspace>" \
        "${GEOSERVER_URL}/rest/workspaces" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Creado${NC}"
        return 0
    else
        echo -e "${RED}❌ Error (HTTP $HTTP_CODE)${NC}"
        return 1
    fi
}

# Función para obtener información del workspace
get_workspace_info() {
    curl -s -u "${GEOSERVER_USER}:${GEOSERVER_PASSWORD}" \
        "${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}" 2>/dev/null
}

# Main
main() {
    if check_workspace_exists; then
        echo -e "${GREEN}✅ Workspace '${WORKSPACE}' existe${NC}"
        echo ""
        echo "📋 Información del workspace:"
        get_workspace_info | grep -E "<name>|<uri>" | sed 's/.*<\([^>]*\)>\(.*\)<\/[^>]*>.*/   \1: \2/'
        echo ""
        echo "✅ No es necesario crear el workspace"
    else
        echo -e "${YELLOW}⚠️  Workspace '${WORKSPACE}' no existe${NC}"
        echo ""
        read -p "¿Deseas crear el workspace ahora? (s/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[SsYy]$ ]]; then
            if create_workspace; then
                echo ""
                echo -e "${GREEN}✅ Workspace creado exitosamente${NC}"
                echo ""
                echo "📋 Información del workspace:"
                get_workspace_info | grep -E "<name>|<uri>" | sed 's/.*<\([^>]*\)>\(.*\)<\/[^>]*>.*/   \1: \2/'
            else
                echo -e "${RED}❌ Error al crear el workspace${NC}"
                exit 1
            fi
        else
            echo "Workspace no creado. Puedes crearlo manualmente desde GeoServer UI"
            exit 0
        fi
    fi
    
    echo ""
    echo "💡 Próximos pasos:"
    echo "   1. Verificar layers NDVI: ./scripts/verify-geoserver-ndvi-layers.sh"
    echo "   2. Crear layers cuando se procesen jobs NDVI"
    echo "   3. Ver documentación: docs/GEOSERVER_NDVI_LAYERS_SETUP.md"
}

main "$@"

