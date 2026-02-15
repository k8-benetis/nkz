# GitOps Database Migrations

## Overview

All database migrations are managed through GitOps. Migrations are stored in `config/timescaledb/migrations/` and are automatically applied during deployment.

## Migration Process

### 1. Migration Files

All SQL migration files are stored in:
```
config/timescaledb/migrations/
```

Migrations are numbered sequentially (e.g., `001_*.sql`, `002_*.sql`, `024_*.sql`) and are applied in order.

### 2. Automatic Application

Migrations are applied automatically via:
- **ConfigMap**: `postgresql-migrations` contains all migration files
- **Job**: `db-migration` job applies migrations in order
- **Script**: `scripts/apply-database-migrations.sh` orchestrates the process

### 3. Critical Tables Fallback

The migration job includes inline SQL for critical tables as a fallback:
- `ndvi_jobs` and `ndvi_results` (NDVI processing)
- `marketplace_modules` and `tenant_installed_modules` (Module Federation)

These are created if migrations fail or haven't been applied yet.

## Applying Migrations

### Manual Application

```bash
# From the repository root
bash scripts/apply-database-migrations.sh
```

This script:
1. Updates the `postgresql-migrations` ConfigMap with all migration files
2. Deletes old migration jobs
3. Creates a new migration job
4. Waits for completion

### Automatic Application

Migrations are automatically applied when:
- The `db-migration` job runs (triggered by deployment)
- The ConfigMap is updated with new migration files

## Key Migrations

### Migration 024: Module Federation Registry
- Creates `marketplace_modules` table
- Creates `tenant_installed_modules` table
- Required for `/gestión de módulos` page

### Migration 006: NDVI Tables
- Creates `ndvi_jobs` table
- Creates `ndvi_results` table
- Required for NDVI processing

## Verification

Check if migrations were applied:

```bash
# Check tables exist
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c "\dt"

# Check specific table
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres -d nekazari -c "\d marketplace_modules"
```

## Troubleshooting

### Migrations Not Applied

1. Check ConfigMap:
   ```bash
   kubectl get configmap postgresql-migrations -n nekazari -o jsonpath='{.data}' | jq 'keys | length'
   ```

2. Check migration job:
   ```bash
   kubectl get job db-migration -n nekazari
   kubectl logs -n nekazari job/db-migration
   ```

3. Apply manually:
   ```bash
   bash scripts/apply-database-migrations.sh
   ```

### Tables Missing

If critical tables are missing, the migration job includes fallback SQL that creates them automatically. Check the job logs to see if fallback creation was triggered.

## GitOps Best Practices

1. **Always commit migration files** before deploying
2. **Test migrations locally** if possible
3. **Use idempotent migrations** (IF NOT EXISTS, etc.)
4. **Document breaking changes** in migration comments
5. **Number migrations sequentially** to ensure correct order

## Future Deployments

All migrations are automatically applied on deployment:
- ConfigMap is updated with all migration files
- Migration job runs and applies all migrations in order
- Critical tables are created as fallback if needed

No manual intervention required for standard deployments.
