# 🔐 Authentication - Nekazari Integration Standard

## 📋 Métodos de Autenticación

Nekazari soporta dos métodos de autenticación:

1. **API Key** (Recomendado para dispositivos remotos)
2. **JWT Token** (Para usuarios del dashboard)

---

## 🔑 Método 1: API Key (Recomendado para Integraciones)

### Ventajas
- ✅ No requiere gestión de tokens
- ✅ No expira (a menos que se regenere)
- ✅ Ideal para dispositivos IoT y automatización
- ✅ Más simple de implementar

### Obtención de API Key

#### Desde el Dashboard

1. Accede a: `https://nekazari.robotika.cloud/settings`
2. Inicia sesión con tu cuenta
3. En la sección "API Key":
   - Si no tienes una: Haz clic en **"Crear API Key"**
   - Si ya tienes una: Puedes regenerarla con **"Regenerar API Key"**
4. ⚠️ **IMPORTANTE**: Copia la API Key completa inmediatamente

#### Desde API (si tienes token JWT)

```bash
curl -X POST https://nekazari.robotika.cloud/auth/api-key/regenerate \
  -H "Authorization: Bearer TU_JWT_TOKEN"
```

### Uso de API Key

Todas las peticiones deben incluir estos headers:

```
X-API-Key: <tu_api_key_completa>
Fiware-Service: <tu_tenant_id>
```

**Ejemplo**:
```bash
curl -X POST https://nekazari.robotika.cloud/api/sensors/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2" \
  -H "Fiware-Service: mi-tenant-id" \
  -d '{...}'
```

### Seguridad de API Key

- ✅ La API Key se almacena como **hash SHA256** en la base de datos
- ✅ No es posible recuperar la API Key original (solo regenerar)
- ✅ Si pierdes tu API Key, debes regenerarla desde el dashboard
- ✅ La API Key anterior quedará invalidada al regenerar

---

## 🎫 Método 2: JWT Token (Para Usuarios del Dashboard)

### Ventajas
- ✅ Integrado con Keycloak
- ✅ Expiración automática
- ✅ Refresh tokens disponibles
- ✅ Ideal para aplicaciones web

### Obtención de JWT Token

#### Login desde Dashboard

1. Accede a: `https://nekazari.robotika.cloud/login`
2. Inicia sesión con tus credenciales
3. El token se almacena automáticamente en el navegador

#### Login desde API

```bash
curl -X POST https://nekazari.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=tu_email@ejemplo.com" \
  -d "password=tu_password" \
  -d "grant_type=password" \
  -d "client_id=nekazari-frontend"
```

**Respuesta**:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 300,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer"
}
```

### Uso de JWT Token

Todas las peticiones deben incluir este header:

```
Authorization: Bearer <tu_jwt_token>
```

**Ejemplo**:
```bash
curl -X GET https://nekazari.robotika.cloud/api/sensors \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🔄 Comparación de Métodos

| Característica | API Key | JWT Token |
|----------------|---------|-----------|
| **Expiración** | No expira | Expira (típicamente 5-15 min) |
| **Refresh** | No necesario | Requiere refresh token |
| **Uso** | Dispositivos remotos, IoT | Aplicaciones web |
| **Complejidad** | Baja | Media |
| **Seguridad** | Alta (hash SHA256) | Alta (firma digital) |

---

## ⚠️ Errores Comunes

### Error 401: Authentication required

**Causa**: No se proporcionó API Key ni JWT Token

**Solución**:
- Si usas API Key: Incluye headers `X-API-Key` y `Fiware-Service`
- Si usas JWT: Incluye header `Authorization: Bearer <token>`

### Error 401: Invalid API Key

**Causa**: La API Key no es válida o no coincide con el tenant

**Solución**:
1. Verifica que la API Key es completa (64 caracteres hex)
2. Verifica que el `Fiware-Service` header coincide con tu tenant
3. Regenera la API Key desde el dashboard si es necesario

### Error 401: Token has expired

**Causa**: El JWT Token ha expirado

**Solución**:
1. Usa el refresh token para obtener un nuevo access token
2. O vuelve a hacer login

---

## 🔒 Mejores Prácticas

### Para API Keys

1. ✅ **Nunca** compartas tu API Key públicamente
2. ✅ **Nunca** la incluyas en código fuente público (usa variables de entorno)
3. ✅ **Regenera** la API Key si sospechas que ha sido comprometida
4. ✅ **Usa HTTPS** siempre (la API Key viaja en headers)

### Para JWT Tokens

1. ✅ **Almacena** el token de forma segura (no en localStorage para apps sensibles)
2. ✅ **Maneja** la expiración y refresh automáticamente
3. ✅ **No** incluyas el token en URLs o logs
4. ✅ **Usa HTTPS** siempre

---

## 📝 Ejemplos por Lenguaje

### Python

```python
import requests

# API Key
headers = {
    "X-API-Key": "tu_api_key",
    "Fiware-Service": "tu_tenant_id",
    "Content-Type": "application/json"
}

# JWT Token
headers = {
    "Authorization": "Bearer tu_jwt_token",
    "Content-Type": "application/json"
}

response = requests.post(url, json=data, headers=headers)
```

### JavaScript/Node.js

```javascript
// API Key
const headers = {
  'X-API-Key': 'tu_api_key',
  'Fiware-Service': 'tu_tenant_id',
  'Content-Type': 'application/json'
};

// JWT Token
const headers = {
  'Authorization': `Bearer ${jwtToken}`,
  'Content-Type': 'application/json'
};

fetch(url, {
  method: 'POST',
  headers: headers,
  body: JSON.stringify(data)
});
```

### Arduino/ESP32

```cpp
// API Key
http.begin(client, url);
http.addHeader("X-API-Key", "tu_api_key");
http.addHeader("Fiware-Service", "tu_tenant_id");
http.addHeader("Content-Type", "application/json");
http.POST(jsonData);
```

---

**Siguiente**: [API Reference](./api-reference.md)

