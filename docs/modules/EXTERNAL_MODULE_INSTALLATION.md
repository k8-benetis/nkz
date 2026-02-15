# External Module Installation Guide - Nekazari Platform

This guide provides step-by-step instructions for installing external modules on the Nekazari Platform. Follow these steps in order to ensure a successful deployment.

## Prerequisites

- Access to the Kubernetes cluster where Nekazari Platform is deployed
- `kubectl` configured with cluster access
- Access to the Core Platform database (PostgreSQL)
- GitHub Container Registry (GHCR) credentials configured as `ghcr-secret` in the `nekazari` namespace
- Access to the Core Platform repository (`nekazari-public`) for Ingress updates
- **Important**: The Core Platform host frontend must be up-to-date (if installing the first external module, ensure the latest host image is deployed, as it includes Module Federation shared module support)

## Overview

Installing an external module involves these main steps:

1. **Build and Push Docker Images** - Build and publish module images to GHCR
2. **Deploy Kubernetes Resources** - Deploy backend, frontend, and worker (if needed)
3. **Update Ingress** - Add routes for API and frontend
4. **Register Module** - Register the module in the `marketplace_modules` table
5. **Verify Deployment** - Test that the module loads correctly

---

## Step 1: Build and Push Docker Images

### Option A: Using GitHub Actions CI/CD (Recommended)

If the module repository has GitHub Actions configured:

1. **Tag a release** (for versioned deployments):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Or push to main branch** (for `latest` tag):
   ```bash
   git push origin main
   ```

3. **Wait for CI/CD to complete** (usually 5-10 minutes):
   - Check GitHub Actions in the module repository
   - Verify images are pushed to GHCR

### Option B: Build Locally

If you need to build manually or for testing:

```bash
# Navigate to module root directory
cd /path/to/module

# Build frontend image
docker build -f frontend/Dockerfile \
  -t ghcr.io/your-org/your-module/your-module-frontend:v1.0.0 \
  .

# Build backend image
docker build -f backend/Dockerfile \
  -t ghcr.io/your-org/your-module/your-module-backend:v1.0.0 \
  ./backend

# Build worker image (if applicable)
docker build -f backend/Dockerfile \
  -t ghcr.io/your-org/your-module/your-module-worker:v1.0.0 \
  --target worker \
  ./backend

# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Push images
docker push ghcr.io/your-org/your-module/your-module-frontend:v1.0.0
docker push ghcr.io/your-org/your-module/your-module-backend:v1.0.0
docker push ghcr.io/your-org/your-module/your-module-worker:v1.0.0
```

**Important Notes:**
- Use versioned tags (`v1.0.0`) instead of `latest` for production stability
- Frontend Dockerfile must be built from module root with `context: .` and `file: ./frontend/Dockerfile`
- Frontend must include `nginx.conf` with correct path rewriting for `/modules/{module-name}/*` paths

---

## Step 2: Deploy Kubernetes Resources

### 2.1 Review Deployment Manifests

Verify the module's Kubernetes manifests are correct:

- `k8s/backend-deployment.yaml` - Backend API deployment
- `k8s/frontend-deployment.yaml` - Frontend Nginx deployment
- `k8s/worker-deployment.yaml` - Celery worker (if applicable)

**Key Configuration Checks:**

1. **Image Pull Secrets**: Must reference `ghcr-secret`
   ```yaml
   imagePullSecrets:
     - name: ghcr-secret
   ```

2. **Image Pull Policy**: Use `Always` for `latest`, `IfNotPresent` for versioned tags
   ```yaml
   imagePullPolicy: Always  # or IfNotPresent for versioned tags
   ```

3. **Environment Variables**: Must include:
   - `DATABASE_URL` - From `postgresql-secret` (key: `connection-string`)
   - `MODULE_MANAGEMENT_KEY` - Service-to-service auth key
   - `CELERY_BROKER_URL` - Redis connection
   - Keycloak/JWT configuration

