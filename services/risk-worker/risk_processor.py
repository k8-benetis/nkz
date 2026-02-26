#!/usr/bin/env python3
# =============================================================================
# Risk Worker - Evaluate Risks for Entities
# =============================================================================
# Batch worker that evaluates risks for all active entities
# Runs hourly via CronJob for batch risks (agronomic, energy)
# Real-time risks are handled via webhook/event-driven flow

import os
import sys
import logging
import json
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import uuid

import requests
import psycopg2
from psycopg2.extras import RealDictCursor

# Add paths for imports
sys.path.insert(0, '/app/task-queue')
sys.path.insert(0, '/app/common')
sys.path.insert(0, '/app')

# Import task_queue module
try:
    import importlib.util
    task_queue_file = '/app/task-queue/task_queue.py'
    if os.path.exists(task_queue_file):
        spec = importlib.util.spec_from_file_location("task_queue", task_queue_file)
        task_queue_module = importlib.util.module_from_spec(spec)
        sys.modules["task_queue"] = task_queue_module
        spec.loader.exec_module(task_queue_module)
        TaskQueue = task_queue_module.TaskQueue
        logger = logging.getLogger(__name__)
        logger.info("TaskQueue module loaded successfully")
    else:
        raise ImportError(f"task_queue.py not found at {task_queue_file}")
except Exception as e:
    logger = logging.getLogger(__name__)
    logger.error(f"Failed to load TaskQueue module: {e}")
    raise

from db_helper import set_tenant_context

# Import risk models
from risk_models.factory import RiskModelFactory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
POSTGRES_URL = os.getenv('POSTGRES_URL')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'nekazari')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgresql-service')
POSTGRES_PORT = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'nekazari')

ORION_URL = os.getenv('ORION_URL', 'http://orion-ld-service:1026')
REDIS_URL = os.getenv('REDIS_URL', 'redis://redis-service:6379')

# Build PostgreSQL URL
if POSTGRES_PASSWORD:
    POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    logger.info(f"PostgreSQL URL built from components (host: {POSTGRES_HOST}, db: {POSTGRES_DB})")
elif POSTGRES_URL:
    logger.warning("PostgreSQL URL provided but no password - connection may fail")
else:
    POSTGRES_URL = None
    logger.warning("PostgreSQL configuration not available")


