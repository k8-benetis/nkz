-- =============================================================================
-- TimescaleDB Initialization Script for Nekazari Platform
-- =============================================================================
-- This script initializes TimescaleDB with basic configuration only
-- Database structure will be created by migrations

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create basic schemas
CREATE SCHEMA IF NOT EXISTS public;

-- Create timescale user for telemetry access
CREATE USER IF NOT EXISTS timescale WITH PASSWORD 'timescale123';

-- Grant permissions to the postgres user
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;

-- Grant permissions to timescale user
GRANT ALL PRIVILEGES ON SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON DATABASE nekazari TO timescale;