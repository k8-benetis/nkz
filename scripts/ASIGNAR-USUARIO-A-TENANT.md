# CÓMO ASIGNAR UN USUARIO A UN TENANT

## ✅ Tenant TESTTENANT ya está creado

## 📝 Instrucciones para asignar un usuario:

### Opción 1: Desde el servidor (más simple)

```bash
# Conectarse al servidor
ssh user@your-server-ip

# Ejecutar este comando (reemplaza <EMAIL> y <TENANT_ID>):
sudo kubectl run assign-tenant-$$ --rm -i --restart=Never --image=curlimages/curl:latest -n nekazari -- sh -c '
apk add --no-cache jq > /dev/null 2>&1
ADMIN_PASSWORD=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath="{.data.admin-password}" | base64 -d)
ADMIN_USER=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath="{.data.admin-username}" | base64 -d)
ADMIN_TOKEN=$(curl -s -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "username=${ADMIN_USER}" -d "password=${ADMIN_PASSWORD}" -d "grant_type=password" -d "client_id=admin-cli" http://keycloak-service:8080/auth/realms/master/protocol/openid-connect/token | jq -r ".access_token")
EMAIL="<EMAIL>"
TENANT_ID="<TENANT_ID>"
USER_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://keycloak-service:8080/auth/admin/realms/nekazari/users?email=${EMAIL}" | jq -r ".[0].id // empty")
USER_DATA=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://keycloak-service:8080/auth/admin/realms/nekazari/users/${USER_ID}")
UPDATED_USER=$(echo "$USER_DATA" | jq ".attributes.tenant_id = [\"${TENANT_ID}\"]")
HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "$UPDATED_USER" "http://keycloak-service:8080/auth/admin/realms/nekazari/users/${USER_ID}")
if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then echo "✅ Usuario ${EMAIL} asignado al tenant ${TENANT_ID}"; else echo "❌ ERROR: HTTP $HTTP_CODE"; fi
'
```

### Opción 2: Ejemplo concreto para TESTTENANT

```bash
# Asignar nekazari@robotika.cloud a TESTTENANT
sudo kubectl run assign-nekazari --rm -i --restart=Never --image=curlimages/curl:latest -n nekazari -- sh -c '
apk add --no-cache jq > /dev/null 2>&1
ADMIN_PASSWORD=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath="{.data.admin-password}" | base64 -d)
ADMIN_USER=$(kubectl get secret keycloak-secret -n nekazari -o jsonpath="{.data.admin-username}" | base64 -d)
ADMIN_TOKEN=$(curl -s -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "username=${ADMIN_USER}" -d "password=${ADMIN_PASSWORD}" -d "grant_type=password" -d "client_id=admin-cli" http://keycloak-service:8080/auth/realms/master/protocol/openid-connect/token | jq -r ".access_token")
EMAIL="nekazari@robotika.cloud"
TENANT_ID="TESTTENANT"
USER_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://keycloak-service:8080/auth/admin/realms/nekazari/users?email=${EMAIL}" | jq -r ".[0].id // empty")
USER_DATA=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://keycloak-service:8080/auth/admin/realms/nekazari/users/${USER_ID}")
UPDATED_USER=$(echo "$USER_DATA" | jq ".attributes.tenant_id = [\"${TENANT_ID}\"]")
curl -s -w "%{http_code}" -o /dev/null -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "$UPDATED_USER" "http://keycloak-service:8080/auth/admin/realms/nekazari/users/${USER_ID}"
echo "✅ Completado"
'
```

## 🔍 Verificar asignación:

```bash
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d keycloak -c "SELECT u.email, ua.value as tenant_id FROM user_entity u JOIN user_attribute ua ON u.id = ua.user_id WHERE u.realm_id = (SELECT id FROM realm WHERE name = 'nekazari') AND ua.name = 'tenant_id' ORDER BY u.email;"
```

## 📋 Listar tenants disponibles:

```bash
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c "SELECT tenant_id, tenant_name, status FROM tenants;"
```