class RiskProcessor:
    """Process risk evaluations for entities"""
    
    def __init__(self):
        self.postgres = None
        self.redis_queue = None
        self._init_connections()
    
    def _init_connections(self):
        """Initialize database and queue connections"""
        if POSTGRES_URL:
            try:
                self.postgres = psycopg2.connect(
                    POSTGRES_URL,
                    cursor_factory=RealDictCursor
                )
                self.postgres.autocommit = False
                logger.info("PostgreSQL connected")
            except Exception as e:
                logger.error(f"PostgreSQL connection failed: {e}")
        
        try:
            self.redis_queue = TaskQueue(stream_name='risk:events')
            logger.info("Redis Streams initialized")
        except Exception as e:
            logger.warning(f"Redis Streams not available: {e}")
    
    def _get_risk_catalog(self, evaluation_mode: str = 'batch') -> List[Dict[str, Any]]:
        """Get active risks from catalog"""
        if not self.postgres:
            return []
        
        try:
            cursor = self.postgres.cursor()
            cursor.execute("""
                SELECT 
                    risk_code, risk_name, target_sdm_type, target_subtype,
                    data_sources, risk_domain, evaluation_mode,
                    model_type, model_config, severity_levels
                FROM admin_platform.risk_catalog
                WHERE is_active = TRUE
                  AND evaluation_mode = %s
                ORDER BY risk_code
            """, (evaluation_mode,))
            
            risks = cursor.fetchall()
            cursor.close()
            return [dict(r) for r in risks]
        except Exception as e:
            logger.error(f"Failed to get risk catalog: {e}")
            return []
    
    def _get_entities_from_orion(self, tenant_id: str, entity_type: str) -> List[Dict[str, Any]]:
        """Get entities from Orion-LD, paginating through all results."""
        all_entities: List[Dict[str, Any]] = []
        headers = {
            'Accept': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }
        page_size = 200
        offset = 0

        try:
            while True:
                params = {
                    'type': entity_type,
                    'limit': page_size,
                    'offset': offset,
                }

                response = requests.get(
                    f"{ORION_URL}/ngsi-ld/v1/entities",
                    headers=headers,
                    params=params,
                    timeout=30
                )

                if response.status_code != 200:
                    logger.warning(
                        f"Failed to get entities from Orion: {response.status_code} "
                        f"(tenant={tenant_id}, type={entity_type}, offset={offset})"
                    )
                    break

                batch = response.json()
                if not isinstance(batch, list) or not batch:
                    break

                all_entities.extend(batch)

                if len(batch) < page_size:
                    break  # last page

                offset += page_size

        except Exception as e:
            logger.error(f"Error getting entities from Orion: {e}")

        return all_entities
    
    def _get_weather_data(self, tenant_id: str, municipality_code: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get latest weather data for tenant"""
        if not self.postgres:
            return None
        
        try:
            cursor = self.postgres.cursor()
            set_tenant_context(cursor, tenant_id)
            
            query = """
                SELECT
                    temp_avg, temp_min, temp_max,
                    humidity_avg, precip_mm,
                    solar_rad_w_m2, solar_rad_ghi_w_m2, solar_rad_dni_w_m2,
                    eto_mm, soil_moisture_0_10cm, soil_moisture_10_40cm,
                    wind_speed_ms, wind_direction_deg, pressure_hpa,
                    delta_t, gdd_accumulated,
                    COALESCE(precip_mm, 0) - COALESCE(eto_mm, 0) AS water_balance,
                    observed_at
                FROM weather_observations
                WHERE tenant_id = %s
                  AND data_type = 'HISTORY'
                  AND observed_at >= NOW() - INTERVAL '24 hours'
            """
            
            params = [tenant_id]
            if municipality_code:
                query += " AND municipality_code = %s"
                params.append(municipality_code)
            
            query += " ORDER BY observed_at DESC LIMIT 1"
            
            cursor.execute(query, params)
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return dict(result)
            return None
        except Exception as e:
            logger.error(f"Failed to get weather data: {e}")
            return None
    
    def _get_ndvi_data(self, tenant_id: str, parcel_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get latest NDVI data for tenant/parcel"""
        if not self.postgres:
            return None
        
        try:
            cursor = self.postgres.cursor()
            set_tenant_context(cursor, tenant_id)
            
            query = """
                SELECT 
                    ndvi_mean, ndvi_min, ndvi_max, ndvi_stddev,
                    acquisition_date, parcel_id
                FROM ndvi_results
                WHERE tenant_id = %s
            """
            
            params = [tenant_id]
            if parcel_id:
                query += " AND parcel_id = %s"
                params.append(parcel_id)
            
            query += " ORDER BY acquisition_date DESC LIMIT 1"
            
            cursor.execute(query, params)
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return dict(result)
            return None
        except Exception as e:
            logger.error(f"Failed to get NDVI data: {e}")
            return None
    
    def _get_gdd_accumulated(
        self,
        tenant_id: str,
        season_start_doy: int = 1,
        municipality_code: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Return the cumulative GDD accumulated since `season_start_doy` (1=Jan 1).

        Queries weather_observations and sums gdd_accumulated (daily GDD)
        for rows from the start of the current agronomic season to now.
        Returns dict with:
          gdd_season_total: float  — summed GDD
          season_start_doy: int    — day of year used
          days_accumulated: int    — number of days with data
        """
        if not self.postgres:
            return None

        try:
            cursor = self.postgres.cursor()
            set_tenant_context(cursor, tenant_id)

            # Build the season start date from DOY (current year)
            query = """
                SELECT
                    COALESCE(SUM(gdd_accumulated), 0)  AS gdd_season_total,
                    COUNT(*)                            AS days_accumulated
                FROM weather_observations
                WHERE tenant_id = %s
                  AND data_type = 'HISTORY'
                  AND gdd_accumulated IS NOT NULL
                  AND observed_at >= make_date(
                        EXTRACT(year FROM CURRENT_DATE)::int,
                        1, 1
                      ) + INTERVAL '1 day' * (%s - 1)
            """

            params: list = [tenant_id, season_start_doy]
            if municipality_code:
                query += " AND municipality_code = %s"
                params.append(municipality_code)

            cursor.execute(query, params)
            row = cursor.fetchone()
            cursor.close()

            if row:
                return {
                    'gdd_season_total': float(row['gdd_season_total']),
                    'season_start_doy': season_start_doy,
                    'days_accumulated': int(row['days_accumulated']),
                }
            return None
        except Exception as e:
            logger.error(f"Failed to get GDD accumulated: {e}")
            return None

    def _get_telemetry_data(self, tenant_id: str, device_id: str, metric_name: str, hours: int = 24) -> Optional[List[Dict[str, Any]]]:
        """Get latest telemetry data for device"""
        if not self.postgres:
            return None
        
        try:
            cursor = self.postgres.cursor()
            set_tenant_context(cursor, tenant_id)
            
            cursor.execute("""
                SELECT metric_name, value, unit, time, metadata
                FROM telemetry
                WHERE tenant_id = %s
                  AND device_id = %s
                  AND metric_name = %s
                  AND time >= NOW() - INTERVAL '%s hours'
                ORDER BY time DESC
                LIMIT 100
            """, (tenant_id, device_id, metric_name, hours))
            
            results = cursor.fetchall()
            cursor.close()
            
            if results:
                return [dict(r) for r in results]
            return None
        except Exception as e:
            logger.error(f"Failed to get telemetry data: {e}")
            return None
    
    def _prepare_data_sources(self, tenant_id: str, risk: Dict[str, Any], entity: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare data sources for risk evaluation"""
        data_sources = {}
        required_sources = risk.get('data_sources', [])
        
        # Get weather data if needed
        if 'weather' in required_sources:
            # Try to get municipality from entity location
            municipality_code = None
            if 'location' in entity:
                location = entity['location']
                if isinstance(location, dict) and 'value' in location:
                    # Extract municipality if available
                    # For now, get general weather for tenant
                    pass
            weather_data = self._get_weather_data(tenant_id, municipality_code)
            if weather_data:
                data_sources['weather'] = weather_data
        
        # Get accumulated GDD if needed (for pest cycle models)
        if 'gdd' in required_sources:
            # season_start_doy from the risk's model_config (default Jan 1)
            model_config = risk.get('model_config', {})
            season_start_doy = model_config.get('season_start_doy', 1)
            municipality_code = None  # could be enriched from entity location in future
            gdd_data = self._get_gdd_accumulated(tenant_id, season_start_doy, municipality_code)
            if gdd_data:
                data_sources['gdd'] = gdd_data

        # Get NDVI data if needed
        if 'ndvi' in required_sources:
            parcel_id = None
            # Try to extract parcel ID from entity
            if 'id' in entity:
                entity_id = entity['id']
                if 'parcel' in entity_id.lower() or 'AgriCrop' in entity.get('type', ''):
                    # Extract parcel ID from entity ID or attributes
                    pass
            ndvi_data = self._get_ndvi_data(tenant_id, parcel_id)
            if ndvi_data:
                data_sources['ndvi'] = ndvi_data
        
        # Get telemetry data if needed
        if 'telemetry' in required_sources:
            device_id = None
            # Extract device ID from entity
            if 'id' in entity:
                entity_id = entity['id']
                # Extract device ID (e.g., from urn:ngsi-ld:Device:robot_123)
                if 'Device' in entity.get('type', '') or 'Vehicle' in entity.get('type', ''):
                    # Use entity ID as device ID
                    device_id = entity_id.split(':')[-1] if ':' in entity_id else entity_id
            
            if device_id:
                # Get battery telemetry
                battery_telemetry = self._get_telemetry_data(tenant_id, device_id, 'batteryLevel', hours=1)
                if battery_telemetry:
                    # Use latest value
                    data_sources['telemetry'] = battery_telemetry[0] if battery_telemetry else None
                else:
                    # Try alternative metric names
                    for alt_name in ['battery', 'batteryLevel', 'powerLevel']:
                        alt_telemetry = self._get_telemetry_data(tenant_id, device_id, alt_name, hours=1)
                        if alt_telemetry:
                            data_sources['telemetry'] = alt_telemetry[0]
                            break
        
        return data_sources
    
    def _store_risk_evaluation(
        self,
        tenant_id: str,
        entity_id: str,
        entity_type: str,
        risk_code: str,
        probability_score: float,
        evaluation_data: Dict[str, Any],
        confidence: float = 1.0
    ) -> bool:
        """Store risk evaluation in database"""
        if not self.postgres:
            return False
        
        try:
            cursor = self.postgres.cursor()
            set_tenant_context(cursor, tenant_id)
            
            cursor.execute("""
                INSERT INTO risk_daily_states (
                    tenant_id, entity_id, entity_type, risk_code,
                    probability_score, evaluation_data, evaluation_timestamp,
                    timestamp, evaluated_by, evaluation_version
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s
                )
            """, (
                tenant_id, entity_id, entity_type, risk_code,
                probability_score, json.dumps(evaluation_data), datetime.utcnow(),
                datetime.utcnow(), 'risk-worker', '1.0.0'
            ))
            
            self.postgres.commit()
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"Failed to store risk evaluation: {e}")
            if self.postgres:
                self.postgres.rollback()
            return False
    
    def _compute_severity(self, probability_score: float, severity_levels: dict) -> str:
        """Compute severity label from probability score and catalog thresholds"""
        levels = severity_levels or {"low": 30, "medium": 60, "high": 80, "critical": 95}
        if probability_score >= levels.get('critical', 95):
            return 'critical'
        if probability_score >= levels.get('high', 80):
            return 'high'
        if probability_score >= levels.get('medium', 60):
            return 'medium'
        return 'low'

    def _publish_risk_event(
        self,
        tenant_id: str,
        entity_id: str,
        entity_type: str,
        risk_code: str,
        probability_score: float,
        severity: str
    ) -> bool:
        """Publish risk event to Redis Streams for orchestrator"""
        if not self.redis_queue:
            return False
        
        try:
            event = {
                'tenant_id': tenant_id,
                'entity_id': entity_id,
                'entity_type': entity_type,
                'risk_code': risk_code,
                'probability_score': probability_score,
                'severity': severity,
                'timestamp': datetime.utcnow().isoformat(),
                'event_type': 'risk_evaluation'
            }
            
            self.redis_queue.enqueue_task(
                tenant_id=tenant_id,
                task_type='risk_evaluation',
                payload=event,
                max_retries=1
            )
            
            logger.info(f"Published risk event: {risk_code} for {entity_id} (score: {probability_score:.1f})")
            return True
        except Exception as e:
            logger.error(f"Failed to publish risk event: {e}")
            return False
    
    def evaluate_risks_for_tenant(self, tenant_id: str) -> Dict[str, Any]:
        """Evaluate all batch risks for a tenant"""
        logger.info(f"Evaluating risks for tenant: {tenant_id}")
        
        # Get batch risks from catalog
        risks = self._get_risk_catalog(evaluation_mode='batch')
        if not risks:
            logger.info("No batch risks found in catalog")
            return {'evaluated': 0, 'errors': 0}
        
        evaluated = 0
        errors = 0
        
        for risk in risks:
            risk_code = risk['risk_code']
            target_sdm_type = risk['target_sdm_type']
            risk_domain = risk['risk_domain']
            model_config = risk.get('model_config', {})
            model_type = risk.get('model_type')

            logger.info(f"Evaluating risk: {risk_code} for entity type: {target_sdm_type}")

            # Get entities of this type from Orion-LD
            entities = self._get_entities_from_orion(tenant_id, target_sdm_type)
            if not entities:
                logger.info(f"No entities of type {target_sdm_type} found for tenant {tenant_id}")
                continue

            # Create risk model using factory (model_type takes precedence over domain)
            model = RiskModelFactory.create_model(risk_code, risk_domain, model_config, model_type)
            if not model:
                logger.error(f"Failed to create model for risk: {risk_code}")
                errors += 1
                continue
            
            # Evaluate risk for each entity
            for entity in entities:
                entity_id = entity.get('id')
                if not entity_id:
                    continue
                
                try:
                    # Prepare data sources
                    data_sources = self._prepare_data_sources(tenant_id, risk, entity)
                    
                    # Evaluate risk
                    result = model.evaluate(
                        entity_id=entity_id,
                        entity_type=target_sdm_type,
                        tenant_id=tenant_id,
                        data_sources=data_sources
                    )
                    
                    probability_score = result.get('probability_score', 0.0)
                    evaluation_data = result.get('evaluation_data', {})
                    confidence = result.get('confidence', 1.0)
                    
                    # Store evaluation
                    if self._store_risk_evaluation(
                        tenant_id=tenant_id,
                        entity_id=entity_id,
                        entity_type=target_sdm_type,
                        risk_code=risk_code,
                        probability_score=probability_score,
                        evaluation_data=evaluation_data,
                        confidence=confidence
                    ):
                        evaluated += 1
                        
                        # Publish event if risk is significant (>= 50%)
                        if probability_score >= 50:
                            severity = self._compute_severity(probability_score, risk.get('severity_levels', {}))
                            self._publish_risk_event(
                                tenant_id=tenant_id,
                                entity_id=entity_id,
                                entity_type=target_sdm_type,
                                risk_code=risk_code,
                                probability_score=probability_score,
                                severity=severity
                            )
                    else:
                        errors += 1
                        
                except Exception as e:
                    logger.error(f"Error evaluating risk {risk_code} for entity {entity_id}: {e}")
                    errors += 1
        
        return {'evaluated': evaluated, 'errors': errors}
    
    def run_batch_evaluation(self):
        """Run batch evaluation for all active tenants"""
        if not self.postgres:
            logger.error("PostgreSQL not available")
            return
        
        try:
            cursor = self.postgres.cursor()
            cursor.execute("""
                SELECT DISTINCT tenant_id
                FROM tenants
                WHERE status = 'active'
            """)
            
            tenants = cursor.fetchall()
            cursor.close()
            
            if not tenants:
                logger.info("No active tenants found")
                return
            
            total_evaluated = 0
            total_errors = 0
            
            for tenant_row in tenants:
                tenant_id = tenant_row['tenant_id']
                result = self.evaluate_risks_for_tenant(tenant_id)
                total_evaluated += result['evaluated']
                total_errors += result['errors']
            
            logger.info(f"Batch evaluation complete. Evaluated: {total_evaluated}, Errors: {total_errors}")
            
        except Exception as e:
            logger.error(f"Error running batch evaluation: {e}")


    def run_continuous(self):
        """Run continuously: consume on-demand requests + hourly batch fallback"""
        logger.info("Starting risk worker in continuous mode")
        eval_queue = TaskQueue(stream_name='risk:eval-requests')
        consumer_group = 'risk-worker'
        consumer_name = f'worker-{os.getenv("HOSTNAME", "local")}'

        last_batch_ts = 0.0
        batch_interval = 3600  # 1 hour in seconds

        while True:
            try:
                # Pull on-demand evaluation requests
                tasks = eval_queue.consume_tasks(
                    consumer_group=consumer_group,
                    consumer_name=consumer_name,
                    count=5
                )
                for task in (tasks or []):
                    task_id = task.get('id')
                    payload = task.get('payload', {})
                    tenant_id = payload.get('tenant_id') or task.get('tenant_id')
                    if tenant_id:
                        logger.info(f"On-demand evaluation triggered for tenant: {tenant_id}")
                        self.evaluate_risks_for_tenant(tenant_id)
                    if task_id:
                        eval_queue.acknowledge_task(consumer_group, task_id)

                # Hourly batch fallback
                now = time.time()
                if now - last_batch_ts >= batch_interval:
                    logger.info("Running scheduled batch evaluation")
                    self.run_batch_evaluation()
                    last_batch_ts = now

            except Exception as e:
                logger.error(f"Error in continuous loop: {e}")

            time.sleep(10)


def main():
    """Main entry point for risk worker"""
    processor = RiskProcessor()
    if os.getenv('CONTINUOUS_MODE', '').lower() == 'true':
        processor.run_continuous()
    else:
        processor.run_batch_evaluation()


if __name__ == '__main__':
    main()

