# Integración Keycloak - Nekazari Platform

## 🚀 Implementación Completa

Esta implementación integra completamente Keycloak como sistema de autenticación y autorización para la plataforma Nekazari, reemplazando el sistema legacy de autenticación.

## 📋 Resumen de Cambios

### ✅ Frontend Actualizado
- **Nuevo contexto de autenticación**: `KeycloakAuthContext.tsx`
- **Rutas protegidas**: `KeycloakProtectedRoute.tsx` con roles específicos
- **Página de login**: `KeycloakLogin.tsx` con integración OIDC
- **Navegación**: `KeycloakNavigation.tsx` con información de usuario y roles
- **Dependencias**: Añadido `keycloak-js` para integración OIDC

### ✅ Backend Actualizado
- **API Gateway**: `keycloak_api_gateway.py` con validación JWT usando JWKS
- **API Validator**: `keycloak_jwt_validator.py` reemplaza validación de API keys
- **Admin Verification**: `keycloak_admin_verification.py` con verificación de roles
- **Dependencias**: Añadido `cryptography` para manejo de claves RSA

### ✅ Configuración de Keycloak
- **Realm**: Configuración completa del realm `nekazari`
- **Clientes**: Frontend, Admin, API Gateway con configuración OIDC
- **Roles**: PlatformAdmin, TenantAdmin, DeviceManager, DashboardViewer, Farmer
- **Usuarios**: Admin y farmer de ejemplo con roles asignados

### ✅ Kubernetes
- **Deployments**: Actualizados para usar nuevos servicios
- **Secrets**: Configuración de secretos para Keycloak
- **ConfigMaps**: Variables de entorno para integración
- **Jobs**: Job de importación de realm automática

### ✅ Scripts de Gestión
- **Migración**: `migrate-to-keycloak.sh` para migración completa
- **Usuarios**: `manage-keycloak-users.sh` para gestión de usuarios

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Keycloak      │    │   Backend APIs  │
│   (React)       │◄──►│   (OIDC/OAuth2)  │◄──►│   (JWT Validation)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Login    │    │   JWT Tokens     │    │   Role-based    │
│   & Redirect    │    │   & JWKS         │    │   Authorization │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🔐 Flujo de Autenticación

1. **Usuario accede al frontend** → Redirige a Keycloak
2. **Keycloak autentica** → Devuelve JWT con roles y tenant
3. **Frontend almacena JWT** → Incluye en requests a APIs
4. **APIs validan JWT** → Usando JWKS de Keycloak
5. **Autorización basada en roles** → Acceso granular por funcionalidad

## 🚀 Despliegue Rápido

### 1. Aplicar Configuración Base
```bash
# Secretos de Keycloak
kubectl apply -f k8s/k3s-optimized/keycloak-secrets.yaml

# Configuración de realm
kubectl apply -f k8s/keycloak/realm-import-job.yaml
```

### 2. Desplegar Servicios
```bash
# Keycloak
kubectl apply -f k8s/k3s-optimized/keycloak-deployment.yaml

# Backend con Keycloak
kubectl apply -f k8s/k3s-optimized/api-gateway-keycloak-deployment.yaml
kubectl apply -f k8s/k3s-optimized/api-validator-keycloak-deployment.yaml
kubectl apply -f k8s/k3s-optimized/admin-verification-keycloak-deployment.yaml

# Frontend con Keycloak
kubectl apply -f k8s/k3s-optimized/frontend-deployment.yaml
```

### 3. Ejecutar Migración
```bash
# Configurar realm y usuarios iniciales
./scripts/migrate-to-keycloak.sh
```

## 👥 Usuarios de Prueba

| Usuario | Contraseña | Rol | Tenant |
|---------|------------|-----|--------|
| `admin` | *(generated during deploy)* | PlatformAdmin | platform |
| `farmer1` | *(set during user creation)* | Farmer | tenant1 |

## 🔧 Gestión de Usuarios

