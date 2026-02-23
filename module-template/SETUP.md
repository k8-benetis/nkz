# Setup guide

> For full documentation see [README.md](README.md).

## 1. Clone and rename

```bash
git clone https://github.com/k8-benetis/nkz-module-template.git my-module
cd my-module
```

## 2. Replace placeholders

Find-and-replace across all files:

| Placeholder | Replace with | Example |
|-------------|--------------|---------|
| `MODULE_NAME` | Your module ID (lowercase, hyphens) | `soil-sensor` |
| `MODULE_DISPLAY_NAME` | Human-readable name | `Soil Sensor` |
| `MODULE_ROUTE` | URL path | `/soil-sensor` |
| `YOUR_ORG` | GitHub org | `acme-corp` |
| `YOUR_NAME` | Author name | `Jane Smith` |

## 3. Install dependencies

```bash
npm install
```

## 4. Configure environment

```bash
cp env.example .env
# Edit .env — set VITE_PROXY_TARGET to your API domain
```

## 5. Develop

```bash
npm run dev
# http://localhost:5003 — dev shell only, not the production slot
```

## 6. Build

```bash
npm run build:module
# → dist/nkz-module.js
```

## 7. Upload to MinIO

```bash
# On the server with port-forward active:
mc cp dist/nkz-module.js \
   minio/nekazari-frontend/modules/MODULE_NAME/nkz-module.js \
   --attr "Content-Type=application/javascript"
```

## 8. Register in database

```bash
psql -U postgres -d nekazari -f k8s/registration.sql
```

## 9. Deploy backend (if any)

```bash
docker build -t ghcr.io/YOUR_ORG/MODULE_NAME-backend:v1.0.0 ./backend
docker push ghcr.io/YOUR_ORG/MODULE_NAME-backend:v1.0.0
kubectl apply -f k8s/backend-deployment.yaml -n nekazari
```

Add ingress: `/api/MODULE_NAME` → `MODULE_NAME-api-service:8000`

## 10. Activate for tenants

Tenants enable the module via the platform UI, or directly:

```sql
INSERT INTO tenant_installed_modules (tenant_id, module_id, is_active)
VALUES ('your-tenant', 'MODULE_NAME', true)
ON CONFLICT DO NOTHING;
```
