# NKZ — Platform Conventions

Quick reference for developers and AI agents. Everything here reflects how the platform **actually works** in production. If your code contradicts this document, your code has a bug.

Last verified: 2026-03-19 (nomenclature unification + billing roles)

---

## 1. Authentication

There is ONE auth mechanism: **httpOnly cookie `nkz_token`**.

```
Browser → POST /api/auth/session (body: {token}) → Set-Cookie: nkz_token (httpOnly, Secure, SameSite=Strict, domain=.robotika.cloud)
Browser → DELETE /api/auth/session → Clear cookie
```

### How each layer reads the token

| Layer | How it gets the JWT |
|-------|---------------------|
| **Frontend (host)** | Never reads the token directly. `credentials: 'include'` on every fetch. |
| **Frontend (IIFE modules)** | Same — `credentials: 'include'`. The SDK handles it. |
| **api-gateway** | `get_request_token()`: reads `Authorization: Bearer` header first, falls back to `nkz_token` cookie. |
| **Module backends (direct ingress)** | Must implement cookie fallback themselves. Pattern: check Bearer header → fall back to `request.cookies.get("nkz_token")`. See `agrienergy/middleware/__init__.py`. |

### Rules

- **Never** store tokens in localStorage or sessionStorage.
- **Never** pass tokens in query strings.
- **Never** expose tokens via `window.__nekazariAuthContext` (it only has `isAuthenticated`, `user`, `tenantId`, `roles` — no token).
- All fetch calls must use `credentials: 'include'`.

---

## 2. Tenant Resolution

Every request is scoped to a tenant. The flow:

```
JWT token contains: { tenant_id: "My-Farm", ... }   ← canonical claim: tenant_id (snake_case)
           ↓
  api-gateway extracts tenant_id from JWT claims
           ↓
  normalize_tenant_id("My-Farm") → "my_farm"
           ↓
  Injects headers for internal services:
    NGSILD-Tenant: my_farm       ← canonical (ETSI NGSI-LD spec)
    Fiware-Service: my_farm      ← legacy, remove after 2026-04-02
    X-Tenant-ID: my_farm
```

### Tenant ID normalization rules

```
Input           → Output
"My-Farm"       → "my_farm"
"Test Tenant"   → "test_tenant"
"UPPERCASE"     → "uppercase"
"a-b-c"         → "a_b_c"
```

Function: `normalize_tenant_id()` in `common/tenant_utils.py` (lowercase, hyphens→underscores, strip special chars, 3-63 chars).

### Which header to use when

| Calling... | Header | Who sets it |
|------------|--------|-------------|
| Orion-LD (NGSI-LD broker) | `NGSILD-Tenant` (canonical, ETSI spec) | api-gateway (automatic) |
| Internal backend services | `X-Tenant-ID` | api-gateway (automatic) |
| Module backends (direct ingress) | Extract from `X-Tenant-ID` header (if routed via gateway) or JWT `tenant_id` claim | Module's own middleware |

> **Migration note (until 2026-04-02)**: Gateway sends both `NGSILD-Tenant` and `Fiware-Service`. After that date, only `NGSILD-Tenant`. `Fiware-ServicePath` has been removed (Orion-LD ignores it in NGSI-LD mode).

### Rules

- **Always** normalize before using as DB schema name, MongoDB collection, MinIO path, or SQL identifier.
- **Never** trust tenant ID from request body or query params — always from JWT.
- Default tenant (no tenant in JWT): `"default"`.

---

## 3. NGSI-LD Requests to Orion-LD

Two valid patterns. Choose based on Content-Type:

### Pattern A: `application/json` + Link header

```http
POST /ngsi-ld/v1/entities HTTP/1.1
Content-Type: application/json
Link: <http://api-gateway-service:5000/ngsi-ld-context.json>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
NGSILD-Tenant: my_farm

{"id": "urn:ngsi-ld:AgriParcel:001", "type": "AgriParcel", "name": {"type": "Property", "value": "North field"}}
```

### Pattern B: `application/ld+json` + @context in body

```http
POST /ngsi-ld/v1/entities HTTP/1.1
Content-Type: application/ld+json
NGSILD-Tenant: my_farm

{"@context": "http://api-gateway-service:5000/ngsi-ld-context.json", "id": "urn:ngsi-ld:AgriParcel:001", "type": "AgriParcel", "name": {"type": "Property", "value": "North field"}}
```

### Rules

