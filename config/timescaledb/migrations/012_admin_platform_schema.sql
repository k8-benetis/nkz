-- =============================================================================
-- Migration 012: Admin Platform Schema
-- =============================================================================
-- Creates admin_platform schema for platform-level configuration
-- Separates model registry and tenant capabilities from tenant data
-- This schema is NOT accessible to tenants (RLS isolation)

-- Create admin_platform schema
CREATE SCHEMA IF NOT EXISTS admin_platform;

-- Grant permissions (only postgres/admin can access)
GRANT USAGE ON SCHEMA admin_platform TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_platform GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_platform GRANT ALL ON SEQUENCES TO postgres;

-- =============================================================================
-- 1. Model Registry Table
-- =============================================================================
-- Stores coefficients, rules, and configuration for simulation models
-- Not visible to tenants - platform admin only

CREATE TABLE IF NOT EXISTS admin_platform.model_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Model identification
    model_name TEXT NOT NULL UNIQUE, -- e.g., 'harvest_prediction', 'battery_life', 'water_stress'
    model_type TEXT NOT NULL, -- 'regression', 'classification', 'time_series', 'mock'
    entity_type TEXT NOT NULL, -- 'AgriCrop', 'Device', 'Robot', etc.
    
    -- Model configuration
    algorithm TEXT NOT NULL, -- 'linear_regression', 'mock', etc.
    coefficients JSONB DEFAULT '{}', -- Model coefficients/parameters
    rules JSONB DEFAULT '{}', -- Business rules and constraints
    config JSONB DEFAULT '{}', -- Additional configuration
    
    -- Input/output specification
    required_attributes JSONB DEFAULT '[]', -- Required entity attributes (e.g., ['batteryLevel', 'operatingHours'])
    output_attributes JSONB DEFAULT '[]', -- Output attributes (e.g., ['predictedBatteryLife', 'confidence'])
    
    -- Metadata
    description TEXT,
    version TEXT DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    created_by TEXT, -- Platform admin user
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns if table exists but columns are missing (idempotent)
DO $$
BEGIN
    -- Add model_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'model_type'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN model_type TEXT;
    END IF;
    
    -- Add entity_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'entity_type'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN entity_type TEXT;
    END IF;
    
    -- Add other columns if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'algorithm'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN algorithm TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'coefficients'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN coefficients JSONB DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'required_attributes'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN required_attributes JSONB DEFAULT '[]';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'output_attributes'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN output_attributes JSONB DEFAULT '[]';
    END IF;
    
    -- Add description if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN description TEXT;
    END IF;
    
    -- Add rules if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'rules'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN rules JSONB DEFAULT '{}';
    END IF;
    
    -- Add config if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'config'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN config JSONB DEFAULT '{}';
    END IF;
    
    -- Add version if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'version'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN version TEXT DEFAULT '1.0.0';
    END IF;
    
    -- Add is_active if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    -- Add created_by if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN created_by TEXT;
    END IF;
    
    -- Add created_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add updated_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE admin_platform.model_registry ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Indexes (after table creation) - only if columns exist
DO $$
BEGIN
    -- Check if entity_type column exists before creating index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'entity_type'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_model_registry_entity_type ON admin_platform.model_registry(entity_type);
    END IF;
    
    -- Check if model_type column exists before creating index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'model_type'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_model_registry_model_type ON admin_platform.model_registry(model_type);
    END IF;
    
    -- Check if is_active column exists before creating index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'is_active'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_model_registry_active ON admin_platform.model_registry(is_active) WHERE is_active = true;
    END IF;
END $$;

-- =============================================================================
-- 2. Tenant Capabilities Table
-- =============================================================================
-- Defines what capabilities/features each tenant has access to
-- Used for feature flags and plan-based restrictions

CREATE TABLE IF NOT EXISTS admin_platform.tenant_capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL UNIQUE,
    
    -- Capabilities (feature flags)
    simulation_enabled BOOLEAN DEFAULT false,
    advanced_analytics BOOLEAN DEFAULT false,
    custom_models BOOLEAN DEFAULT false,
    
    -- Plan-based limits
    max_simulations_per_day INTEGER DEFAULT 10,
    max_saved_simulations INTEGER DEFAULT 50,
    
    -- Allowed model types
    allowed_model_types TEXT[] DEFAULT ARRAY['mock'], -- ['mock', 'linear_regression', etc.]
    
    -- Metadata
    plan_type TEXT DEFAULT 'basic', -- 'basic', 'premium', 'enterprise'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_capabilities_tenant_id ON admin_platform.tenant_capabilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_capabilities_plan ON admin_platform.tenant_capabilities(plan_type);

-- =============================================================================
-- 3. Comments
-- =============================================================================

COMMENT ON SCHEMA admin_platform IS 
'Platform-level configuration schema. Not accessible to tenants. Contains model registry and tenant capabilities.';

