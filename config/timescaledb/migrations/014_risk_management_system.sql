-- =============================================================================
-- Migration 014: Risk Management System Schema
-- =============================================================================
-- Creates risk catalog, subscriptions, and daily states tables
-- Supports multi-domain risk evaluation (Agronomic, Robotic, Energy)
-- NOTE: Must be run as postgres user (superuser) to create objects in admin_platform schema

-- Ensure admin_platform schema exists (created by migration 012)
CREATE SCHEMA IF NOT EXISTS admin_platform;

-- Grant permissions to postgres
GRANT USAGE ON SCHEMA admin_platform TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_platform GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_platform GRANT ALL ON SEQUENCES TO postgres;

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Risk Catalog (Platform Admin - admin_platform schema)
-- =============================================================================
-- Defines what risks can occur, what data sources they need, and which entity types they apply to

CREATE TABLE IF NOT EXISTS admin_platform.risk_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Risk identification
    risk_code TEXT NOT NULL UNIQUE, -- e.g., 'OLIVE_FLY_ATTACK', 'ROBOT_BATTERY_LOW', 'SOLAR_LOW_EFFICIENCY'
    risk_name TEXT NOT NULL, -- Human-readable name
    risk_description TEXT,
    
    -- Target entity type (SDM-based for scalability)
    target_sdm_type TEXT NOT NULL, -- 'AgriCrop', 'Device', 'Vehicle', 'PhotovoltaicInstallation'
    target_subtype TEXT, -- Optional: 'olive', 'drone', 'tractor', etc.
    
    -- Data sources required for evaluation
    data_sources JSONB NOT NULL DEFAULT '[]', -- ['weather', 'ndvi', 'telemetry']
    
    -- Risk domain
    risk_domain TEXT NOT NULL CHECK (risk_domain IN ('agronomic', 'robotic', 'energy', 'livestock', 'other')),
    
    -- Evaluation mode
    evaluation_mode TEXT NOT NULL DEFAULT 'batch' CHECK (evaluation_mode IN ('batch', 'realtime', 'hybrid')),
    
    -- Model configuration (for Factory Pattern)
    model_type TEXT NOT NULL DEFAULT 'simple', -- 'simple', 'regression', 'classification', 'ml'
    model_config JSONB DEFAULT '{}', -- Model-specific configuration
    
    -- Metadata
    severity_levels JSONB DEFAULT '{"low": 30, "medium": 60, "high": 80, "critical": 95}', -- Thresholds for severity
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT -- Platform admin user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_catalog_sdm_type ON admin_platform.risk_catalog(target_sdm_type);
CREATE INDEX IF NOT EXISTS idx_risk_catalog_domain ON admin_platform.risk_catalog(risk_domain);
CREATE INDEX IF NOT EXISTS idx_risk_catalog_evaluation_mode ON admin_platform.risk_catalog(evaluation_mode);
CREATE INDEX IF NOT EXISTS idx_risk_catalog_active ON admin_platform.risk_catalog(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE admin_platform.risk_catalog IS 
'Platform-level risk catalog. Defines what risks can occur and what data they need. Platform admin only.';
COMMENT ON COLUMN admin_platform.risk_catalog.risk_code IS 'Unique code identifier for the risk (e.g., OLIVE_FLY_ATTACK)';
COMMENT ON COLUMN admin_platform.risk_catalog.target_sdm_type IS 'SDM entity type this risk applies to (e.g., AgriCrop, Device)';
COMMENT ON COLUMN admin_platform.risk_catalog.data_sources IS 'JSON array of required data sources: ["weather", "ndvi", "telemetry"]';
COMMENT ON COLUMN admin_platform.risk_catalog.evaluation_mode IS 'batch (scheduled), realtime (event-driven), or hybrid';

-- =============================================================================
-- 2. Tenant Risk Subscriptions (Public schema - Tenant data)
-- =============================================================================
-- User preferences for which risks to monitor and notification thresholds

CREATE TABLE IF NOT EXISTS public.tenant_risk_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    risk_code TEXT NOT NULL REFERENCES admin_platform.risk_catalog(risk_code) ON DELETE CASCADE,
    
    -- Subscription settings
    is_active BOOLEAN DEFAULT true,
    user_threshold INTEGER NOT NULL DEFAULT 50 CHECK (user_threshold >= 0 AND user_threshold <= 100),
    
    -- Notification channels
    notification_channels JSONB DEFAULT '{"email": true, "push": false}',
    
    -- Additional filters (optional)
    entity_filters JSONB DEFAULT '{}', -- e.g., {"device_types": ["tractor"], "parcel_ids": ["uuid1", "uuid2"]}
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID, -- REFERENCES users(id) - removed FK constraint as users table may not exist yet
    
    -- Unique constraint: one subscription per tenant-risk combination
    UNIQUE(tenant_id, risk_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_subscriptions_tenant ON public.tenant_risk_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_subscriptions_risk_code ON public.tenant_risk_subscriptions(risk_code);
CREATE INDEX IF NOT EXISTS idx_risk_subscriptions_active ON public.tenant_risk_subscriptions(tenant_id, is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE public.tenant_risk_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_subscriptions_tenant_isolation ON public.tenant_risk_subscriptions;
CREATE POLICY risk_subscriptions_tenant_isolation ON public.tenant_risk_subscriptions
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS risk_subscriptions_tenant_insert ON public.tenant_risk_subscriptions;
CREATE POLICY risk_subscriptions_tenant_insert ON public.tenant_risk_subscriptions
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Comments
COMMENT ON TABLE public.tenant_risk_subscriptions IS 
'Tenant-specific risk subscriptions. Users configure which risks to monitor and notification thresholds.';
COMMENT ON COLUMN public.tenant_risk_subscriptions.user_threshold IS 
'Probability threshold (0-100). User will be notified if risk probability >= this value.';

-- =============================================================================
-- 3. Risk Daily States (Public schema - TimescaleDB hypertable)
-- =============================================================================
-- Historical record of risk evaluations per entity

CREATE TABLE IF NOT EXISTS public.risk_daily_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    entity_id TEXT NOT NULL, -- Entity ID from Orion-LD (e.g., "urn:ngsi-ld:AgriCrop:parcel_123")
    entity_type TEXT NOT NULL, -- SDM type (e.g., "AgriCrop", "Device")
    risk_code TEXT NOT NULL REFERENCES admin_platform.risk_catalog(risk_code) ON DELETE CASCADE,
    
    -- Risk evaluation
    probability_score DOUBLE PRECISION NOT NULL CHECK (probability_score >= 0 AND probability_score <= 100),
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Evaluation details
    evaluation_data JSONB DEFAULT '{}', -- Raw data used for evaluation (for debugging/audit)
    evaluation_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Temporal (for TimescaleDB partitioning)
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    evaluated_by TEXT DEFAULT 'risk-worker', -- Which service evaluated this
    evaluation_version TEXT DEFAULT '1.0.0'
);

-- Convert to TimescaleDB hypertable for efficient time-series queries
-- Only if table exists and is not already a hypertable
-- Note: TimescaleDB requires unique indexes to include the partitioning column
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'risk_daily_states'
    ) AND NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_schema = 'public' AND hypertable_name = 'risk_daily_states'
    ) THEN
        -- Drop any unique constraints that don't include timestamp
        -- (TimescaleDB requires unique indexes to include partitioning column)
        FOR constraint_name IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.risk_daily_states'::regclass
            AND contype = 'u'
            AND conname NOT LIKE '%timestamp%'
        LOOP
            BEGIN
                EXECUTE format('ALTER TABLE public.risk_daily_states DROP CONSTRAINT IF EXISTS %I', constraint_name);
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors when dropping constraints
                NULL;
            END;
        END LOOP;
        
        -- Now create hypertable
        BEGIN
            PERFORM create_hypertable(
                'risk_daily_states',
                'timestamp',
                chunk_time_interval => INTERVAL '7 days',
                if_not_exists => TRUE
            );
        EXCEPTION WHEN OTHERS THEN
            -- If hypertable creation fails, log but continue
            RAISE NOTICE 'Could not create hypertable: %', SQLERRM;
        END;
    END IF;
