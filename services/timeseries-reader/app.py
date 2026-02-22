#!/usr/bin/env python3
# =============================================================================
# Timeseries Reader Service - API for querying historical telemetry from TimescaleDB
# =============================================================================

import io
import os
import sys
import tempfile
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
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

# Whitelist of valid column names to prevent SQL injection
VALID_ATTRIBUTES = frozenset({
    'temp_avg', 'temp_min', 'temp_max',
    'humidity_avg', 'precip_mm',
    'solar_rad_w_m2', 'eto_mm',
    'soil_moisture_0_10cm', 'wind_speed_ms',
    'pressure_hpa',
})

app = Flask(__name__)
CORS(app)

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
    """Extract tenant ID from request"""
    # Try to get from JWT token (set by auth_middleware)
    tenant = getattr(g, 'tenant_id', None)
    if tenant:
        return tenant
    
    # Fallback to header
    return request.headers.get('Fiware-Service')


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
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
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
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400

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
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
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
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
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
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
    
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

