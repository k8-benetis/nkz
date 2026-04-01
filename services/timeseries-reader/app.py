#!/usr/bin/env python3
# =============================================================================
# Timeseries Reader Service - API for querying historical telemetry from TimescaleDB
# =============================================================================

import io
import os
import sys
import tempfile
import uuid
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple, Union
from flask import Flask, request, jsonify, g, Response
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from dateutil.parser import isoparse

try:
    import pyarrow as pa
    import pyarrow.csv as pa_csv
    import pyarrow.parquet as pa_parquet
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False
    pa_csv = None
    pa_parquet = None

ARROW_STREAM_TYPE = "application/vnd.apache.arrow.stream"
# Parquet exports written under this prefix. Configure MinIO lifecycle (ILM) to delete objects
# under this prefix after 1 hour to prevent storage leaks. See docs/DEPLOYMENT_EXPORTS_MINIO.md
EXPORT_BUCKET_PREFIX = "exports/"
PRESIGNED_EXPIRY_SECONDS = 3600  # 1 hour; must match MinIO ILM TTL for exports/

# Add common directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'common'))

try:
    from auth_middleware import require_auth, inject_fiware_headers
except ImportError:
    logging.warning("auth_middleware not available - auth will be disabled")
    def require_auth(f):
        return f
    def inject_fiware_headers(headers, tenant):
        headers['Fiware-Service'] = tenant
        return headers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from urn_resolution import plan_timeseries_read, normalize_device_id
except ImportError:
    plan_timeseries_read = None  # type: ignore
    normalize_device_id = lambda x: x.rsplit(":", 1)[-1] if x and ":" in x else (x or "")  # type: ignore

# Whitelist of valid column names to prevent SQL injection (weather_observations only).
# Never interpolate user input into SQL as identifiers except values verified against these sets.
VALID_ATTRIBUTES = frozenset({
    'temp_avg', 'temp_min', 'temp_max',
    'humidity_avg', 'precip_mm',
    'solar_rad_w_m2', 'eto_mm',
    'soil_moisture_0_10cm', 'wind_speed_ms',
    'pressure_hpa',
})

# Whitelist for telemetry payload.measurements object keys (bound as %s via ->>; restricted to known names).
# Extend via env TIMESERIES_V2_TELEMETRY_ATTR_WHITELIST_EXTRA=comma,separated,keys
_VALID_TELEMETRY_BASE = frozenset({
    'soilMoisture', 'soilTemperature', 'airTemperature', 'relativeHumidity',
    'atmosphericPressure', 'windSpeed', 'windDirection', 'solarRadiation',
    'rainGauge', 'illuminance', 'depth', 'conductance', 'batteryLevel',
    'humidity', 'temperature',
})

# NGSI-LD / provisioning typos vs Smart Data Models: UI may show these names but
# telemetry_events.measurements uses the canonical JSON key (right-hand side).
_TELEMETRY_MEASUREMENT_UI_ALIASES: Dict[str, str] = {
    "sensorsinsolation": "solarRadiation",
}


def _telemetry_measurement_whitelist() -> frozenset:
    extra = os.getenv("TIMESERIES_V2_TELEMETRY_ATTR_WHITELIST_EXTRA", "")
    if not extra.strip():
        return _VALID_TELEMETRY_BASE
    more = frozenset(x.strip() for x in extra.split(",") if x.strip())
    return _VALID_TELEMETRY_BASE | more


def _resolve_telemetry_measurement_key(requested: str) -> Optional[str]:
    """
    Map a requested attribute (from Orion/Data BFF) to the key inside payload.measurements.
    Returns None if neither the request nor a known alias targets a whitelisted key.
    """
    twl = _telemetry_measurement_whitelist()
    r = (requested or "").strip()
    if not r:
        return None
    if r in twl:
        return r
    canonical = _TELEMETRY_MEASUREMENT_UI_ALIASES.get(r)
    if canonical and canonical in twl:
        return canonical
    return None

# Hard cap for POST /v2/query series count (DoS / query size). Override via env if needed.
MAX_V2_QUERY_SERIES = int(os.getenv("MAX_V2_QUERY_SERIES", "10"))

app = Flask(__name__)
_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',') if o.strip()]
CORS(app, origins=_cors_origins, supports_credentials=True)

# Configuration
POSTGRES_URL = os.getenv('POSTGRES_URL')
if not POSTGRES_URL:
    raise ValueError("POSTGRES_URL environment variable is required")

LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
logger.setLevel(getattr(logging, LOG_LEVEL))


# =============================================================================
# Database Connection
# =============================================================================

def get_db_connection():
    """Get PostgreSQL connection"""
    try:
        conn = psycopg2.connect(
            POSTGRES_URL,
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise


# =============================================================================
# Helper Functions
# =============================================================================

def parse_datetime(value: str) -> datetime:
    """Parse ISO 8601 datetime string"""
    if isinstance(value, datetime):
        return value
    return isoparse(value)


def get_tenant_from_request() -> Optional[str]:
    """Extract tenant ID: must agree with JWT (g.tenant) when gateway sends X-Tenant-ID/Fiware-Service."""
    if getattr(g, "system_gateway_delegation", False):
        t = getattr(g, "tenant", None) or getattr(g, "tenant_id", None)
        if t and str(t).strip():
            return str(t).strip()
        return None

    jwt_tenant = getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None)
    header_tenant = request.headers.get('X-Tenant-ID') or request.headers.get('Fiware-Service')
    if header_tenant:
        header_tenant = header_tenant.strip() or None
    g._tenant_mismatch = False
    if jwt_tenant and header_tenant and jwt_tenant != header_tenant:
        g._tenant_mismatch = True
        logger.warning("Tenant header does not match token tenant")
        return None
    return jwt_tenant or header_tenant


def _resolve_tenant_context() -> Union[str, Tuple[Any, int]]:
    """Return tenant_id or (jsonify body, status_code)."""
    tenant_id = get_tenant_from_request()
    if getattr(g, '_tenant_mismatch', False):
        return jsonify({'error': 'Tenant header does not match token'}), 403
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
    return tenant_id


def format_time_bucket(aggregation: str) -> Optional[str]:
    """Convert aggregation type to TimescaleDB time_bucket interval"""
    mapping = {
        'none': None,  # No aggregation
        'hourly': '1 hour',
        'daily': '1 day',
        'weekly': '7 days',
        'monthly': '1 month',
    }
    return mapping.get(aggregation.lower(), '1 hour')


