#!/usr/bin/env python3
# =============================================================================
# Audit Logger - Structured Logging for Compliance and Debugging
# =============================================================================
# Provides structured audit logging for module actions, user operations,
# and security events. Designed for GDPR compliance and operational visibility.

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from functools import wraps
from flask import request, g

logger = logging.getLogger(__name__)

# Configuration
AUDIT_LOG_ENABLED = os.getenv('AUDIT_LOG_ENABLED', 'true').lower() == 'true'
AUDIT_LOG_LEVEL = os.getenv('AUDIT_LOG_LEVEL', 'INFO').upper()
AUDIT_LOG_FORMAT = os.getenv('AUDIT_LOG_FORMAT', 'json')  # 'json' or 'text'
AUDIT_LOG_TO_DB = os.getenv('AUDIT_LOG_TO_DB', 'true').lower() == 'true'
POSTGRES_URL = os.getenv('POSTGRES_URL')  # For database logging

class JsonAuditFormatter(logging.Formatter):
    """JSON formatter for audit logs"""
    
    def format(self, record):
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'event_type': getattr(record, 'event_type', 'audit'),
            'action': getattr(record, 'action', 'unknown'),
            'tenant_id': getattr(record, 'tenant_id', None),
            'user_id': getattr(record, 'user_id', None),
            'module_id': getattr(record, 'module_id', None),
            'resource_type': getattr(record, 'resource_type', None),
            'resource_id': getattr(record, 'resource_id', None),
            'ip_address': getattr(record, 'ip_address', None),
            'user_agent': getattr(record, 'user_agent', None),
            'success': getattr(record, 'success', True),
            'error': getattr(record, 'error', None),
            'metadata': getattr(record, 'metadata', {}),
        }
        
        # Add message if present
        if record.getMessage():
            log_data['message'] = record.getMessage()
        
        return json.dumps(log_data)


# Configure audit logger
audit_logger = logging.getLogger('audit')
audit_logger.setLevel(getattr(logging, AUDIT_LOG_LEVEL, logging.INFO))

# Create handler if not exists
if not audit_logger.handlers:
    handler = logging.StreamHandler()
    if AUDIT_LOG_FORMAT == 'json':
        handler.setFormatter(JsonAuditFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            '%(asctime)s [AUDIT] %(levelname)s: %(message)s'
        ))
    audit_logger.addHandler(handler)
    audit_logger.propagate = False


def get_client_info() -> Dict[str, Any]:
    """Extract client information from request"""
    return {
        'ip_address': request.remote_addr or request.headers.get('X-Forwarded-For', 'unknown'),
        'user_agent': request.headers.get('User-Agent', 'unknown'),
    }


def get_user_info() -> Dict[str, Any]:
    """Extract user information from Flask g context"""
    return {
        'tenant_id': getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None),
        'user_id': getattr(g, 'user_id', None) or (getattr(g, 'current_user', {}) or {}).get('sub'),
        'username': getattr(g, 'username', None) or (getattr(g, 'current_user', {}) or {}).get('preferred_username'),
    }


