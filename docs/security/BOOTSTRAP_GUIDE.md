# Bootstrap Guide - First Platform Deployment

## 🎯 Problema que Resuelve

En el primer despliegue de la plataforma en un nuevo servidor, necesitamos:
1. ✅ Un usuario PlatformAdmin funcional
2. ✅ El usuario debe tener tenant `platform`
3. ✅ El usuario debe tener el rol `PlatformAdmin`
4. ✅ Todo debe funcionar desde el primer momento

## 📋 Checklist de Bootstrap

### Antes del Despliegue:

- [ ] 1. Crear secret `bootstrap-secret` con:
  ```bash
  kubectl create secret generic bootstrap-secret -n nekazari \
    --from-literal=admin-email=admin@yourdomain.com \
    --from-literal=admin-password='TuPasswordSeguro123!'
  ```

- [ ] 2. Verificar que el job `bootstrap-tenant-and-admin` está configurado
- [ ] 3. El job creará automáticamente:
  - Grupo `platform` con atributos correctos
  - Usuario con email del secret
  - Rol `PlatformAdmin` asignado
  - Usuario añadido al grupo `platform`

### Después del Despliegue:

- [ ] 4. Verificar que el usuario puede iniciar sesión
- [ ] 5. Verificar que el token incluye `tenant-id: "platform"`
- [ ] 6. Verificar que el token incluye `realm_access.roles: ["PlatformAdmin"]`

## 🔧 Script de Verificación

```bash
# En el servidor
python3 /tmp/setup-platform-admin.py admin@yourdomain.com
```

Este script:
- ✅ Crea el grupo `platform` si no existe
- ✅ Configura atributos del grupo
- ✅ Encuentra usuarios con rol `PlatformAdmin`
- ✅ Los añade al grupo `platform`
- ✅ Los remueve de otros grupos de tenant

## 📝 Arquitectura Bootstrap

```
Usuario Bootstrap (admin@yourdomain.com):
├── GRUPO: "platform" (tenant especial)
│   └── Atributos:
│       ├── tenant_id: "platform"
│       ├── tenant_type: "system"
│       └── plan_type: "system"
└── ROL: PlatformAdmin
```

**Token JWT:**
```json
{
  "groups": ["platform"],
  "tenant-id": "platform",
  "realm_access": {
    "roles": ["PlatformAdmin"]
  }
}
```

## ⚠️ Problemas Comunes en Bootstrap

### Problema 1: Usuario no tiene tenant en token

**Causa**: Usuario no está en el grupo `platform`
**Solución**: Ejecutar `setup-platform-admin.py`

### Problema 2: Usuario tiene tenant "bootstrap" en lugar de "platform"

**Causa**: Usuario está en grupo `bootstrap` en lugar de `platform`
**Solución**: El script de setup remueve automáticamente de grupos de tenant

### Problema 3: Usuario no tiene rol PlatformAdmin

**Causa**: El rol no fue asignado durante bootstrap
**Solución**: Ejecutar `assign-platform-admin-role.sh admin@yourdomain.com`

## ✅ Flujo Completo de Bootstrap

1. **Despliegue inicial**: Job `bootstrap-tenant-and-admin` se ejecuta
2. **Job crea**:
   - Grupo `platform` con atributos
   - Usuario con email del secret
   - Rol `PlatformAdmin` asignado
   - Usuario añadido al grupo `platform`
3. **Usuario inicia sesión**: Obtiene token con `tenant-id: "platform"`
4. **Backend detecta**: `PlatformAdmin` + `tenant="platform"` → Acceso cross-tenant
5. **✅ Todo funciona desde el primer momento**

## 🎯 Esto Resuelve el Problema de "Cien Problemas"

Con esta arquitectura:
- ✅ **Siempre hay un usuario** (creado por bootstrap job)
- ✅ **Siempre tiene tenant** (grupo `platform`)
- ✅ **Siempre tiene permisos** (rol `PlatformAdmin`)
- ✅ **Siempre funciona** (no hay casos especiales)

**NO MÁS PROBLEMAS DE BOOTSTRAP** 🎉
