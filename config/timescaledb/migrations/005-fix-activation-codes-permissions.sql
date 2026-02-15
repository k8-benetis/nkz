-- =============================================================================
-- Migration 005: Fix Activation Codes Permissions
-- =============================================================================
-- This migration ensures all necessary users have permissions on activation_codes
-- It is idempotent and safe to run multiple times
-- 
-- This fixes the "permission denied for table activation_codes" error
-- that occurs when tenant-webhook service tries to create activation codes

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

-- Grant permissions on farmer_activations table as well (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'farmer_activations') THEN
        GRANT ALL PRIVILEGES ON TABLE farmer_activations TO postgres;
        GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO postgres;
        
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nekazari') THEN
            GRANT ALL PRIVILEGES ON TABLE farmer_activations TO nekazari;
            GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO nekazari;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timescale') THEN
            GRANT ALL PRIVILEGES ON TABLE farmer_activations TO timescale;
            GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO timescale;
        END IF;
        
        GRANT ALL PRIVILEGES ON TABLE farmer_activations TO PUBLIC;
        GRANT ALL PRIVILEGES ON SEQUENCE farmer_activations_id_seq TO PUBLIC;
        
        RAISE NOTICE 'Permissions granted on farmer_activations table';
    END IF;
END $$;

-- Verify permissions were granted
DO $$
DECLARE
    perm_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO perm_count
    FROM information_schema.role_table_grants 
    WHERE table_name = 'activation_codes' 
    AND grantee IN ('postgres', 'timescale', 'PUBLIC')
    AND privilege_type = 'INSERT';
    
    IF perm_count >= 1 THEN
        RAISE NOTICE 'Permissions verified: % users have INSERT permission on activation_codes', perm_count;
    ELSE
        RAISE WARNING 'Permissions may not have been granted correctly';
    END IF;
END $$;