# Standard intervals for quantization (seconds, PostgreSQL interval string).
# Using standard intervals optimizes TimescaleDB query planner and cache.
STANDARD_INTERVALS: List[Tuple[int, str]] = [
    (1, "1 second"),
    (5, "5 seconds"),
    (10, "10 seconds"),
    (15, "15 seconds"),
    (30, "30 seconds"),
    (60, "1 minute"),
    (300, "5 minutes"),
    (900, "15 minutes"),
    (1800, "30 minutes"),
    (3600, "1 hour"),
    (7200, "2 hours"),
    (21600, "6 hours"),
    (43200, "12 hours"),
    (86400, "1 day"),
    (604800, "1 week"),
    (2592000, "1 month"),
]
STANDARD_INTERVAL_STRINGS = frozenset(pg for _, pg in STANDARD_INTERVALS)

# Device / weather-key sanity (parameter values, not SQL identifiers)
_SAFE_DEVICE_ID = re.compile(r"^[a-zA-Z0-9_:.\-]{1,256}$")
# Municipality INE-style or alphanumeric station keys (parameter binding only)
_SAFE_WEATHER_ENTITY_KEY = re.compile(r"^[a-zA-Z0-9_.\-]{1,64}$")


def _execute_align_query(
    conn,
    tenant_id: str,
    start_dt: datetime,
    end_dt: datetime,
    resolution: int,
    validated_series: List[Tuple[str, str]],
    bucket_interval_override: Optional[str] = None,
) -> pa.Table:
    """
    Run the same horizontal pivot SQL as Phase 2 (time_bucket_gapfill + locf + FILTER).
    Returns a pyarrow.Table: timestamp (float64) + value_0, value_1, ... (float64).
    Used by both /align (Arrow IPC) and /export (CSV/Parquet).
    If bucket_interval_override is set (e.g. "1 hour", "1 day"), use it; else derive from resolution.
    """
    n = len(validated_series)
    entity_ids = [eid for eid, _ in validated_series]
    in_placeholders = ", ".join(["%s"] * n)
    if bucket_interval_override and bucket_interval_override in STANDARD_INTERVAL_STRINGS:
        bucket_interval = bucket_interval_override
    else:
        bucket_interval = calculate_dynamic_bucket(start_dt, end_dt, resolution)
    if bucket_interval not in STANDARD_INTERVAL_STRINGS:
        bucket_interval = "1 hour"
    locf_parts = []
    params: List[Any] = [bucket_interval]
    for idx, (entity_id, attribute) in enumerate(validated_series):
        if attribute not in VALID_ATTRIBUTES:
            raise ValueError(f"Invalid attribute: {attribute}")
        # SAFE: idx is an integer from enumerate(), immune to SQLi.
        locf_parts.append(
            f'locf(AVG("{attribute}") FILTER (WHERE station_id = %s OR municipality_code = %s))::float8 AS value_{idx}'
        )
        params.extend([entity_id, entity_id])
    params.extend([tenant_id, start_dt, end_dt])
    params.extend(entity_ids)
    params.extend(entity_ids)
    params.append(bucket_interval)
    sql = f"""
        SELECT
            EXTRACT(EPOCH FROM time_bucket_gapfill(%s::interval, observed_at))::float8 AS timestamp,
            {", ".join(locf_parts)}
        FROM weather_observations
        WHERE tenant_id = %s
          AND observed_at >= %s AND observed_at < %s
          AND (station_id IN ({in_placeholders}) OR municipality_code IN ({in_placeholders}))
        GROUP BY time_bucket_gapfill(%s::interval, observed_at)
        ORDER BY timestamp ASC
    """
    cursor = conn.cursor()
    try:
        try:
            cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
        except Exception:
            pass
        cursor.execute(sql, params)
        rows = cursor.fetchall()
    finally:
        cursor.close()
    if not rows:
        cols: Dict[str, pa.Array] = {"timestamp": pa.array([], type=pa.float64())}
        for idx in range(n):
            cols[f"value_{idx}"] = pa.array([], type=pa.float64())
        return pa.table(cols)
    timestamps = pa.array([r["timestamp"] for r in rows], type=pa.float64())
    cols = {"timestamp": timestamps}
    for idx in range(n):
        cols[f"value_{idx}"] = pa.array([r[f"value_{idx}"] for r in rows], type=pa.float64())
    return pa.table(cols)


def _execute_telemetry_align_query(
    conn,
    tenant_id: str,
    start_dt: datetime,
    end_dt: datetime,
    resolution: int,
    validated_series: List[Tuple[str, str]],
    bucket_interval_override: Optional[str] = None,
) -> pa.Table:
    """
    Align multiple IoT series on telemetry_events using direct JSONB key reads
    (payload.measurements->>key). Each row contributes at most one value per series per bucket.

    Arrow: Float64 epoch seconds on timestamp column.
    """
    n = len(validated_series)
    if bucket_interval_override and bucket_interval_override in STANDARD_INTERVAL_STRINGS:
        bucket_interval = bucket_interval_override
    else:
        bucket_interval = calculate_dynamic_bucket(start_dt, end_dt, resolution)
    if bucket_interval not in STANDARD_INTERVAL_STRINGS:
        bucket_interval = "1 hour"

    flat_meas = "(NULLIF(trim(e.payload->'measurements'->>%s), ''))::double precision"

    locf_parts: List[str] = []
    params: List[Any] = [bucket_interval]
    for idx, (device_id, meas_type) in enumerate(validated_series):
        # SAFE: idx is an integer from enumerate(), immune to SQLi.
        locf_parts.append(
            f"""locf(avg(
    (CASE WHEN e.device_id = %s THEN {flat_meas} END)
  ))::float8 AS value_{idx}"""
        )
        params.extend([device_id, meas_type])

    unique_devices = list(dict.fromkeys(d for d, _ in validated_series))
    params.extend([tenant_id, start_dt, end_dt, unique_devices, bucket_interval])

    sql = f"""
        SELECT
            EXTRACT(EPOCH FROM time_bucket_gapfill(%s::interval, e.observed_at))::float8 AS timestamp,
            {", ".join(locf_parts)}
        FROM telemetry_events e
        WHERE e.tenant_id = %s
          AND e.observed_at >= %s AND e.observed_at < %s
          AND e.device_id = ANY(%s)
        GROUP BY time_bucket_gapfill(%s::interval, e.observed_at)
        ORDER BY timestamp ASC
    """
    cursor = conn.cursor()
    try:
        try:
            cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
        except Exception:
            pass
        cursor.execute(sql, params)
        rows = cursor.fetchall()
    finally:
        cursor.close()
    if not rows:
        cols: Dict[str, pa.Array] = {"timestamp": pa.array([], type=pa.float64())}
        for idx in range(n):
            cols[f"value_{idx}"] = pa.array([], type=pa.float64())
        return pa.table(cols)
    timestamps = pa.array([r["timestamp"] for r in rows], type=pa.float64())
    cols: Dict[str, pa.Array] = {"timestamp": timestamps}
    for idx in range(n):
        cols[f"value_{idx}"] = pa.array([r[f"value_{idx}"] for r in rows], type=pa.float64())
    return pa.table(cols)