def _write_to_db(log_data: Dict[str, Any], postgres_url: Optional[str] = None):
    """
    Write audit log to database using psycopg2 (consistent with platform pattern)
    
    Args:
        log_data: Dictionary with audit log data
        postgres_url: PostgreSQL connection URL (optional, uses POSTGRES_URL env var if not provided)
    """
    if not AUDIT_LOG_TO_DB:
        return
    
    db_url = postgres_url or POSTGRES_URL
    if not db_url:
        logger.debug("POSTGRES_URL not set, skipping database audit log")
        return
    
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Extract tenant_id and set it for RLS
        tenant_id = log_data.get('tenant_id')
        if tenant_id:
            cursor.execute("SET app.current_tenant = %s", (tenant_id,))
        
        cursor.execute("""
            INSERT INTO sys_audit_logs (
                tenant_id, user_id, username, module_id,
                event_type, action, resource_type, resource_id,
                success, error, ip_address, user_agent, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """, (
            log_data.get('tenant_id'),
            log_data.get('user_id'),
            log_data.get('username'),
            log_data.get('module_id'),
            log_data.get('event_type', 'audit'),
            log_data.get('action'),
            log_data.get('resource_type'),
            log_data.get('resource_id'),
            log_data.get('success', True),
            log_data.get('error'),
            log_data.get('ip_address'),
            log_data.get('user_agent'),
            json.dumps(log_data.get('metadata', {}))
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
    except ImportError:
        logger.warning("psycopg2 not available, skipping database audit log")
    except Exception as e:
        logger.error(f"Failed to write audit log to DB: {e}")
        # Fallback: escribir a STDOUT si BD falla
        logger.info(f"[AUDIT-FALLBACK] {json.dumps(log_data)}")


def audit_log(
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    module_id: Optional[str] = None,
    success: bool = True,
    error: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Log an audit event
    
    Args:
        action: Action performed (e.g., 'module.toggle', 'module.create_job')
        resource_type: Type of resource (e.g., 'module', 'job', 'parcel')
        resource_id: ID of the resource
        module_id: ID of the module (if module-related)
        success: Whether the action succeeded
        error: Error message if failed
        metadata: Additional metadata
    """
    if not AUDIT_LOG_ENABLED:
        return
    
    client_info = get_client_info()
    user_info = get_user_info()
    
    # Determine event type from action
    event_type = 'audit'
    if action.startswith('module.'):
        event_type = 'module_action'
    elif action.startswith('security.'):
        event_type = 'security_event'
    elif action.startswith('data.'):
        event_type = 'data_access'
    
    log_level = logging.ERROR if error else (logging.WARNING if not success else logging.INFO)
    
    log_data = {
        'event_type': event_type,
        'action': action,
        'tenant_id': user_info.get('tenant_id'),
        'user_id': user_info.get('user_id'),
        'username': user_info.get('username'),
        'module_id': module_id,
        'resource_type': resource_type,
        'resource_id': resource_id,
        'ip_address': client_info.get('ip_address'),
        'user_agent': client_info.get('user_agent'),
        'success': success,
        'error': error,
        'metadata': metadata or {},
    }
    
    # Write to database (primary)
    _write_to_db(log_data)
    
    # Also write to STDOUT (for logs aggregation, debugging)
    extra = log_data.copy()
    audit_logger.log(log_level, f"Audit: {action}", extra=extra)


def audit_log_decorator(
    action: str,
    resource_type: Optional[str] = None,
    extract_resource_id: Optional[callable] = None,
    extract_module_id: Optional[callable] = None,
):
    """
    Decorator for automatic audit logging
    
    Usage:
        @audit_log_decorator(
            action='module.toggle',
            resource_type='module',
            extract_module_id=lambda: request.json.get('module_id')
        )
        def toggle_module():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            success = True
            error = None
            resource_id = None
            module_id = None
            
            try:
                # Extract resource/module IDs if functions provided
                if extract_resource_id:
                    try:
                        resource_id = extract_resource_id()
                    except Exception as e:
                        logger.warning(f"Failed to extract resource_id: {e}")
                
                if extract_module_id:
                    try:
                        module_id = extract_module_id()
                    except Exception as e:
                        logger.warning(f"Failed to extract module_id: {e}")
                
                # Execute function
                result = func(*args, **kwargs)
                
                # Log success
                audit_log(
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    module_id=module_id,
                    success=True,
                    metadata={'result': 'success'},
                )
                
                return result
                
            except Exception as e:
                success = False
                error = str(e)
                
                # Log failure
                audit_log(
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    module_id=module_id,
                    success=False,
                    error=error,
                    metadata={'exception_type': type(e).__name__},
                )
                
                # Re-raise exception
                raise
        
        return wrapper
    return decorator


# Convenience functions for common actions

def log_module_toggle(module_id: str, enabled: bool, **metadata):
    """Log module activation/deactivation"""
    audit_log(
        action='module.toggle',
        resource_type='module',
        resource_id=module_id,
        module_id=module_id,
        success=True,
        metadata={
            'enabled': enabled,
            **metadata,
        },
    )


def log_module_job_create(module_id: str, job_id: str, **metadata):
    """Log module job creation"""
    audit_log(
        action='module.job.create',
        resource_type='job',
        resource_id=job_id,
        module_id=module_id,
        success=True,
        metadata={
            'job_id': job_id,
            **metadata,
        },
    )


def log_module_data_access(module_id: str, resource_type: str, resource_id: str, **metadata):
    """Log data access by module"""
    audit_log(
        action='data.access',
        resource_type=resource_type,
        resource_id=resource_id,
        module_id=module_id,
        success=True,
        metadata=metadata,
    )


def log_security_event(action: str, **metadata):
    """Log security-related event"""
    audit_log(
        action=f'security.{action}',
        success=True,
        metadata=metadata,
    )


def log_error(action: str, error: str, **metadata):
    """Log error event"""
    audit_log(
        action=action,
        success=False,
        error=error,
        metadata=metadata,
    )

