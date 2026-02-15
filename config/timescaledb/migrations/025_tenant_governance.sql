-- =============================================================================
-- Migration 025: Tenant Governance and Module Tier System
-- =============================================================================
-- Implements tenant governance (administrative fields) and module tier system
-- for controlling module access based on tenant plan_type.
--
-- Key Principles:
-- 1. Limits remain in Orion-LD (TenantConfig) - PostgreSQL stores only metadata
-- 2. Uses existing plan_type nomenclature (basic, premium, enterprise)
-- 3. Separates module_type (CORE/ADDON) from category (functional: weather/analytics)
-- 4. Adds validation fields for module installation control
--
-- Dependencies: Requires 001_complete_schema.sql, 024_module_federation_registry.sql
-- =============================================================================

-- =============================================================================
-- 1. Tenant Administrative Fields
-- =============================================================================
-- Add administrative fields to tenants table
-- Note: Limits (max_users, max_robots, etc.) remain in Orion-LD for consistency
-- with FIWARE architecture. PostgreSQL stores only administrative metadata.

ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS contract_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS sales_contact TEXT,
  ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'standard';

-- Constraints for support_level
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS valid_support_level;
ALTER TABLE tenants
  ADD CONSTRAINT valid_support_level CHECK (
    support_level IS NULL OR support_level IN ('standard', 'priority', 'enterprise')
  );

-- Indexes for administrative queries
CREATE INDEX IF NOT EXISTS idx_tenants_contract_end_date ON tenants(contract_end_date) WHERE contract_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_billing_email ON tenants(billing_email) WHERE billing_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_support_level ON tenants(support_level);

-- Comments
COMMENT ON COLUMN tenants.contract_end_date IS 'Contract end date (may differ from expires_at which is for activation codes)';
COMMENT ON COLUMN tenants.billing_email IS 'Email for billing purposes (may differ from primary email)';
COMMENT ON COLUMN tenants.notes IS 'Administrative notes about the tenant';
COMMENT ON COLUMN tenants.sales_contact IS 'Sales representative or contact person';
COMMENT ON COLUMN tenants.support_level IS 'Support tier: standard, priority, enterprise';

-- =============================================================================
-- 2. Module Governance Fields
-- =============================================================================
-- Add governance fields to marketplace_modules
-- Separates module_type (CORE/ADDON) from category (functional classification)

ALTER TABLE marketplace_modules
  ADD COLUMN IF NOT EXISTS module_type TEXT DEFAULT 'ADDON_FREE',
  ADD COLUMN IF NOT EXISTS required_plan_type TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS installation_restrictions JSONB DEFAULT '{}'::jsonb;

-- Constraints
ALTER TABLE marketplace_modules
  DROP CONSTRAINT IF EXISTS valid_module_type;
ALTER TABLE marketplace_modules
  ADD CONSTRAINT valid_module_type CHECK (
    module_type IN ('CORE', 'ADDON_FREE', 'ADDON_PAID', 'ENTERPRISE')
  );

ALTER TABLE marketplace_modules
  DROP CONSTRAINT IF EXISTS valid_required_plan;
ALTER TABLE marketplace_modules
  ADD CONSTRAINT valid_required_plan CHECK (
    required_plan_type IS NULL OR required_plan_type IN ('basic', 'premium', 'enterprise')
  );

ALTER TABLE marketplace_modules
  DROP CONSTRAINT IF EXISTS valid_pricing_tier;
ALTER TABLE marketplace_modules
  ADD CONSTRAINT valid_pricing_tier CHECK (
    pricing_tier IS NULL OR pricing_tier IN ('FREE', 'PAID', 'ENTERPRISE_ONLY')
  );

