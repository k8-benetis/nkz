#!/usr/bin/env python3
# =============================================================================
# Timeseries Reader Service - API for querying historical telemetry from TimescaleDB
# =============================================================================

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from dateutil.parser import isoparse

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


def format_time_bucket(aggregation: str) -> str:
    """Convert aggregation type to TimescaleDB time_bucket interval"""
    mapping = {
        'none': None,  # No aggregation
        'hourly': '1 hour',
        'daily': '1 day',
        'weekly': '7 days',
        'monthly': '1 month',
    }
    return mapping.get(aggregation.lower(), '1 hour')


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


@app.route('/api/timeseries/entities/<entity_id>/data', methods=['GET'])
@require_auth
def get_entity_timeseries(entity_id: str):
    """
    Get historical timeseries data for an entity
    
    Query params:
        - start_time: ISO 8601 datetime (required)
        - end_time: ISO 8601 datetime (default: now)
        - aggregation: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' (default: 'none')
        - attribute: attribute name to query (optional, returns all if not specified)
        - limit: max number of points (default: 1000)
    """
    tenant_id = get_tenant_from_request()
    if not tenant_id:
        return jsonify({'error': 'Tenant ID required'}), 400
    
    try:
        # Parse query parameters
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        aggregation = request.args.get('aggregation', 'none')
        attribute = request.args.get('attribute')
        limit = int(request.args.get('limit', 1000))
        
        if not start_time:
            return jsonify({'error': 'start_time parameter is required'}), 400

        if attribute and attribute not in VALID_ATTRIBUTES:
            return jsonify({'error': f'Invalid attribute: {attribute}'}), 400

        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time) if end_time else datetime.utcnow()

        if start_dt >= end_dt:
            return jsonify({'error': 'start_time must be before end_time'}), 400

        # Determine which table to query based on entity type
        # For now, we'll check both weather_observations and a generic telemetry table
        # First, try to get entity type from Orion-LD if possible
        # For MVP, we'll query weather_observations if entity_id matches station pattern
        
        # Query weather_observations (for WeatherStation entities)
        # TODO: Add generic telemetry table support
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Set tenant context if RLS is enabled
            try:
                cursor.execute("SELECT set_config('app.current_tenant', %s, true)", (tenant_id,))
            except Exception:
                pass  # RLS may not be enabled
            
            # Build query based on aggregation
            time_bucket = format_time_bucket(aggregation)
            
            if time_bucket:
                # Aggregated query
                query = f"""
                    SELECT 
                        time_bucket('{time_bucket}', observed_at) as timestamp,
                        AVG(temp_avg) as temp_avg,
                        MIN(temp_min) as temp_min,
                        MAX(temp_max) as temp_max,
                        AVG(humidity_avg) as humidity_avg,
                        AVG(precip_mm) as precip_mm,
                        AVG(solar_rad_w_m2) as solar_rad_w_m2,
                        AVG(eto_mm) as eto_mm,
                        AVG(soil_moisture_0_10cm) as soil_moisture_0_10cm,
                        AVG(wind_speed_ms) as wind_speed_ms,
                        AVG(pressure_hpa) as pressure_hpa
                    FROM weather_observations
                    WHERE tenant_id = %s
                        AND observed_at >= %s
                        AND observed_at <= %s
                        AND (station_id = %s OR municipality_code = %s)
                    GROUP BY time_bucket('{time_bucket}', observed_at)
                    ORDER BY timestamp ASC
                    LIMIT %s
                """
                cursor.execute(query, (tenant_id, start_dt, end_dt, entity_id, entity_id, limit))
            else:
                # Raw data query (no aggregation)
                query = """
                    SELECT 
                        observed_at as timestamp,
                        temp_avg,
                        temp_min,
                        temp_max,
                        humidity_avg,
                        precip_mm,
                        solar_rad_w_m2,
                        eto_mm,
                        soil_moisture_0_10cm,
                        wind_speed_ms,
                        pressure_hpa
                    FROM weather_observations
                    WHERE tenant_id = %s
                        AND observed_at >= %s
                        AND observed_at <= %s
                        AND (station_id = %s OR municipality_code = %s)
                    ORDER BY observed_at ASC
                    LIMIT %s
                """
                cursor.execute(query, (tenant_id, start_dt, end_dt, entity_id, entity_id, limit))
            
            rows = cursor.fetchall()
            cursor.close()
            
            # Format response
            data = []
            for row in rows:
                point = {
                    'timestamp': row['timestamp'].isoformat() if row['timestamp'] else None,
                }
                
                # Add attribute values (filter by attribute param if specified)
                for attr in VALID_ATTRIBUTES:
                    if (not attribute or attribute == attr) and row.get(attr) is not None:
                        point[attr] = float(row[attr])
                
                if len(point) > 1:  # Has at least one attribute
                    data.append(point)
            
            return jsonify({
                'entity_id': entity_id,
                'start_time': start_dt.isoformat(),
                'end_time': end_dt.isoformat(),
                'aggregation': aggregation,
                'count': len(data),
                'data': data
            }), 200
            
    except Exception as e:
        logger.error(f"Error querying timeseries: {e}", exc_info=True)
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
                        AND observed_at <= %s
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

