#!/bin/bash
# Script para asignar tenant_id a usuarios en Keycloak

set -e

REALM="nekazari"
ADMIN_USER="admin"
ADMIN_PASSWORD="${1:-${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD env var is required}}"

echo "🔐 Obteniendo token de administrador de Keycloak..."

# Obtener token de admin
ADMIN_TOKEN=$(curl -s -X POST \
  "http://keycloak-service:8080/auth/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ ERROR: No se pudo obtener el token de administrador"
  exit 1
fi

echo "✅ Token obtenido"

# Función para asignar tenant_id a un usuario
assign_tenant() {
  local EMAIL=$1
  local TENANT_ID=$2
  
  echo ""
  echo "🔍 Buscando usuario: $EMAIL"
  
  # Buscar usuario por email
  USER_DATA=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "http://keycloak-service:8080/auth/admin/realms/${REALM}/users?email=${EMAIL}")
  
  USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id // empty')
  
  if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
    echo "❌ Usuario no encontrado: $EMAIL"
    return 1
  fi
  
  echo "✅ Usuario encontrado: $USER_ID"
  
  # Obtener datos actuales del usuario
  CURRENT_USER=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "http://keycloak-service:8080/auth/admin/realms/${REALM}/users/${USER_ID}")
  
  # Actualizar atributos
  CURRENT_ATTRS=$(echo "$CURRENT_USER" | jq '.attributes // {}')
  UPDATED_ATTRS=$(echo "$CURRENT_ATTRS" | jq ".tenant_id = [\"$TENANT_ID\"]")
  
  # Preparar payload completo del usuario
  UPDATED_USER=$(echo "$CURRENT_USER" | jq ".attributes = $UPDATED_ATTRS")
  
  # Actualizar usuario
  HTTP_CODE=$(curl -s -o /tmp/user-update-response.json -w "%{http_code}" -X PUT \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_USER" \
    "http://keycloak-service:8080/auth/admin/realms/${REALM}/users/${USER_ID}")
  
  if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Tenant asignado correctamente: $TENANT_ID"
    return 0
  else
    echo "❌ ERROR: Fallo al actualizar usuario (HTTP $HTTP_CODE)"
    cat /tmp/user-update-response.json
    return 1
  fi
}

# Asignar tenant a usuarios
echo ""
echo "📋 Asignando tenants a usuarios..."
# Add user emails here
# assign_tenant "user@example.com" "tenant-name"

echo ""
echo "✅ Proceso completado"