END $$;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_risk_states_tenant_timestamp ON public.risk_daily_states(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_states_entity_risk ON public.risk_daily_states(entity_id, risk_code, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_states_risk_code ON public.risk_daily_states(risk_code, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_states_probability ON public.risk_daily_states(probability_score DESC) WHERE probability_score >= 50;
CREATE INDEX IF NOT EXISTS idx_risk_states_severity ON public.risk_daily_states(severity, timestamp DESC) WHERE severity IN ('high', 'critical');

-- RLS Policies
ALTER TABLE public.risk_daily_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_states_tenant_isolation ON public.risk_daily_states;
CREATE POLICY risk_states_tenant_isolation ON public.risk_daily_states
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS risk_states_tenant_insert ON public.risk_daily_states;
CREATE POLICY risk_states_tenant_insert ON public.risk_daily_states
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Comments
COMMENT ON TABLE public.risk_daily_states IS 
'Historical record of risk evaluations. TimescaleDB hypertable for efficient time-series queries.';
COMMENT ON COLUMN public.risk_daily_states.probability_score IS 
'Risk probability score (0-100). Higher = more likely the risk will occur.';
COMMENT ON COLUMN public.risk_daily_states.evaluation_data IS 
'JSON object containing raw data used for evaluation (weather, NDVI, telemetry values)';

-- =============================================================================
-- 4. Helper Views for n8n Workflow
-- =============================================================================

-- View: Active risks requiring notification (optimized for n8n query)
-- Note: email and user_id will be empty if users table doesn't exist
-- This is acceptable as n8n can query users table separately if needed
-- Only create view if all required tables exist
DO $$
BEGIN
    -- Check if all required tables exist before creating view
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'risk_daily_states'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'admin_platform' AND table_name = 'risk_catalog'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tenant_risk_subscriptions'
    ) THEN
        BEGIN
            -- Drop view if it exists (to recreate it)
            DROP VIEW IF EXISTS public.risk_notifications_pending;
            
            -- Create view with simplified logic (no users table dependency)
            CREATE VIEW public.risk_notifications_pending AS
            SELECT 
                s.id,
                s.tenant_id,
                s.entity_id,
                s.entity_type,
                s.risk_code,
                c.risk_name,
                s.probability_score,
                s.severity,
                s.timestamp,
                sub.user_threshold,
                sub.notification_channels,
                ''::text as email,  -- Will be populated by n8n if users table exists
                ''::text as user_id  -- Will be populated by n8n if users table exists
            FROM risk_daily_states s
            JOIN admin_platform.risk_catalog c ON s.risk_code = c.risk_code
            JOIN tenant_risk_subscriptions sub ON s.tenant_id = sub.tenant_id 
                                               AND s.risk_code = sub.risk_code
            WHERE s.timestamp >= CURRENT_DATE
              AND s.probability_score >= sub.user_threshold
              AND sub.is_active = TRUE
              AND c.is_active = TRUE;
              
            COMMENT ON VIEW public.risk_notifications_pending IS 
            'View for n8n workflow. Returns active risks that exceed user thresholds and require notification.';
        EXCEPTION WHEN OTHERS THEN
            -- If view creation fails, log but continue
            RAISE NOTICE 'Could not create view risk_notifications_pending: %', SQLERRM;
        END;
    END IF;
END $$;

-- =============================================================================
-- 5. Functions
-- =============================================================================

-- Function: Calculate severity from probability score
CREATE OR REPLACE FUNCTION public.calculate_risk_severity(
    p_probability_score DOUBLE PRECISION,
    p_severity_levels JSONB DEFAULT '{"low": 30, "medium": 60, "high": 80, "critical": 95}'
) RETURNS TEXT AS $$
DECLARE
    v_low DOUBLE PRECISION;
    v_medium DOUBLE PRECISION;
    v_high DOUBLE PRECISION;
    v_critical DOUBLE PRECISION;
BEGIN
    v_low := (p_severity_levels->>'low')::DOUBLE PRECISION;
    v_medium := (p_severity_levels->>'medium')::DOUBLE PRECISION;
    v_high := (p_severity_levels->>'high')::DOUBLE PRECISION;
    v_critical := (p_severity_levels->>'critical')::DOUBLE PRECISION;
    
    IF p_probability_score >= v_critical THEN
        RETURN 'critical';
    ELSIF p_probability_score >= v_high THEN
        RETURN 'high';
    ELSIF p_probability_score >= v_medium THEN
        RETURN 'medium';
    ELSIF p_probability_score >= v_low THEN
        RETURN 'low';
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_risk_severity IS 
'Calculate risk severity level from probability score using configurable thresholds.';

-- =============================================================================
-- 6. Triggers
-- =============================================================================

-- Trigger: Auto-calculate severity on insert/update
CREATE OR REPLACE FUNCTION public.risk_states_calculate_severity()
RETURNS TRIGGER AS $$
DECLARE
    v_severity_levels JSONB;
BEGIN
    -- Get severity levels from risk catalog
    SELECT severity_levels INTO v_severity_levels
    FROM admin_platform.risk_catalog
    WHERE risk_code = NEW.risk_code;
    
    -- Calculate severity
    NEW.severity := public.calculate_risk_severity(NEW.probability_score, v_severity_levels);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_states_severity_trigger ON public.risk_daily_states;
CREATE TRIGGER risk_states_severity_trigger
    BEFORE INSERT OR UPDATE OF probability_score ON public.risk_daily_states
    FOR EACH ROW
    EXECUTE FUNCTION public.risk_states_calculate_severity();

-- Trigger: Update updated_at timestamp
DROP TRIGGER IF EXISTS risk_subscriptions_updated_at ON public.tenant_risk_subscriptions;
CREATE TRIGGER risk_subscriptions_updated_at
    BEFORE UPDATE ON public.tenant_risk_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. Grants
-- =============================================================================

GRANT SELECT ON admin_platform.risk_catalog TO postgres;
GRANT ALL ON public.tenant_risk_subscriptions TO postgres;
GRANT ALL ON public.risk_daily_states TO postgres;
-- Grant on view only if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'risk_notifications_pending') THEN
        GRANT SELECT ON public.risk_notifications_pending TO postgres;
    END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_risk_severity TO postgres;

-- Grant permissions to nekazari user
GRANT SELECT ON admin_platform.risk_catalog TO nekazari;
GRANT ALL ON public.tenant_risk_subscriptions TO nekazari;
GRANT ALL ON public.risk_daily_states TO nekazari;
-- Grant on view only if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'risk_notifications_pending') THEN
        GRANT SELECT ON public.risk_notifications_pending TO nekazari;
    END IF;
