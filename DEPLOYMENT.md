# Nekazari Platform Deployment Guide

This document provides a comprehensive guide to deploying, maintaining, and troubleshooting the Nekazari platform on Kubernetes.

## 1. Principles & GitOps

We follow a **GitOps** approach with ArgoCD. We prioritize:
1.  **Configuration as Code:** All changes (Env vars, Image tags, replicas) MUST be made in the YAML files in `k8s/` and committed to Git.
2.  **No Ad-Hoc Changes:** Avoid `kubectl edit`. If you change it on the server, update the file in Git immediately.
3.  **Secrets Management:** Sensitive data matches the `k8s/k3s-optimized/*-secrets.yaml` structure but values are base64 encoded manually or via scripts.

## 2. Installation & Bootstrap

### 2.1. Prerequisites
*   **Cluster:** K3s (recommended) or standard Kubernetes.
*   **Resources:** Min 4 CPU / 8GB RAM.
*   **Domain:** Wildcard DNS (e.g., `*.robotika.cloud`) pointing to the Ingress Controller LoadBalancer.

### 2.2. Deployment Steps
1.  **Clone Repository:**
    ```bash
    git clone https://github.com/k8-benetis/nekazari-public.git
    cd nekazari-public
    ```
2.  **Run Deploy Script:**
    ```bash
    ./scripts/deploy-platform.sh
    ```
    *   Installs dependencies (K3s).
    *   Applies all Secrets, ConfigMaps, and Services.
    *   Bootstraps Keycloak and Databases.
    *   **Deploys all services including `cadastral-api`** (automatically pulls latest image from GitHub Container Registry).

3.  **Apply Database Migrations (CRITICAL):**
    **⚠️ ALWAYS run this after deployment to ensure all tables exist!**
    ```bash
    ./scripts/apply-database-migrations.sh
    ```
    This script:
    - Updates the ConfigMap with all migration files
    - Creates and runs the migration job
    - Waits for completion and shows logs
    - Ensures all tables (`tenants`, `api_keys`, `farmers`, etc.) are created
    
    **Without this step, the platform will fail with errors like:**
    - `relation "tenants" does not exist`
    - `function set_current_tenant(unknown) does not exist`
    - Other missing table/function errors

4.  **Bootstrap Admin User:**
    The script runs `bootstrap-tenant-and-admin-job.yaml`. To retrieve the generated password:
    ```bash
    kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' | base64 -d
    ```
    
    **SDM Secrets (IoT Agent, MongoDB)**
    Run helper script:
    `./scripts/generate-sdm-secrets.sh`
    
    **JWT Secret**
    ```bash
    kubectl create secret generic jwt-secret \
      --from-literal=secret='YOUR_JWT_SECRET_MIN_32_CHARS' \
      -n nekazari
    ```

## 3. Operations & Maintenance

### 3.1. Updating Images
**Note:** Images are now built and pushed to GitHub Container Registry via GitHub Actions. For local development:

1.  **Build & Push to Registry (Production):**
    - Images are automatically built via GitHub Actions on push
    - Check `.github/workflows/docker-build.yml` for build configuration
    - Images are tagged as `ghcr.io/k8-benetis/nekazari-public/<service-name>:latest`
    - **For fresh deployments:** Images are automatically pulled from registry (no manual build needed)

2.  **Local Development (Not Recommended for Production):**
    ```bash
    ./scripts/build-images.sh
    ```
    *(Note: On K3s this script imports images directly to containerd via `k3s ctr`)*.
    - Then set `imagePullPolicy: Never` in deployment (temporary only)
    - **Remember to revert to `Always` and use registry images for production!**

    **Environment Variables for Build:**
    The `build-images.sh` script does not require environment variables. However, if you need to pass build-time variables to Docker builds, you can:
    
    - **For the Host build (monorepo):** The Dockerfile uses multi-stage builds and doesn't require build args by default. If you need to customize the build:
      ```bash
      docker build \
        --build-arg NODE_ENV=production \
        --build-arg VITE_API_URL=https://api.example.com \
        -f apps/host/Dockerfile \
        -t nekazari/host:latest .
      ```
      Note: Vite variables must be prefixed with `VITE_` to be available in the frontend.
    
    - **For service builds:** Most service Dockerfiles don't require build args. Check individual Dockerfiles if you need to pass specific variables.
    
    - **Registry credentials:** If pushing to a registry, ensure you're logged in:
      ```bash
      echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
      ```

3.  **Restart Service After Image Update:**
    ```bash
    kubectl rollout restart deployment <deployment-name> -n nekazari
    ```
    
    **For cadastral-api specifically (after code changes):**
    ```bash
    # Option 1: Use automated script (recommended)
    ./scripts/deploy-cadastral-api.sh
    
    # Option 2: Manual rollout
    kubectl rollout restart deployment/cadastral-api -n nekazari
    ```
    
    **Note:** The `cadastral-api` service is automatically deployed as part of the complete platform deployment (see Section 2.2). For updates after initial deployment, use the script above or manual rollout.

### 3.2. Building and Deploying the Frontend Host (Monorepo)

**Context:** The frontend is now part of a monorepo structure with shared packages (`@nekazari/sdk`, `@nekazari/ui-kit`). The build process requires access to the entire workspace context.

#### Building the Host Image

**Important:** The Dockerfile for the host must be executed from the **root of the repository** because it needs access to:
- `package.json` and `pnpm-lock.yaml` (workspace root)
- `pnpm-workspace.yaml` (workspace configuration)
- `packages/` directory (shared libraries)
- `turbo.json` (build orchestration)

**Build Command:**
```bash
# From repository root
docker build -f apps/host/Dockerfile -t nekazari/host:latest .
```

**What the build does:**
1. **Stage 1 (deps):** Installs pnpm and all workspace dependencies
2. **Stage 2 (build-packages):** Builds `@nekazari/sdk` and `@nekazari/ui-kit` packages
3. **Stage 3 (build-host):** Builds the host application using the compiled packages
4. **Stage 4 (production):** Creates Nginx image serving the static files

**Using the build script:**
```bash
# The build-images.sh script now includes the host
./scripts/build-images.sh
```

