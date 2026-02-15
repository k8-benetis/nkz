-- =============================================================================
-- Migration 010: Tenant Invitations Table
-- =============================================================================
-- Esta migración crea la tabla para gestionar invitaciones de usuarios
-- a tenants existentes (diferente de los códigos NEK que crean tenants nuevos)

-- Create tenant_invitations table
CREATE TABLE IF NOT EXISTS tenant_invitations (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    invitation_code TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'Farmer',
    invited_by TEXT NOT NULL, -- Email del admin que invitó
    status TEXT NOT NULL DEFAULT 'pending', -- pending/accepted/expired/revoked
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    CONSTRAINT valid_role CHECK (role IN ('Farmer', 'DeviceManager', 'TechnicalConsultant', 'TenantAdmin')),
    CONSTRAINT unique_tenant_email_pending UNIQUE (tenant_id, email, status) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_code ON tenant_invitations(invitation_code);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_status ON tenant_invitations(status);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_expires ON tenant_invitations(expires_at);

-- Function to generate unique invitation code
CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate code in format: INV-XXXX-XXXX-XXXX
        new_code := 'INV-' || 
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                    upper(substring(md5(random()::text) from 1 for 4));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM tenant_invitations WHERE invitation_code = new_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_tenant_invitations_updated_at ON tenant_invitations;
CREATE TRIGGER update_tenant_invitations_updated_at
    BEFORE UPDATE ON tenant_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE tenant_invitations TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE tenant_invitations_id_seq TO postgres;

-- Grant to nekazari user if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nekazari') THEN
        GRANT ALL PRIVILEGES ON TABLE tenant_invitations TO nekazari;
        GRANT ALL PRIVILEGES ON SEQUENCE tenant_invitations_id_seq TO nekazari;
        RAISE NOTICE 'Permissions granted to nekazari user';
    END IF;
END $$;

-- Grant to timescale user
GRANT ALL PRIVILEGES ON TABLE tenant_invitations TO timescale;
GRANT ALL PRIVILEGES ON SEQUENCE tenant_invitations_id_seq TO timescale;

-- Grant to PUBLIC (for tenant-webhook service)
GRANT ALL PRIVILEGES ON TABLE tenant_invitations TO PUBLIC;
GRANT ALL PRIVILEGES ON SEQUENCE tenant_invitations_id_seq TO PUBLIC;

