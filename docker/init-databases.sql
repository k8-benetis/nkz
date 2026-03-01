-- =============================================================================
-- Nekazari Platform — Database Initialization (docker-compose)
-- =============================================================================
-- Creates auxiliary databases and extensions required before migrations run.
-- Mounted into /docker-entrypoint-initdb.d/ of the TimescaleDB container.

-- Create separate databases for each service
CREATE DATABASE keycloak;
CREATE DATABASE api_validator_db;
CREATE DATABASE farmer_auth_db;
CREATE DATABASE activation_codes_db;
CREATE DATABASE fiware_history;

-- Grant permissions to postgres user
GRANT ALL PRIVILEGES ON DATABASE keycloak TO postgres;
GRANT ALL PRIVILEGES ON DATABASE api_validator_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE farmer_auth_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE activation_codes_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE fiware_history TO postgres;

-- Create TimescaleDB extension in fiware_history
\c fiware_history;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create extensions in main database
\c nekazari;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Activation Codes Table (required for tenant-webhook service at startup)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
        CREATE TYPE plan_type AS ENUM ('basic', 'premium', 'enterprise');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_status') THEN
        CREATE TYPE code_status AS ENUM ('pending', 'active', 'expired', 'revoked');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS activation_codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    plan plan_type NOT NULL DEFAULT 'basic',
    status code_status NOT NULL DEFAULT 'pending',
    max_users INTEGER DEFAULT 1,
    max_robots INTEGER DEFAULT 3,
    max_sensors INTEGER DEFAULT 10,
    used_count INTEGER DEFAULT 0,
    activated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    duration_days INTEGER DEFAULT 30,
    generated_by TEXT,
    order_id TEXT,
    notes TEXT,
    last_notification_days INTEGER[],
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_email ON activation_codes(email);
CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_expires ON activation_codes(expires_at);

CREATE OR REPLACE FUNCTION generate_activation_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := 'NEK-' ||
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4));
        SELECT EXISTS(SELECT 1 FROM activation_codes WHERE code = new_code) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_activation_codes_updated_at ON activation_codes;
CREATE TRIGGER update_activation_codes_updated_at
    BEFORE UPDATE ON activation_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

GRANT ALL PRIVILEGES ON TABLE activation_codes TO postgres;
GRANT USAGE, SELECT ON SEQUENCE activation_codes_id_seq TO postgres;
