-- =============================================================================
-- Migration 051: Spray Suitability Risk Model
-- =============================================================================
-- Adds SPRAY_SUITABILITY to the risk catalog.
-- Evaluates optimal spraying conditions based on Delta T (dry bulb - wet bulb).
-- Delta T data is already calculated by weather-worker in weather_observations.delta_t
-- =============================================================================

INSERT INTO admin_platform.risk_catalog (
    risk_code,
    risk_name,
    risk_description,
    target_sdm_type,
    target_subtype,
    data_sources,
    risk_domain,
    evaluation_mode,
    model_type,
    model_config,
    severity_levels,
    is_active
) VALUES (
    'SPRAY_SUITABILITY',
    'Idoneidad de Pulverización',
    'Evaluación de condiciones óptimas para tratamientos fitosanitarios basada en Delta T (diferencia entre temperatura de bulbo seco y húmedo). Delta T 2-8°C óptimo, 8-10°C precaución, >10°C o <2°C no apto.',
    'AgriParcel',
    NULL,
    '["weather"]',
    'agronomic',
    'batch',
    'spray_suitability',
    '{"optimal_min": 2, "optimal_max": 8, "caution_max": 10}',
    '{"low": 25, "medium": 50, "high": 75, "critical": 90}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config = EXCLUDED.model_config,
    severity_levels = EXCLUDED.severity_levels,
    is_active = EXCLUDED.is_active;
