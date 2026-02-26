-- =============================================================================
-- Migration 053: Frost, Wind Spray and Water Stress Risk Models
-- =============================================================================
-- Adds three new agronomic risks to the catalog:
--   FROST          — temperature-based frost risk (uses temp_min)
--   WIND_SPRAY     — wind conditions for phytosanitary applications (uses wind_speed_ms)
--   WATER_STRESS   — crop water stress (uses precip_mm, eto_mm, soil_moisture_0_10cm)
--
-- All data fields are already present in weather_observations (no schema changes needed).
-- =============================================================================

-- ── FROST ─────────────────────────────────────────────────────────────────────
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
    'FROST',
    'Riesgo de Helada',
    'Evaluación del riesgo de helada basada en la temperatura mínima prevista. '
    'Umbrales: >2°C sin riesgo, 0-2°C vigilancia, -2-0°C helada leve, -5--2°C helada moderada, <-5°C helada severa.',
    'AgriParcel',
    NULL,
    '["weather"]',
    'agronomic',
    'batch',
    'frost',
    '{"watch_threshold": 2.0, "light_threshold": 0.0, "moderate_threshold": -2.0, "severe_threshold": -5.0}',
    '{"low": 35, "medium": 60, "high": 80, "critical": 93}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;


-- ── WIND SPRAY ────────────────────────────────────────────────────────────────
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
    'WIND_SPRAY',
    'Viento para Pulverización',
    'Evaluación de las condiciones de viento para la aplicación de productos fitosanitarios. '
    'Referencia AEPLA y Directiva UE 2009/128/CE: <3 m/s apto, 3-5 m/s precaución, >5 m/s no apto.',
    'AgriParcel',
    NULL,
    '["weather"]',
    'agronomic',
    'batch',
    'wind_spray',
    '{"suitable_max": 3.0, "caution_max": 5.0}',
    '{"low": 25, "medium": 55, "high": 80, "critical": 92}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;


-- ── WATER STRESS ──────────────────────────────────────────────────────────────
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
    'WATER_STRESS',
    'Estrés Hídrico',
    'Evaluación del estrés hídrico del cultivo mediante balance hídrico (precip - ETo) y humedad del suelo (0-10 cm). '
    'El balance hídrico negativo indica déficit de agua. Umbrales: >0mm sin estrés, 0..-5mm leve, -5..-15mm moderado, <-15mm severo.',
    'AgriParcel',
    NULL,
    '["weather"]',
    'agronomic',
    'batch',
    'water_stress',
    '{"balance_watch": 0.0, "balance_moderate": -5.0, "balance_stress": -15.0, "soil_stress_min": 15.0, "soil_severe_min": 10.0, "soil_weight": 0.3}',
    '{"low": 28, "medium": 55, "high": 75, "critical": 90}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;