END $$;

-- =============================================================================
-- 8. Seed Data: 3 Pilot Use Cases
-- =============================================================================

-- 1. AGRONOMIC: Mildiu Risk (Requires Weather + NDVI)
INSERT INTO admin_platform.risk_catalog (
    risk_code, risk_name, risk_description,
    target_sdm_type, target_subtype,
    data_sources, risk_domain, evaluation_mode,
    model_type, model_config, severity_levels
) VALUES (
    'MILDEW_RISK',
    'Riesgo de Mildiu',
    'Riesgo de aparición de mildiu en cultivos basado en condiciones meteorológicas (humedad, temperatura) y estado de vegetación (NDVI)',
    'AgriCrop',
    NULL, -- Applies to all crop types
    '["weather", "ndvi"]'::jsonb,
    'agronomic',
    'batch',
    'simple',
    '{"humidity_threshold": 80, "temp_range": [10, 25], "ndvi_threshold": 0.5}'::jsonb,
    '{"low": 30, "medium": 60, "high": 80, "critical": 95}'::jsonb
) ON CONFLICT (risk_code) DO NOTHING;

-- 2. ROBOTIC: Critical Battery Low (Requires Telemetry)
INSERT INTO admin_platform.risk_catalog (
    risk_code, risk_name, risk_description,
    target_sdm_type, target_subtype,
    data_sources, risk_domain, evaluation_mode,
    model_type, model_config, severity_levels
) VALUES (
    'BATTERY_CRITICAL',
    'Batería Crítica',
    'Batería del robot/vehículo por debajo del 15%. Requiere carga inmediata.',
    'Device',
    NULL, -- Applies to all devices with battery
    '["telemetry"]'::jsonb,
    'robotic',
    'realtime',
    'simple',
    '{"battery_threshold": 15, "check_interval_minutes": 5}'::jsonb,
    '{"low": 20, "medium": 15, "high": 10, "critical": 5}'::jsonb
) ON CONFLICT (risk_code) DO NOTHING;