### Crear Nuevos Usuarios
```bash
# Administrador de tenant
./scripts/manage-keycloak-users.sh create-tenant-admin tenant2 admin2 admin2@tenant2.com <your-password>

# Agricultor
./scripts/manage-keycloak-users.sh create-farmer tenant2 farmer2 farmer2@tenant2.com <your-password> John Doe

# Gestor de dispositivos
./scripts/manage-keycloak-users.sh create-device-manager tenant2 devmgr2 devmgr2@tenant2.com devmgr123 Jane Smith
```

### Listar Usuarios y Roles
```bash
# Ver todos los usuarios
./scripts/manage-keycloak-users.sh list-users

# Ver roles disponibles
./scripts/manage-keycloak-users.sh list-roles
```

## 🛡️ Seguridad

### Características de Seguridad
- **JWT con RS256**: Firma asimétrica para máxima seguridad
- **JWKS**: Validación de claves públicas desde Keycloak
- **Roles granulares**: Control de acceso basado en roles
- **Multi-tenancy**: Aislamiento por tenant
- **HTTPS**: Comunicación encriptada (configurar en producción)

### Configuración de Producción
1. **Cambiar contraseñas por defecto**
2. **Configurar certificados SSL**
3. **Usar secretos seguros**
4. **Habilitar auditoría**
5. **Configurar backup**

## 📊 Monitoreo

### Endpoints de Salud
- **Keycloak**: `http://keycloak-service:8080/auth/realms/master`
- **API Gateway**: `http://api-gateway-service:8080/health`
- **API Validator**: `http://api-validator-service:5000/health`
- **Admin Verification**: `http://admin-verification-service:5002/health`

### Logs Importantes
```bash
# Logs de Keycloak
kubectl logs -n nekazari deployment/keycloak -f

# Logs de autenticación
kubectl logs -n nekazari deployment/api-gateway -f
```

## 🔄 Migración desde Sistema Legacy

### Servicios Reemplazados
- ❌ `farmer-auth-api` → ✅ Keycloak OIDC
- ❌ API Key validation → ✅ JWT validation
- ❌ Password-based admin → ✅ Role-based admin

### Datos Migrados
- **Usuarios**: Importados a Keycloak con roles
- **Tenants**: Configurados como atributos de usuario
- **Permisos**: Mapeados a roles de Keycloak

## 🧪 Testing

### Test de Autenticación
1. Acceder a `https://nekazari.robotika.cloud`
2. Verificar redirección a Keycloak
3. Login con credenciales de prueba
4. Verificar acceso a dashboard

### Test de Autorización
1. Login como farmer → Solo acceso a rutas permitidas
2. Login como admin → Acceso completo
3. Verificar restricciones por rol

### Test de APIs
```bash
# Obtener token
TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=[CONTRASEÑA_GENERADA_POR_DEPLOY]!&grant_type=password&client_id=nekazari-frontend" \
  https://nekazari.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/token | \
  jq -r '.access_token')

# Test API
curl -H "Authorization: Bearer $TOKEN" \
  https://nekazari.robotika.cloud/api/user-info
```

## 📚 Documentación Adicional

- [Guía de Despliegue Detallada](docs/KEYCLOAK_DEPLOYMENT_GUIDE.md)
- [Configuración de Keycloak](k8s/keycloak/)
- [Scripts de Gestión](scripts/)

## 🆘 Troubleshooting

### Problemas Comunes

#### Keycloak no inicia
```bash
kubectl logs -n nekazari deployment/keycloak
kubectl get pods -n nekazari -l app=keycloak
```

#### Frontend no conecta
```bash
kubectl exec -n nekazari deployment/frontend -- env | grep VITE_KEYCLOAK
```

#### APIs no validan JWT
```bash
kubectl logs -n nekazari deployment/api-gateway
kubectl exec -n nekazari deployment/api-gateway -- curl http://keycloak-service:8080/auth/realms/nekazari/protocol/openid-connect/certs
```

## 🎯 Próximos Pasos

1. **Configurar HTTPS** en producción
2. **Implementar backup** de Keycloak
3. **Configurar monitoreo** avanzado
4. **Optimizar performance** de JWT validation
5. **Implementar SSO** con otros sistemas

---

**¡La integración de Keycloak está completa y lista para producción!** 🎉
