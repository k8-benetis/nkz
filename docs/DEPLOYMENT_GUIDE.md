# Professional Deployment Guide

## Overview

This guide explains the professional deployment system that ensures:
- ✅ **Data Safety**: PVCs and database data are never touched
- ✅ **Secret Preservation**: All secrets remain intact
- ✅ **Image Reliability**: No cache issues with semantic versioning
- ✅ **Verification**: Automatic post-deploy verification
- ✅ **Idempotency**: Safe to run multiple times

## Architecture

### Components

1. **`build-images.sh`**: Builds Docker images and imports to k3s
2. **`setup-production-secrets.sh`**: Creates all required secrets
3. **`deploy-platform.sh`**: Deploys entire platform
4. **`deploy-frontend.sh`**: Uploads frontend to MinIO

### Tag Strategy

Images are tagged with: `v<commit-sha>-<timestamp>`

Example: `vabc123-20251221-120000`

- **Unique**: Every build gets a unique tag
- **Traceable**: Can identify exact commit and time
- **Reliable**: No cache ambiguity
- **Rollback-friendly**: Easy to revert to previous tags

## GitOps Workflow

**Always follow this flow for clean deploys:**

```
LOCAL → GITHUB → SERVER
```

1. **Make changes locally** (code, configs)
2. **Commit and push to GitHub**: `git add -A && git commit -m "..." && git push`
3. **Pull on server**: `ssh user@server "cd nekazari-public && git pull"`
4. **Build and deploy**: Run deploy scripts on server

> ⚠️ **Never edit files directly on the server!** All changes flow through Git.

### Quick Service Update

```bash
# On local machine
git add -A && git commit -m "feat: description" && git push

# On server (SSH)
ssh user@your-server-ip "
  cd nekazari-public && git pull
  docker build -t ghcr.io/k8-benetis/nekazari-public/SERVICE:latest -f services/SERVICE/Dockerfile services/SERVICE/
  docker save ghcr.io/k8-benetis/nekazari-public/SERVICE:latest | sudo k3s ctr images import -
  sudo kubectl rollout restart deployment/SERVICE -n nekazari
"
```

## Usage

### Quick Deploy (Recommended)

```bash
# Deploy changes (builds and deploys everything)
./scripts/deploy-platform.sh
```

### Fresh Production Installation (Clean Slate)

This is the recommended method for a clean deployment, ensuring all legacy artifacts are removed.

```bash
# 1. Setup Production Secrets
# Generates Postgres, Keycloak, JWT, Redis, MongoDB, MinIO and SDM secrets
./scripts/setup-production-secrets.sh

# 2. Deploy Platform (skipping interactive secret creation as we just did it)
./scripts/deploy-platform.sh --skip-secrets

# 3. Deploy Frontend to MinIO (if not using CI/CD)
# This uploads the built frontend to MinIO for static serving
./scripts/deploy-frontend.sh
```

### Post-Deployment Steps

After running the deployment scripts, verify these resources are applied:

```bash
# Keycloak Ingress (auth.robotika.cloud)
kubectl apply -f k8s/core/auth/keycloak-ingress.yaml

# CORS Middleware (required for Traefik)
kubectl apply -f k8s/core/networking/cors-middleware.yaml

# Auth Certificate
kubectl apply -f k8s/core/networking/certificate-auth.yaml

# Bootstrap Admin User
kubectl apply -f k8s/core/bootstrap/bootstrap-tenant-and-admin-job.yaml
```

### Keycloak 26 User Requirements

> **Important**: Keycloak 26+ requires `firstName` and `lastName` to be set on users.
> The bootstrap job handles this automatically, but manually created users must have these fields.

Bootstrap user credentials (from `bootstrap-secret`):
- **Email**: Value of `admin-email` in secret
- **Password**: Value of `admin-password` in secret (must include special char)
- **Default**: `admin@yourdomain.com` / `<your-secure-password>`

### Step-by-Step Deploy (Legacy/Dev)

```bash
# 1. Build images with tags
./scripts/build-and-tag-images.sh ndvi-worker --push

# 2. Deploy safely (preserves all data)
./scripts/deploy-service-safe.sh ndvi-worker

# 3. Verify deployment
./scripts/verify-deployment.sh ndvi-worker <image-tag>
```

### Build Options

```bash
# Build without cache (clean build)
./scripts/build-and-tag-images.sh ndvi-worker --no-cache

# Build and push to registry
./scripts/build-and-tag-images.sh ndvi-worker --push

# Build all services
./scripts/build-images.sh
```

## Service Architecture

### Active Services

- **Core**: `api-gateway`, `entity-manager`, `tenant-user-api`, `tenant-webhook`
- **Identity**: `keycloak`
- **Data**: `postgresql` (TimescaleDB), `mongodb` (IoT Registry), `redis` (Cache/Queue), `minio` (Object Storage)
- **IoT & Telemetry**: `telemetry-worker`, `orion-ld`, `iot-agent-json`, `n8n`
- **Intelligence**: `intelligence-service` (AI/ML), `risk-api`
- **Frontend**: `frontend-static` (Nginx serving from MinIO)
- **Infrastructure**: `mosquitto` (MQTT Broker)

