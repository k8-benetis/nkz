-- =============================================================================
-- Migration 054: GDD Pest Cycle Alerts
-- =============================================================================
-- Adds Growing Degree Day (GDD) based pest pressure risks to the catalog.
-- GDD accumulation uses the existing gdd_accumulated column in weather_observations.
-- Data is summed from the configured season_start_doy (day of year) to today.
--
-- Pest references (Spain / Mediterranean climate):
--   Prays oleae (olive moth)  — base 10°C, alert ~250 GDD from Jan 1
--   Lobesia botrana 1st gen   — base 10°C, alert ~120 GDD from Feb 1 (doy=32)
--   Lobesia botrana 2nd gen   — base 10°C, alert ~560 GDD from Feb 1 (doy=32)
-- =============================================================================


-- ── Olive moth — Prays oleae ──────────────────────────────────────────────────
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
    'GDD_PRAYS_OLEAE',
    'Prays oleae (Polilla del Olivo)',
    'Riesgo de presión de Prays oleae (polilla del olivo) basado en GDD acumulados desde el 1 de enero. '
    'Umbrales (base 10°C): <100 GDD sin riesgo, 100-250 GDD vigilancia, 250-400 GDD alerta, >400 GDD presión crítica. '
    'Aplicable a parcelas de olivar.',
    'AgriParcel',
    'olive',
    '["gdd"]',
    'agronomic',
    'batch',
    'gdd_pest',
    '{
        "base_temp": 10.0,
        "season_start_doy": 1,
        "watch_threshold": 100,
        "alert_threshold": 250,
        "critical_threshold": 400,
        "crop_type": "olive",
        "pest_name": "Prays oleae"
    }',
    '{"low": 30, "medium": 60, "high": 80, "critical": 92}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;


-- ── Grape berry moth 1st generation — Lobesia botrana ────────────────────────
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
    'GDD_LOBESIA_1ST',
    'Lobesia botrana — 1.ª generación (Polilla del Racimo)',
    'Riesgo de 1.ª generación de Lobesia botrana (polilla del racimo de la uva). '
    'Base 10°C, acumulación desde el 1 de febrero (doy=32). '
    'Vuelo típico: 80-120 GDD. Puesta de huevos y daños en yemas/inflorescencias.',
    'AgriParcel',
    'vine',
    '["gdd"]',
    'agronomic',
    'batch',
    'gdd_pest',
    '{
        "base_temp": 10.0,
        "season_start_doy": 32,
        "watch_threshold": 60,
        "alert_threshold": 100,
        "critical_threshold": 180,
        "crop_type": "vine",
        "pest_name": "Lobesia botrana 1.ª gen."
    }',
    '{"low": 25, "medium": 55, "high": 78, "critical": 91}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;


-- ── Grape berry moth 2nd generation — Lobesia botrana ────────────────────────
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
    'GDD_LOBESIA_2ND',
    'Lobesia botrana — 2.ª generación (Polilla del Racimo)',
    'Riesgo de 2.ª generación de Lobesia botrana. Base 10°C, acumulación desde el 1 de febrero. '
    'Vuelo típico: 430-560 GDD (junio-julio). Daños en bayas en envero.',
    'AgriParcel',
    'vine',
    '["gdd"]',
    'agronomic',
    'batch',
    'gdd_pest',
    '{
        "base_temp": 10.0,
        "season_start_doy": 32,
        "watch_threshold": 380,
        "alert_threshold": 480,
        "critical_threshold": 600,
        "crop_type": "vine",
        "pest_name": "Lobesia botrana 2.ª gen."
    }',
    '{"low": 25, "medium": 55, "high": 78, "critical": 91}',
    true
)
ON CONFLICT (risk_code) DO UPDATE SET
    risk_name        = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config     = EXCLUDED.model_config,
    severity_levels  = EXCLUDED.severity_levels,
    is_active        = EXCLUDED.is_active;