-- Indexes for module governance queries
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_type ON marketplace_modules(module_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_required_plan ON marketplace_modules(required_plan_type) WHERE required_plan_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_pricing ON marketplace_modules(pricing_tier) WHERE pricing_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_type_active ON marketplace_modules(module_type, is_active) WHERE is_active = true;

-- Comments
COMMENT ON COLUMN marketplace_modules.module_type IS 'Module type: CORE (always available), ADDON_FREE (free addon), ADDON_PAID (paid addon), ENTERPRISE (enterprise only)';
COMMENT ON COLUMN marketplace_modules.required_plan_type IS 'Minimum plan_type required to install this module (NULL = all plans allowed)';
COMMENT ON COLUMN marketplace_modules.pricing_tier IS 'Pricing tier: FREE, PAID, ENTERPRISE_ONLY';
COMMENT ON COLUMN marketplace_modules.installation_restrictions IS 'JSONB with additional restrictions: {"max_installations_per_tenant": 1, "requires_approval": true, etc.}';
COMMENT ON COLUMN marketplace_modules.category IS 'Functional category (weather, analytics, iot) - different from module_type';

-- =============================================================================
-- 3. Helper Function: Check Module Installation Eligibility
-- =============================================================================
-- Function to check if a tenant can install a module based on plan_type
-- This can be called from application code or used in triggers/views

CREATE OR REPLACE FUNCTION can_install_module(
  p_tenant_plan_type TEXT,
  p_module_id TEXT
)
RETURNS TABLE(
  can_install BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_module marketplace_modules%ROWTYPE;
BEGIN
  -- Get module details
  SELECT * INTO v_module
  FROM marketplace_modules
  WHERE id = p_module_id;
  
  -- Module doesn't exist
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Module not found'::TEXT;
    RETURN;
  END IF;
  
  -- Module is not active
  IF NOT v_module.is_active THEN
    RETURN QUERY SELECT FALSE, 'Module is not active'::TEXT;
    RETURN;
  END IF;
  
  -- CORE modules are always available
  IF v_module.module_type = 'CORE' THEN
    RETURN QUERY SELECT TRUE, 'CORE module - always available'::TEXT;
    RETURN;
  END IF;
  
  -- Check required_plan_type
  IF v_module.required_plan_type IS NOT NULL THEN
    -- Define plan hierarchy: basic < premium < enterprise
    IF v_module.required_plan_type = 'enterprise' AND p_tenant_plan_type != 'enterprise' THEN
      RETURN QUERY SELECT FALSE, format('Module requires enterprise plan, tenant has %s', p_tenant_plan_type)::TEXT;
      RETURN;
    ELSIF v_module.required_plan_type = 'premium' AND p_tenant_plan_type NOT IN ('premium', 'enterprise') THEN
      RETURN QUERY SELECT FALSE, format('Module requires premium plan, tenant has %s', p_tenant_plan_type)::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT TRUE, 'Module can be installed'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_install_module IS 'Checks if a tenant with given plan_type can install a module. Returns can_install boolean and reason text.';

-- =============================================================================
-- 4. Update RLS Policies (if needed)
-- =============================================================================
-- RLS policies should already allow PlatformAdmin to see all modules
-- and tenants to see only active modules. No changes needed here.

-- =============================================================================
-- 5. Seed Data: Update Existing Modules
-- =============================================================================
-- Assign module_type and required_plan_type to existing modules
-- This is a best-effort assignment based on current understanding

-- Weather module: ADDON_FREE, available to all plans
UPDATE marketplace_modules
SET module_type = 'ADDON_FREE',
    required_plan_type = NULL,
    pricing_tier = 'FREE'
WHERE name ILIKE '%weather%' OR display_name ILIKE '%weather%';

-- NDVI module: ADDON_PAID, requires premium or enterprise
UPDATE marketplace_modules
SET module_type = 'ADDON_PAID',
    required_plan_type = 'premium',
    pricing_tier = 'PAID'
WHERE name ILIKE '%ndvi%' OR display_name ILIKE '%ndvi%';

-- Analytics/Grafana: ENTERPRISE only
UPDATE marketplace_modules
SET module_type = 'ENTERPRISE',
    required_plan_type = 'enterprise',
    pricing_tier = 'ENTERPRISE_ONLY'
WHERE name ILIKE '%analytics%' OR name ILIKE '%grafana%' OR display_name ILIKE '%analytics%';

-- Default: If not set, mark as ADDON_FREE
UPDATE marketplace_modules
SET module_type = 'ADDON_FREE',
    pricing_tier = 'FREE'
WHERE module_type IS NULL OR module_type = '';

-- =============================================================================
-- 6. Audit Log Table (Optional but Recommended)
-- =============================================================================
-- Track changes to tenant governance for audit purposes

CREATE TABLE IF NOT EXISTS tenant_governance_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_type TEXT NOT NULL, -- 'plan_change', 'contract_update', 'module_restriction', etc.
    old_values JSONB,
    new_values JSONB,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenant_governance_audit_tenant ON tenant_governance_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_governance_audit_changed_at ON tenant_governance_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_governance_audit_type ON tenant_governance_audit(change_type);

COMMENT ON TABLE tenant_governance_audit IS 'Audit log for tenant governance changes (plan changes, contract updates, etc.)';

-- Enable RLS on audit table
ALTER TABLE tenant_governance_audit ENABLE ROW LEVEL SECURITY;

-- Only PlatformAdmin can see audit logs
DROP POLICY IF EXISTS tenant_governance_audit_read ON tenant_governance_audit;
CREATE POLICY tenant_governance_audit_read ON tenant_governance_audit
    FOR SELECT
    USING (current_setting('app.current_tenant', true) = 'platform_admin');

-- =============================================================================
-- Migration Complete
-- =============================================================================
