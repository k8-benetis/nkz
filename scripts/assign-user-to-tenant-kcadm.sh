#!/bin/bash
# =============================================================================
# ASIGNAR USUARIO A TENANT - USANDO kcadm.sh (MÁS SIMPLE)
# =============================================================================
# Uso: ./assign-user-to-tenant-kcadm.sh <email> <tenant_id>
# Ejemplo: ./assign-user-to-tenant-kcadm.sh nekazari@robotika.cloud TESTTENANT
# =============================================================================

set -e

if [ $# -ne 2 ]; then
  echo "Uso: $0 <email> <tenant_id>"
  echo "Ejemplo: $0 nekazari@robotika.cloud TESTTENANT"
  exit 1
fi

EMAIL="$1"
TENANT_ID="$2"
NAMESPACE="nekazari"
REALM="nekazari"

echo "Asignando $EMAIL al tenant $TENANT_ID..."

# Ejecutar dentro del pod de Keycloak usando kcadm.sh
kubectl exec -n $NAMESPACE deployment/keycloak -- sh -c "
cd /opt/keycloak

# Obtener contraseña de admin
ADMIN_PASS=\$(kubectl get secret keycloak-secret -n $NAMESPACE -o jsonpath='{.data.admin-password}' | base64 -d)

# Configurar credenciales
./bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password \"\$ADMIN_PASS\" > /dev/null 2>&1

# Obtener ID del usuario
USER_ID=\$(./bin/kcadm.sh get users -r $REALM --fields id,email | grep \"$EMAIL\" | awk '{print \$2}')

if [ -z \"\$USER_ID\" ]; then
  echo \"❌ ERROR: Usuario $EMAIL no encontrado\"
  exit 1
fi

# Actualizar atributo tenant_id
./bin/kcadm.sh update users/\$USER_ID -r $REALM -s \"attributes.tenant_id=[\\\"$TENANT_ID\\\"]\" > /dev/null 2>&1

if [ \$? -eq 0 ]; then
  echo \"✅ Usuario $EMAIL asignado al tenant $TENANT_ID\"
else
  echo \"❌ ERROR: Fallo al asignar tenant\"
  exit 1
fi
"