### Removed / Deprecated Services

- ❌ `sensor-ingestor` (Replaced by `telemetry-worker`)
- ❌ `ndvi-service` (Legacy API removed)
- ❌ `ndvi-worker` (Legacy worker removed)
- ❌ `api-validator`

## What Gets Preserved

### ✅ Always Preserved

- **PVCs (PersistentVolumeClaims)**: Database data, MinIO data, etc.
- **Secrets**: All credentials and API keys
- **ConfigMaps**: Configuration data
- **Database Data**: All tables and records
- **Service Accounts**: RBAC configurations

### 🔄 Updated Safely

- **Deployments**: Container images updated via rolling update
- **Image Tags**: New images deployed without downtime
- **ConfigMaps**: Updated if changed in Git

## Safety Guarantees

### kubectl apply Behavior

`kubectl apply` is **non-destructive** for:
- PVCs: Only updated if spec changes (data never touched)
- Secrets: Only updated if data changes (existing values preserved)
- Deployments: Rolling update (zero downtime)

### What We Do

1. **Build** with unique tags
2. **Import** to k3s (if local)
3. **Update** deployment image (rolling update)
4. **Verify** pod is using correct image
5. **Preserve** all existing data

### What We Never Do

- ❌ Delete PVCs
- ❌ Delete Secrets
- ❌ Delete ConfigMaps
- ❌ Drop database tables
- ❌ Remove data

## Troubleshooting

### Image Not Updating

```bash
# Check current image
kubectl get deployment ndvi-worker -n nekazari -o jsonpath='{.spec.template.spec.containers[0].image}'

# Force image pull
kubectl patch deployment ndvi-worker -n nekazari -p '{"spec":{"template":{"spec":{"containers":[{"name":"ndvi-worker","imagePullPolicy":"Always"}]}}}}'

# Restart deployment
kubectl rollout restart deployment/ndvi-worker -n nekazari
```

### Verify Image in Pod

```bash
# Get pod image
kubectl get pod <pod-name> -n nekazari -o jsonpath='{.spec.containers[0].image}'

# Get image ID
kubectl get pod <pod-name> -n nekazari -o jsonpath='{.status.containerStatuses[0].imageID}'
```

### Check Deployment Status

```bash
# Deployment status
kubectl rollout status deployment/ndvi-worker -n nekazari

# Pod status
kubectl get pods -n nekazari -l app=ndvi-worker

# Recent events
kubectl get events -n nekazari --sort-by='.lastTimestamp' | grep ndvi-worker
```

## Rollback

### Rollback to Previous Tag

```bash
# Find previous tag
cat .deploy/ndvi-worker-tag.txt

# Deploy previous version
./scripts/deploy-service-safe.sh ndvi-worker v<previous-tag>
```

### Rollback via kubectl

```bash
# View rollout history
kubectl rollout history deployment/ndvi-worker -n nekazari

# Rollback to previous revision
kubectl rollout undo deployment/ndvi-worker -n nekazari
```

## Best Practices

1. **Always use tags**: Never deploy `latest` in production
2. **Verify after deploy**: Run verification script
3. **Check logs**: Verify application is working
4. **Keep tag files**: `.deploy/*-tag.txt` files track versions
5. **Document changes**: Commit tag files with changes

## Migration from Old Scripts

### Old Way (deprecated)

```bash
docker build -t nekazari-ndvi-worker:latest ...
docker save ... | k3s ctr images import -
kubectl rollout restart deployment/ndvi-worker
```

### New Way (recommended)

```bash
./scripts/build-and-tag-images.sh ndvi-worker --push
./scripts/deploy-service-safe.sh ndvi-worker
./scripts/verify-deployment.sh ndvi-worker <tag>
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build and Deploy
  run: |
    ./scripts/build-and-tag-images.sh all --push
    ./scripts/deploy-service-safe.sh ndvi-worker
    ./scripts/verify-deployment.sh ndvi-worker $(cat .deploy/ndvi-worker-tag.txt)
```

## FAQ

### Will this delete my database?

**No.** PVCs are never deleted by `kubectl apply`. Database data is always preserved.

### Will this delete my secrets?

**No.** Secrets are only updated if you change them. Existing values are preserved.

### Can I run this multiple times?

**Yes.** The scripts are idempotent and safe to run multiple times.

### What if the deployment fails?

The scripts will exit with an error code. Your existing deployment remains unchanged.

### How do I know which image is deployed?

Check the tag file: `cat .deploy/ndvi-worker-tag.txt`

Or check the pod: `kubectl get pod <name> -o jsonpath='{.spec.containers[0].image}'`
