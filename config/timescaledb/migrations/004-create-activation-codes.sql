-- =============================================================================
-- Migration 004: Create Activation Codes Tables and Functions
-- =============================================================================
-- This migration creates the activation_codes table and related structures
-- It is idempotent and safe to run multiple times

-- Create plan types enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
        CREATE TYPE plan_type AS ENUM ('basic', 'premium', 'enterprise');
    END IF;
END $$;

-- Create code status enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_status') THEN
        CREATE TYPE code_status AS ENUM ('pending', 'active', 'expired', 'revoked');
    END IF;
END $$;

-- Create activation_codes table if not exists
CREATE TABLE IF NOT EXISTS activation_codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    plan plan_type NOT NULL DEFAULT 'basic',
    status code_status NOT NULL DEFAULT 'pending',
    
    -- Limits based on plan
    max_users INTEGER DEFAULT 1,
    max_robots INTEGER DEFAULT 3,
    max_sensors INTEGER DEFAULT 10,
    
    -- Usage tracking
    used_count INTEGER DEFAULT 0,
    activated_at TIMESTAMP,
    
    -- Validity period
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    duration_days INTEGER DEFAULT 30,
    
    -- Metadata
    generated_by TEXT, -- 'woocommerce' or admin email
    order_id TEXT, -- WooCommerce order ID
    notes TEXT,
    
    -- Notification tracking
    last_notification_days INTEGER[], -- Days thresholds for which notification was sent (e.g., [30, 15, 7, 1])
    
    -- Audit
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes if not exists (using IF NOT EXISTS for PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_email ON activation_codes(email);
CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_expires ON activation_codes(expires_at);

-- Create farmer_activations table if not exists (only if farmers table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'farmers') THEN
        CREATE TABLE IF NOT EXISTS farmer_activations (
            id SERIAL PRIMARY KEY,
            farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
            activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE CASCADE,
            activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(farmer_id, activation_code_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_farmer_activations_farmer ON farmer_activations(farmer_id);
        CREATE INDEX IF NOT EXISTS idx_farmer_activations_code ON farmer_activations(activation_code_id);
    END IF;
END $$;

-- Create function to generate unique activation code
CREATE OR REPLACE FUNCTION generate_activation_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate code in format: NEK-XXXX-XXXX-XXXX
        new_code := 'NEK-' || 
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM activation_codes WHERE code = new_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for activation_codes updated_at
DROP TRIGGER IF EXISTS update_activation_codes_updated_at ON activation_codes;
CREATE TRIGGER update_activation_codes_updated_at
    BEFORE UPDATE ON activation_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS - CRITICAL: Ensure all users can access activation_codes
-- =============================================================================

-- Grant ALL PRIVILEGES to postgres user
GRANT ALL PRIVILEGES ON TABLE activation_codes TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO postgres;

-- Grant ALL PRIVILEGES to nekazari user (the one actually used by tenant-webhook service)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nekazari') THEN
        GRANT ALL PRIVILEGES ON TABLE activation_codes TO nekazari;
        GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO nekazari;
        RAISE NOTICE 'Permissions granted to nekazari user';
    END IF;
END $$;

-- Grant ALL PRIVILEGES to timescale user if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timescale') THEN
        GRANT ALL PRIVILEGES ON TABLE activation_codes TO timescale;
        GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO timescale;
        RAISE NOTICE 'Permissions granted to timescale user';
    END IF;
END $$;

-- Grant ALL PRIVILEGES to PUBLIC (allows any authenticated user to access)
-- This is a temporary measure to ensure tenant-webhook service works regardless of which user it uses
-- In production, you may want to restrict this to specific users only
GRANT ALL PRIVILEGES ON TABLE activation_codes TO PUBLIC;
GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO PUBLIC;

-- Grant permissions on farmer_activations table as well
GRANT ALL PRIVILEGES ON TABLE farmer_activations TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO postgres;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nekazari') THEN
        GRANT ALL PRIVILEGES ON TABLE farmer_activations TO nekazari;
        GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO nekazari;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timescale') THEN
        GRANT ALL PRIVILEGES ON TABLE farmer_activations TO timescale;
        GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO timescale;
    END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE farmer_activations TO PUBLIC;
GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO PUBLIC;

-- Add notification tracking column if it doesn't exist (for existing installations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'activation_codes' 
        AND column_name = 'last_notification_days'
    ) THEN
        ALTER TABLE activation_codes ADD COLUMN last_notification_days INTEGER[];
        COMMENT ON COLUMN activation_codes.last_notification_days IS 'Array of day thresholds (30, 15, 7, 1) for which expiration notification was already sent';
    END IF;
END $$;


