-- =============================================================================
-- Migration 029: Module Uploads Table
-- =============================================================================
-- Stores uploaded module ZIPs and their validation status
-- Used for the external module upload system (Phase 1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS module_uploads (
    upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    author_email VARCHAR(255) NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'validating',
    -- Status: validating, validated_waiting_review, rejected, published
    zip_file_path TEXT NOT NULL,  -- Path in MinIO: modules-raw/{upload_id}.zip
    extracted_path TEXT,          -- Temporary extraction path (K8s Job)
    validation_results JSONB,     -- Schema validation results
    build_log TEXT,               -- Build output/logs
    rejection_reason TEXT,
    published_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_module_uploads_status ON module_uploads(status);
CREATE INDEX IF NOT EXISTS idx_module_uploads_module_id ON module_uploads(module_id);
CREATE INDEX IF NOT EXISTS idx_module_uploads_uploaded_by ON module_uploads(uploaded_by);

-- Add comment
COMMENT ON TABLE module_uploads IS 'Stores uploaded external module ZIPs and their validation status';
COMMENT ON COLUMN module_uploads.status IS 'Status: validating, validated_waiting_review, rejected, published';
COMMENT ON COLUMN module_uploads.zip_file_path IS 'Path in MinIO bucket modules-raw';
COMMENT ON COLUMN module_uploads.validation_results IS 'JSON with schema validation results';

-- =============================================================================
-- End of migration 029
-- =============================================================================
