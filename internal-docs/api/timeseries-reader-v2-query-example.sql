-- Stress / audit: run against staging or production read-replica.
-- Production contract: payload.measurements is a flat JSON object (SDM-style keys, numeric values).
-- Expect Index Scan on (tenant_id, device_id, observed_at) after migration 062 (ix_telemetry_tenant_device_time).

EXPLAIN (ANALYZE, BUFFERS)
WITH series_0 AS (
  SELECT time_bucket_gapfill('1 hour'::interval, e.observed_at) AS bucket,
         locf(AVG((NULLIF(trim(e.payload->'measurements'->>'soilMoisture'), ''))::double precision))::float8 AS value_0
  FROM telemetry_events e
  WHERE e.tenant_id = 'tenant_demo'
    AND e.observed_at >= '2025-01-01T00:00:00+00'::timestamptz
    AND e.observed_at < '2025-01-31T00:00:00+00'::timestamptz
    AND e.device_id = 'sensor_device_01'
  GROUP BY time_bucket_gapfill('1 hour'::interval, e.observed_at)
),
series_1 AS (
  SELECT time_bucket_gapfill('1 hour'::interval, observed_at) AS bucket,
         locf(AVG("humidity_avg"))::float8 AS value_1
  FROM weather_observations
  WHERE tenant_id = 'tenant_demo'
    AND observed_at >= '2025-01-01T00:00:00+00'::timestamptz
    AND observed_at < '2025-01-31T00:00:00+00'::timestamptz
    AND (station_id = '28079' OR municipality_code = '28079')
  GROUP BY time_bucket_gapfill('1 hour'::interval, observed_at)
)
SELECT
  EXTRACT(EPOCH FROM bucket)::float8 AS timestamp,
  s0.value_0,
  s1.value_1
FROM series_0 s0
FULL OUTER JOIN series_1 s1 USING (bucket)
ORDER BY timestamp ASC;
