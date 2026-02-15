-- =============================================================================
-- Grant Permissions for API Keys Table
-- =============================================================================
-- This migration grants necessary permissions to the timescale user
-- for accessing the api_keys table used by tenant-webhook service

-- Grant permissions on api_keys table to timescale user
-- Note: api_keys uses UUID as primary key, not SERIAL, so no sequence needed
GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO timescale;

-- Also ensure activation_codes table has permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON activation_codes TO timescale;
-- activation_codes uses SERIAL, so grant sequence permissions only if sequence exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'activation_codes_id_seq') THEN
        GRANT USAGE, SELECT ON SEQUENCE activation_codes_id_seq TO timescale;
    END IF;
END $$;

-- Grant permissions on other related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON farmers TO timescale;
GRANT SELECT, INSERT, UPDATE, DELETE ON farmer_activations TO timescale;

-- If using UUID instead of sequences, grant permission on the uuid extension
GRANT USAGE ON SCHEMA public TO timescale;

COMMENT ON TABLE api_keys IS 'API keys for tenant authentication - accessible by timescale user for tenant-webhook service';