This will build all services including the host. The host build uses the Dockerfile at `apps/host/Dockerfile` with the repository root as context.

#### Local Development Build

For local development and testing:

```bash
# From repository root
cd apps/host
pnpm install  # Install all workspace dependencies
pnpm build    # Build the host application
```

**Note:** The build process requires:
- `pnpm` installed globally or via `npm install -g pnpm`
- All workspace dependencies installed (run `pnpm install` from root)
- Packages (`@nekazari/sdk`, `@nekazari/ui-kit`) must be built first if using `turbo run build`

#### Deployment Considerations

**For Kubernetes Deployment:**
1. Build and push the image to your registry:
   ```bash
   docker build -f apps/host/Dockerfile -t ghcr.io/k8-benetis/nekazari-public/host:latest .
   docker push ghcr.io/k8-benetis/nekazari-public/host:latest
   ```

2. Update the deployment YAML to use the new image:
   ```yaml
   image: ghcr.io/k8-benetis/nekazari-public/host:latest
   imagePullPolicy: Always
   ```

3. Apply the deployment:
   ```bash
   kubectl apply -f k8s/k3s-optimized/host-deployment.yaml
   kubectl rollout restart deployment/host -n nekazari
   ```

**Nginx Configuration:**
The Dockerfile includes a basic Nginx configuration optimized for SPAs:
- All routes redirect to `index.html` (for client-side routing)
- Static assets cached for 1 year
- `index.html` has no-cache headers (for updates)
- Gzip compression enabled

To customize Nginx, create `apps/host/nginx.conf` and uncomment the COPY line in the Dockerfile.

#### Troubleshooting Build Issues

**Error: "Cannot find module '@nekazari/sdk'"**
- **Cause:** Packages not built or not accessible in workspace
- **Fix:** Ensure you're building from repository root and packages are built first:
  ```bash
  pnpm --filter @nekazari/sdk build
  pnpm --filter @nekazari/ui-kit build
  pnpm --filter nekazari-frontend build
  ```

**Error: "pnpm-workspace.yaml not found"**
- **Cause:** Docker context is not repository root
- **Fix:** Ensure you run `docker build` from repository root with `-f apps/host/Dockerfile .`

**Error: "Module not found" during build**
- **Cause:** Dependencies not installed or workspace not properly linked
- **Fix:** Run `pnpm install` from repository root before building

**Build is slow:**
- **Cause:** Not using Docker layer caching effectively
- **Fix:** The Dockerfile is optimized with multi-stage builds. Ensure Docker BuildKit is enabled:
  ```bash
  DOCKER_BUILDKIT=1 docker build -f apps/host/Dockerfile -t nekazari/host:latest .
  ```

### 3.3. Keycloak Configuration Updates

#### Protocol Mappers Configuration
Keycloak Protocol Mappers define what claims are included in JWT tokens. These mappers are managed via GitOps.

**When to Update:**
- After deploying new code that adds/modifies protocol mappers
- When adding new OIDC claims to tokens
- After realm configuration changes

**How to Apply Protocol Mapper Updates:**

1. **Apply the update-realm-mappers job:**
   ```bash
   kubectl apply -f k8s/keycloak/update-realm-mappers-job.yaml
   kubectl wait --for=condition=complete job/keycloak-update-mappers -n nekazari --timeout=300s
   kubectl logs job/keycloak-update-mappers -n nekazari
   ```

2. **Verify mappers are applied:**
   Check logs to confirm all mappers were created/updated successfully.

**Current Client Scopes for `nekazari-frontend` client:**
- `basic`: Contains the `sub` claim mapper (OIDC standard, required for user identification)
- `profile`: User profile information (firstName, lastName, etc.)
- `email`: User email address
- `roles`: Realm roles
- `web-origins`: Web origins configuration
- `role_list`: Role list
- `tenant-id`: Custom tenant ID scope

**Current Protocol Mappers for `nekazari-frontend` client:**
- `realm-roles`: Maps realm roles to `realm_access.roles` claim
- `tenant-id-mapper`: Maps user tenant attribute to `tenant_id` claim
- `groups`: Maps user groups to `groups` claim
- `group-tenant-attributes-mapper`: Script-based mapper for tenant attributes from groups

**⚠️ IMPORTANT:** The `basic` client scope is critical - it includes the `sub` claim mapper required by backend services. Without it, endpoints like `/api/tenant/users/me` will fail with "Token missing user identifier" errors.

**Migration History:**
- **2025-12-13**: Added `basic` client scope to ensure OIDC compliance and enable user profile updates
  - **Reason:** In Keycloak 21+, the `sub` claim is included via the `basic` client scope (not automatically)
  - **Solution:** Assign `basic` scope to `nekazari-frontend` client (standard approach, better than custom mappers)
  - **Impact:** All users need to log out and log back in to get tokens with `sub` claim
  - **Affected Services:** `tenant-user-api`, `entity-manager`, `sdm-integration`

### 3.4. Database Schema Updates
**⚠️ CRITICAL: Always run migrations after deployment or when adding new migrations!**

#### Critical Migrations (Must Run):
The following migrations are **ESSENTIAL** and must run in order:

1. **001_complete_schema.sql** - Creates all core tables:
   - `tenants`, `api_keys`, `farmers`, `users`, `devices`, `telemetry`, `commands`
   - Base functions and triggers

2. **004-create-activation-codes.sql** - Creates activation codes system:
   - `activation_codes` table
   - Code generation functions

3. **004_enable_rls.sql** - Enables Row-Level Security:
   - Creates initial RLS helper functions: `set_current_tenant(TEXT)`, `get_current_tenant()`
   - Enables RLS policies on all tenant-isolated tables
   - **CRITICAL:** Functions must have PUBLIC permissions for RLS to work
   - **Note:** Migration 020_ensure_set_current_tenant_function.sql provides a safety net if these functions are missing

