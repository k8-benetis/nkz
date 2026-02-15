# Module Template Setup Guide

This guide will help you set up your new module from this template.

## Step 1: Copy Template

```bash
cp -r module-template my-module-name
cd my-module-name
```

## Step 2: Replace Placeholders

Use find-and-replace in your editor to replace:

- `MODULE_NAME` → Your module ID (lowercase, hyphens, e.g., `my-module`)
- `MODULE_DISPLAY_NAME` → Display name (e.g., `My Module`)
- `MODULE_SCOPE` → Module scope for Module Federation (e.g., `my_module`)
- `MODULE_ROUTE` → Route path (e.g., `/my-module`)
- `YOUR_ORG` → Your GitHub organization (e.g., `k8-benetis`)

### Files to Update

1. **package.json**
   - `name`: `MODULE_NAME-module`
   - `description`: Update description

2. **vite.config.ts**
   - `name`: `MODULE_SCOPE` (federation name)
   - `exposes`: Update component paths if needed

3. **manifest.json**
   - All `MODULE_NAME`, `MODULE_DISPLAY_NAME`, `MODULE_ROUTE`, `MODULE_SCOPE`
   - Update author, description, features

4. **k8s/frontend-deployment.yaml**
   - `name`: `MODULE_NAME-frontend`
   - `image`: `ghcr.io/YOUR_ORG/MODULE_NAME-frontend:v1.0.0`
   - Service name: `MODULE_NAME-frontend-service`

5. **k8s/registration.sql**
   - All placeholders

6. **frontend/nginx.conf**
   - `location ~ ^/modules/MODULE_NAME/`

7. **src/App.tsx**
   - `MODULE_DISPLAY_NAME` in title and content

8. **src/slots/index.ts**
   - Comments mentioning `MODULE_DISPLAY_NAME`

9. **src/services/api.ts**
   - `baseUrl`: `/api/MODULE_NAME`
   - Comments mentioning `MODULE_DISPLAY_NAME`

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Update Slot Components

1. Edit `src/components/slots/ExampleSlot.tsx` or create new slot components
2. Register them in `src/slots/index.ts`
3. Export them in `vite.config.ts` under `exposes`

## Step 5: Update API Client

Edit `src/services/api.ts` with your actual API endpoints.

## Step 6: Test Locally

```bash
npm run dev
```

Visit `http://localhost:5003` to see your module.

## Step 7: Build

```bash
npm run build
```

## Step 8: Docker Build

```bash
docker build -f frontend/Dockerfile -t ghcr.io/YOUR_ORG/MODULE_NAME-frontend:v1.0.0 .
docker push ghcr.io/YOUR_ORG/MODULE_NAME-frontend:v1.0.0
```

## Step 9: Deploy

1. Update `k8s/frontend-deployment.yaml` with your image
2. Apply deployment:
   ```bash
   kubectl apply -f k8s/frontend-deployment.yaml
   ```
3. Register module:
   ```bash
   kubectl exec -it <postgres-pod> -n nekazari -- psql -U nekazari -d nekazari -f /path/to/k8s/registration.sql
   ```
4. Update Ingress in `nekazari-public`:
   ```yaml
   - path: /modules/MODULE_NAME
     backend:
       service:
         name: MODULE_NAME-frontend-service
   ```

## Next Steps

- Read the main `README.md` for detailed documentation
- Check examples in `src/components/slots/ExampleSlot.tsx`
- Review SDK documentation for available hooks and APIs
- Follow best practices from Module Development Guide

