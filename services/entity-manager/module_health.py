#!/usr/bin/env python3
# =============================================================================
# Module Health Checks
# =============================================================================
# Provides health check functionality for modules to verify:
# - Database tables exist
# - Endpoints are accessible
# - Dependencies are available

import os
import logging
from typing import Dict, Any, Optional
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Module-specific health checks
MODULE_HEALTH_CHECKS = {
    'ndvi': {
        'tables': ['ndvi_jobs', 'ndvi_results'],
        'endpoints': ['/ndvi/jobs', '/ndvi/results'],
    },
    # Add more modules as needed
}


def check_module_tables(module_id: str, postgres_url: str, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Check if module's database tables exist
    
    Returns:
        {
            'healthy': bool,
            'tables': {
                'table_name': {'exists': bool, 'row_count': int}
            }
        }
    """
    if module_id not in MODULE_HEALTH_CHECKS:
        return {
            'healthy': False,
            'error': f'No health checks defined for module {module_id}',
            'tables': {}
        }
    
    module_config = MODULE_HEALTH_CHECKS[module_id]
    required_tables = module_config.get('tables', [])
    
    if not required_tables:
        return {
            'healthy': True,
            'tables': {},
            'message': 'No tables required for this module'
        }
    
    results = {
        'healthy': True,
        'tables': {}
    }
    
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
        conn = psycopg2.connect(postgres_url)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        for table_name in required_tables:
            try:
                # Check if table exists
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = %s
                    )
                """, (table_name,))
                exists = cur.fetchone()[0]
                
                if exists:
                    # Get row count (only for current tenant if tenant_id is provided)
                    row_count = 0
                    if tenant_id:
                        try:
                            # Set tenant context for RLS
                            cur.execute("SELECT set_current_tenant(%s)", (tenant_id,))
                            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                            row_count = cur.fetchone()[0] or 0
                        except Exception as tenant_err:
                            # If RLS fails, try without tenant context
                            logger.warning(f"Could not filter by tenant for {table_name}, using total count: {tenant_err}")
                            try:
                                cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                                row_count = cur.fetchone()[0] or 0
                            except Exception as count_err:
                                logger.warning(f"Could not count rows for {table_name}: {count_err}")
                                row_count = 0
                    else:
                        try:
                            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                            row_count = cur.fetchone()[0] or 0
                        except Exception as count_err:
                            logger.warning(f"Could not count rows for {table_name}: {count_err}")
                            row_count = 0
                    
                    results['tables'][table_name] = {
                        'exists': True,
                        'row_count': row_count
                    }
                else:
                    results['tables'][table_name] = {
                        'exists': False,
                        'row_count': 0
                    }
                    results['healthy'] = False
                    
            except Exception as e:
                logger.error(f"Error checking table {table_name}: {e}")
                results['tables'][table_name] = {
                    'exists': False,
                    'error': str(e)
                }
                results['healthy'] = False
        
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error connecting to database for health check: {e}")
        results['healthy'] = False
        results['error'] = str(e)
    
    return results


def check_module_endpoints(module_id: str) -> Dict[str, Any]:
    """
    Check if module's endpoints are registered
    
    Returns:
        {
            'healthy': bool,
            'endpoints': {
                'endpoint': {'registered': bool}
            }
        }
    """
    if module_id not in MODULE_HEALTH_CHECKS:
        return {
            'healthy': False,
            'error': f'No health checks defined for module {module_id}',
            'endpoints': {}
        }
    
    module_config = MODULE_HEALTH_CHECKS[module_id]
    required_endpoints = module_config.get('endpoints', [])
    
    if not required_endpoints:
        return {
            'healthy': True,
            'endpoints': {},
            'message': 'No endpoints required for this module'
        }
    
    # This would need access to Flask app's URL map
    # For now, return a placeholder
    results = {
        'healthy': True,
        'endpoints': {}
    }
    
    for endpoint in required_endpoints:
        results['endpoints'][endpoint] = {
            'registered': True,  # Would check Flask app.url_map
            'note': 'Endpoint registration check not fully implemented'
        }
    
    return results


def check_module_dependencies(module_id: str) -> Dict[str, Any]:
    """
    Check if module's dependencies are available
    
    Returns:
        {
            'healthy': bool,
            'dependencies': {
                'dependency': {'available': bool}
            }
        }
    """
    # Module-specific dependency checks
    # Note: External modules should define their own health checks
    # This is only for core modules that need special dependency validation
    dependency_checks = {
        # Core modules only - external modules should implement their own health checks
    }
    
    if module_id not in dependency_checks:
        return {
            'healthy': True,
            'dependencies': {},
            'message': 'No specific dependencies to check'
        }
    
    results = {
        'healthy': True,
        'dependencies': {}
    }
    
    # Placeholder - would implement actual checks
    for dep_name, available in dependency_checks[module_id].items():
        results['dependencies'][dep_name] = {
            'available': available
        }
        if not available:
            results['healthy'] = False
    
    return results


def get_module_health(module_id: str, tenant_id: Optional[str], postgres_url: str) -> Dict[str, Any]:
    """
    Get comprehensive health status for a module
    
    Returns:
        {
            'module_id': str,
            'status': 'healthy' | 'degraded' | 'unhealthy',
            'checks': {
                'database': {...},
                'endpoints': {...},
                'dependencies': {...}
            },
            'timestamp': str
        }
    """
    from datetime import datetime
    
    checks = {
        'database': check_module_tables(module_id, postgres_url, tenant_id),
        'endpoints': check_module_endpoints(module_id),
        'dependencies': check_module_dependencies(module_id),
    }
    
    # Determine overall status
    all_healthy = all(
        check.get('healthy', False) 
        for check in checks.values()
    )
    
    status = 'healthy' if all_healthy else 'degraded'
    
    # If critical checks fail, mark as unhealthy
    if not checks['database'].get('healthy', False):
        status = 'unhealthy'
    
    return {
        'module_id': module_id,
        'status': status,
        'checks': checks,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }

