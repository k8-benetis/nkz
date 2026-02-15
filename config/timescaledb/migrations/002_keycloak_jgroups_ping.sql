-- =============================================================================
-- Keycloak JGroups Ping Table Setup
-- =============================================================================
-- This migration creates the jgroups_ping table required for Keycloak clustering
-- Migration: 002_keycloak_jgroups_ping.sql
-- 
-- Keycloak uses JDBC_PING protocol for cluster node discovery
-- This table is required for multi-node Keycloak deployments

-- Connect to keycloak database
\c keycloak;

-- Drop existing table if it exists (in case of schema changes)
DROP TABLE IF EXISTS jgroups_ping CASCADE;

-- Create jgroups_ping table with correct schema for Keycloak
-- Keycloak expects 'address' column, not 'own_addr'
CREATE TABLE jgroups_ping (
    address VARCHAR(200) NOT NULL,
    cluster_name VARCHAR(200) NOT NULL,
    ping_data BYTEA,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jgroups_ping_pk PRIMARY KEY (address, cluster_name)
);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE jgroups_ping TO postgres;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_jgroups_ping_cluster ON jgroups_ping(cluster_name);

COMMENT ON TABLE jgroups_ping IS 'JGroups JDBC_PING table for Keycloak cluster node discovery';
