#!/usr/bin/env python3
# =============================================================================
# Module Metrics - Prometheus Metrics for Modules
# =============================================================================
# Provides Prometheus metrics for module usage, latency, and errors.
# Enables monitoring and analysis of module performance.

import os
import logging
from typing import Optional
from functools import wraps
from flask import request, g

logger = logging.getLogger(__name__)

# Configuration
METRICS_ENABLED = os.getenv('METRICS_ENABLED', 'true').lower() == 'true'

# Try to import Prometheus client
try:
    from prometheus_client import Counter, Histogram, Gauge
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    logger.warning("prometheus_client not available, metrics disabled")
    # Create dummy classes
    class Counter:
        def __init__(self, *args, **kwargs):
            pass
        def labels(self, *args, **kwargs):
            return self
        def inc(self, *args, **kwargs):
            pass
    
    class Histogram:
        def __init__(self, *args, **kwargs):
            pass
        def labels(self, *args, **kwargs):
            return self
        def time(self):
            return self
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
    
    class Gauge:
        def __init__(self, *args, **kwargs):
            pass
        def labels(self, *args, **kwargs):
            return self
        def set(self, *args, **kwargs):
            pass

# Module usage counter
module_usage = Counter(
    'module_usage_total',
    'Total module usage',
    ['module_id', 'tenant_id', 'action']
) if PROMETHEUS_AVAILABLE else Counter()

# Module request duration histogram
module_latency = Histogram(
    'module_request_duration_seconds',
    'Module request duration in seconds',
    ['module_id', 'endpoint'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0)
) if PROMETHEUS_AVAILABLE else Histogram()

# Module error counter
module_errors = Counter(
    'module_errors_total',
    'Total module errors',
    ['module_id', 'tenant_id', 'error_type']
) if PROMETHEUS_AVAILABLE else Counter()

# Active jobs gauge
module_active_jobs = Gauge(
    'module_active_jobs',
    'Number of active jobs per module',
    ['module_id', 'tenant_id', 'status']
) if PROMETHEUS_AVAILABLE else Gauge()


def record_module_usage(module_id: str, action: str, tenant_id: Optional[str] = None):
    """
    Record module usage metric
    
    Args:
        module_id: Module ID (e.g., 'vegetation-prime', 'ndvi')
        action: Action performed (e.g., 'create_job', 'get_results')
        tenant_id: Tenant ID (optional, extracted from g if not provided)
    """
    if not METRICS_ENABLED or not PROMETHEUS_AVAILABLE:
        return
    
    try:
        tenant = tenant_id or getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None) or 'unknown'
        module_usage.labels(
            module_id=module_id,
            tenant_id=tenant,
            action=action
        ).inc()
    except Exception as e:
        logger.warning(f"Failed to record module usage metric: {e}")


def record_module_latency(module_id: str, endpoint: str, duration: float):
    """
    Record module request latency
    
    Args:
        module_id: Module ID
        endpoint: Endpoint path
        duration: Duration in seconds
    """
    if not METRICS_ENABLED or not PROMETHEUS_AVAILABLE:
        return
    
    try:
        module_latency.labels(
            module_id=module_id,
            endpoint=endpoint
        ).observe(duration)
    except Exception as e:
        logger.warning(f"Failed to record module latency metric: {e}")


def record_module_error(module_id: str, error_type: str, tenant_id: Optional[str] = None):
    """
    Record module error
    
    Args:
        module_id: Module ID
        error_type: Type of error (e.g., 'validation_error', 'database_error')
        tenant_id: Tenant ID (optional)
    """
    if not METRICS_ENABLED or not PROMETHEUS_AVAILABLE:
        return
    
    try:
        tenant = tenant_id or getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None) or 'unknown'
        module_errors.labels(
            module_id=module_id,
            tenant_id=tenant,
            error_type=error_type
        ).inc()
    except Exception as e:
        logger.warning(f"Failed to record module error metric: {e}")


def update_active_jobs(module_id: str, status: str, count: int, tenant_id: Optional[str] = None):
    """
    Update active jobs gauge
    
    Args:
        module_id: Module ID
        status: Job status (e.g., 'queued', 'processing', 'completed')
        count: Number of jobs
        tenant_id: Tenant ID (optional)
    """
    if not METRICS_ENABLED or not PROMETHEUS_AVAILABLE:
        return
    
    try:
        tenant = tenant_id or getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None) or 'unknown'
        module_active_jobs.labels(
            module_id=module_id,
            tenant_id=tenant,
            status=status
        ).set(count)
    except Exception as e:
        logger.warning(f"Failed to update active jobs metric: {e}")


def metrics_decorator(module_id: str, action: str):
    """
    Decorator to automatically record metrics for module endpoints
    
    Usage:
        @metrics_decorator('vegetation-health', 'create_job')
        def create_vegetation_job():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            import time
            start_time = time.time()
            
            try:
                # Record usage
                record_module_usage(module_id, action)
                
                # Execute function
                result = func(*args, **kwargs)
                
                # Record latency
                duration = time.time() - start_time
                record_module_latency(module_id, request.path, duration)
                
                return result
                
            except Exception as e:
                # Record error
                error_type = type(e).__name__
                record_module_error(module_id, error_type)
                
                # Record latency even on error
                duration = time.time() - start_time
                record_module_latency(module_id, request.path, duration)
                
                # Re-raise exception
                raise
        
        return wrapper
    return decorator

