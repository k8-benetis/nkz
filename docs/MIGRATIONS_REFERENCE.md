# Database Migrations Reference

This document lists all database migrations and their dependencies. Migrations are executed in alphabetical/numerical order by filename.

## Critical Migrations (Must Run in Order)

### 001_complete_schema.sql
**Purpose:** Creates all core platform tables
**Creates:**
- `api_keys` - API key management
- `audit_log` - Audit trail
- `farmers` - Farmer accounts
- `users` - User accounts
- `devices` - IoT devices
- `telemetry` - TimescaleDB hypertable for sensor data
- `commands` - Device commands
- `tenants` - Tenant/organization management
- Functions: `update_updated_at_column()`, `generate_farmer_api_key()`
- Triggers for auto-updating timestamps

**Dependencies:** None (base schema)

---

### 004-create-activation-codes.sql
**Purpose:** Creates activation codes system for tenant registration
**Creates:**
- `activation_codes` table
- `farmer_activations` table (if farmers table exists)
- Types: `plan_type`, `code_status`
- Function: `generate_activation_code()`
- Indexes and permissions

**Dependencies:** Requires `farmers` table (from 001)

---

### 004_enable_rls.sql
**Purpose:** Enables Row-Level Security (RLS) and creates helper functions
**Creates:**
- Function: `set_current_tenant(TEXT)` - Sets tenant context for RLS
- Function: `get_current_tenant()` - Gets current tenant from context
- RLS policies on all tenant-aware tables
- Grants PUBLIC permissions on functions

**Dependencies:** Requires all tables from 001

**⚠️ CRITICAL:** This migration must run after 001, and functions must have PUBLIC permissions.

---

### 009_add_tenant_id_to_activation_codes.sql
**Purpose:** Links activation codes to tenants explicitly
**Modifies:**
- Adds `tenant_id TEXT` column to `activation_codes`
- Creates index on `tenant_id`
- Backfills tenant_id from email if missing
- Seeds tenants table from activation codes

**Dependencies:** 
- Requires `activation_codes` table (004-create-activation-codes.sql)
- Requires `tenants` table (001_complete_schema.sql)
- Requires `tenants.email` column (015_add_email_to_tenants.sql)

**⚠️ CRITICAL:** This migration checks for email column existence before seeding.

---

### 008_add_email_to_tenants.sql
**Purpose:** Adds email column to tenants table
**Modifies:**
- Adds `email TEXT` column to `tenants` table
- Creates index on email

**Dependencies:** Requires `tenants` table (001_complete_schema.sql)

**⚠️ CRITICAL:** Must run before 009 if 009 seeds tenants from activation codes.
**Note:** Renamed from 015 to 008 to ensure correct execution order (008 < 009).

---

### 020_ensure_set_current_tenant_function.sql
**Purpose:** Safety net to ensure RLS functions exist with correct permissions
**Creates/Updates:**
- Function: `set_current_tenant(TEXT)` with PUBLIC permissions
- Function: `get_current_tenant()` with PUBLIC permissions
- Verification checks

**Dependencies:** Can run independently (idempotent)

**⚠️ CRITICAL:** This is a safety net migration. Should not be needed if 004_enable_rls.sql runs correctly.

---

## Migration Execution Order

Migrations are executed in **alphabetical/numerical order** by filename. The `sort -V` command ensures proper version sorting:

1. `001_complete_schema.sql` - Base tables
2. `002_*.sql` - Various feature additions
3. `003-grant-api-keys-permissions.sql` - Permissions
4. `004-create-activation-codes.sql` - Activation codes
5. `004_enable_rls.sql` - RLS and helper functions
6. `005_*.sql` - Feature additions
7. `006_*.sql` - NDVI features
8. `007_*.sql` - Additional features
9. `008_update_rls_policies.sql` - RLS policy updates
10. `009_add_tenant_id_to_activation_codes.sql` - Tenant linking
11. `010_*.sql` - Sensor and tenant features
12. `011_*.sql` - Cleanup and weather
13. `012_*.sql` - Admin and weather
14. `013_*.sql` - Simulation and NDVI updates
15. `014_*.sql` - Fixes and risk management
16. `015_add_email_to_tenants.sql` - Email column
17. `016_grant_permissions.sql` - Permissions
18. `017_grant_all_permissions.sql` - More permissions
19. `018_add_multi_index_support.sql` - Multi-index support
20. `019_weather_delta_t_agro_metrics.sql` - Weather metrics
21. `020_ensure_set_current_tenant_function.sql` - Function safety net

---

## Common Issues and Solutions

### Issue: "relation X does not exist"
**Cause:** Migration 001 hasn't run or failed
**Solution:** Run `./scripts/apply-database-migrations.sh`

### Issue: "function set_current_tenant(unknown) does not exist"
**Cause:** Migration 004_enable_rls.sql or 020 hasn't run
**Solution:** Run migrations, ensure functions have PUBLIC permissions

### Issue: "column tenant_id does not exist"
**Cause:** Migration 009 hasn't run
**Solution:** Run `./scripts/apply-database-migrations.sh`

### Issue: "column email does not exist" in tenants
**Cause:** Migration 015 hasn't run
**Solution:** Run `./scripts/apply-database-migrations.sh`

---

## Verification Queries

After running migrations, verify critical components:

```sql
-- Check tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('tenants', 'activation_codes', 'api_keys', 'farmers');

-- Check functions exist
SELECT proname, pg_get_function_arguments(oid) 
FROM pg_proc 
WHERE proname IN ('set_current_tenant', 'get_current_tenant');

-- Check function permissions
SELECT proname, proacl 
FROM pg_proc 
WHERE proname = 'set_current_tenant';

-- Check activation_codes has tenant_id
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'activation_codes' 
AND column_name = 'tenant_id';

-- Check tenants has email
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tenants' 
AND column_name = 'email';
```
