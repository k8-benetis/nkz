-- =============================================================================
-- QuantumLeap Database Initialization
-- =============================================================================
-- Este script inicializa la base de datos fiware_history para QuantumLeap
-- QuantumLeap crea automáticamente las tablas necesarias cuando recibe
-- notificaciones de Orion-LD, por lo que solo necesitamos asegurar que
-- la base de datos existe y tiene las extensiones correctas.
-- =============================================================================

-- Crear base de datos fiware_history si no existe
-- Nota: En PostgreSQL, CREATE DATABASE debe ejecutarse fuera de una transacción
-- Este script debe ejecutarse como usuario con permisos de superusuario

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fiware_history') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE fiware_history');
    END IF;
END
$$;

-- Conectar a la base de datos fiware_history
\c fiware_history;

-- Crear extensión TimescaleDB si no existe
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Verificar que TimescaleDB está habilitado
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        RAISE EXCEPTION 'TimescaleDB extension no está disponible';
    END IF;
END
$$;

-- Otorgar permisos al usuario postgres (o el usuario configurado)
GRANT ALL PRIVILEGES ON DATABASE fiware_history TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Establecer permisos por defecto para objetos futuros
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;

-- Crear esquema para métricas si es necesario (opcional)
-- CREATE SCHEMA IF NOT EXISTS metrics;

-- Comentarios informativos
COMMENT ON DATABASE fiware_history IS 'Base de datos para historización de datos NGSI-LD mediante QuantumLeap';

-- =============================================================================
-- NOTAS IMPORTANTES:
-- =============================================================================
-- 1. QuantumLeap creará automáticamente las tablas cuando reciba notificaciones
-- 2. Las tablas seguirán el formato: <entity_type>_<entity_id>_<attribute_name>
-- 3. TimescaleDB particionará automáticamente las tablas por tiempo
-- 4. No es necesario crear tablas manualmente
-- =============================================================================



