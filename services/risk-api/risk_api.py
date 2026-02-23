#!/usr/bin/env python3
# =============================================================================
# Risk Management API
# =============================================================================
# REST API for risk catalog, subscriptions, and states
# Provides endpoints for frontend SmartRiskPanel

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor

# Add common directory to path
sys.path.insert(0, '/app/common')
from auth_middleware import require_auth
from db_helper import set_tenant_context

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration - Use POSTGRES_URL directly from environment (standard approach)
# This ensures consistency with other services and GitOps configuration
POSTGRES_URL = os.getenv('POSTGRES_URL')
if not POSTGRES_URL:
    raise ValueError("POSTGRES_URL environment variable is required")


def get_db_connection():
    """Get database connection"""
    try:
        conn = psycopg2.connect(POSTGRES_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return None


@app.route('/api/risks/catalog', methods=['GET'])
@require_auth
def get_risk_catalog():
    """Get active risk catalog (filtered by tenant's entity types)"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        cursor = conn.cursor()
        
        # Get active risks
        cursor.execute("""
            SELECT 
                risk_code, risk_name, risk_description,
                target_sdm_type, target_subtype,
                data_sources, risk_domain, evaluation_mode,
                model_type, model_config, severity_levels
            FROM admin_platform.risk_catalog
            WHERE is_active = TRUE
            ORDER BY risk_domain, risk_code
        """)
        
        risks = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return jsonify([dict(r) for r in risks]), 200
        
    except Exception as e:
        logger.error(f"Error getting risk catalog: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/subscriptions', methods=['GET'])
@require_auth
def get_risk_subscriptions():
    """Get risk subscriptions for current tenant"""
    try:
        tenant = g.tenant
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        set_tenant_context(conn, tenant)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                id, tenant_id, risk_code, is_active,
                user_threshold, notification_channels, entity_filters,
                created_at, updated_at, created_by
            FROM tenant_risk_subscriptions
            WHERE tenant_id = %s
            ORDER BY risk_code
        """, (tenant,))
        
        subscriptions = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return jsonify([dict(s) for s in subscriptions]), 200
        
    except Exception as e:
        logger.error(f"Error getting subscriptions: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/subscriptions', methods=['POST'])
@require_auth
def create_risk_subscription():
    """Create new risk subscription"""
    try:
        tenant = g.tenant
        data = request.get_json()
        
        risk_code = data.get('risk_code')
        user_threshold = data.get('user_threshold', 50)
        notification_channels = data.get('notification_channels', {'email': True, 'push': False})
        entity_filters = data.get('entity_filters', {})
        
        if not risk_code:
            return jsonify({'error': 'risk_code is required'}), 400
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        set_tenant_context(conn, tenant)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO tenant_risk_subscriptions (
                tenant_id, risk_code, is_active,
                user_threshold, notification_channels, entity_filters
            ) VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, risk_code) 
            DO UPDATE SET
                is_active = EXCLUDED.is_active,
                user_threshold = EXCLUDED.user_threshold,
                notification_channels = EXCLUDED.notification_channels,
                entity_filters = EXCLUDED.entity_filters,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, tenant_id, risk_code, is_active,
                      user_threshold, notification_channels, entity_filters,
                      created_at, updated_at
        """, (
            tenant, risk_code, True,
            user_threshold, json.dumps(notification_channels), json.dumps(entity_filters)
        ))
        
        subscription = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify(dict(subscription)), 201
        
    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/subscriptions/<subscription_id>', methods=['PATCH'])
@require_auth
def update_risk_subscription(subscription_id: str):
    """Update risk subscription"""
    try:
        tenant = g.tenant
        data = request.get_json()
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        set_tenant_context(conn, tenant)
        cursor = conn.cursor()
        
        # Build update query dynamically
        updates = []
        params = []
        
        if 'is_active' in data:
            updates.append('is_active = %s')
            params.append(data['is_active'])
        
        if 'user_threshold' in data:
            updates.append('user_threshold = %s')
            params.append(data['user_threshold'])
        
        if 'notification_channels' in data:
            updates.append('notification_channels = %s')
            params.append(json.dumps(data['notification_channels']))
        
        if 'entity_filters' in data:
            updates.append('entity_filters = %s')
            params.append(json.dumps(data['entity_filters']))
        
        if not updates:
            return jsonify({'error': 'No fields to update'}), 400
        
        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(subscription_id)
        params.append(tenant)
        
        query = f"""
            UPDATE tenant_risk_subscriptions
            SET {', '.join(updates)}
            WHERE id = %s AND tenant_id = %s
            RETURNING id, tenant_id, risk_code, is_active,
                      user_threshold, notification_channels, entity_filters,
                      created_at, updated_at
        """
        
        cursor.execute(query, params)
        subscription = cursor.fetchone()
        
        if not subscription:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Subscription not found'}), 404
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify(dict(subscription)), 200
        
    except Exception as e:
        logger.error(f"Error updating subscription: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/subscriptions/<subscription_id>', methods=['DELETE'])
@require_auth
def delete_risk_subscription(subscription_id: str):
    """Delete risk subscription"""
    try:
        tenant = g.tenant
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        set_tenant_context(conn, tenant)
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM tenant_risk_subscriptions
            WHERE id = %s AND tenant_id = %s
            RETURNING id
        """, (subscription_id, tenant))
        
        deleted = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        
        if not deleted:
            return jsonify({'error': 'Subscription not found'}), 404
        
        return jsonify({'message': 'Subscription deleted'}), 200
        
    except Exception as e:
        logger.error(f"Error deleting subscription: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/webhooks', methods=['GET'])
@require_auth
def get_risk_webhooks():
    """List webhook registrations for current tenant"""
    try:
        tenant = g.tenant
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500

        set_tenant_context(conn, tenant)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, tenant_id, name, url, events, min_severity, is_active, created_at
            FROM tenant_risk_webhooks
            WHERE tenant_id = %s
            ORDER BY created_at DESC
        """, (tenant,))

        webhooks = cursor.fetchall()
        cursor.close()
        conn.close()

        return jsonify([dict(w) for w in webhooks]), 200

    except Exception as e:
        logger.error(f"Error getting webhooks: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/webhooks', methods=['POST'])
@require_auth
def create_risk_webhook():
    """Register a new webhook for risk push notifications"""
    try:
        tenant = g.tenant
        data = request.get_json()

        name = data.get('name')
        url = data.get('url')
        secret = data.get('secret')
        events = data.get('events', ['risk_evaluation'])
        min_severity = data.get('min_severity', 'medium')

        if not name or not url:
            return jsonify({'error': 'name and url are required'}), 400

        if min_severity not in ('low', 'medium', 'high', 'critical'):
            return jsonify({'error': 'min_severity must be low, medium, high, or critical'}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500

        set_tenant_context(conn, tenant)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO tenant_risk_webhooks (
                tenant_id, name, url, secret, events, min_severity
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, tenant_id, name, url, events, min_severity, is_active, created_at
        """, (tenant, name, url, secret, events, min_severity))

        webhook = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify(dict(webhook)), 201

    except Exception as e:
        logger.error(f"Error creating webhook: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/risks/webhooks/<webhook_id>', methods=['DELETE'])
@require_auth
def delete_risk_webhook(webhook_id: str):
    """Delete a webhook registration"""
    try:
        tenant = g.tenant
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500

        set_tenant_context(conn, tenant)
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM tenant_risk_webhooks
            WHERE id = %s AND tenant_id = %s
            RETURNING id
        """, (webhook_id, tenant))

        deleted = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not deleted:
            return jsonify({'error': 'Webhook not found'}), 404

        return jsonify({'message': 'Webhook deleted'}), 200

    except Exception as e:
        logger.error(f"Error deleting webhook: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint (no authentication required)"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'status': 'unhealthy', 'error': 'Database unavailable'}), 503
        conn.close()
        return jsonify({'status': 'healthy'}), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 503


@app.route('/api/risks/states', methods=['GET'])
@require_auth
def get_risk_states():
    """Get risk states for current tenant"""
    try:
        tenant = g.tenant
        entity_id = request.args.get('entityId')
        risk_code = request.args.get('riskCode')
        limit = int(request.args.get('limit', 50))
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database unavailable'}), 500
        
        set_tenant_context(conn, tenant)
        cursor = conn.cursor()
        
        query = """
            SELECT 
                id, tenant_id, entity_id, entity_type, risk_code,
                probability_score, severity, evaluation_data,
                timestamp, evaluation_timestamp
            FROM risk_daily_states
            WHERE tenant_id = %s
        """
        params = [tenant]
        
        if entity_id:
            query += " AND entity_id = %s"
            params.append(entity_id)
        
        if risk_code:
            query += " AND risk_code = %s"
            params.append(risk_code)
        
        if start_date:
            query += " AND timestamp >= %s"
            params.append(start_date)
        
        if end_date:
            query += " AND timestamp <= %s"
            params.append(end_date)
        
        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        states = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return jsonify([dict(s) for s in states]), 200
        
    except Exception as e:
        logger.error(f"Error getting risk states: {e}")
        return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

