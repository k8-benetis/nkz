-- =============================================================================
-- Migration 057: Add missing columns to risk_daily_states
-- =============================================================================
-- The risk_processor.py INSERT uses evaluated_by and evaluation_version
-- columns that were not in the original risk_daily_states DDL.
-- =============================================================================

ALTER TABLE risk_daily_states ADD COLUMN IF NOT EXISTS evaluated_by VARCHAR(64) DEFAULT 'risk-worker';
ALTER TABLE risk_daily_states ADD COLUMN IF NOT EXISTS evaluation_version VARCHAR(16) DEFAULT '1.0.0';
