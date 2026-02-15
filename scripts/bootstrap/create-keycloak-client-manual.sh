#!/bin/bash
# Script temporal para crear el cliente nekazari-api-gateway y asignar permisos
# Este script se ejecuta dentro del pod de Keycloak

set -e

ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"

echo "=== Configurando credenciales de kcadm.sh ==="
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth \
  --realm master \
  --user "${ADMIN_USER}" \
  --password "${ADMIN_PASS}"

echo ""
echo "=== Verificando si el cliente ya existe ==="
EXISTING_CLIENT=$(/opt/keycloak/bin/kcadm.sh get clients \
  --realm nekazari \
  --fields id,clientId \
  --format csv \
  --noquotes 2>/dev/null | grep "nekazari-api-gateway" || echo "")

if [ -n "$EXISTING_CLIENT" ]; then
  echo "✓ Cliente nekazari-api-gateway ya existe"
  CLIENT_UUID=$(echo "$EXISTING_CLIENT" | cut -d',' -f1)
else
  echo "Creando cliente nekazari-api-gateway..."
  /opt/keycloak/bin/kcadm.sh create clients \
    --realm nekazari \
    -s clientId=nekazari-api-gateway \
    -s name="Nekazari API Gateway" \
    -s description="API Gateway service for Nekazari platform" \
    -s enabled=true \
    -s clientAuthenticatorType=client-secret \
    -s serviceAccountsEnabled=true \
    -s protocol=openid-connect \
    -s fullScopeAllowed=true
  
  echo "✓ Cliente creado"
  
  # Obtener UUID del cliente recién creado
  CLIENT_UUID=$(/opt/keycloak/bin/kcadm.sh get clients \
    --realm nekazari \
    --fields id,clientId \
    --format csv \
    --noquotes 2>/dev/null | grep "nekazari-api-gateway" | cut -d',' -f1)
fi

echo ""
echo "Client UUID: $CLIENT_UUID"

echo ""
echo "=== Obteniendo Service Account User ID ==="
SERVICE_ACCOUNT_ID=$(/opt/keycloak/bin/kcadm.sh get \
  "clients/${CLIENT_UUID}/service-account-user" \
  --realm nekazari \
  --fields id \
  --format csv \
  --noquotes 2>/dev/null | cut -d',' -f1)

echo "Service Account User ID: $SERVICE_ACCOUNT_ID"

echo ""
echo "=== Verificando si el rol realm-admin ya está asignado ==="
EXISTING_ROLES=$(/opt/keycloak/bin/kcadm.sh get \
  "users/${SERVICE_ACCOUNT_ID}/role-mappings/realm" \
  --realm nekazari \
  --fields id,name \
  --format csv \
  --noquotes 2>/dev/null | grep "realm-admin" || echo "")

if [ -n "$EXISTING_ROLES" ]; then
  echo "✓ El rol realm-admin ya está asignado"
  exit 0
fi

echo ""
echo "=== Asignando rol realm-admin al Service Account ==="
/opt/keycloak/bin/kcadm.sh add-roles \
  --realm nekazari \
  --uusername "service-account-nekazari-api-gateway" \
  --rolename "realm-admin"

echo ""
echo "=== Verificando asignación ==="
FINAL_ROLES=$(/opt/keycloak/bin/kcadm.sh get \
  "users/${SERVICE_ACCOUNT_ID}/role-mappings/realm" \
  --realm nekazari \
  --fields name \
  --format csv \
  --noquotes 2>/dev/null | grep "realm-admin" || echo "")

if [ -n "$FINAL_ROLES" ]; then
  echo "✓ ✓ ✓ ÉXITO: El rol realm-admin está asignado correctamente"
  echo "✓ El Service Account ahora puede crear usuarios en Keycloak"
else
  echo "⚠ ERROR: El rol no se asignó correctamente"
  exit 1
fi



