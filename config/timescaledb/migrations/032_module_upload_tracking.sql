-- =============================================================================
-- Migration 032: Module Upload Tracking
-- =============================================================================
-- Creates table to track module uploads, validation status, and notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS module_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id TEXT UNIQUE NOT NULL,
    module_id TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, validating, completed, failed
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    error_message TEXT,
    validation_logs TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'validating', 'completed', 'failed'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_module_uploads_upload_id ON module_uploads(upload_id);
CREATE INDEX IF NOT EXISTS idx_module_uploads_module_id ON module_uploads(module_id);
CREATE INDEX IF NOT EXISTS idx_module_uploads_status ON module_uploads(status);
CREATE INDEX IF NOT EXISTS idx_module_uploads_uploaded_by ON module_uploads(uploaded_by);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_module_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER module_uploads_updated_at
    BEFORE UPDATE ON module_uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_module_uploads_updated_at();

-- Comments
COMMENT ON TABLE module_uploads IS 'Tracks module uploads, validation status, and provides audit trail';
COMMENT ON COLUMN module_uploads.upload_id IS 'Unique identifier for the upload (UUID)';
COMMENT ON COLUMN module_uploads.status IS 'Current status: pending, validating, completed, failed';
COMMENT ON COLUMN module_uploads.validation_logs IS 'Last N lines of validation job logs';
COMMENT ON COLUMN module_uploads.metadata IS 'Additional metadata: job_name, pod_name, etc.';























