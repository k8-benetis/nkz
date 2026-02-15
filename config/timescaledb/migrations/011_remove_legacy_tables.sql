-- =============================================================================
-- Migration 011: Remove unused legacy tables
-- =============================================================================
-- Elimina tablas antiguas que fueron reemplazadas por el nuevo sistema
-- de ingestión de sensores:
--   - devices → reemplazada por sensors
--   - telemetry → reemplazada por telemetry_events
-- =============================================================================
-- IMPORTANTE: Ejecutar solo después de verificar que están vacías o migradas

-- Verificar que las tablas están vacías antes de eliminar
DO $$
DECLARE
    devices_count INTEGER;
    telemetry_count INTEGER;
BEGIN
    -- Contar registros en tablas antiguas
    SELECT COUNT(*) INTO devices_count FROM devices;
    SELECT COUNT(*) INTO telemetry_count FROM telemetry;
    
    -- Si hay datos, abortar migración
    IF devices_count > 0 OR telemetry_count > 0 THEN
        RAISE EXCEPTION 'Las tablas devices (%) o telemetry (%) contienen datos. Migrar datos antes de eliminar.', 
            devices_count, telemetry_count;
    END IF;
    
    RAISE NOTICE 'Tablas antiguas verificadas como vacías. Procediendo con eliminación...';
END $$;

-- Eliminar vistas que dependen de devices
DROP VIEW IF EXISTS devices_geoserver CASCADE;

-- Eliminar tablas antiguas
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS telemetry CASCADE;

-- Eliminar índices si existen (por si acaso)
DROP INDEX IF EXISTS idx_devices_tenant_id;
DROP INDEX IF EXISTS idx_devices_device_id;
DROP INDEX IF EXISTS idx_devices_status;
DROP INDEX IF EXISTS idx_devices_is_active;
DROP INDEX IF EXISTS idx_telemetry_tenant_id;
DROP INDEX IF EXISTS idx_telemetry_device_id;
DROP INDEX IF EXISTS idx_telemetry_metric_name;
DROP INDEX IF EXISTS idx_telemetry_time;

RAISE NOTICE 'Migración 011 completada: Tablas antiguas eliminadas';