4. **008_add_email_to_tenants.sql** - Adds email to tenants:
   - Adds `email` column to `tenants` table
   - **CRITICAL:** Must run before 009

   - `ndvi_jobs` table for job tracking (status, parameters, geometry, progress)
   - `ndvi_results` table for NDVI calculation results
   - RLS policies for tenant isolation
   - **Dependencies:** Requires `004_enable_rls.sql` for RLS functions

   - `cadastral_parcels` table for parcel management (PostGIS geometry, area calculation)
   - GeoServer views for WMS/WFS layers
   - RLS policies for tenant isolation
   - **Without this migration:** Parcel metadata queries fail, may cause 500 errors
   - **Dependencies:** Requires PostGIS extension and `004_enable_rls.sql`

   - `catalog_municipalities` table (Spanish municipalities with INE codes, AEMET IDs, coordinates)
   - `tenant_weather_locations` table (tenant-specific weather station bindings)
   - `weather_observations` hypertable (TimescaleDB) for weather data storage
   - `sensor_profiles` table (sensor type catalog)
   - RLS policies for tenant isolation
   - **Without this migration:** Errors like "relation catalog_municipalities does not exist" or "relation weather_observations does not exist"
   - **Dependencies:** Requires PostGIS extension, TimescaleDB, and `004_enable_rls.sql`
   - **For fresh deployments:** Must run before weather data collection and municipality-based features

   - Adds multi-source support to `weather_observations` (OPEN-METEO, AEMET, SENSOR_REAL)
   - Adds forecast/history data type support
   - Adds agricultural metrics (ET₀, GDD, soil moisture, solar radiation)
   - Creates `weather_observations_latest` view for latest data per tenant/municipality
   - **IMPORTANT:** Enhances weather data quality and agricultural intelligence
   - **Dependencies:** Requires `010_sensor_ingestion_schema.sql` (weather_observations table must exist)
   - **For fresh deployments:** Should run after 010 for complete weather functionality

9. **021_add_ndvi_jobs_columns.sql** - Adds missing columns to ndvi_jobs:
   - Adds `geometry`, `area_hectares`, `job_type` columns
   - **CRITICAL:** Required for manual geometry jobs

10. **022_add_ndvi_jobs_progress.sql** - Adds progress tracking to ndvi_jobs:
   - Adds `progress_message` column for current processing stage
   - Adds `estimated_duration_seconds` column for time estimation

11. **023_parcel_ndvi_history.sql** - Adds time-series storage (opt-in time_series mode):
   - Creates hypertable `parcel_ndvi_history` with UNIQUE (job_id, time, parcel_id)
   - Stores per-window NDVI samples (time-chunking) for opt-in time_series mode
   - Idempotent; uses TimescaleDB hypertable

   - **Note:** NDVI legacy module remains active and functional - both modules can coexist
   - **Dependencies:** Requires `024_module_federation_registry.sql` (marketplace_modules table must exist)
   - **For fresh deployments:** Should run after 024 to register the module

13. **034_add_source_module_to_ndvi_tables.sql** - **IMPORTANT for Module Distinction:** Adds source tracking to NDVI tables:
   - Adds `source_module` column to `ndvi_jobs` and `ndvi_results` tables
   - **IMPORTANT:** Required to track which module created each job/result
   - **Enables:** Module-specific filtering, clean uninstallation, data migration
   - **Default:** Existing records get `source_module = 'ndvi'` (legacy)
   - **Dependencies:** Requires `006-create-ndvi-tables.sql` (tables must exist)
   - **For fresh deployments:** Should run after 006 to enable module tracking

   - Creates `vegetation_jobs` table (isolated from `ndvi_jobs`)
   - Creates `vegetation_results` table (isolated from `ndvi_results`)
   - **CRITICAL:** Enables clean module uninstallation without affecting other modules
   - **Features:** Multi-index support (`indices_requested` array), progress tracking, RLS policies
   - **Architecture:** Follows module development best practices (namespaced tables)
   - **Dependencies:** Requires `004_enable_rls.sql` for RLS functions
   - **For fresh deployments:** Should run after 004 to create isolated module tables
   - **See:** `docs/development/MODULE_DEVELOPMENT_BEST_PRACTICES.md` for reference implementation

5. **009_add_tenant_id_to_activation_codes.sql** - Links codes to tenants:
   - Adds `tenant_id` column to `activation_codes`
   - **CRITICAL:** Requires `tenants.email` column (from 008)

6. **006-create-ndvi-tables.sql** - Creates NDVI processing tables:
   - `ndvi_jobs` table (required for NDVI job creation)
   - `ndvi_results` table (stores NDVI calculation results)
   - RLS policies for tenant isolation
   - **CRITICAL:** Required for NDVI functionality - without this, NDVI jobs will fail with "relation ndvi_jobs does not exist"

7. **007_cadastral_parcels.sql** - Creates cadastral parcels management:
   - `cadastral_parcels` table (stores selected agricultural parcels)
   - PostGIS geometry support
   - GeoServer views for WMS/WFS layers
   - **CRITICAL:** Required for NDVI and parcel management - without this, parcel metadata lookup fails

8. **020_ensure_set_current_tenant_function.sql** - CRITICAL: RLS helper functions:
   - Creates `set_current_tenant(TEXT)` and `get_current_tenant()` functions
   - Grants PUBLIC execute permissions (required for RLS to work)
   - **CRITICAL:** Required by all services that interact with tenant-isolated data
   - **Without this migration:** Activation code generation, tenant creation, and all RLS-aware operations will fail with `function set_current_tenant(unknown) does not exist`

