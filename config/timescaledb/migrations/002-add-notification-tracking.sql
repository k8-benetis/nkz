-- =============================================================================
-- Migration: Add notification tracking to activation_codes
-- =============================================================================
-- Adds last_notification_days array to track which notification thresholds have been sent

-- Add column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activation_codes' 
        AND column_name = 'last_notification_days'
    ) THEN
        ALTER TABLE activation_codes 
        ADD COLUMN last_notification_days INTEGER[] DEFAULT '{}';
        
        RAISE NOTICE 'Added last_notification_days column to activation_codes';
    ELSE
        RAISE NOTICE 'Column last_notification_days already exists';
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN activation_codes.last_notification_days IS 'Array of day thresholds (30, 15, 7, 1) for which expiration notification was already sent';

