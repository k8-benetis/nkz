-- =============================================================================
-- Nekazari Agricultural Platform - Separate Databases Initialization
-- =============================================================================
-- This script creates separate databases for each microservice to ensure
-- proper isolation and prevent data conflicts between services.

-- Create dedicated database for API Validator
CREATE DATABASE api_validator_db;

-- Create dedicated database for Farmer Auth API  
CREATE DATABASE farmer_auth_db;

-- Create dedicated database for Activation Codes API
CREATE DATABASE activation_codes_db;

-- Create dedicated database for Keycloak (already handled by deploy.sh)
-- CREATE DATABASE keycloak;

-- Grant permissions to timescale user for all databases
GRANT ALL PRIVILEGES ON DATABASE api_validator_db TO timescale;
GRANT ALL PRIVILEGES ON DATABASE farmer_auth_db TO timescale;
GRANT ALL PRIVILEGES ON DATABASE activation_codes_db TO timescale;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO timescale;

-- Connect to each database and create necessary extensions
\c api_validator_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c farmer_auth_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c activation_codes_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c keycloak;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Return to main database
\c fiware_history;
