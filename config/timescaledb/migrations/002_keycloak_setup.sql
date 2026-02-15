-- =============================================================================
-- Keycloak Database Setup Migration
-- =============================================================================
-- This migration ensures Keycloak database is properly configured
-- Migration: 002_keycloak_setup.sql

-- This migration is specifically for the keycloak database
-- It ensures proper permissions and initial setup

-- Create keycloak database if it doesn't exist
-- CREATE DATABASE keycloak;

-- Grant all necessary permissions to postgres user for Keycloak
GRANT ALL PRIVILEGES ON DATABASE keycloak TO postgres;

-- Connect to keycloak database and set up schema
\c keycloak;

-- Create schema if it doesn't exist (Keycloak will create its own tables)
-- We just ensure the user has proper permissions

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
