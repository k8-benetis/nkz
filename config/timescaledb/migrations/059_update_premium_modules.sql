-- =============================================================================
-- Migration 059: Update Modules Plan Availability (Premium)
-- =============================================================================
-- The user requested to make the following modules available for Premium users 
-- instead of Enterprise only.
--
-- Plan Levels mapping:
-- 0: Basic
-- 1: Premium (Pro)
-- 2: Enterprise
-- =============================================================================

UPDATE marketplace_modules 
SET required_plan_level = 1 
WHERE id IN (
    'catastro-spain', 
    'connectivity', 
    'eu-elevation', 
    'intelligence', 
    'sensors', 
    'vegetation-prime', 
    'weather'
);
