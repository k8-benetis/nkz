#!/usr/bin/env python3
# =============================================================================
# Audit Middleware - Automatic Request Logging
# =============================================================================
# Middleware that automatically logs all requests to module endpoints.
# Provides a safety net to ensure nothing goes unlogged, even if developers
# forget to add decorators.

import os
import logging
from flask import request, g
from typing import Optional

logger = logging.getLogger(__name__)

# Configuration
AUDIT_MIDDLEWARE_ENABLED = os.getenv('AUDIT_MIDDLEWARE_ENABLED', 'true').lower() == 'true'

# Lista de exclusión (como sugiere el agente)
EXCLUDED_PATHS = [
    '/health',
    '/metrics',
    '/api/health',
    '/api/metrics',
    '/api/modules/me',  # Too frequent, not critical
]

EXCLUDED_METHODS = ['OPTIONS', 'HEAD']

# Map API paths to module IDs
# Note: This should ideally be dynamic from marketplace_modules table
# External modules should use their module ID directly in API paths (e.g., /api/vegetation-prime/...)
MODULE_PATH_MAP = {
    'ndvi': 'ndvi',
    'weather': 'weather-module',
    'sensors': 'sensors-module',
    # Add more mappings as modules are added
    # External modules: Use module ID directly (e.g., 'vegetation-prime' -> 'vegetation-prime')
}


def _map_path_to_module(path_part: str) -> Optional[str]:
    """
    Map API path segment to module ID
    
    Args:
        path_part: First segment after /api/ (e.g., 'vegetation', 'ndvi')
    
    Returns:
        Module ID or None if not a module endpoint
    """
    return MODULE_PATH_MAP.get(path_part.lower())


def _extract_module_from_path(path: str) -> Optional[str]:
    """
    Extract module ID from request path
    
    Examples:
        /api/vegetation/jobs -> 'vegetation-health'
        /api/ndvi/results -> 'ndvi'
        /api/modules/toggle -> None (platform endpoint)
    """
    if not path.startswith('/api/'):
        return None
    
    parts = path.split('/')
    if len(parts) < 3:
        return None
    
    # Skip platform endpoints
    if parts[2] in ['modules', 'admin']:
        return None
    
    # Map path to module
    return _map_path_to_module(parts[2])


def setup_audit_middleware(app, postgres_url: Optional[str] = None):
    """
    Setup automatic audit logging middleware
    
    Args:
        app: Flask application instance
        postgres_url: PostgreSQL connection URL (optional)
    """
    if not AUDIT_MIDDLEWARE_ENABLED:
        logger.info("Audit middleware disabled")
        return
    
    try:
        from audit_logger import audit_log
    except ImportError:
        logger.warning("audit_logger not available, audit middleware disabled")
        return
    
    @app.before_request
    def audit_request():
        """Log all requests to module endpoints"""
        # Skip excluded paths/methods
        if request.path in EXCLUDED_PATHS:
            return
        if request.method in EXCLUDED_METHODS:
            return
        
        # Extract module from path
        module_id = _extract_module_from_path(request.path)
        
        # Only log module endpoints (not platform endpoints)
        if module_id:
            try:
                audit_log(
                    action='api.request',
                    module_id=module_id,
                    resource_type='api_endpoint',
                    resource_id=request.path,
                    metadata={
                        'method': request.method,
                        'endpoint': request.path,
                        'query_params': dict(request.args) if request.args else None,
                    },
                )
            except Exception as e:
                # Don't break the request if logging fails
                logger.warning(f"Failed to log audit request: {e}")
    
    logger.info("Audit middleware enabled")

