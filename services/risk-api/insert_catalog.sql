
-- Nekazari Risk Catalog - 20 SOTA Risk Models
INSERT INTO admin_platform.risk_catalog (risk_code, risk_name, risk_description, risk_domain, target_sdm_type, is_active, model_type, model_config)
VALUES 
-- Category 1: Climate
('frost_spring', 'Helada Primaveral', 'Riesgo crítico en floración por temperaturas bajo cero.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "dewPoint", "windSpeed"], "logic": "T < 0"}'),
('heat_stress', 'Golpe de Calor', 'Estrés por calor extremo y baja humedad.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "relativeHumidity"], "logic": "T > 35 & H < 30"}'),
('hail_proxy', 'Riesgo de Granizo', 'Caída brusca de presión y temperatura con lluvia.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "atmosphericPressure", "precipitation"], "logic": "ΔP > 5 & ΔT > 8"}'),
('wind_damage', 'Daño por Viento', 'Peligro de rotura de ramas o caída de frutos.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["windSpeed", "windDirection"], "logic": "V > 60"}'),
('sunburn', 'Insolación de Fruto', 'Daño por radiación solar directa intensa.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["solarRadiation", "airTemperature"], "logic": "R > 850 & T > 33"}'),
('fire_30_30_30', 'Riesgo de Incendio (30-30-30)', 'Regla clásica de incendio agrícola/forestal.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "relativeHumidity", "windSpeed"], "logic": "T>30, H<30, V>30"}'),

-- Category 2: Water & Soil
('water_stress', 'Estrés Hídrico Severo', 'Falta de agua disponible en la zona radicular.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["soilMoistureVwc", "airTemperature"], "logic": "VWC < 15"}'),
('waterlogging', 'Asfixia Radicular', 'Saturación prolongada de agua en el suelo.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["soilMoistureVwc", "precipitation"], "logic": "VWC > 45 for 48h"}'),
('saline_stress', 'Estrés Salino', 'Bloqueo por exceso de sales en el suelo.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["electroConductivity", "soilMoistureVwc"], "logic": "EC > 4"}'),
('nutrient_leaching', 'Lixiviación de Nutrientes', 'Lavado de fertilizantes por lluvia intensa.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["precipitation"], "logic": "P > 40mm/24h"}'),
('root_thermal_stress', 'Estrés Térmico Radicular', 'Temperatura del suelo fuera de rango óptimo.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["soilTemperature"], "logic": "ST > 28 | ST < 5"}'),

-- Category 3: Fungi
('oidio_gubler', 'Oídio (Gubler-Thomas)', 'Riesgo de ceniza por calor y humedad sin lluvia.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "relativeHumidity"], "logic": "T 20-30 & H > 80"}'),
('mildiu_goidanich', 'Mildiu (Goidanich)', 'Riesgo tras lluvias con temperaturas cálidas.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "precipitation", "leafWetness"], "logic": "T > 10 & P > 10"}'),
('botrytis', 'Botrytis (Pudrición)', 'Peligro por humedad foliar prolongada.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["leafWetness", "airTemperature"], "logic": "LW > 12h & T 15-20"}'),
('rust_yellow', 'Roya Amarilla/Parda', 'Riesgo en cereales por humedad nocturna.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["leafWetness", "airTemperature"], "logic": "LW night & T 10-15"}'),
('fire_blight', 'Fuego Bacteriano', 'Riesgo extremo en floración de frutales.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "leafWetness", "relativeHumidity"], "logic": "T > 18 & LW"}'),

-- Category 4: Pests
('red_spider', 'Araña Roja', 'Proliferación en ambientes cálidos y secos.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "relativeHumidity"], "logic": "T > 30 & H < 40"}'),
('fruit_fly', 'Mosca de la Fruta', 'Actividad biológica según temperatura.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature"], "logic": "T 16-32"}'),
('aphids', 'Pulgón', 'Riesgo por calor suave y exceso de nitrógeno.', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature", "vegetationIndex"], "logic": "T 20-25 & NDVI high"}'),
('gdd_lobesia', 'Polilla del Racimo', 'Ciclo biológico por acumulación de calor (GDD).', 'agronomic', 'AgriParcel', true, 'threshold', '{"params": ["airTemperature"], "logic": "GDD > threshold"}')
ON CONFLICT (risk_code) DO UPDATE SET 
    risk_name = EXCLUDED.risk_name,
    risk_description = EXCLUDED.risk_description,
    model_config = EXCLUDED.model_config;
