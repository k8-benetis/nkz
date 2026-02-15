-- =============================================================================
-- Migration 013: Simulation Schema & Parcel Extensions
-- =============================================================================
-- Extends cadastral_parcels for simulation support
-- Creates saved_simulations table for persisting simulation scenarios
-- Idempotent: Safe to run multiple times

-- =============================================================================
-- 1. Extend cadastral_parcels table
-- =============================================================================

-- Add active_indices column (JSONB) to track which indices are active for this parcel
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cadastral_parcels' 
        AND column_name = 'active_indices'
    ) THEN
        ALTER TABLE cadastral_parcels 
        ADD COLUMN active_indices JSONB DEFAULT '[]'::jsonb;
        
        COMMENT ON COLUMN cadastral_parcels.active_indices IS 
        'Array of active vegetation indices for this parcel (e.g., ["ndvi", "savi", "evi"]). 
        Used to determine which indices to calculate during batch processing.';
    END IF;
END $$;

-- Add last_processed_date column to track when indices were last calculated
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cadastral_parcels' 
        AND column_name = 'last_processed_date'
    ) THEN
        ALTER TABLE cadastral_parcels 
        ADD COLUMN last_processed_date TIMESTAMPTZ;
        
        COMMENT ON COLUMN cadastral_parcels.last_processed_date IS 
        'Timestamp of last successful index calculation/processing for this parcel. 
        Used for batch job idempotency and scheduling.';
    END IF;
END $$;

-- Create index on active_indices for efficient queries
CREATE INDEX IF NOT EXISTS idx_parcels_active_indices 
    ON cadastral_parcels USING GIN(active_indices) 
    WHERE active_indices IS NOT NULL AND jsonb_array_length(active_indices) > 0;

-- Create index on last_processed_date for batch job queries
CREATE INDEX IF NOT EXISTS idx_parcels_last_processed 
    ON cadastral_parcels(tenant_id, last_processed_date) 
    WHERE last_processed_date IS NOT NULL;

-- =============================================================================
-- 2. Saved Simulations Table
-- =============================================================================
-- Stores user-approved simulation scenarios for historical analysis and Grafana

CREATE TABLE IF NOT EXISTS saved_simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    
    -- Entity reference
    entity_id TEXT NOT NULL, -- Can reference NGSI-LD entity ID or cadastral_parcels.id
    entity_type TEXT NOT NULL, -- 'AgriParcel', 'AgriculturalRobot', 'Device', etc.
    
    -- Simulation metadata
    simulation_type TEXT NOT NULL, -- 'harvest_prediction', 'battery_life', 'water_stress', etc.
    algorithm TEXT NOT NULL, -- 'mock', 'linear_regression', etc.
    
    -- Input parameters (what user configured)
    params JSONB NOT NULL DEFAULT '{}', -- User input parameters for simulation
    
    -- Results (simulation output)
    result_data JSONB NOT NULL DEFAULT '{}', -- Simulation results (predictions, metrics, etc.)
    
    -- Visual state for Cesium (optional)
    visual_state JSONB, -- Color, opacity, position for map visualization
    
    -- Status and approval
    status TEXT DEFAULT 'saved', -- 'saved', 'approved', 'rejected', 'archived'
    approved_by TEXT, -- User ID who approved this simulation
    approved_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_simulations_tenant_id 
    ON saved_simulations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saved_simulations_entity 
    ON saved_simulations(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_saved_simulations_type 
    ON saved_simulations(simulation_type);
CREATE INDEX IF NOT EXISTS idx_saved_simulations_status 
    ON saved_simulations(status) WHERE status = 'saved';
CREATE INDEX IF NOT EXISTS idx_saved_simulations_created 
    ON saved_simulations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_simulations_params 
    ON saved_simulations USING GIN(params);
CREATE INDEX IF NOT EXISTS idx_saved_simulations_result_data 
    ON saved_simulations USING GIN(result_data);

-- RLS policies (tenant isolation)
ALTER TABLE saved_simulations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS saved_simulations_tenant_isolation ON saved_simulations;
DROP POLICY IF EXISTS saved_simulations_tenant_insert ON saved_simulations;
DROP POLICY IF EXISTS saved_simulations_tenant_update ON saved_simulations;
DROP POLICY IF EXISTS saved_simulations_tenant_delete ON saved_simulations;

CREATE POLICY saved_simulations_tenant_isolation ON saved_simulations
    USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY saved_simulations_tenant_insert ON saved_simulations
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY saved_simulations_tenant_update ON saved_simulations
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY saved_simulations_tenant_delete ON saved_simulations
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Trigger for updated_at
CREATE TRIGGER saved_simulations_updated_at
    BEFORE UPDATE ON saved_simulations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. Helper Functions
-- =============================================================================

-- Function: Get simulations for an entity
CREATE OR REPLACE FUNCTION get_entity_simulations(
    p_entity_id TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_simulation_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    simulation_type TEXT,
    algorithm TEXT,
    params JSONB,
    result_data JSONB,
    status TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.simulation_type,
        s.algorithm,
        s.params,
        s.result_data,
        s.status,
        s.created_at
    FROM saved_simulations s
    WHERE 
        s.entity_id = p_entity_id
        AND (p_entity_type IS NULL OR s.entity_type = p_entity_type)
        AND (p_simulation_type IS NULL OR s.simulation_type = p_simulation_type)
        AND s.tenant_id = current_setting('app.current_tenant', true)
    ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_entity_simulations IS 
'Get saved simulations for a specific entity, optionally filtered by type';

-- =============================================================================
-- 4. Grants
-- =============================================================================

GRANT ALL ON saved_simulations TO postgres;
GRANT EXECUTE ON FUNCTION get_entity_simulations(TEXT, TEXT, TEXT) TO postgres;

-- =============================================================================
-- 5. Comments
-- =============================================================================

COMMENT ON TABLE saved_simulations IS 
'Stored simulation scenarios approved by users. 
Used for historical analysis, Grafana dashboards, and comparison of "what-if" scenarios.
Results are stored as JSONB for flexibility across different simulation types.';

COMMENT ON COLUMN saved_simulations.entity_id IS 
'Reference to entity (NGSI-LD ID or PostgreSQL UUID). 
Can reference cadastral_parcels.id, robot IDs, etc.';

COMMENT ON COLUMN saved_simulations.simulation_type IS 
'Type of simulation: harvest_prediction, battery_life, water_stress, etc.';

COMMENT ON COLUMN saved_simulations.params IS 
'Input parameters used for simulation (user-configured sliders, switches, etc.)';

COMMENT ON COLUMN saved_simulations.result_data IS 
'Simulation results: predictions, metrics, confidence scores, etc.';

COMMENT ON COLUMN saved_simulations.visual_state IS 
'Visual representation for Cesium map: color, opacity, position (for ghosting/overlays)';