COMMENT ON TABLE admin_platform.model_registry IS 
'Registry of simulation models, algorithms, and their configurations. Platform admin only.';

COMMENT ON TABLE admin_platform.tenant_capabilities IS 
'Feature flags and capabilities per tenant. Controls access to simulation and advanced features.';

-- =============================================================================
-- 4. Initial Data (Mock Models)
-- =============================================================================

-- Insert mock models for initial implementation (only if ALL required columns exist)
-- Handle case where table might have different structure (e.g., model_id column)
DO $$
DECLARE
    col_count INTEGER;
    has_model_id BOOLEAN;
    has_model_name BOOLEAN;
BEGIN
    -- Check if model_name column exists (required for inserts)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'model_name'
    ) INTO has_model_name;
    
    -- Check if model_id column exists (might be from old structure)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'admin_platform' 
        AND table_name = 'model_registry' 
        AND column_name = 'model_id'
    ) INTO has_model_id;
    
    -- Count how many required columns exist
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns 
    WHERE table_schema = 'admin_platform' 
    AND table_name = 'model_registry' 
    AND column_name IN ('model_name', 'model_type', 'entity_type', 'algorithm', 'description', 'required_attributes', 'output_attributes');
    
    -- Only insert if model_name exists and we have the required columns
    IF has_model_name AND col_count >= 4 THEN  -- At least model_name, model_type, entity_type, algorithm
        -- Insert each model individually, checking if it exists first
        -- Use dynamic SQL to handle different table structures
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM admin_platform.model_registry WHERE model_name = 'harvest_prediction') THEN
                IF has_model_id THEN
                    -- Table has model_id, use it
                    INSERT INTO admin_platform.model_registry (model_id, model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES (uuid_generate_v4(), 'harvest_prediction', 'regression', 'AgriCrop', 'mock', 'Mock harvest prediction model for parcels', 
                            '["soilMoisture", "ndvi", "temperature"]'::jsonb, 
                            '["predictedYield", "confidence"]'::jsonb);
                ELSE
                    -- Table doesn't have model_id, use standard columns
                    INSERT INTO admin_platform.model_registry (model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES ('harvest_prediction', 'regression', 'AgriCrop', 'mock', 'Mock harvest prediction model for parcels', 
                            '["soilMoisture", "ndvi", "temperature"]'::jsonb, 
                            '["predictedYield", "confidence"]'::jsonb);
                END IF;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM admin_platform.model_registry WHERE model_name = 'battery_life') THEN
                IF has_model_id THEN
                    INSERT INTO admin_platform.model_registry (model_id, model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES (uuid_generate_v4(), 'battery_life', 'regression', 'Device', 'mock', 'Mock battery life prediction for robots', 
                            '["batteryLevel", "operatingHours", "temperature"]'::jsonb, 
                            '["predictedBatteryLife", "confidence"]'::jsonb);
                ELSE
                    INSERT INTO admin_platform.model_registry (model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES ('battery_life', 'regression', 'Device', 'mock', 'Mock battery life prediction for robots', 
                            '["batteryLevel", "operatingHours", "temperature"]'::jsonb, 
                            '["predictedBatteryLife", "confidence"]'::jsonb);
                END IF;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM admin_platform.model_registry WHERE model_name = 'water_stress') THEN
                IF has_model_id THEN
                    INSERT INTO admin_platform.model_registry (model_id, model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES (uuid_generate_v4(), 'water_stress', 'classification', 'AgriCrop', 'mock', 'Mock water stress detection for crops', 
                            '["soilMoisture", "temperature", "humidity"]'::jsonb, 
                            '["stressLevel", "recommendation"]'::jsonb);
                ELSE
                    INSERT INTO admin_platform.model_registry (model_name, model_type, entity_type, algorithm, description, required_attributes, output_attributes)
                    VALUES ('water_stress', 'classification', 'AgriCrop', 'mock', 'Mock water stress detection for crops', 
                            '["soilMoisture", "temperature", "humidity"]'::jsonb, 
                            '["stressLevel", "recommendation"]'::jsonb);
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If inserts fail, log but continue
            RAISE NOTICE 'Could not insert mock models: %', SQLERRM;
        END;
    END IF;
END $$;

-- Grant default capabilities to existing tenants (basic plan)
-- Only if cadastral_parcels table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cadastral_parcels'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'admin_platform' AND table_name = 'tenant_capabilities'
    ) THEN
        INSERT INTO admin_platform.tenant_capabilities (tenant_id, simulation_enabled, allowed_model_types)
        SELECT DISTINCT tenant_id, true, ARRAY['mock']::TEXT[]
        FROM cadastral_parcels
        WHERE tenant_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM admin_platform.tenant_capabilities 
            WHERE tenant_capabilities.tenant_id = cadastral_parcels.tenant_id
        );
    END IF;
END $$;

