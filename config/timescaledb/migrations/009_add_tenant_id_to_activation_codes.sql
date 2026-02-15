-- Migration 009: Add tenant_id to activation_codes and seed tenants table
-- Purpose: ensure activation codes are explicitly linked to tenants so that
-- admin workflows (API key creation, dashboards, etc.) can resolve tenant
-- metadata without guessing from the email address.

BEGIN;

-- 1) Add tenant_id column if it does not exist yet
ALTER TABLE activation_codes
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- 2) Backfill tenant_id using the email local-part when missing
UPDATE activation_codes
SET tenant_id = COALESCE(
        NULLIF(tenant_id, ''),
        NULLIF(
            regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]+', '', 'g'),
            ''
        ),
        CONCAT('tenant', id)
    )
WHERE tenant_id IS NULL OR tenant_id = '';

-- 3) Create index to speed up lookups by tenant_id
CREATE INDEX IF NOT EXISTS idx_activation_codes_tenant_id
    ON activation_codes(tenant_id);

-- 4) Seed tenants table for any tenant_id discovered in activation_codes
-- Only if tenants table has email column (added in migration 008)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tenants' 
        AND column_name = 'email'
    ) THEN
        WITH latest_codes AS (
            SELECT DISTINCT ON (tenant_id)
                tenant_id,
                email,
                plan,
                expires_at,
                created_at
            FROM activation_codes
            WHERE tenant_id IS NOT NULL
            ORDER BY tenant_id, created_at DESC
        )
        INSERT INTO tenants (
            tenant_id,
            tenant_name,
            email,
            plan_type,
            status,
            expires_at
        )
        SELECT
            lc.tenant_id,
            COALESCE(
                INITCAP(NULLIF(regexp_replace(split_part(lc.email, '@', 1), '[^a-z0-9]+', ' ', 'g'), '')),
                lc.tenant_id
            ),
            CASE WHEN lc.email IS NOT NULL THEN lower(lc.email) ELSE NULL END,
            COALESCE(lc.plan::text, 'basic'),
            'active',
            lc.expires_at
        FROM latest_codes lc
        ON CONFLICT (tenant_id) DO UPDATE
        SET tenant_name = EXCLUDED.tenant_name,
            email = EXCLUDED.email,
            plan_type = EXCLUDED.plan_type,
            status = EXCLUDED.status,
            expires_at = EXCLUDED.expires_at;
    END IF;
END $$;

COMMIT;