9. **024_module_federation_registry.sql** - Module Federation Registry:
   - Creates `marketplace_modules` table (catalog of available remote modules)
   - Creates `tenant_installed_modules` table (tenant-specific module installations)
   - RLS policies for tenant isolation and platform admin access
   - **CRITICAL:** Required for dynamic module loading in the Host application
   - **Without this migration:** `/api/modules/me` endpoint returns 404, module management fails
   - **Dependencies:** Requires `004_enable_rls.sql` for RLS functions
   - **Note on RLS Policies:** This migration uses `DROP POLICY IF EXISTS` + `CREATE POLICY` instead of `CREATE POLICY IF NOT EXISTS` for PostgreSQL compatibility (some versions don't support `IF NOT EXISTS` on policies)

**See `docs/MIGRATIONS_REFERENCE.md` for complete migration list and dependencies.**

#### When to Run Migrations:
- **After fresh deployments** (to create all tables)
- **After pulling new code** that includes migration files
- **When adding new tables or functions** to the database
- **After restoring from backup** (to ensure schema is up to date)

#### How to Run Migrations:

**⚠️ IMPORTANT for Fresh Deployments:**
- Migrations **MUST** run in order (001, 004, 006, 007, 008, 009, 020, etc.)
- For **fresh deployments from scratch**, run `./scripts/apply-database-migrations.sh` immediately after database initialization
- The migration job will execute all migrations in `config/timescaledb/migrations/` in numerical order
- **Critical migrations for NDVI:** 006, 007, 020, 021, 022 must all run successfully

**Method 1: Automated Script (RECOMMENDED)**
```bash
./scripts/apply-database-migrations.sh
```
This script automatically:
- Updates the ConfigMap with all migrations from `config/timescaledb/migrations/`
- Creates and runs the migration job
- Waits for completion (up to 5 minutes)
- Shows logs and exits with proper status codes
- Handles errors gracefully

**Method 2: Manual Steps (if script fails)**
```bash
# 1. Update ConfigMap with all migration files
kubectl create configmap postgresql-migrations \
    --from-file=config/timescaledb/migrations/ \
    -n nekazari \
    --dry-run=client -o yaml | kubectl apply -f -

# 2. Delete old migration job (if exists)
kubectl delete job db-migration -n nekazari --ignore-not-found

# 3. Apply migration job
kubectl apply -f k8s/db/migration-job.yaml

# 4. Wait and check status
kubectl wait --for=condition=complete --timeout=300s job/db-migration -n nekazari

# 5. View logs
kubectl logs -n nekazari job/db-migration --tail=50
```

#### Adding New Migrations:
1. Create a new SQL file in `config/timescaledb/migrations/` with format: `XXX_description.sql`
   - Use sequential numbers (e.g., `023_new_feature.sql`)
   - Use `CREATE TABLE IF NOT EXISTS` for idempotency
   - Use `CREATE OR REPLACE FUNCTION` for functions
   - Add comments explaining dependencies and importance
   - Include verification blocks (DO $$ blocks) to verify successful creation
2. Document the migration in this section (DEPLOYMENT.md) with:
   - What it creates/modifies
   - Dependencies (which migrations must run before it)
   - Importance level (CRITICAL, IMPORTANT, OPTIONAL)
   - What breaks if it's not applied
3. Commit and push to Git
4. Run `./scripts/apply-database-migrations.sh` to apply
5. Verify the migration succeeded:
   ```bash
   kubectl logs -n nekazari job/db-migration | grep -A 5 "XXX_description.sql"
   ```

#### Migration Best Practices:
- **Idempotency:** All migrations should be safe to run multiple times
- **Verification:** Include verification blocks to confirm successful execution
- **Dependencies:** Document which migrations must run first
- **Rollback:** Consider adding rollback scripts for critical migrations (optional)
- **Testing:** Test migrations in a development environment first
- **RLS Policies Compatibility:** When creating RLS policies, use `DROP POLICY IF EXISTS` + `CREATE POLICY` instead of `CREATE POLICY IF NOT EXISTS`:
  - **Reason:** PostgreSQL < 9.5 and some TimescaleDB versions don't support `IF NOT EXISTS` on `CREATE POLICY`
  - **Pattern:** Always drop the policy first (idempotent), then create it
  - **Example:**
    ```sql
    DROP POLICY IF EXISTS policy_name ON table_name;
    CREATE POLICY policy_name ON table_name FOR SELECT USING (...);
    ```
  - **See:** Migration `024_module_federation_registry.sql` for reference implementation

#### Common Issues:
- **"relation does not exist"**: Run migrations - tables haven't been created yet
  - Most common: `tenants`, `activation_codes`, `api_keys`, `ndvi_jobs`, `cadastral_parcels`
  - **Fix:** Run `./scripts/apply-database-migrations.sh`
  
- **"function set_current_tenant(unknown) does not exist"**: RLS functions missing
  - **Symptom:** Errors when creating activation codes, tenants, or accessing tenant-isolated data
  - **Cause:** Migration 020_ensure_set_current_tenant_function.sql hasn't been executed
  - **Fix:** Run `./scripts/apply-database-migrations.sh` (ensures migration 020 is applied)
  - **Manual Fix (if needed):**
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari < config/timescaledb/migrations/020_ensure_set_current_tenant_function.sql
    ```
  - **Verify:** 
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\df set_current_tenant"
    ```
    Should show function with signature `set_current_tenant(tenant text)`
  - **Check Permissions:**
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "SELECT proname, proacl FROM pg_proc WHERE proname = 'set_current_tenant';"
    ```
    `proacl` should be NULL (default PUBLIC) or contain `=X` (PUBLIC execute permission)
  
- **"column tenant_id does not exist"**: Migration 009 hasn't run
  - **Fix:** Run `./scripts/apply-database-migrations.sh`
  - **Verify:** `\d activation_codes` should show `tenant_id` column
  
- **"column email does not exist" in tenants**: Migration 008 hasn't run
  - **Fix:** Run `./scripts/apply-database-migrations.sh`
  - **Verify:** `\d tenants` should show `email` column
  
- **"relation ndvi_jobs does not exist"**: Migration 006 hasn't run
  - **Error:** `Failed to create job: relation "ndvi_jobs" does not exist` (500 error on `POST /api/ndvi/jobs`)
  - **Cause:** Migration `006-create-ndvi-tables.sql` hasn't been executed
  - **Fix:** Run `./scripts/apply-database-migrations.sh` or manually apply:
    ```bash
    kubectl cp config/timescaledb/migrations/006-create-ndvi-tables.sql nekazari/<postgres-pod>:/tmp/
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/006-create-ndvi-tables.sql
    ```
  - **Verify:** 
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\dt ndvi_jobs"
    ```
  - **Dependencies:** Requires `004_enable_rls.sql` for RLS policies

- **"relation catalog_municipalities does not exist"**: Migration 010 hasn't run
  - **Error:** `relation "catalog_municipalities" does not exist` (500 error on municipality lookups)
  - **Symptom:** Weather data, municipality searches, and some entity-manager endpoints fail
  - **Cause:** Migration `010_sensor_ingestion_schema.sql` hasn't been executed
  - **Fix:** Run `./scripts/apply-database-migrations.sh` or manually apply:
    ```bash
    cat config/timescaledb/migrations/010_sensor_ingestion_schema.sql | kubectl exec -i -n nekazari deployment/postgresql -- psql -U postgres -d nekazari
    ```
  - **Verify:** 
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\dt catalog_municipalities"
    ```
  - **Dependencies:** Requires PostGIS extension and `004_enable_rls.sql`

- **"relation weather_observations does not exist"**: Migration 010 hasn't run
  - **Error:** `relation "weather_observations" does not exist` (500 error on weather endpoints)
  - **Symptom:** Weather data endpoints fail, weather worker cannot store data
  - **Cause:** Migration `010_sensor_ingestion_schema.sql` hasn't been executed
  - **Fix:** Same as above (010 creates both catalog_municipalities and weather_observations)
  - **Verify:** 
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\dt weather_observations"
    ```

- **"relation cadastral_parcels does not exist"**: Migration 007 hasn't run
  - **Error:** `Unable to fetch parcel metadata: relation "cadastral_parcels" does not exist` (warning in logs, but may cause 500 if parcel lookup is required)
  - **Symptom:** NDVI jobs may fail if they need to fetch parcel metadata
  - **Cause:** Migration `007_cadastral_parcels.sql` hasn't been executed
  - **Fix:** Run `./scripts/apply-database-migrations.sh` or manually apply:
    ```bash
    kubectl cp config/timescaledb/migrations/007_cadastral_parcels.sql nekazari/<postgres-pod>:/tmp/
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/007_cadastral_parcels.sql
    ```
  - **Verify:** 
    ```bash
    kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\dt cadastral_parcels"
    ```
  - **Dependencies:** Requires PostGIS extension and `004_enable_rls.sql`
  
- **"column progress_message does not exist" in ndvi_jobs**: Migration 022 hasn't run
  - **Error:** `Error listing NDVI jobs: column "progress_message" does not exist`
  - **Fix:** Run `./scripts/apply-database-migrations.sh` or manually apply `022_add_ndvi_jobs_progress.sql`
  - **Verify:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'ndvi_jobs' AND column_name = 'progress_message';`
  - **Note:** This migration adds `progress_message` and `estimated_duration_seconds` columns for NDVI job progress tracking
  
- **Migration job fails**: Check logs with `kubectl logs -n nekazari job/db-migration`
  - Some migrations may fail if already applied (idempotent) - this is OK
  - Check for actual errors vs. expected "already exists" messages
  
- **ConfigMap not updated**: Re-run the script or manually update ConfigMap
  - **Fix:** `kubectl create configmap postgresql-migrations --from-file=config/timescaledb/migrations/ -n nekazari --dry-run=client -o yaml | kubectl apply -f -`

- **"syntax error at or near NOT" when creating RLS policies**: PostgreSQL version incompatibility
  - **Symptom:** Migration fails with `ERROR: syntax error at or near "NOT"` on `CREATE POLICY IF NOT EXISTS`
  - **Cause:** PostgreSQL < 9.5 or TimescaleDB versions don't support `IF NOT EXISTS` clause on `CREATE POLICY`
  - **Fix:** Use `DROP POLICY IF EXISTS` + `CREATE POLICY` pattern instead (see Migration Best Practices above)
  - **Example Fix:**
    ```sql
    -- ❌ Wrong (not compatible with all PostgreSQL versions):
    CREATE POLICY IF NOT EXISTS policy_name ON table_name FOR SELECT USING (...);
    
    -- ✅ Correct (compatible):
    DROP POLICY IF EXISTS policy_name ON table_name;
    CREATE POLICY policy_name ON table_name FOR SELECT USING (...);
    ```
  - **Reference:** Migration `024_module_federation_registry.sql` uses the correct pattern

#### Migration Execution Order:
Migrations are executed in **numerical/alphabetical order** (using `sort -V` for version sorting):
1. `001_complete_schema.sql` - **MUST RUN FIRST** (creates all base tables)
2. `002_*.sql` through `003_*.sql` - Feature additions
3. `004-create-activation-codes.sql` - Activation codes (requires 001)
4. `004_enable_rls.sql` - Row-Level Security (requires 001)
5. `006-create-ndvi-tables.sql` - NDVI jobs and results tables
6. `006_ndvi_raster_storage.sql` - NDVI raster storage
7. `007_cadastral_parcels.sql` - Cadastral parcels table
8. `007-ndvi-manual-geometry.sql` - NDVI manual geometry support
9. `007_add_index_type_to_ndvi_jobs.sql` - NDVI index type column
10. `008_add_email_to_tenants.sql` - Email column in tenants
11. `008_update_rls_policies.sql` - RLS policy updates
12. `009_add_tenant_id_to_activation_codes.sql` - Tenant ID in activation codes
13. `010_sensor_ingestion_schema.sql` - Sensor ingestion tables
14. `010_tenant_invitations.sql` - Tenant invitations
15. `011_weather_module_agroclimatic_intelligence.sql` - Weather module
16. `012_admin_platform_schema.sql` - Admin platform schema
17. `013_simulation_schema.sql` - Simulation schema
18. `014_fix_ndvi_jobs_id_default.sql` - Fix NDVI jobs ID default
19. `018_add_multi_index_support.sql` - Multi-index support for NDVI
20. `020_ensure_set_current_tenant_function.sql` - **CRITICAL:** Ensure RLS functions exist with PUBLIC permissions (required for activation codes, tenant creation, all RLS-aware operations)
21. `021_add_ndvi_jobs_columns.sql` - Add geometry, area_hectares, job_type to ndvi_jobs
22. `022_add_ndvi_jobs_progress.sql` - Add progress tracking to ndvi_jobs (progress_message, estimated_duration_seconds)

**⚠️ IMPORTANT:** 
- The migration job uses `sort -V` which ensures proper version sorting
- Always name migrations with leading zeros (001, 002, 008, 009, 010, 020) to maintain correct order
- **Migration 008** (email column) now runs before **009** (tenant_id column) ensuring correct dependency order

## 4. Troubleshooting Guide

### 4.1. SSL Issues ("TRAEFIK DEFAULT CERT" / Security Warning)
**Symptom:** Browser shows warnings; Certificate issuer is "TRAEFIK DEFAULT CERT".
**Causes & Fixes:**
1.  **Missing Secrets:** If Ingress refs a secret that doesn't exist (e.g., `nekazari-tls`), Traefik rejects the *entire* config.
    *   *Fix:* Comment out invalid TLS blocks in `ingress.yaml` until you have the certs.
2.  **Traefik Cache:** Traefik sometimes holds onto old certs.
    *   *Fix (Operational):* Restart Traefik.
        ```bash
        kubectl rollout restart deployment traefik -n kube-system
        ```

### 4.2. Keycloak "Internal Server Error" (500)
**Symptom:** Login page fails or crashes.
**Causes & Fixes:**
1.  **Missing Schema:** Keycloak logs show `ERROR: relation "realm" does not exist`. This happens if Keycloak starts in `--optimized` mode without running migrations first.
    *   *Fix:* Edit `keycloak-deployment.yaml` to remove `--optimized` from `args`, deploy, and wait for startup. Then re-add it if desired.
2.  **Bootstrap Failed:** If `tenants` table is missing, the bootstrap job crashes.
    *   *Fix:* Run the DB Migration job (Section 3.4): `./scripts/apply-database-migrations.sh`

### 4.3. Keycloak Token Issues

#### Missing `sub` Claim in JWT Tokens
**Symptom:** Backend services return 401 "Token missing user identifier" or "Could not identify user"
**Causes & Fixes:**
1. **`basic` Client Scope Not Assigned:** In Keycloak 21+, the `sub` claim is included via the `basic` client scope
   * **Fix:** Ensure `basic` scope is assigned to `nekazari-frontend` client
     - **Automated:** Run the protocol mapper update job (see Section 3.3):
       ```bash
       kubectl apply -f k8s/keycloak/update-realm-mappers-job.yaml
       kubectl wait --for=condition=complete job/keycloak-update-mappers -n nekazari --timeout=300s
       ```
     - **Manual:** Keycloak Admin Console → Realm `nekazari` → Clients → `nekazari-frontend` → Client Scopes → Assign `basic` to Default Client Scopes
   * **Verify:** Check logs: `kubectl logs job/keycloak-update-mappers -n nekazari | grep "basic"`
   * **After fix:** Users must log out and log back in to get new tokens with `sub` claim

2. **Frontend Not Requesting `openid` Scope:** The frontend must request `openid` scope
   * **Verify:** Check frontend code uses `scope: 'openid'` in Keycloak init/login calls
   * **Status:** ✅ Already configured in `KeycloakAuthContext.tsx`

3. **Stale Tokens:** Existing tokens were issued before the scope was added
   * **Fix:** Users need to log out and log back in to get new tokens
   * **Verify:** Decode a new token: `jwt.decode(token, options={"verify_signature": False})` should show `sub` claim

4. **Client Scope Configuration Issue:** The `basic` scope exists but isn't assigned correctly
   * **Check:** Keycloak Admin Console → Realm `nekazari` → Clients → `nekazari-frontend` → Client Scopes
   * **Verify:** `basic` is listed under "Assigned Default Client Scopes"
   * **Fix:** Click "Add" next to Default Client Scopes and select `basic`

#### Missing Keycloak Roles (404 "Role not found")
**Symptom:** Users can log in but get "Access Denied" errors. Logs show `Failed to assign role TenantAdmin: 404 {"error":"Role not found"}`. User has only `default-roles-nekazari, offline_access, uma_authorization` roles.
**Causes & Fixes:**
1. **Roles Not Created:** After Keycloak restart with `--import-realm`, roles may not be imported correctly
   * **Root Cause:** When Keycloak starts with `--import-realm`, it only imports the realm if it doesn't exist. If the realm exists, roles from the JSON aren't automatically recreated.
   * **Fix Option A - Reset Realm (RECOMMENDED if starting fresh):**
     ```bash
     # This deletes the realm and reimports it (DELETES ALL USERS!)
     kubectl create configmap keycloak-realm-config \
       --from-file=nekazari-realm.json=k8s/keycloak/nekazari-realm.json \
       -n nekazari --dry-run=client -o yaml | kubectl apply -f -
     kubectl apply -f k8s/keycloak/reset-realm-job.yaml
     kubectl wait --for=condition=complete job/keycloak-reset-realm -n nekazari --timeout=180s
     kubectl logs -n nekazari job/keycloak-reset-realm
     ```
     - Deletes existing realm and reimports from `nekazari-realm.json`
     - Creates all roles: `TenantAdmin`, `Farmer`, `PlatformAdmin`, `TechnicalConsultant`, `DashboardViewer`
     - Verifies roles exist after import
   * **Fix Option B - Create Roles Only (if users must be preserved):**
     ```bash
     ./scripts/fix-keycloak-roles.sh [user-email]
     ```
     - Creates missing roles without deleting users
     - Optionally assigns `TenantAdmin` to a user if email provided
   * **Verify:** Check roles exist:
     - Keycloak Admin Console → Realm `nekazari` → Roles → Should see all required roles
     - Or check logs: `kubectl logs -n nekazari -l app=tenant-webhook | grep "Role not found"`
   * **After fix:** Users need to log out and log back in to get new tokens with roles
   * **Required Roles:** `TenantAdmin`, `Farmer`, `PlatformAdmin`, `TechnicalConsultant`, `DashboardViewer`
   * **Roles Source:** Defined in `k8s/keycloak/nekazari-realm.json` (lines 318-360)

#### User Profile Update Fails (401/500 Errors)
**Symptom:** `PUT /api/tenant/users/me` returns 401 or 500 when updating user name
**Causes & Fixes:**
1. **Missing `sub` claim:** See above section
2. **Token expired:** User needs to refresh or re-login
3. **Backend service not updated:** Ensure `tenant-user-api` is using latest code
   * **Fix:** `kubectl rollout restart deployment/tenant-user-api -n nekazari`




- **NDVI Legacy Module (`ndvi`):**
  - Route: `/ndvi`
  - Status: Active but deprecated (marked as `is_legacy: true`)
  - Functionality: Basic NDVI index only
  - Can be deactivated in Modules UI if desired

  - Route: `/vegetation`
  - Status: Active (recommended for new implementations)
  - Functionality: Multiple indices, pixel-level visualization, timeline analysis
  - Uses same backend endpoints (`/ndvi/jobs`, `/ndvi/results`) as NDVI legacy
  - **Independent:** Works independently of NDVI legacy module activation status



1. **006-create-ndvi-tables.sql** - Creates `ndvi_jobs` and `ndvi_results` tables
2. **007_cadastral_parcels.sql** - Creates `cadastral_parcels` table for parcel metadata
3. **010_sensor_ingestion_schema.sql** - Creates `catalog_municipalities` and `weather_observations` tables
4. **011_weather_module_agroclimatic_intelligence.sql** - Enhances weather observations
5. **021_add_ndvi_jobs_columns.sql** - Adds geometry and job_type columns
6. **022_add_ndvi_jobs_progress.sql** - Adds progress tracking

**Verification:**
```bash
# Check if module is registered
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c \

# Check if required tables exist
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('ndvi_jobs', 'catalog_municipalities', 'weather_observations') ORDER BY tablename;"
```

#### Common Issues

- **"503 Service Unavailable" on `/ndvi/jobs`:**
  - **Cause:** `POSTGRES_URL` not configured in entity-manager pod
  - **Fix:** Verify secret exists: `kubectl get secret postgresql-secret -n nekazari`
  - **Verify:** `kubectl exec -n nekazari deployment/entity-manager -- env | grep POSTGRES_URL`
  - **Restart:** `kubectl rollout restart deployment/entity-manager -n nekazari`

- **"relation catalog_municipalities does not exist":**
  - **Cause:** Migration 010 hasn't been applied
  - **Fix:** Apply migration 010 (see Section 3.4)
  - **Manual:** `cat config/timescaledb/migrations/010_sensor_ingestion_schema.sql | kubectl exec -i -n nekazari deployment/postgresql -- psql -U postgres -d nekazari`

- **"relation weather_observations does not exist":**
  - **Cause:** Migration 010 hasn't been applied
  - **Fix:** Same as above (010 creates both tables)

- **Module not appearing in Modules UI:**
  - **Cause:** Migration 033 hasn't been applied
  - **Fix:** Apply migration 033 or manually register:
    ```bash
    kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari <<'SQL'
    -- Check if module exists
    -- If empty, apply migration 033
    SQL
    ```

#### Module Activation/Deactivation

Both modules can be activated/deactivated independently via the Modules UI:
- **Recommendation:** Keep both active during transition period, then deactivate NDVI legacy once all users migrate

#### Shared Resources Warning ⚠️

- **Shared Tables:** `ndvi_jobs`, `ndvi_results`
- **Shared Endpoints:** `/ndvi/jobs`, `/ndvi/results`, `/ndvi/download/*`
- **Shared Backend:** `entity-manager` serves both modules

**Solution Implemented (Fase 2 - Complete Isolation):**
- ✅ Migration 035 creates isolated tables: `vegetation_jobs`, `vegetation_results`
- ✅ Module-specific endpoints: `/api/vegetation/*` (separate from `/ndvi/*`)
- ✅ Clean uninstallation: Can drop tables without affecting NDVI legacy
- ✅ Multi-index support: `indices_requested` array for multiple vegetation indices
- ✅ Progress tracking: `progress_message`, `estimated_duration_seconds` columns

**Architecture:**
- **NDVI Legacy:** Uses `ndvi_jobs`, `ndvi_results` tables, `/ndvi/*` endpoints
- **No conflicts:** Complete isolation between modules
- **Best Practice:** This is the reference implementation for all future modules

**Worker Processing:**
- The NDVI worker (`ndvi-worker`) processes jobs from both modules
- **Table Selection:** Automatically uses correct tables based on module:
  - `ndvi` (legacy) → `ndvi_jobs`, `ndvi_results`
- **Backward Compatibility:** Defaults to `ndvi` if module is not specified in payload

**Migration Path:**
- Migration 034 (optional): Adds `source_module` to legacy tables for tracking
- Frontend updated: Uses `/api/vegetation/*` endpoints
- Backend updated: New endpoints use `vegetation_*` tables
- Worker updated: Detects module and uses correct tables

**Verification:**
```bash
# Check source_module distribution
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c \
  "SELECT source_module, COUNT(*) FROM ndvi_jobs GROUP BY source_module;"
```

### 4.5. NDVI Job Creation Fails (500 Error - "relation does not exist")

**Symptom:** `POST /api/ndvi/jobs` returns 500 with error "relation ndvi_jobs does not exist" or "relation cadastral_parcels does not exist"

**Causes & Fixes:**

1. **Missing Migrations:** Migrations 006 and 007 haven't been executed
   * **Symptom:** Logs show `ERROR: relation "ndvi_jobs" does not exist` or `ERROR: relation "cadastral_parcels" does not exist`
   * **Fix:** Run database migrations (see Section 3.4):
     ```bash
     ./scripts/apply-database-migrations.sh
     ```
   * **Verify:** Check tables exist:
     ```bash
     kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\dt ndvi_jobs cadastral_parcels"
     ```
   * **Manual Fix (if migration job fails):**
     ```bash
     # Copy migration files to pod
     kubectl cp config/timescaledb/migrations/006-create-ndvi-tables.sql nekazari/<postgres-pod>:/tmp/
     kubectl cp config/timescaledb/migrations/007_cadastral_parcels.sql nekazari/<postgres-pod>:/tmp/
     
     # Execute migrations
     kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/006-create-ndvi-tables.sql
     kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/007_cadastral_parcels.sql
     ```

2. **RLS Function Issue:** `set_current_tenant` function not working correctly
   * **Symptom:** Tables exist but inserts fail with RLS policy errors
   * **Fix:** Ensure migration 020 is applied (see Section 3.4):
     ```bash
     kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f config/timescaledb/migrations/020_ensure_set_current_tenant_function.sql
     ```
   * **Verify:** Check function exists:
     ```bash
     kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\df set_current_tenant"
     ```

3. **Entity Manager Not Updated:** Service using old code that doesn't call `set_current_tenant`
   * **Symptom:** Logs show `Database error with tenant context` but no `set_current_tenant` call
   * **Fix:** Restart entity-manager to use latest code:
     ```bash
     kubectl rollout restart deployment/entity-manager -n nekazari
     ```
   * **Verify:** Check logs show `set_current_tenant` being called:
     ```bash
     kubectl logs -n nekazari -l app=entity-manager | grep "Set tenant context"
     ```

**Required Migrations for NDVI:**
- `006-create-ndvi-tables.sql` - Creates `ndvi_jobs` and `ndvi_results` tables
- `007_cadastral_parcels.sql` - Creates `cadastral_parcels` table
- `020_ensure_set_current_tenant_function.sql` - Ensures RLS functions work correctly
- `022_add_ndvi_jobs_progress.sql` - Adds progress tracking columns (optional but recommended)

### 4.5. Database Errors (Missing Tables/Functions)

#### Quick Verification Script
Before troubleshooting, run the verification script to check RLS function status:
```bash
./scripts/verify-rls-functions.sh
```

This script checks:
- Function existence (`set_current_tenant`, `get_current_tenant`)
- Function signatures (must be `tenant text`)
- PUBLIC execute permissions
- Function execution (test call)

**Symptom:** Errors like `relation "tenants" does not exist` or `function set_current_tenant(unknown) does not exist`.

**Causes & Fixes:**
1.  **Missing Tables:** Database migrations haven't been run after deployment.
    *   *Fix:* Run `./scripts/apply-database-migrations.sh` (see Section 3.4)
    *   *Verify:* Check tables exist: `kubectl exec postgresql-<pod> -n nekazari -- psql -U postgres -d nekazari -c "\dt tenants"`
    *   *Critical Tables:* `tenants`, `activation_codes`, `api_keys`, `farmers`, `users`, `devices`

2.  **Missing Functions:** RLS helper functions not created.
    *   **Symptom:** `function set_current_tenant(unknown) does not exist` when creating activation codes or accessing tenant data
    *   **Cause:** Migration 020_ensure_set_current_tenant_function.sql hasn't been executed, or migrations were skipped
    *   **Fix:** Run `./scripts/apply-database-migrations.sh` to apply all migrations (including 020)
    *   **Alternative:** Apply migration 020 manually if other migrations are up to date:
      ```bash
      kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/020_ensure_set_current_tenant_function.sql
      kubectl cp config/timescaledb/migrations/020_ensure_set_current_tenant_function.sql nekazari/$(kubectl get pod -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}'):/tmp/
      ```
    *   **Verify:** Check function exists with correct signature:
      ```bash
      kubectl exec -it deployment/postgresql -n nekazari -- psql -U postgres -d nekazari -c "\df set_current_tenant"
      ```
      Should show: `set_current_tenant(tenant text) -> void`
    *   **Required Functions:** `set_current_tenant(TEXT)`, `get_current_tenant()`
    *   **Dependencies:** None (migration 020 is standalone and idempotent)
    *   **Verification Script:** Run `./scripts/verify-rls-functions.sh` to check function status
    *   **Services Affected:** 
      - `tenant-webhook` (activation code generation)
      - `ndvi-service` (NDVI job creation)
      - `weather-worker` (tenant-isolated data access)
      - Any service that uses `set_current_tenant()` for RLS

3.  **Permission Errors:** Functions exist but lack PUBLIC permissions.
    *   *Fix:* Run migrations - permissions are granted in migration files
    *   *Manual Fix:* `GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO PUBLIC;`
    *   *Verify:* `SELECT proacl FROM pg_proc WHERE proname = 'set_current_tenant';` should show `=X` (PUBLIC execute)

4.  **Missing Columns:** Column errors like `column "tenant_id" does not exist`.
    *   *Fix:* Run specific migrations:
      - `tenant_id` in `activation_codes`: Run migration `009_add_tenant_id_to_activation_codes.sql`
      - `email` in `tenants`: Run migration `015_add_email_to_tenants.sql`
    *   *Verify:* `\d activation_codes` and `\d tenants` to check columns

### 4.5. Orion Context Broker Auth Failure
**Symptom:** Orion logs `Authentication failed` or `CrashLoopBackOff`, even with correct URI.
**Causes & Fixes:**
1.  **Password Mismatch:** The data in `/var/lib/nekazari/mongodb` was initialized with an old password, but `mongodb-secret` has a new one.
    *   *Fix (Secure Volume Wipe):*
        ```bash
        kubectl scale deployment mongodb -n nekazari --replicas=0
        # DANGER: Only on fresh installs!
        sudo rm -rf /var/lib/nekazari/mongodb/*
        kubectl scale deployment mongodb -n nekazari --replicas=1
        ```
        MongoDB will re-initialize with the correct password from the secret.

### 4.6. Image Pull Errors (`ErrImagePull`, `ImagePullBackOff`)
**Symptom:** Pods stuck waiting for image or showing `ErrImagePull`/`ImagePullBackOff`.

**Causes & Fixes:**
1.  **Images in GitHub Container Registry:** All images are now in `ghcr.io/k8-benetis/nekazari-public/`
    *   *Verify:* Check deployment has `imagePullSecrets: [name: ghcr-secret]`
    *   *Verify:* Check `imagePullPolicy: Always` is set
    *   *Fix:* Ensure `ghcr-secret` exists: `kubectl get secret ghcr-secret -n nekazari`

2.  **Missing Image Pull Secret:** Pod can't authenticate to GitHub Container Registry.
    *   *Fix:* Create secret if missing (should be created during deployment)
    *   *Verify:* `kubectl get secret ghcr-secret -n nekazari`

3.  **Image Not Built/Pushed:** Image doesn't exist in registry yet.
    *   *Fix:* Images are built via GitHub Actions. Check repository for build status.
    *   *Local Development:* Use `./scripts/build-images.sh` and set `imagePullPolicy: Never` (not recommended for production)

4.  **Network Issues:** Can't reach GitHub Container Registry.
    *   *Fix:* Check network connectivity, firewall rules, DNS resolution