4. **Resource Limits**: Should be reasonable (check module documentation)

### 2.2 Apply Deployments

```bash
# Apply backend deployment
kubectl apply -f k8s/backend-deployment.yaml

# Apply frontend deployment
kubectl apply -f k8s/frontend-deployment.yaml

# Apply worker deployment (if applicable)
kubectl apply -f k8s/worker-deployment.yaml
```

### 2.3 Verify Pods are Running

```bash
# Check all module pods
kubectl get pods -n nekazari | grep your-module-name

# Check pod logs for errors
kubectl logs -n nekazari -l app=your-module-backend --tail=50
kubectl logs -n nekazari -l app=your-module-frontend --tail=50
kubectl logs -n nekazari -l app=your-module-worker --tail=50
```

**Common Issues:**
- `ErrImagePull` / `ImagePullBackOff`: Image doesn't exist in GHCR or wrong image name
- `CreateContainerConfigError`: Missing environment variables or secrets
- Crash loops: Check logs for runtime errors

---

## Step 3: Update Ingress

The Core Platform Ingress must be updated to route traffic to the module's services.

### 3.1 Locate Ingress Configuration

In the Core Platform repository (`nekazari-public`):
- File: `k8s/core/networking/ingress.yaml`

### 3.2 Add Routes

Add two paths for each module:

```yaml
# API route (for backend)
- path: /api/your-module-name
  pathType: Prefix
  backend:
    service:
      name: your-module-api-service
      port:
        number: 8000

# Frontend route (for Module Federation assets)
# IMPORTANT: This route MUST come BEFORE the generic /modules route
- path: /modules/your-module-name
  pathType: Prefix
  backend:
    service:
      name: your-module-frontend-service
      port:
        number: 80
```

**Critical Notes:**
- The `/modules/{module-name}` route **MUST** be defined **BEFORE** any generic `/modules` route to ensure correct routing priority
- Module-specific routes have higher priority when they appear first in the rules list

### 3.3 Apply Ingress Changes

```bash
# From Core Platform repository
cd /path/to/nekazari-public
kubectl apply -f k8s/core/networking/ingress.yaml
```

### 3.4 Verify Routes

```bash
# Check Ingress configuration
kubectl get ingress -n nekazari -o yaml | grep -A 10 "your-module-name"

# Test API endpoint
curl -I https://nekazari.robotika.cloud/api/your-module-name/health

# Test frontend remoteEntry.js
curl -I https://nekazari.robotika.cloud/modules/your-module-name/assets/remoteEntry.js
# Should return HTTP 200 and Content-Type: application/javascript
```

---

## Step 4: Register Module in Database

The module must be registered in the `marketplace_modules` table for the platform to discover and load it.

### 4.1 Locate Registration SQL

Module should provide: `k8s/registration.sql`

### 4.2 Review Registration SQL

Verify these critical fields:

1. **Table Name**: Must use `marketplace_modules` (NOT `modules`)
   ```sql
   INSERT INTO marketplace_modules (...)
   ```

2. **remote_entry_url**: Must be the **public URL** accessible via Ingress
   ```sql
   remote_entry_url = 'https://nekazari.robotika.cloud/modules/your-module-name/assets/remoteEntry.js'
   ```

3. **build_config**: Must include Module Federation configuration
   ```sql
   build_config = '{
     "exposes": {
       "./App": "./App",
       ...
     },
     "shared": {
       "react": {
         "singleton": true,
         "requiredVersion": "^18.3.1"
       },
       ...
     }
   }'::jsonb
   ```

4. **Required Fields**:
   - `id` - Module identifier (unique)
   - `name` - Module name
   - `display_name` - Human-readable name
   - `scope` - Module Federation scope
   - `exposed_module` - Main export path (usually `"./App"`)
   - `version` - Module version
   - `route_path` - Frontend route (e.g., `"/your-module"`)
   - `backend_url` - Internal service URL
   - `frontend_url` - Internal service URL
   - `is_local` - Set to `false` for external modules
   - `is_active` - Set to `true` to enable the module

