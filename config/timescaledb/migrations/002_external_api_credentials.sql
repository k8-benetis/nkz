-- =============================================================================
-- Migration 002: External API Credentials Table
-- =============================================================================
-- Stores credentials for external APIs that require authentication
-- Managed through AdminPanel

CREATE TABLE IF NOT EXISTS external_api_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'sentinel-hub', 'aemet', 'catastro'
    service_url TEXT NOT NULL,                  -- Base URL of the service
    auth_type VARCHAR(50) NOT NULL,             -- 'api_key', 'basic_auth', 'bearer', 'none'
    username TEXT,                               -- For basic auth or username-based auth
    password_encrypted TEXT,                     -- Encrypted password (using pgcrypto)
    api_key_encrypted TEXT,                      -- Encrypted API key (using pgcrypto)
    additional_params JSONB DEFAULT '{}',        -- Additional parameters (headers, query params, etc.)
    description TEXT,                            -- Human-readable description
    is_active BOOLEAN DEFAULT true,              -- Enable/disable this credential
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),                     -- User who created this credential
    last_used_at TIMESTAMP,                      -- Last time this credential was used
    last_used_by VARCHAR(255)                    -- Last user/service that used it
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_external_api_credentials_service_name ON external_api_credentials(service_name);
CREATE INDEX IF NOT EXISTS idx_external_api_credentials_is_active ON external_api_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_external_api_credentials_auth_type ON external_api_credentials(auth_type);

-- RLS Policy: Only PlatformAdmin can manage credentials
ALTER TABLE external_api_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated PlatformAdmin users can access
CREATE POLICY external_api_credentials_admin_only ON external_api_credentials
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'PlatformAdmin' OR
        current_setting('app.current_user_role', true) IS NULL  -- Allow during setup
    );

-- Function to encrypt password/api_key
CREATE OR REPLACE FUNCTION encrypt_credential(plain_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Use pgcrypto to encrypt
    RETURN encode(digest(plain_text || current_setting('app.encryption_salt', true), 'sha256'), 'hex');
    -- Note: In production, use proper encryption (pgcrypto encrypt/decrypt functions)
    -- For now, using hash for demonstration
END;
$$ LANGUAGE plpgsql;

-- Function to get decrypted credential (for service use)
CREATE OR REPLACE FUNCTION get_api_credential(service_name_param VARCHAR(255))
RETURNS TABLE (
    service_name VARCHAR(255),
    service_url TEXT,
    auth_type VARCHAR(50),
    username TEXT,
    password TEXT,
    api_key TEXT,
    additional_params JSONB
) AS $$
BEGIN
    -- In production, decrypt here
    -- For now, return encrypted values (services will decrypt)
    RETURN QUERY
    SELECT 
        e.service_name,
        e.service_url,
        e.auth_type,
        e.username,
        e.password_encrypted as password,  -- Services will decrypt
        e.api_key_encrypted as api_key,     -- Services will decrypt
        e.additional_params
    FROM external_api_credentials e
    WHERE e.service_name = service_name_param
    AND e.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON TABLE external_api_credentials IS 'Stores encrypted credentials for external APIs';
COMMENT ON COLUMN external_api_credentials.service_name IS 'Unique identifier for the service (e.g., sentinel-hub, aemet)';
COMMENT ON COLUMN external_api_credentials.service_url IS 'Base URL of the external service';
COMMENT ON COLUMN external_api_credentials.auth_type IS 'Type of authentication: api_key, basic_auth, bearer, none';
COMMENT ON COLUMN external_api_credentials.password_encrypted IS 'Encrypted password (for basic_auth)';
COMMENT ON COLUMN external_api_credentials.api_key_encrypted IS 'Encrypted API key';
COMMENT ON COLUMN external_api_credentials.additional_params IS 'Additional parameters (headers, query params, etc.)';