- **Never** mix: if `@context` is in the body, do NOT send the Link header (Orion rejects it).
- **Never** use external context URLs in production (`https://raw.githubusercontent.com/smart-data-models/...`). Always use the local gateway context: `http://api-gateway-service:5000/ngsi-ld-context.json`.
- The api-gateway handles this automatically for proxied requests (`inject_fiware_headers()`).
- For direct Orion calls from backend services, you must set headers yourself.
- Frontend consumption: use `options=keyValues` for simple JSON responses.

---

## 4. Entity Types (Smart Data Models)

Use SDM vocabulary. This table is the canonical list of types used in NKZ:

### Entities you create via wizard / SDM Integration

| Category | Type | Notes |
|----------|------|-------|
| **Parcelas** | `AgriParcel` | Primary land unit. Has `location` (GeoJSON polygon), `area` (hectares) |
| **Sensores** | `AgriSensor` | IoT sensor. Replaces legacy `Device` type. Gets MQTT credentials on creation |
| **Tractores** | `AgriculturalTractor` | Farm machinery with J1939/ISOBUS |
| **Implementos** | `AgriculturalImplement` | Attachments (plough, sprayer, etc.) |
| **Edificios** | `Building` | Farm buildings |
| **Agua** | `WaterSource`, `Well`, `Spring`, `Pond`, `IrrigationOutlet`, `IrrigationSystem` | Water infrastructure |
| **Energía** | `PhotovoltaicInstallation`, `EnergyStorageSystem` | Solar + batteries |
| **Ganadería** | `LivestockAnimal`, `LivestockGroup`, `LivestockFarm` | Animals + farms |
| **Robots** | `AgriculturalRobot` | Autonomous machines |
| **Legacy** | `Device` | Generic IoT device. **Prefer `AgriSensor`** for new entities. Kept for backwards compatibility |

### Entities created by backend services (not via wizard)

| Type | Created by | Notes |
|------|------------|-------|
| `WeatherObserved` | weather-worker | Hourly weather data per parcel |
| `AgriParcelRecord` | telemetry-worker | Sensor measurements linked to parcels |

### Entity ID format

```
urn:ngsi-ld:{Type}:{uuid4_hex_16}
```

Generated by `generate_entity_id()` from `common/entity_utils.py`.
For externally-keyed entities (cadastral parcels): `generate_entity_id_deterministic()` produces stable IDs from SHA-256 of the external key.

Examples: `urn:ngsi-ld:AgriParcel:a1b2c3d4e5f67890`, `urn:ngsi-ld:AgriSensor:f9e8d7c6b5a43210`

> Existing entity IDs are immutable — never rename entities already in Orion.

### Entity Display Name

Use the canonical function to extract a display name from an NGSI-LD entity:

- **Python**: `get_entity_display_name(entity)` from `common/entity_utils.py`
- **TypeScript**: `getEntityDisplayName(entity)` from `@nekazari/sdk` (`ngsi/helpers.ts`)

Logic: `entity.name` (string) > `entity.name.value` (Property format) > `entity.id` (fallback).

### Context URL

One canonical env var: **`CONTEXT_URL`**. Default: `http://api-gateway-service:5000/ngsi-ld-context.json`.

Every service must use: `CONTEXT_URL = os.getenv("CONTEXT_URL", "http://api-gateway-service:5000/ngsi-ld-context.json")`

### Rules