### 4.3 Execute Registration

```bash
# Connect to database (adjust connection string as needed)
kubectl exec -it -n nekazari postgresql-pod -- psql -U nekazari -d nekazari -f - < k8s/registration.sql

# Or if you have direct database access
psql $DATABASE_URL -f k8s/registration.sql
```

### 4.4 Verify Registration

```bash
# Query the database to verify
kubectl exec -it -n nekazari postgresql-pod -- psql -U nekazari -d nekazari -c \
  "SELECT id, name, display_name, version, is_active, is_local, remote_entry_url FROM marketplace_modules WHERE id = 'your-module-id';"
```

---

## Step 5: Verify Deployment

### 5.1 Check Pods Status

```bash
# All pods should be Running
kubectl get pods -n nekazari | grep your-module-name

# Expected output:
# your-module-backend-xxx   1/1   Running   0   5m
# your-module-frontend-xxx  1/1   Running   0   5m
# your-module-worker-xxx    1/1   Running   0   5m
```

### 5.2 Check Services

```bash
# Services should be running
kubectl get svc -n nekazari | grep your-module-name

# Expected output:
# your-module-api-service      ClusterIP   10.x.x.x   8000/TCP   5m
# your-module-frontend-service ClusterIP   10.x.x.x   80/TCP     5m
```

### 5.3 Test API Endpoints

```bash
# Health check
curl https://nekazari.robotika.cloud/api/your-module-name/health

# Should return: {"status":"healthy","service":"your-module-name"}
```

### 5.4 Test Frontend Module Federation

```bash
# Check remoteEntry.js is accessible
curl -I https://nekazari.robotika.cloud/modules/your-module-name/assets/remoteEntry.js

# Should return:
# HTTP/1.1 200 OK
# Content-Type: application/javascript
# (NOT text/html)
```

If you get `text/html` or a 404, check:
- Ingress configuration (route order and path matching)
- Nginx configuration in frontend (path rewriting)

### 5.5 Test in Browser

1. **Log in to Nekazari Platform**
2. **Navigate to Marketplace** - Module should appear in the list
3. **Install the module** (if required for tenant)
4. **Navigate to module route** (e.g., `/your-module`)
5. **Check browser console** for errors:
   - `undefined has no properties` → Module Federation shared modules issue
   - `404` for `remoteEntry.js` → Ingress/Nginx routing issue
   - `CORS` errors → CORS headers not configured in Nginx

### 5.6 Verify Module Federation Loading

Open browser DevTools Console and look for:

```
[ModuleLoader] Loading module: your-module-name, isLocal: false
[RemoteModuleLoader] Importing remote entry: https://nekazari.robotika.cloud/modules/your-module-name/assets/remoteEntry.js
[RemoteModuleLoader] Container initialized with shared modules from window globals
[RemoteModuleLoader] Module loaded successfully: your-module-name
```

**Common Errors:**

1. **`undefined has no properties`**:
   - Module Federation shared modules not correctly configured
   - Check that React is exposed globally on window in host's `main.tsx`
   - Check that `RemoteModuleLoader.tsx` populates `globalThis.__federation_shared__` before importing remote entry

2. **`404` for `remoteEntry.js`**:
   - Ingress route not configured correctly
   - Nginx configuration missing or incorrect path rewriting
   - Check that `/modules/{module-name}` route comes before generic `/modules` route

3. **`CORS` errors**:
   - Frontend Nginx missing CORS headers
   - Check `nginx.conf` includes `Access-Control-Allow-Origin: *` for `.js` files

---

## Troubleshooting

### Issue: Pods not starting

**Check:**
```bash
kubectl describe pod -n nekazari your-module-pod-name
kubectl logs -n nekazari your-module-pod-name
```

