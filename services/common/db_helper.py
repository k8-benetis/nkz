#!/usr/bin/env python3
# =============================================================================
# Database Helper - Multi-Tenant Context Management
# =============================================================================
# Helper functions to set tenant context for RLS (Row Level Security)
# This ensures database queries are automatically filtered by tenant

import os
import logging
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from typing import Optional

logger = logging.getLogger(__name__)

ADMIN_TENANT = os.getenv('PLATFORM_ADMIN_TENANT', 'platform_admin')

# Connection pool
_connection_pool = None

def get_pool():
    """Get or create database connection pool"""
    global _connection_pool
    
    if _connection_pool is None:
        postgres_url = os.getenv('POSTGRES_URL')
        if not postgres_url:
            logger.error("POSTGRES_URL not configured")
            return None
        
        # Parse connection string
        try:
            _connection_pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=20,
                dsn=postgres_url
            )
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error(f"Failed to create connection pool: {e}")
            return None
    
    return _connection_pool


@contextmanager
def get_db_connection_with_tenant(tenant_id: str):
    """
    Get database connection with tenant context set for RLS
    
    Usage:
        with get_db_connection_with_tenant(tenant_id) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM farmers")
            # RLS automatically filters by tenant_id
    
    Args:
        tenant_id: Tenant ID to set in session context
    
    Yields:
        psycopg2 connection with tenant context
    """
    pool = get_pool()
    if not pool:
        raise RuntimeError("Database connection pool not available")
    
    conn = None
    try:
        conn = pool.getconn()
        if conn is None:
            raise RuntimeError("Failed to obtain database connection from pool (pool exhausted)")
        cursor = conn.cursor()
        
        # Set tenant context for RLS using the set_current_tenant function
        cursor.execute("SELECT set_current_tenant(%s)", (tenant_id,))
        # Function persists tenant context for entire connection session
        cursor.close()
        
        logger.debug(f"Set tenant context: {tenant_id}")
        
        yield conn
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error with tenant context: {e}")
        raise
    finally:
        if conn:
            pool.putconn(conn)


def set_tenant_context(conn, tenant_id: str):
    """
    Set tenant context on an existing connection
    
    Use this when you already have a connection and need to set tenant context
    
    Args:
        conn: psycopg2 connection
        tenant_id: Tenant ID
    """
    cursor = conn.cursor()
    try:
        # Use set_current_tenant function to set tenant context for RLS
        cursor.execute("SELECT set_current_tenant(%s)", (tenant_id,))
        # Function persists tenant context for entire connection session
        logger.debug(f"Set tenant context: {tenant_id}")
    finally:
        cursor.close()


def set_platform_admin_context(conn):
    """
    Set platform admin context on an existing connection to bypass tenant
    filtering via RLS policies.
    """
    if not ADMIN_TENANT:
        raise RuntimeError("PLATFORM_ADMIN_TENANT is not configured")

    set_tenant_context(conn, ADMIN_TENANT)


def get_tenant_from_context(conn):
    """
    Get current tenant from connection context
    
    Args:
        conn: psycopg2 connection
    
    Returns:
        Tenant ID string or None
    """
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT get_current_tenant()")
        result = cursor.fetchone()
        return result[0] if result else None
    finally:
        cursor.close()


def get_db_connection_simple():
    """
    Get simple database connection without tenant context
    
    Use this for admin operations that need to bypass RLS
    or when you manually add WHERE tenant_id = ...
    
    Returns:
        psycopg2 connection
    """
    pool = get_pool()
    if not pool:
        logger.error("Database connection pool not available")
        return None
    
    conn = pool.getconn()
    if conn is None:
        logger.error("Failed to obtain database connection from pool (pool exhausted)")
        return None
    return conn


def return_db_connection(conn):
    """
    Return connection to pool
    
    Args:
        conn: psycopg2 connection
    """
    pool = get_pool()
    if pool and conn:
        try:
            pool.putconn(conn)
        except Exception as e:
            logger.error(f"Error returning connection to pool: {e}")


# =============================================================================
# Exported symbols
# =============================================================================

__all__ = [
    'get_db_connection_with_tenant',
    'set_tenant_context',
    'set_platform_admin_context',
    'get_tenant_from_context',
    'get_db_connection_simple',
    'return_db_connection',
    'ADMIN_TENANT',
]