- **Never** invent new types if an SDM type exists (e.g., don't use `Parcel`, `Sensor`, `Robot`).
- The SDM catalog in `sdm-integration/sdm_api.py` defines all available types. To add a new type, add it there.
- IoT types (`AgriSensor`, `Sensor`, `Actuator`, `WeatherStation`, `AgriculturalTractor`, `LivestockAnimal`, `AgriculturalMachine`) automatically get MQTT credentials provisioned on creation.
- **Never** hardcode context URLs — always use the `CONTEXT_URL` env var.

---

## 5. Units of Measurement (unitCode)

Numeric properties must include `unitCode` using **UN/CEFACT Common Codes**:

| Measurement | unitCode | Wrong |
|-------------|----------|-------|
| Temperature (°C) | `CEL` | `"ºC"`, `"celsius"` |
| Pressure (hPa) | `HPA` | `A97`, `"hPa"` |
| Area (hectares) | `HAR` | `"ha"`, `"hectareas"` |
| Percentage | `P1` | `"%"`, `"percent"` |
| Wind speed (m/s) | `MTS` | `"m/s"`, `"Km/h"` |
| Precipitation (mm) | `MMT` | `"mm"` |
| Irradiance (W/m²) | `D54` | `"W/m2"` |

Example:
```json
{
  "atmosphericPressure": {
    "type": "Property",
    "value": 1013.25,
    "unitCode": "HPA"
  }
}
```

---

## 6. API Routing

### Through api-gateway (nkz.robotika.cloud)

All requests go through the gateway, which handles auth + tenant injection:

| Path | Backend service | Notes |
|------|----------------|-------|
| `/api/auth/session` | gateway itself | Cookie set/clear |
| `/ngsi-ld/v1/*` | orion-ld-service:1026 | NGSI-LD CRUD. Gateway injects NGSILD-Tenant |
| `/api/weather/*` | weather-worker:8080 | Weather data + agroclimatology |
| `/api/risks/*` | risk-api-service:5000 | Risk states, catalog, webhooks |
| `/api/timeseries/*` | timeseries-reader-service:8000 | Historical data from TimescaleDB |
| `/api/modules/*` | entity-manager-service:5000 | Module marketplace, health |
| `/api/admin/*` | entity-manager-service:5000 | Platform administration |
| `/api/assets/*` | entity-manager-service:5000 | File management (MinIO) |
| `/api/tenant/*` | tenant-user-api-service:5000 | User management per tenant |
| `/api/vegetation/*` | vegetation-prime-api-service:8000 | NDVI/satellite analysis |
| `/api/cadastral-api/*` | cadastral-api-service:8000 | Spanish cadastre |
| `/sdm/*` | sdm-integration-service:5000 | Entity creation (SDM Integration) |
| `/api/v1/profiles/*` | gateway itself | Device profiles |
| `/api/iot/provision-mqtt` | gateway itself | MQTT credential provisioning |

### Direct ingress (nekazari.robotika.cloud)

IIFE module backends that bypass the gateway. The module handles its own auth:

| Path | Backend service | Ingress name |
|------|----------------|--------------|
| `/api/agrienergy/*` | agrienergy-api-service:8000 | `agrienergy-api-frontend-host` |
| `/api/connectivity/*` | connectivity-api-service:8000 | `connectivity-api-frontend-host` |
| `/api/datahub/*` | datahub-api-service:8000 | `datahub-api-frontend-host` |

### Rules

- api-gateway routes use prefix `/api/`. The gateway receives the full path including `/api/`.
- Module backends with direct ingress must validate JWT themselves (JWKS from Keycloak).
- Frontend calls always go to `VITE_API_URL` (`https://nkz.robotika.cloud`) for gateway routes, or relative paths for direct-ingress modules (since they share the frontend domain).

---

## 7. GeoJSON

- Coordinate order: **`[longitude, latitude]`** (NOT `[lat, lon]`).
- CRS: WGS84 (EPSG:4326). Always.
- Location property in NGSI-LD:

```json
{
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [-2.6189, 42.8467]
    }
  }
}
```

---

## 8. Frontend i18n

- All user-facing strings must use `t()` from react-i18next.
- Minimum languages: `es` + `en`.
- Host app: translations in `apps/host/public/locales/{lang}.json`, namespace `common`.
- IIFE modules: bundle translations in `src/locales/{lang}.json`, register with `i18n.addResourceBundle(lang, 'common', translations, true, true)`.
- **Never** use a custom namespace unless the module has its own `useTranslation('my-namespace')` call.

---

## 9. IIFE Module Build

- Output: single `nkz-module.js` file (NOT `nekazari-module.js`).
- JSX: `"jsx": "react"` (classic transform). **Never** `"react-jsx"`.
- Externals: `react→React`, `react-dom→ReactDOM`, `react-router-dom→ReactRouterDOM`, `@nekazari/sdk→__NKZ_SDK__`, `@nekazari/ui-kit→__NKZ_UI__`.
- Entry: `src/moduleEntry.ts` → `window.__NKZ__.register({ id, viewerSlots, version })`.
- Deploy: upload to MinIO `nekazari-frontend/modules/{moduleId}/nkz-module.js`.
- Module `id` must match `marketplace_modules.id` in the database exactly.

---

## 10. Billing & subscription roles (Keycloak)

Canonical **realm role names** for Stripe ↔ Keycloak orchestration (billing module + api-gateway):

| Role | Meaning |
|------|---------|
| `role_pro_trial` | Subscription in trial |
| `role_pro_active` | Paid / active access |
| `role_pro_expired` | Terminal non-payment or cancellation; **read-only** platform lock (gateway mutating API → 403) |

### Rules

- **Never** use legacy names such as `role_locked` in new code, docs, or Keycloak configuration — use **`role_pro_expired`**.
- Checkout trial length is configured with **`STRIPE_TRIAL_PERIOD_DAYS`** (default `45` in billing module settings); keep product copy and Stripe dashboard aligned.
- Billing admin HTTP routes accept **`PlatformAdmin`** or **`TenantAdmin`** JWT roles; tenant/user context always comes from JWT claims, never from the request body.