def _execute_v2_align_unified_sql(
    conn,
    tenant_id: str,
    start_dt: datetime,
    end_dt: datetime,
    resolution: int,
    ordered_specs: List[Tuple[str, str, str]],
    bucket_interval_override: Optional[str] = None,
) -> pa.Table:
    """
    Single SQL for POST /v2/query: dynamic CTEs per series, then chained
    FULL OUTER JOIN … USING (bucket); `EXTRACT(EPOCH FROM bucket)::float8` for Arrow/uPlot.

    ordered_specs: ("weather", key, attr) or ("telemetry", device_id, meas_key).
    Weather attr must be in VALID_ATTRIBUTES (identifier-safe). Telemetry meas_key is a whitelisted JSON key (bound as %s).

    Output timestamp: Float64 epoch seconds for Arrow / uPlot.
    """
    n = len(ordered_specs)
    if n == 0:
        raise ValueError("no series")

    if bucket_interval_override and bucket_interval_override in STANDARD_INTERVAL_STRINGS:
        bucket_interval = bucket_interval_override
    else:
        bucket_interval = calculate_dynamic_bucket(start_dt, end_dt, resolution)
    if bucket_interval not in STANDARD_INTERVAL_STRINGS:
        bucket_interval = "1 hour"

    cte_sql_parts: List[str] = []
    params: List[Any] = []

    for i, (kind, key, attr) in enumerate(ordered_specs):
        # SAFE: i is an integer from enumerate(), immune to SQLi.
        if kind == "weather":
            if attr not in VALID_ATTRIBUTES:
                raise ValueError(f"Invalid weather attribute: {attr}")
            cte_sql_parts.append(
                f"""series_{i} AS (
  SELECT time_bucket_gapfill(%s::interval, observed_at) AS bucket,
         locf(AVG("{attr}"))::float8 AS value_{i}
  FROM weather_observations
  WHERE tenant_id = %s AND observed_at >= %s AND observed_at < %s
    AND (station_id = %s OR municipality_code = %s)
  GROUP BY time_bucket_gapfill(%s::interval, observed_at)
)"""
            )
            params.extend([bucket_interval, tenant_id, start_dt, end_dt, key, key, bucket_interval])
        elif kind == "telemetry":
            cte_sql_parts.append(
                f"""series_{i} AS (
  SELECT time_bucket_gapfill(%s::interval, e.observed_at) AS bucket,
         locf(AVG((NULLIF(trim(e.payload->'measurements'->>%s), ''))::double precision))::float8 AS value_{i}
  FROM telemetry_events e
  WHERE e.tenant_id = %s AND e.observed_at >= %s AND e.observed_at < %s
    AND e.device_id = %s
  GROUP BY time_bucket_gapfill(%s::interval, e.observed_at)
)"""
            )
            params.extend([bucket_interval, attr, tenant_id, start_dt, end_dt, key, bucket_interval])
        else:
            raise ValueError(f"Unknown series kind: {kind}")

    select_vals = ", ".join(f"s{i}.value_{i}" for i in range(n))

    if n == 1:
        from_sql = "series_0 s0"
    else:
        join_lines = [
            f"FULL OUTER JOIN series_{i} s{i} USING (bucket)"
            for i in range(1, n)
        ]
        from_sql = "series_0 s0\n" + "\n".join(join_lines)

    sql = f"""
WITH {", ".join(cte_sql_parts)}
SELECT
  EXTRACT(EPOCH FROM bucket)::float8 AS timestamp,
  {select_vals}
FROM {from_sql}
ORDER BY timestamp ASC
"""

    cursor = conn.cursor()
    try:
        try:
            cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
        except Exception:
            pass
        cursor.execute(sql, params)
        rows = cursor.fetchall()
    finally:
        cursor.close()

    if not rows:
        cols: Dict[str, pa.Array] = {"timestamp": pa.array([], type=pa.float64())}
        for idx in range(n):
            cols[f"value_{idx}"] = pa.array([], type=pa.float64())
        return pa.table(cols)

    ts_col = pa.array([r["timestamp"] for r in rows], type=pa.float64())
    cols_out: Dict[str, pa.Array] = {"timestamp": ts_col}
    for idx in range(n):
        cols_out[f"value_{idx}"] = pa.array([r[f"value_{idx}"] for r in rows], type=pa.float64())
    return pa.table(cols_out)


def calculate_dynamic_bucket(start_time: datetime, end_time: datetime, resolution: int) -> str:
    """
    Compute the time_bucket interval so that the number of points does not exceed
    resolution, using only standard PostgreSQL intervals (quantization).
    """
    delta_seconds = (end_time - start_time).total_seconds()
    if delta_seconds <= 0 or resolution <= 0:
        return "1 second"
    raw_bucket_sec = delta_seconds / resolution
    for sec, pg_interval in STANDARD_INTERVALS:
        if raw_bucket_sec <= sec:
            return pg_interval
    return "1 month"


# =============================================================================
# API Endpoints
# =============================================================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1')
            cursor.close()
        return jsonify({'status': 'healthy'}), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500