-- 3. ENERGY: Low Solar Efficiency (Production vs Radiation)
INSERT INTO admin_platform.risk_catalog (
    risk_code, risk_name, risk_description,
    target_sdm_type, target_subtype,
    data_sources, risk_domain, evaluation_mode,
    model_type, model_config, severity_levels
) VALUES (
    'SOLAR_LOW_EFFICIENCY',
    'Baja Eficiencia Solar',
    'Producción de energía solar por debajo del esperado según radiación solar disponible. Indica posible problema en paneles.',
    'PhotovoltaicInstallation',
    NULL,
    '["weather", "telemetry"]'::jsonb,
    'energy',
    'batch',
    'simple',
    '{"efficiency_threshold": 0.7, "min_radiation_w_m2": 200}'::jsonb,
    '{"low": 30, "medium": 50, "high": 70, "critical": 85}'::jsonb
) ON CONFLICT (risk_code) DO NOTHING;

-- =============================================================================
-- 9. Documentation
-- =============================================================================

COMMENT ON SCHEMA admin_platform IS 
'Platform-level configuration. Risk catalog defines what risks can occur. Platform admin only.';

COMMENT ON TABLE public.tenant_risk_subscriptions IS 
'Tenant-specific risk subscriptions. Users configure which risks to monitor and notification thresholds.';

COMMENT ON TABLE public.risk_daily_states IS 
'Historical record of risk evaluations per entity. TimescaleDB hypertable for efficient time-series queries and Grafana visualization.';

