-- Migration 017: Grant all permissions to nekazari user
-- Required for tenant-webhook service to manage all entities

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nekazari;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nekazari;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO nekazari;
