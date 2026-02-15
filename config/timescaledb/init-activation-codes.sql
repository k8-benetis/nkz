-- =============================================================================
-- Activation Codes Schema
-- =============================================================================

-- Create timescale user if not exists (for telemetry access)
-- Password will be set by deploy.sh script
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timescale') THEN
        CREATE USER timescale WITH PASSWORD 'PLACEHOLDER_TIMESCALE_PASSWORD';
        RAISE NOTICE 'Created user timescale';
    END IF;
END $$;

-- Grant permissions to timescale user
GRANT ALL PRIVILEGES ON DATABASE nekazari TO timescale;
GRANT ALL PRIVILEGES ON SCHEMA public TO timescale;

-- Plan types enum
CREATE TYPE plan_type AS ENUM ('basic', 'premium', 'enterprise');

-- Code status enum
CREATE TYPE code_status AS ENUM ('pending', 'active', 'expired', 'revoked');

-- Activation codes table
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

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_email ON activation_codes(email);
CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_expires ON activation_codes(expires_at);

-- Link farmers to activation codes
CREATE TABLE IF NOT EXISTS farmer_activations (
    id SERIAL PRIMARY KEY,
    farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
    activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE CASCADE,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(farmer_id, activation_code_id)
);

-- Index for farmer activations
CREATE INDEX IF NOT EXISTS idx_farmer_activations_farmer ON farmer_activations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_farmer_activations_code ON farmer_activations(activation_code_id);

-- Function to generate unique activation code
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

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for activation_codes
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
GRANT ALL PRIVILEGES ON TABLE farmer_activations TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO postgres;

-- Grant ALL PRIVILEGES to nekazari user (the one actually used by tenant-webhook service)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nekazari') THEN
        GRANT ALL PRIVILEGES ON TABLE activation_codes TO nekazari;
        GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO nekazari;
        GRANT ALL PRIVILEGES ON TABLE farmer_activations TO nekazari;
        GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO nekazari;
        RAISE NOTICE 'Permissions granted to nekazari user';
    END IF;
END $$;

-- Grant ALL PRIVILEGES to timescale user
GRANT ALL PRIVILEGES ON TABLE activation_codes TO timescale;
GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO timescale;
GRANT ALL PRIVILEGES ON TABLE farmer_activations TO timescale;
GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO timescale;

-- Grant ALL PRIVILEGES to PUBLIC (allows any authenticated user to access)
-- This is a temporary measure to ensure tenant-webhook service works regardless of which user it uses
-- In production, you may want to restrict this to specific users only
GRANT ALL PRIVILEGES ON TABLE activation_codes TO PUBLIC;
GRANT ALL PRIVILEGES ON SEQUENCE activation_codes_id_seq TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE farmer_activations TO PUBLIC;
GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO PUBLIC;

-- Grant permissions on all tables and sequences (for timescale user)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO timescale;
GRANT USAGE ON TYPE plan_type TO timescale;
GRANT USAGE ON TYPE code_status TO timescale;
