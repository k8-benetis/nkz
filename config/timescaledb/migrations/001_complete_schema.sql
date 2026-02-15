-- =============================================================================
-- Migration 001: Complete Database Schema for Nekazari Platform
-- =============================================================================
-- This migration creates the complete database structure from scratch
-- All tables with all required columns in the correct order

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. API Keys Table (with all required columns)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    tenant_id TEXT,
    farmer_id UUID,
    key_type TEXT DEFAULT 'farmer',
    scopes JSONB DEFAULT '{"read": ["own"], "write": ["own"]}',
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Create indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_farmer_id ON api_keys(farmer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_type ON api_keys(key_type);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- =============================================================================
-- 2. Audit Log Table (with all required columns)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id),
    tenant_id TEXT,
    user_id UUID,
    action TEXT NOT NULL,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    request_data JSONB,
    response_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_id ON audit_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- =============================================================================
-- 3. Farmers Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS farmers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(255),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for farmers
CREATE INDEX IF NOT EXISTS idx_farmers_tenant_id ON farmers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_farmers_username ON farmers(username);
CREATE INDEX IF NOT EXISTS idx_farmers_email ON farmers(email);
CREATE INDEX IF NOT EXISTS idx_farmers_is_active ON farmers(is_active);

-- =============================================================================
-- 4. Users Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(255),
    farmer_id UUID REFERENCES farmers(id),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'farmer',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_farmer_id ON users(farmer_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================================================
-- 5. Devices Table (with all required columns)
-- =============================================================================
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT,
    device_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    status TEXT DEFAULT 'active',
    location JSONB,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for devices
CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);

-- =============================================================================
-- 6. Telemetry Table (TimescaleDB hypertable)
-- =============================================================================
CREATE TABLE IF NOT EXISTS telemetry (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id TEXT,
    device_id TEXT,
    metric_name TEXT,
    value DOUBLE PRECISION,
    unit TEXT,
    metadata JSONB DEFAULT '{}',
    time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (time, id)
);

-- Create TimescaleDB hypertable
SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

-- Create indexes for telemetry
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_id ON telemetry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_id ON telemetry(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_name ON telemetry(metric_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry(time);

-- =============================================================================
-- 7. Commands Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT,
    device_id TEXT,
    command_type TEXT,
    payload JSONB,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP,
    response JSONB
);

-- Create indexes for commands
CREATE INDEX IF NOT EXISTS idx_commands_tenant_id ON commands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commands_device_id ON commands(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);

-- =============================================================================
-- 8. Tenants Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    tenant_name TEXT NOT NULL,
    plan_type TEXT NOT NULL DEFAULT 'basic',
    status TEXT NOT NULL DEFAULT 'active',
    max_users INTEGER DEFAULT 1,
    max_robots INTEGER DEFAULT 3,
    max_sensors INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_plan CHECK (plan_type IN ('basic', 'premium', 'enterprise')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'cancelled'))
);

-- Create indexes for tenants
CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- =============================================================================
-- 9. Functions and Triggers
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_farmers_updated_at BEFORE UPDATE ON farmers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate farmer API key
CREATE OR REPLACE FUNCTION generate_farmer_api_key()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO api_keys (key_hash, name, tenant_id, farmer_id, key_type, scopes)
    VALUES (
        encode(digest(NEW.id::text || extract(epoch from now())::text, 'sha256'), 'hex'),
        'Auto-generated key for ' || NEW.username,
        NEW.tenant_id,
        NEW.id,
        'farmer',
        '{"read": ["own"], "write": ["own"]}'::jsonb
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to generate API key for new farmers
CREATE TRIGGER trigger_generate_farmer_api_key
    AFTER INSERT ON farmers
    FOR EACH ROW
    EXECUTE FUNCTION generate_farmer_api_key();

-- =============================================================================
-- 10. Permissions
-- =============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- =============================================================================
-- 11. Initial Data
-- =============================================================================
-- Insert default admin API key
INSERT INTO api_keys (key_hash, name, description, tenant_id, key_type, scopes, permissions, is_active)
VALUES (
    encode(digest('admin-default-key', 'sha256'), 'hex'),
    'Admin Default Key',
    'Default admin key for system access',
    'admin',
    'admin',
    '{"read": true, "write": true, "admin": true}'::jsonb,
    '{"read": true, "write": true, "admin": true}'::jsonb,
    true
) ON CONFLICT DO NOTHING;

-- Insert default tenant
INSERT INTO tenants (tenant_id, tenant_name, plan_type, status, max_users, max_robots, max_sensors)
VALUES (
    'default',
    'Default Tenant',
    'basic',
    'active',
    1,
    3,
    10
) ON CONFLICT DO NOTHING;
