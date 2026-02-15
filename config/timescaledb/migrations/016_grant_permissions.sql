-- Migration 016: Grant permissions to nekazari user
-- Required for tenant-webhook service

GRANT ALL PRIVILEGES ON TABLE tenants TO nekazari;
GRANT ALL PRIVILEGES ON TABLE activation_codes TO nekazari;
GRANT ALL PRIVILEGES ON SEQUENCE tenants_id_seq TO nekazari;