**Common causes:**
- Missing secrets (check `imagePullSecrets`, environment variables)
- Wrong image tag or image doesn't exist in GHCR
- Resource limits too low
- Database connection issues

### Issue: Module not appearing in Marketplace

**Check:**
1. Module registered in `marketplace_modules` table?
   ```bash
   kubectl exec -it -n nekazari postgresql-pod -- psql -U nekazari -d nekazari -c \
     "SELECT id, is_active FROM marketplace_modules WHERE id = 'your-module-id';"
   ```

2. `is_active = true`?
3. `is_local = false` for external modules?

### Issue: Module loads but shows errors

**Check browser console:**
- Network tab: Are all Module Federation chunks loading (200 status)?
- Console: Any JavaScript errors?

**Common errors and fixes:**

1. **`undefined has no properties` or `consumer config import=false,so cant use callback shared module`**:
   - **Cause**: Module Federation shared modules (React) not available in `globalThis.__federation_shared__`
   - **Solution**: Ensure the Core Platform host frontend is up-to-date. The host must populate `globalThis.__federation_shared__` before importing remote modules
   - **Check**: Look for `[RemoteModuleLoader] ✅ Shared modules stored` in browser console
   - **Fix**: Rebuild and redeploy the host frontend if you see `[RemoteModuleLoader] ❌ Cannot populate shared modules`

2. **Clear browser cache** (Module Federation chunks may be cached)

3. **Check Nginx cache headers** (should have short cache for `remoteEntry.js`)

### Issue: API calls failing

**Check:**
1. API route configured in Ingress?
2. Backend service running?
3. Authentication headers correct?
4. CORS configured (if needed)?

---

## Rollback Procedure

If something goes wrong, you can rollback:

### 1. Remove Module Registration

```bash
kubectl exec -it -n nekazari postgresql-pod -- psql -U nekazari -d nekazari -c \
  "DELETE FROM marketplace_modules WHERE id = 'your-module-id';"
```

### 2. Remove Ingress Routes

Edit `k8s/core/networking/ingress.yaml` and remove module routes, then:
```bash
kubectl apply -f k8s/core/networking/ingress.yaml
```

### 3. Delete Kubernetes Resources

```bash
kubectl delete -f k8s/backend-deployment.yaml
kubectl delete -f k8s/frontend-deployment.yaml
kubectl delete -f k8s/worker-deployment.yaml
```

---

## Module Requirements Checklist

Before installing a module, verify it includes:

- [ ] `k8s/backend-deployment.yaml` with correct configuration
- [ ] `k8s/frontend-deployment.yaml` with correct configuration
- [ ] `k8s/worker-deployment.yaml` (if applicable)
- [ ] `k8s/registration.sql` with correct `marketplace_modules` INSERT
- [ ] `frontend/nginx.conf` with correct path rewriting for `/modules/{module-name}/*`
- [ ] `frontend/Dockerfile` that builds correctly with `context: .` and `file: ./frontend/Dockerfile`
- [ ] `manifest.json` with correct Module Federation configuration
- [ ] `vite.config.ts` with React shared as singleton (for external modules)
- [ ] `tailwind.config.js` with **preflight disabled** and **prefix configured** (if using Tailwind)
- [ ] CSS properly scoped to prevent affecting host layout
- [ ] Documentation (README.md) with deployment instructions

---

## Next Steps

After successful installation:

1. **Test all module features** - Ensure everything works as expected
2. **Monitor logs** - Watch for any errors or warnings
3. **Configure module** - Set up module-specific configuration if needed
4. **Update documentation** - Document any platform-specific configurations or changes

---

## References

- [Module Development Best Practices](../development/MODULE_DEVELOPMENT_BEST_PRACTICES.md)
- [Module Architecture Recommendations](../architecture/MODULE_ARCHITECTURE_RECOMMENDATIONS.md)
- [Deployment Guide](../DEPLOYMENT_GUIDE.md)