@app.route('/api/timeseries/entities', methods=['GET'])
@require_auth
def list_timeseries_entities():
    """
    List entity IDs that have timeseries data (weather_observations.station_id and municipality_code).
    Used by DataHub and other clients to show which "entities" can be queried for temp_avg, humidity_avg, etc.
    Returns: { "entities": [ { "id": "<station_id or municipality_code>", "name": "<label>", "attributes": [...] } ] }
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx
    attributes_list = sorted(VALID_ATTRIBUTES)
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
            except Exception:
                pass
            cursor.execute("""
                SELECT DISTINCT station_id AS id FROM weather_observations
                WHERE tenant_id = %s AND station_id IS NOT NULL AND station_id != ''
                UNION
                SELECT DISTINCT municipality_code AS id FROM weather_observations
                WHERE tenant_id = %s AND municipality_code IS NOT NULL AND municipality_code != ''
                ORDER BY id
            """, (tenant_id, tenant_id))
            rows = cursor.fetchall()
            cursor.close()
        entities = [
            {"id": str(r["id"]), "name": str(r["id"]), "attributes": attributes_list, "source": "timescale"}
            for r in rows
        ]
        return jsonify({"entities": entities})
    except Exception as e:
        logger.error(f"Error listing timeseries entities: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/timeseries/entities/<entity_id>/data', methods=['GET'])
@require_auth
def get_entity_timeseries(entity_id: str):
    """
    Get historical timeseries data for an entity.

    Query params:
        - start_time: ISO 8601 datetime (required)
        - end_time: ISO 8601 datetime (default: now)
        - aggregation: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' (ignored when resolution is set)
        - resolution: target number of points; bucket is quantized to a standard interval (optional)
        - attribute: attribute name (required when format=arrow)
        - limit: max number of points (default: 1000)
        - format: 'json' | 'arrow' (default: json). When 'arrow', returns Apache Arrow IPC stream (timestamp float64 epoch sec, value float64).
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx

    try:
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        aggregation = request.args.get('aggregation', 'none')
        resolution_param = request.args.get('resolution', type=int)
        attribute = request.args.get('attribute')
        limit = int(request.args.get('limit', 1000))
        fmt = (request.args.get('format') or request.headers.get('Accept', '')).split(',')[0].strip().lower()
        if 'arrow' in fmt or request.args.get('format') == 'arrow':
            fmt = 'arrow'
        else:
            fmt = 'json'

        if not start_time:
            return jsonify({'error': 'start_time parameter is required'}), 400
        if attribute and attribute not in VALID_ATTRIBUTES:
            return jsonify({'error': f'Invalid attribute: {attribute}'}), 400
        if fmt == 'arrow':
            if not HAS_PYARROW:
                return jsonify({'error': 'Arrow format not available (pyarrow not installed)'}), 503
            if not attribute:
                return jsonify({'error': 'attribute is required when format=arrow'}), 400

        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time) if end_time else datetime.utcnow()
        if start_dt >= end_dt:
            return jsonify({'error': 'start_time must be before end_time'}), 400

        # When resolution is set, use quantized standard bucket; otherwise use aggregation
        if resolution_param is not None and resolution_param > 0:
            bucket_interval = calculate_dynamic_bucket(start_dt, end_dt, min(resolution_param, limit))
            if bucket_interval not in STANDARD_INTERVAL_STRINGS:
                bucket_interval = "1 hour"
            time_bucket = bucket_interval
        else:
            time_bucket = format_time_bucket(aggregation)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
            except Exception:
                pass

            if fmt == 'arrow' and time_bucket:
                # Arrow path: single attribute, epoch float8 + value float8 (parameterised bucket)
                query_arrow = """
                    SELECT
                        EXTRACT(EPOCH FROM time_bucket(%s::interval, observed_at))::float8 AS timestamp,
                        AVG(""" + attribute + """)::float8 AS value
                    FROM weather_observations
                    WHERE tenant_id = %s AND observed_at >= %s AND observed_at < %s
                      AND (station_id = %s OR municipality_code = %s)
                    GROUP BY time_bucket(%s::interval, observed_at)
                    ORDER BY timestamp ASC
                """
                cursor.execute(
                    query_arrow,
                    (time_bucket, tenant_id, start_dt, end_dt, entity_id, entity_id, time_bucket),
                )
                rows = cursor.fetchall()
                cursor.close()
                timestamps = pa.array([r["timestamp"] for r in rows], type=pa.float64())
                values = pa.array([r["value"] for r in rows], type=pa.float64())
                table = pa.table({"timestamp": timestamps, "value": values})
                sink = pa.BufferOutputStream()
                with pa.ipc.new_stream(sink, table.schema) as writer:
                    writer.write_table(table)
                body = sink.getvalue().to_pybytes()
                return Response(
                    body,
                    status=200,
                    mimetype=ARROW_STREAM_TYPE,
                    headers={"Content-Length": str(len(body))},
                )
            elif fmt == 'arrow':
                return jsonify({'error': 'format=arrow requires aggregation or resolution'}), 400

            # JSON path
            if time_bucket:
                query = """
                    SELECT
                        time_bucket(%s::interval, observed_at) AS timestamp,
                        AVG(temp_avg) AS temp_avg,
                        MIN(temp_min) AS temp_min,
                        MAX(temp_max) AS temp_max,
                        AVG(humidity_avg) AS humidity_avg,
                        AVG(precip_mm) AS precip_mm,
                        AVG(solar_rad_w_m2) AS solar_rad_w_m2,
                        AVG(eto_mm) AS eto_mm,
                        AVG(soil_moisture_0_10cm) AS soil_moisture_0_10cm,
                        AVG(wind_speed_ms) AS wind_speed_ms,
                        AVG(pressure_hpa) AS pressure_hpa
                    FROM weather_observations
                    WHERE tenant_id = %s AND observed_at >= %s AND observed_at < %s
                      AND (station_id = %s OR municipality_code = %s)
                    GROUP BY time_bucket(%s::interval, observed_at)
                    ORDER BY timestamp ASC
                    LIMIT %s
                """
                cursor.execute(
                    query,
                    (time_bucket, tenant_id, start_dt, end_dt, entity_id, entity_id, time_bucket, limit),
                )
            else:
                query = """
                    SELECT
                        observed_at AS timestamp,
                        temp_avg, temp_min, temp_max, humidity_avg, precip_mm,
                        solar_rad_w_m2, eto_mm, soil_moisture_0_10cm, wind_speed_ms, pressure_hpa
                    FROM weather_observations
                    WHERE tenant_id = %s AND observed_at >= %s AND observed_at < %s
                      AND (station_id = %s OR municipality_code = %s)
                    ORDER BY observed_at ASC
                    LIMIT %s
                """
                cursor.execute(query, (tenant_id, start_dt, end_dt, entity_id, entity_id, limit))

            rows = cursor.fetchall()
            cursor.close()
            data = []
            for row in rows:
                point = {
                    "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                }
                for attr in VALID_ATTRIBUTES:
                    if (not attribute or attribute == attr) and row.get(attr) is not None:
                        point[attr] = float(row[attr])
                if len(point) > 1:
                    data.append(point)
            return jsonify({
                "entity_id": entity_id,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "aggregation": aggregation,
                "count": len(data),
                "data": data,
            }), 200

    except Exception as e:
        logger.error(f"Error querying timeseries: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/timeseries/align', methods=['POST'])
@require_auth
def post_timeseries_align():
    """
    Align multiple series on a single time grid (semi-open range [start_time, end_time)).
    Body: {"start_time": "...", "end_time": "...", "resolution": 1000, "series": [{"entity_id": "...", "attribute": "..."}, ...]}.
    Returns Arrow IPC: timestamp (Float64, epoch sec) + value_0, value_1, ... (Float64). LOCF applied to fill gaps.
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx
    if not HAS_PYARROW:
        return jsonify({'error': 'Arrow format not available (pyarrow not installed)'}), 503

    try:
        body = request.get_json(force=True, silent=True) or {}
        start_time = body.get('start_time')
        end_time = body.get('end_time')
        resolution = int(body.get('resolution', 1000))
        series = body.get('series') or []

        if not start_time or not end_time:
            return jsonify({'error': 'start_time and end_time are required'}), 400
        if not isinstance(series, list) or len(series) == 0:
            return jsonify({'error': 'series must be a non-empty array of {entity_id, attribute}'}), 400

        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time)
        if start_dt >= end_dt:
            return jsonify({'error': 'start_time must be before end_time'}), 400

        resolution = max(100, min(resolution, 10000))

        validated_series: List[Tuple[str, str]] = []
        for i, item in enumerate(series):
            if not isinstance(item, dict):
                return jsonify({'error': f'series[{i}] must be an object with entity_id and attribute'}), 400
            eid = item.get('entity_id')
            attr = item.get('attribute')
            if not eid or not attr:
                return jsonify({'error': f'series[{i}] must have entity_id and attribute'}), 400
            if attr not in VALID_ATTRIBUTES:
                return jsonify({'error': f'Invalid attribute "{attr}" in series[{i}]'}), 400
            validated_series.append((str(eid).strip(), attr))

        with get_db_connection() as conn:
            table = _execute_align_query(conn, tenant_id, start_dt, end_dt, resolution, validated_series)
            sink = pa.BufferOutputStream()
            with pa.ipc.new_stream(sink, table.schema) as writer:
                writer.write_table(table)
            body_bytes = sink.getvalue().to_pybytes()
            return Response(
                body_bytes,
                status=200,
                mimetype=ARROW_STREAM_TYPE,
                headers={"Content-Length": str(len(body_bytes))},
            )
    except (ValueError, TypeError) as e:
        logger.warning(f"Align request validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in align: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


def _get_s3_client():
    """S3 client for MinIO (exports bucket). Requires S3_* env vars."""
    import boto3
    from botocore.config import Config
    endpoint = os.getenv("S3_ENDPOINT_URL", "http://minio-service:9000")
    key = os.getenv("S3_ACCESS_KEY")
    secret = os.getenv("S3_SECRET_KEY")
    if not key or not secret:
        return None
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
    )


# Spool to disk above 25 MB to avoid OOM in the pod (Parquet export).
_PARQUET_SPOOL_MAX_SIZE = 25 * 1024 * 1024


def _upload_parquet_and_presign(table: pa.Table, tenant_id: str) -> Optional[str]:
    """
    Write table to MinIO under exports/<tenant_id>/<uuid>.parquet; return presigned GET URL or None.
    Uses SpooledTemporaryFile so data above 25 MB is spilled to disk instead of RAM.
    """
    client = _get_s3_client()
    if not client:
        return None
    bucket = os.getenv("S3_BUCKET", "nekazari-frontend")
    key = f"{EXPORT_BUCKET_PREFIX}{tenant_id}/{uuid.uuid4().hex}.parquet"
    try:
        with tempfile.SpooledTemporaryFile(max_size=_PARQUET_SPOOL_MAX_SIZE, mode="wb") as spool_tmp:
            pa_parquet.write_table(table, spool_tmp, compression="snappy")
            spool_tmp.seek(0)
            client.upload_fileobj(
                spool_tmp,
                bucket,
                key,
                ExtraArgs={"ContentType": "application/vnd.apache.parquet"},
            )
        url = client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=PRESIGNED_EXPIRY_SECONDS
        )
        return url
    except Exception as e:
        logger.error(f"MinIO upload/presign failed: {e}", exc_info=True)
        return None


# Export aggregation: analytical granularity, not screen resolution. "raw" = finest (1 second).
EXPORT_AGGREGATION_MAP = {
    "raw": "1 second",
    "1 hour": "1 hour",
    "1 day": "1 day",
}


@app.route('/api/timeseries/export', methods=['POST'])
@require_auth
def post_timeseries_export():
    """
    Export aligned timeseries as CSV (streamed) or Parquet (MinIO + presigned URL).
    Body: start_time, end_time, series, format ('csv'|'parquet'), aggregation ('raw'|'1 hour'|'1 day').
    aggregation is analytical granularity (not screen resolution). Reuses Phase 2 SQL.
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx
    if not HAS_PYARROW or not pa_csv or not pa_parquet:
        return jsonify({'error': 'Export requires pyarrow (csv + parquet)'}), 503

    try:
        body = request.get_json(force=True, silent=True) or {}
        start_time = body.get('start_time')
        end_time = body.get('end_time')
        series = body.get('series') or []
        fmt = (body.get('format') or 'csv').strip().lower()
        aggregation = (body.get('aggregation') or '1 hour').strip().lower()
        if fmt not in ('csv', 'parquet'):
            return jsonify({'error': 'format must be csv or parquet'}), 400
        if aggregation not in EXPORT_AGGREGATION_MAP:
            return jsonify({'error': 'aggregation must be raw, 1 hour, or 1 day'}), 400

        if not start_time or not end_time:
            return jsonify({'error': 'start_time and end_time are required'}), 400
        if not isinstance(series, list) or len(series) == 0:
            return jsonify({'error': 'series must be a non-empty array of {entity_id, attribute}'}), 400

        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time)
        if start_dt >= end_dt:
            return jsonify({'error': 'start_time must be before end_time'}), 400

        bucket_interval = EXPORT_AGGREGATION_MAP[aggregation]
        validated_series: List[Tuple[str, str]] = []
        for i, item in enumerate(series):
            if not isinstance(item, dict):
                return jsonify({'error': f'series[{i}] must be an object with entity_id and attribute'}), 400
            eid = item.get('entity_id')
            attr = item.get('attribute')
            if not eid or not attr:
                return jsonify({'error': f'series[{i}] must have entity_id and attribute'}), 400
            if attr not in VALID_ATTRIBUTES:
                return jsonify({'error': f'Invalid attribute "{attr}" in series[{i}]'}), 400
            validated_series.append((str(eid).strip(), attr))

        with get_db_connection() as conn:
            table = _execute_align_query(
                conn, tenant_id, start_dt, end_dt, resolution=1000, validated_series=validated_series,
                bucket_interval_override=bucket_interval,
            )

        if fmt == 'csv':
            # Stream CSV by record batches to avoid one giant BytesIO (OOM). Header only on first chunk.
            write_opts_header = pa_csv.WriteOptions(include_header=True)
            write_opts_no_header = pa_csv.WriteOptions(include_header=False)

            def stream():
                for i, batch in enumerate(table.to_batches()):
                    chunk_buf = io.BytesIO()
                    small_table = pa.Table.from_batches([batch])
                    opts = write_opts_header if i == 0 else write_opts_no_header
                    pa_csv.write_csv(small_table, chunk_buf, write_options=opts)
                    chunk_buf.seek(0)
                    yield chunk_buf.getvalue()

            return Response(
                stream(),
                status=200,
                mimetype='text/csv',
                headers={
                    'Content-Disposition': 'attachment; filename="timeseries_export.csv"',
                },
                direct_passthrough=True,
            )
        else:
            download_url = _upload_parquet_and_presign(table, tenant_id)
            if not download_url:
                return jsonify({'error': 'Parquet export failed (MinIO not configured or upload failed)'}), 503
            return jsonify({
                'download_url': download_url,
                'expires_in': PRESIGNED_EXPIRY_SECONDS,
                'format': 'parquet',
            }), 200
    except (ValueError, TypeError) as e:
        logger.warning(f"Export request validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in export: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


def _build_telemetry_columnar(rows: List[Dict[str, Any]], attrs_filter: Optional[List[str]]) -> Dict[str, Any]:
    """Build unified timestamp list + attribute arrays from telemetry_events payloads."""
    flt: Optional[set] = set(attrs_filter) if attrs_filter else None
    by_ts: Dict[datetime, Dict[str, Any]] = {}

    def _store_measurement(ts_key: datetime, name: str, val: Any) -> None:
        if flt is not None and name not in flt:
            return
        if ts_key not in by_ts:
            by_ts[ts_key] = {}
        by_ts[ts_key][name] = float(val) if val is not None and isinstance(val, (int, float)) else val

    for row in rows:
        ts = row.get("observed_at")
        if not ts:
            continue
        payload = row.get("payload")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}
        if not isinstance(payload, dict):
            payload = {}
        raw_meas = payload.get("measurements")
        if isinstance(raw_meas, dict):
            for name, val in raw_meas.items():
                if not name or not isinstance(name, str):
                    continue
                _store_measurement(ts, name, val)
        elif isinstance(raw_meas, list):
            for m in raw_meas:
                if not isinstance(m, dict):
                    continue
                name = m.get("type") or m.get("name")
                if not name:
                    continue
                val = m.get("value")
                _store_measurement(ts, str(name), val)

    sorted_ts = sorted(by_ts.keys())
    all_attrs = set()
    for d in by_ts.values():
        all_attrs |= set(d.keys())
    if flt is not None:
        all_attrs &= flt
    attr_list = sorted(all_attrs)
    timestamps = [t.isoformat() if hasattr(t, "isoformat") else str(t) for t in sorted_ts]
    attributes: Dict[str, List[Any]] = {a: [] for a in attr_list}
    for t in sorted_ts:
        rd = by_ts[t]
        for a in attr_list:
            attributes[a].append(rd.get(a))
    return {"timestamps": timestamps, "attributes": attributes}


def _fetch_telemetry_rows(
    conn, tenant_id: str, device_candidates: List[str], start_dt: datetime, end_dt: datetime, limit: int
) -> List[Dict[str, Any]]:
    if not device_candidates:
        return []
    candidates = list(dict.fromkeys(device_candidates))  # preserve order, unique
    cur = conn.cursor()
    try:
        try:
            cur.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
        except Exception:
            pass
        cur.execute(
            """
            SELECT observed_at, payload
            FROM telemetry_events
            WHERE tenant_id = %s
              AND device_id = ANY(%s)
              AND observed_at >= %s AND observed_at < %s
            ORDER BY observed_at ASC
            LIMIT %s
            """,
            (tenant_id, candidates, start_dt, end_dt, limit),
        )
        return list(cur.fetchall())
    finally:
        cur.close()


def _weather_query_columnar(
    conn,
    tenant_id: str,
    weather_key: str,
    start_dt: datetime,
    end_dt: datetime,
    attrs_requested: Optional[List[str]],
    limit: int,
) -> Dict[str, Any]:
    want = [a for a in (attrs_requested or []) if a in VALID_ATTRIBUTES]
    if not want:
        want = sorted(VALID_ATTRIBUTES)
    cur = conn.cursor()
    try:
        try:
            cur.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
        except Exception:
            pass
        col_sql = ", ".join(f'"{a}"' for a in want)
        cur.execute(
            f"""
            SELECT observed_at AS timestamp, {col_sql}
            FROM weather_observations
            WHERE tenant_id = %s AND observed_at >= %s AND observed_at < %s
              AND (station_id = %s OR municipality_code = %s)
            ORDER BY observed_at ASC
            LIMIT %s
            """,
            (tenant_id, start_dt, end_dt, weather_key, weather_key, limit),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
    timestamps: List[str] = []
    attributes: Dict[str, List[Any]] = {a: [] for a in want}
    for row in rows:
        ts = row["timestamp"]
        timestamps.append(ts.isoformat() if ts else "")
        for a in want:
            v = row.get(a)
            attributes[a].append(float(v) if v is not None else None)
    return {"timestamps": timestamps, "attributes": attributes}


@app.route('/api/timeseries/v2/entities/<path:entity_urn>/data', methods=['GET'])
@require_auth
def get_v2_entity_timeseries(entity_urn: str):
    """
    Unified historical read by canonical NGSI-LD URN (or passthrough id).
    Query: time_from, time_to (or start_time, end_time), attrs (comma-separated), limit.
    Accept: application/json (columnar) or application/vnd.apache.arrow.stream (single attr or first attr only for telemetry multi-attr returns JSON).
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx

    if not plan_timeseries_read:
        return jsonify({"error": "URN resolution not available"}), 503

    time_from = request.args.get("time_from") or request.args.get("start_time")
    time_to = request.args.get("time_to") or request.args.get("end_time")
    attrs_raw = request.args.get("attrs") or request.args.get("attribute")
    limit = int(request.args.get("limit", 5000))

    if not time_from or not time_to:
        return jsonify({"error": "time_from and time_to are required"}), 400

    start_dt = parse_datetime(time_from)
    end_dt = parse_datetime(time_to)
    if start_dt >= end_dt:
        return jsonify({"error": "time_from must be before time_to"}), 400

    attrs_list: Optional[List[str]] = None
    if attrs_raw:
        attrs_list = [a.strip() for a in attrs_raw.split(",") if a.strip()]

    accept = (request.headers.get("Accept") or "application/json").split(",")[0].strip().lower()
    want_arrow = accept == ARROW_STREAM_TYPE or "arrow" in accept

    plan = plan_timeseries_read(tenant_id, entity_urn)
    mode = plan.get("mode")

    with get_db_connection() as conn:
        if mode == "telemetry":
            if attrs_list:
                resolved_attrs: List[str] = []
                for a in attrs_list:
                    sk = _resolve_telemetry_measurement_key(a)
                    if sk is None:
                        return jsonify({"error": f"Unknown telemetry attribute: {a}"}), 400
                    resolved_attrs.append(sk)
                attrs_list = list(dict.fromkeys(resolved_attrs))
            rows = _fetch_telemetry_rows(
                conn, tenant_id, plan.get("device_candidates") or [], start_dt, end_dt, limit
            )
            col = _build_telemetry_columnar(rows, attrs_list)
            if want_arrow:
                if not HAS_PYARROW:
                    return jsonify({"error": "Arrow format not available"}), 503
                if attrs_list and len(attrs_list) == 1:
                    attr = attrs_list[0]
                    ts_arr = []
                    val_arr = []
                    for i, t in enumerate(col["timestamps"]):
                        v = col["attributes"].get(attr, [None] * len(col["timestamps"]))[i]
                        if v is None:
                            continue
                        try:
                            epoch = parse_datetime(t.replace("Z", "+00:00")).timestamp()
                        except Exception:
                            continue
                        ts_arr.append(epoch)
                        val_arr.append(float(v))
                    table = pa.table(
                        {
                            "timestamp": pa.array(ts_arr, type=pa.float64()),
                            "value": pa.array(val_arr, type=pa.float64()),
                        }
                    )
                    sink = pa.BufferOutputStream()
                    with pa.ipc.new_stream(sink, table.schema) as writer:
                        writer.write_table(table)
                    body = sink.getvalue().to_pybytes()
                    return Response(
                        body,
                        status=200,
                        mimetype=ARROW_STREAM_TYPE,
                        headers={"Content-Length": str(len(body))},
                    )
                return jsonify(
                    {
                        "error": "Arrow stream for v2 telemetry requires exactly one attrs= parameter",
                    }
                ), 400
            return jsonify(
                {
                    "entity_urn": entity_urn,
                    "series_kind": "telemetry",
                    "timestamps": col["timestamps"],
                    "attributes": col["attributes"],
                }
            )

        # weather
        wkey = plan.get("weather_key")
        if not wkey:
            return jsonify({"error": "No weather or device timeseries resolved for this entity"}), 404
        if not _SAFE_WEATHER_ENTITY_KEY.match(str(wkey).strip()):
            return jsonify({"error": "Invalid weather timeseries key"}), 400

        if attrs_list:
            for a in attrs_list:
                if a not in VALID_ATTRIBUTES:
                    return jsonify({"error": f'Invalid attribute: {a}'}), 400

        col = _weather_query_columnar(conn, tenant_id, wkey, start_dt, end_dt, attrs_list, limit)

        if want_arrow:
            if not HAS_PYARROW:
                return jsonify({"error": "Arrow format not available"}), 503
            use_attrs = list(col["attributes"].keys())
            if len(use_attrs) != 1:
                return jsonify(
                    {"error": "Arrow stream for v2 weather requires exactly one attrs= parameter"}
                ), 400
            attr = use_attrs[0]
            ts_arr = []
            val_arr = []
            for i, t in enumerate(col["timestamps"]):
                v = col["attributes"][attr][i]
                if v is None:
                    continue
                try:
                    epoch = parse_datetime(t.replace("Z", "+00:00")).timestamp()
                except Exception:
                    continue
                ts_arr.append(epoch)
                val_arr.append(float(v))
            table = pa.table(
                {
                    "timestamp": pa.array(ts_arr, type=pa.float64()),
                    "value": pa.array(val_arr, type=pa.float64()),
                }
            )
            sink = pa.BufferOutputStream()
            with pa.ipc.new_stream(sink, table.schema) as writer:
                writer.write_table(table)
            body = sink.getvalue().to_pybytes()
            return Response(
                body,
                status=200,
                mimetype=ARROW_STREAM_TYPE,
                headers={"Content-Length": str(len(body))},
            )

        return jsonify(
            {
                "entity_urn": entity_urn,
                "series_kind": "weather",
                "timeseries_key": wkey,
                "weather_source": plan.get("weather_source"),
                "timestamps": col["timestamps"],
                "attributes": col["attributes"],
            }
        )


@app.route('/api/timeseries/v2/query', methods=['POST'])
@require_auth
def post_v2_timeseries_query():
    """
    Multi-series align in one SQL round-trip: dynamic CTEs per series, then chained
    FULL OUTER JOIN ... USING (bucket) (Postgres merges bucket); at most MAX_V2_QUERY_SERIES series (413).

    Body: time_from, time_to, resolution, series: [{ entity_urn | entity_id, attribute }, ...].

    Arrow IPC: timestamp is Float64 epoch seconds (mandate §6 / uPlot worker).
    """
    cmd = _resolve_tenant_context()
    if isinstance(cmd, tuple):
        return cmd
    tenant_id = cmd

    if not plan_timeseries_read:
        return jsonify({"error": "URN resolution not available"}), 503
    if not HAS_PYARROW:
        return jsonify({"error": "Arrow format not available"}), 503

    body = request.get_json(force=True, silent=True) or {}
    time_from = body.get("time_from") or body.get("start_time")
    time_to = body.get("time_to") or body.get("end_time")
    resolution = int(body.get("resolution", 1000))
    series = body.get("series") or []

    if not time_from or not time_to:
        return jsonify({"error": "time_from and time_to are required"}), 400
    if not isinstance(series, list) or len(series) == 0:
        return jsonify({"error": "series must be a non-empty array"}), 400
    if len(series) > MAX_V2_QUERY_SERIES:
        return jsonify(
            {
                "error": f"Too many series: maximum is {MAX_V2_QUERY_SERIES}",
                "max_series": MAX_V2_QUERY_SERIES,
            }
        ), 413

    start_dt = parse_datetime(time_from)
    end_dt = parse_datetime(time_to)
    if start_dt >= end_dt:
        return jsonify({"error": "time_from must be before time_to"}), 400

    ordered_specs: List[Tuple[str, str, str]] = []

    for i, item in enumerate(series):
        if not isinstance(item, dict):
            return jsonify({"error": f"series[{i}] must be an object"}), 400
        urn = item.get("entity_urn") or item.get("entity_id")
        attr = item.get("attribute")
        if not urn or not attr:
            return jsonify({"error": f"series[{i}] needs entity_urn and attribute"}), 400
        attr_s = str(attr).strip()
        plan = plan_timeseries_read(tenant_id, str(urn).strip())
        mode = plan.get("mode")

        if mode == "weather":
            if attr_s not in VALID_ATTRIBUTES:
                return jsonify({"error": f"Invalid weather attribute: {attr_s}"}), 400
            wkey = plan.get("weather_key")
            if not wkey:
                return jsonify({"error": f"series[{i}]: no weather timeseries key for entity"}), 400
            wk = str(wkey).strip()
            if not _SAFE_WEATHER_ENTITY_KEY.match(wk):
                return jsonify({"error": f"series[{i}]: invalid weather timeseries key"}), 400
            ordered_specs.append(("weather", wk, attr_s))
        else:
            storage_attr = _resolve_telemetry_measurement_key(attr_s)
            if storage_attr is None:
                return jsonify(
                    {"error": f"Unknown telemetry attribute (not in whitelist): {attr_s}"}
                ), 400
            dev = normalize_device_id(str(urn).strip())
            if not dev or not _SAFE_DEVICE_ID.match(dev):
                return jsonify({"error": f"series[{i}]: invalid device id derived from URN"}), 400
            ordered_specs.append(("telemetry", dev, storage_attr))

    accept = (request.headers.get("Accept") or "").split(",")[0].strip().lower()
    kinds = {s[0] for s in ordered_specs}
    if kinds == {"weather"}:
        series_kind = "weather"
    elif kinds == {"telemetry"}:
        series_kind = "telemetry"
    else:
        series_kind = "mixed"

    try:
        with get_db_connection() as conn:
            table = _execute_v2_align_unified_sql(
                conn, tenant_id, start_dt, end_dt, resolution, ordered_specs
            )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if accept == ARROW_STREAM_TYPE:
        sink = pa.BufferOutputStream()
        with pa.ipc.new_stream(sink, table.schema) as writer:
            writer.write_table(table)
        body_bytes = sink.getvalue().to_pybytes()
        return Response(
            body_bytes,
            status=200,
            mimetype=ARROW_STREAM_TYPE,
            headers={"Content-Length": str(len(body_bytes))},
        )

    cols = table.to_pydict()
    ts = cols.get("timestamp") or []
    keys = [k for k in cols if k != "timestamp"]
    timestamps = []
    for t in ts:
        try:
            timestamps.append(datetime.fromtimestamp(float(t), tz=timezone.utc).isoformat())
        except Exception:
            timestamps.append(str(t))
    attributes = {k: [float(x) if x is not None else None for x in cols[k]] for k in keys}
    return jsonify(
        {
            "timestamps": timestamps,
            "attributes": attributes,
            "series_kind": series_kind,
        }
    )


@app.route('/api/timeseries/entities/<entity_id>/stats', methods=['GET'])
@require_auth
def get_entity_stats(entity_id: str):
    """
    Get statistical summary for entity timeseries data
    
    Query params:
        - start_time: ISO 8601 datetime (required)
        - end_time: ISO 8601 datetime (default: now)
        - attribute: attribute name (optional, returns stats for all if not specified)
    """
    ctx = _resolve_tenant_context()
    if isinstance(ctx, tuple):
        return ctx
    tenant_id = ctx
    
    try:
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        attribute = request.args.get('attribute')
        
        if not start_time:
            return jsonify({'error': 'start_time parameter is required'}), 400
        
        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time) if end_time else datetime.utcnow()
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Set tenant context
            try:
                cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
            except Exception:
                pass
            
            # Build stats query (only whitelisted column names)
            attributes = ['temp_avg', 'humidity_avg', 'precip_mm', 'pressure_hpa']
            if attribute:
                if attribute not in VALID_ATTRIBUTES:
                    return jsonify({'error': f'Invalid attribute: {attribute}'}), 400
                attributes = [attribute]
            
            stats = {}
            for attr in attributes:
                query = f"""
                    SELECT 
                        MIN({attr}) as min_val,
                        MAX({attr}) as max_val,
                        AVG({attr}) as avg_val,
                        COUNT({attr}) as count_val,
                        MIN(observed_at) as first_observed,
                        MAX(observed_at) as last_observed
                    FROM weather_observations
                    WHERE tenant_id = %s
                        AND observed_at >= %s
                        AND observed_at < %s
                        AND (station_id = %s OR municipality_code = %s)
                        AND {attr} IS NOT NULL
                """
                cursor.execute(query, (tenant_id, start_dt, end_dt, entity_id, entity_id))
                row = cursor.fetchone()
                
                if row and row['count_val'] > 0:
                    stats[attr] = {
                        'min': float(row['min_val']) if row['min_val'] is not None else None,
                        'max': float(row['max_val']) if row['max_val'] is not None else None,
                        'avg': float(row['avg_val']) if row['avg_val'] is not None else None,
                        'count': int(row['count_val']),
                        'first_observed': row['first_observed'].isoformat() if row['first_observed'] else None,
                        'last_observed': row['last_observed'].isoformat() if row['last_observed'] else None,
                    }
            
            cursor.close()
            
            return jsonify({
                'entity_id': entity_id,
                'start_time': start_dt.isoformat(),
                'end_time': end_dt.isoformat(),
                'stats': stats
            }), 200
            
    except Exception as e:
        logger.error(f"Error querying stats: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)

