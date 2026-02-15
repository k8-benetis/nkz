#!/usr/bin/env python3
# =============================================================================
# Rate Limiter - Module-Aware Rate Limiting
# =============================================================================
# Provides rate limiting functionality with support for per-module limits.
# Uses in-memory sliding window (can be extended to Redis for distributed systems).

import os
import time
import logging
from collections import defaultdict, deque
from typing import Optional, Dict, Tuple
from functools import wraps
from flask import request, g, jsonify

logger = logging.getLogger(__name__)

# Configuration
RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'

# Default limits (can be overridden per module)
# Note: Module-specific limits should be configured per module, not hardcoded here
DEFAULT_LIMITS = {
    'ndvi': {
        'create_job': '10 per hour',
        'get_results': '60 per hour',
        'default': '100 per hour',
    },
    # Add more modules as needed
    # External modules should configure their own limits via their service configuration
}

# In-memory storage (for single-instance deployments)
# For distributed systems, use Redis instead
_rate_limit_storage: Dict[str, deque] = defaultdict(deque)


def parse_rate_limit(limit_str: str) -> Tuple[int, int]:
    """
    Parse rate limit string (e.g., '10 per hour', '60 per minute')
    
    Returns:
        (count, seconds)
    """
    parts = limit_str.lower().split()
    if len(parts) != 3 or parts[1] != 'per':
        raise ValueError(f"Invalid rate limit format: {limit_str}")
    
    count = int(parts[0])
    period = parts[2]
    
    period_seconds = {
        'second': 1,
        'minute': 60,
        'hour': 3600,
        'day': 86400,
    }.get(period, 60)  # Default to minute
    
    return count, period_seconds


def check_rate_limit(
    key: str,
    limit_str: str,
    storage: Optional[Dict[str, deque]] = None
) -> Tuple[bool, Optional[Dict[str, any]]]:
    """
    Check if request is within rate limit
    
    Args:
        key: Unique key for rate limiting (e.g., 'tenant:module:action')
        limit_str: Rate limit string (e.g., '10 per hour')
        storage: Optional storage dict (defaults to module-level storage)
    
    Returns:
        (allowed, headers) - headers contain rate limit info
    """
    if not RATE_LIMIT_ENABLED:
        return True, None
    
    if storage is None:
        storage = _rate_limit_storage
    
    try:
        count, period_seconds = parse_rate_limit(limit_str)
    except ValueError as e:
        logger.warning(f"Invalid rate limit format: {limit_str}, allowing request")
        return True, None
    
    now = time.time()
    window_start = now - period_seconds
    
    # Get or create queue for this key
    queue = storage[key]
    
    # Remove old entries outside the window
    while queue and queue[0] < window_start:
        queue.popleft()
    
    # Check if limit exceeded
    if len(queue) >= count:
        remaining = 0
        reset_time = queue[0] + period_seconds if queue else now + period_seconds
    else:
        remaining = count - len(queue) - 1
        reset_time = now + period_seconds
    
    # Add current request
    queue.append(now)
    
    # Prepare headers
    headers = {
        'X-RateLimit-Limit': str(count),
        'X-RateLimit-Remaining': str(max(0, remaining)),
        'X-RateLimit-Reset': str(int(reset_time)),
    }
    
    allowed = len(queue) <= count
    
    return allowed, headers


def get_module_rate_limit(module_id: str, action: str = 'default') -> str:
    """
    Get rate limit for a module and action
    
    Args:
        module_id: Module ID (e.g., 'vegetation-health')
        action: Action type (e.g., 'create_job', 'get_results')
    
    Returns:
        Rate limit string (e.g., '10 per hour')
    """
    module_limits = DEFAULT_LIMITS.get(module_id, {})
    return module_limits.get(action, module_limits.get('default', '100 per hour'))


def rate_limit_decorator(
    limit_str: Optional[str] = None,
    key_func: Optional[callable] = None,
    module_id: Optional[str] = None,
    action: Optional[str] = None,
):
    """
    Decorator for rate limiting endpoints
    
    Args:
        limit_str: Rate limit string (e.g., '10 per hour'). If None, uses module defaults.
        key_func: Function to generate rate limit key. Defaults to tenant:module:action.
        module_id: Module ID (if not provided, extracted from request path)
        action: Action name (if not provided, extracted from endpoint)
    
    Usage:
        @rate_limit_decorator(limit_str='10 per hour', module_id='vegetation-health')
        def create_job():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate rate limit key
            if key_func:
                key = key_func()
            else:
                tenant = getattr(g, 'tenant', None) or getattr(g, 'tenant_id', None) or 'unknown'
                
                # Extract module_id if not provided
                if not module_id:
                    path = request.path
                    if path.startswith('/api/'):
                        parts = path.split('/')
                        if len(parts) >= 3:
                            detected_module = parts[2]
                            # Map API path to module ID
                            # Note: This should ideally be dynamic from marketplace_modules table
                            # For now, use path as-is (modules should use their module ID in paths)
                            module_map = {
                                'ndvi': 'ndvi',
                                # External modules should use their module ID directly in API paths
                            }
                            detected_module_id = module_map.get(detected_module, detected_module)
                        else:
                            detected_module_id = 'unknown'
                    else:
                        detected_module_id = 'unknown'
                else:
                    detected_module_id = module_id
                
                # Extract action if not provided
                if not action:
                    detected_action = request.endpoint or func.__name__
                else:
                    detected_action = action
                
                key = f"{tenant}:{detected_module_id}:{detected_action}"
            
            # Get rate limit
            if limit_str:
                limit = limit_str
            else:
                limit = get_module_rate_limit(detected_module_id, detected_action)
            
            # Check rate limit
            allowed, headers = check_rate_limit(key, limit)
            
            if not allowed:
                logger.warning(f"Rate limit exceeded for {key}")
                response = jsonify({
                    'error': 'Rate limit exceeded',
                    'message': f'Too many requests. Limit: {limit}',
                })
                if headers:
                    for header_name, header_value in headers.items():
                        response.headers[header_name] = header_value
                return response, 429
            
            # Add rate limit headers to response
            result = func(*args, **kwargs)
            if headers and hasattr(result, 'headers'):
                for header_name, header_value in headers.items():
                    result.headers[header_name] = header_value
            return result
        
        return wrapper
    return decorator


# Convenience function for module endpoints
def rate_limit_module(module_id: str, action: str = 'default'):
    """
    Convenience decorator for module endpoints
    
    Usage:
        @rate_limit_module('vegetation-health', 'create_job')
        def create_vegetation_job():
            ...
    """
    limit_str = get_module_rate_limit(module_id, action)
    return rate_limit_decorator(
        limit_str=limit_str,
        module_id=module_id,
        action=action,
    )

