-- =============================================================================
-- Migration 024: Module Federation Registry
-- =============================================================================
-- Creates tables for managing dynamic module federation in the Nekazari platform.
-- This enables the Host application to load remote modules dynamically based on
-- tenant configuration.
--
-- Dependencies: Requires 004_enable_rls.sql for RLS policies
-- =============================================================================

-- Marketplace Modules: Catalog of available modules
CREATE TABLE IF NOT EXISTS marketplace_modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    remote_entry_url TEXT NOT NULL,
    scope TEXT NOT NULL, -- Module federation scope name
    exposed_module TEXT NOT NULL, -- e.g., "./WeatherApp"
    version TEXT NOT NULL DEFAULT '1.0.0',
    author TEXT,
    category TEXT, -- e.g., 'weather', 'analytics', 'iot'
    icon_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    required_roles TEXT[], -- Roles required to see/use this module
    metadata JSONB DEFAULT '{}'::jsonb, -- Flexible metadata (routes, navigation items, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT
);

-- Tenant Installed Modules: Which modules are enabled for each tenant
CREATE TABLE IF NOT EXISTS tenant_installed_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    module_id TEXT NOT NULL REFERENCES marketplace_modules(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    configuration JSONB DEFAULT '{}'::jsonb, -- Tenant-specific module configuration
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    installed_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, module_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_active ON marketplace_modules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_category ON marketplace_modules(category);
CREATE INDEX IF NOT EXISTS idx_tenant_installed_modules_tenant ON tenant_installed_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_installed_modules_enabled ON tenant_installed_modules(tenant_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_tenant_installed_modules_module ON tenant_installed_modules(module_id);

-- Enable RLS
ALTER TABLE marketplace_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_installed_modules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketplace_modules (read-only for all authenticated users, write for PlatformAdmin)
-- Note: PostgreSQL < 9.5 doesn't support CREATE POLICY IF NOT EXISTS, so we use DROP IF EXISTS first
DROP POLICY IF EXISTS marketplace_modules_read ON marketplace_modules;
CREATE POLICY marketplace_modules_read ON marketplace_modules
    FOR SELECT
    USING (
        is_active = true OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    );

DROP POLICY IF EXISTS marketplace_modules_write ON marketplace_modules;
CREATE POLICY marketplace_modules_write ON marketplace_modules
    FOR ALL
    USING (current_setting('app.current_tenant', true) = 'platform_admin')
    WITH CHECK (current_setting('app.current_tenant', true) = 'platform_admin');

-- RLS Policies for tenant_installed_modules (tenant isolation)
DROP POLICY IF EXISTS tenant_installed_modules_tenant_isolation ON tenant_installed_modules;
CREATE POLICY tenant_installed_modules_tenant_isolation ON tenant_installed_modules
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true) OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    );

DROP POLICY IF EXISTS tenant_installed_modules_tenant_modify ON tenant_installed_modules;
CREATE POLICY tenant_installed_modules_tenant_modify ON tenant_installed_modules
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true) OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    )
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true) OR
        current_setting('app.current_tenant', true) = 'platform_admin'
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_module_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_modules_updated_at
    BEFORE UPDATE ON marketplace_modules
    FOR EACH ROW
    EXECUTE FUNCTION update_module_updated_at();

CREATE TRIGGER tenant_installed_modules_updated_at
    BEFORE UPDATE ON tenant_installed_modules
    FOR EACH ROW
    EXECUTE FUNCTION update_module_updated_at();

-- Comments
COMMENT ON TABLE marketplace_modules IS 'Catalog of available remote modules for Module Federation';
COMMENT ON TABLE tenant_installed_modules IS 'Tenant-specific module installations and configurations';
COMMENT ON COLUMN marketplace_modules.scope IS 'Module Federation scope name (must match remote module configuration)';
COMMENT ON COLUMN marketplace_modules.exposed_module IS 'Exported module name from remote (e.g., "./WeatherApp")';
COMMENT ON COLUMN marketplace_modules.metadata IS 'Flexible JSON metadata: routes, navigation items, capabilities, etc.';
