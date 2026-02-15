#!/bin/bash
# Script para crear usuario en Keycloak con tenant

set -e

EMAIL="${1:?Email argument is required}"
TENANT_ID="${2:-test}"

KEYCLOAK_URL="http://keycloak-service:8080/auth"
REALM="nekazari"
ADMIN_USER="admin"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD env var is required}"

echo "=== Creando usuario $EMAIL con tenant $TENANT_ID ==="

# Obtener token admin
echo "Obteniendo token admin..."
TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" | \
  grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: No se pudo obtener token admin"
  exit 1
fi

echo "✓ Token obtenido"

# Verificar si el usuario ya existe
echo "Verificando si el usuario ya existe..."
EXISTING_USER=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${EMAIL}&exact=true")

USER_ID=$(echo "$EXISTING_USER" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$USER_ID" ]; then
  echo "Usuario ya existe, actualizando..."
  
  # Actualizar atributos del usuario
  curl -s -X PUT \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"attributes\": {
        \"tenant_id\": [\"${TENANT_ID}\"]
      }
    }" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}"
  
  echo "✓ Usuario actualizado"
else
  echo "Creando nuevo usuario..."
  
  # Crear usuario
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${EMAIL}\",
      \"email\": \"${EMAIL}\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"attributes\": {
        \"tenant_id\": [\"${TENANT_ID}\"]
      },
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"TempPass123!\",
        \"temporary\": true
      }]
    }" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users")
  
  HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
  
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "409" ]; then
    # Obtener ID del usuario creado
    USER_ID=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${EMAIL}&exact=true" | \
      grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    echo "✓ Usuario creado (ID: ${USER_ID})"
  else
    echo "ERROR: Fallo al crear usuario (HTTP $HTTP_CODE)"
    echo "$CREATE_RESPONSE"
    exit 1
  fi
fi

# Asignar usuario al grupo del tenant
echo "Asignando usuario al grupo ${TENANT_ID}..."
GROUP_ID=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/groups?search=${TENANT_ID}" | \
  grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$GROUP_ID" ]; then
  echo "Grupo ${TENANT_ID} no existe, creándolo..."
  GROUP_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${TENANT_ID}\"}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/groups")
  
  GROUP_ID=$(echo "$GROUP_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  echo "✓ Grupo creado (ID: ${GROUP_ID})"
fi

# Asignar usuario al grupo
curl -s -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/groups/${GROUP_ID}"

echo "✓ Usuario asignado al grupo ${TENANT_ID}"

echo ""
echo "=== Usuario creado exitosamente ==="
echo "Email: ${EMAIL}"
echo "Tenant: ${TENANT_ID}"
echo "Contraseña temporal: TempPass123!"
echo "El usuario deberá cambiar la contraseña en el primer login"

