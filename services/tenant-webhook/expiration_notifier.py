#!/usr/bin/env python3
# =============================================================================
# Expiration Notifier - Sends emails and notifications for expiring activation codes
# =============================================================================

import os
import logging
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Configuration
POSTGRES_URL = os.environ['POSTGRES_URL']
EMAIL_SERVICE_URL = os.getenv('EMAIL_SERVICE_URL', 'http://email-service:5000')
NOTIFICATION_THRESHOLDS = [30, 15, 7, 1]  # Days remaining to notify

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(POSTGRES_URL)
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

def check_expiring_activations() -> List[Dict[str, Any]]:
    """Check for activations that need notification based on days remaining"""
    conn = get_db_connection()
    if not conn:
        return []
    
    expiring = []
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all active activation codes with tenant info
        cursor.execute("""
            SELECT 
                ac.id,
                ac.code,
                ac.email,
                ac.plan,
                ac.activated_at,
                ac.expires_at,
                ac.status,
                f.id as farmer_id,
                f.name as farmer_name,
                f.tenant,
                EXTRACT(DAY FROM (ac.expires_at - NOW()))::INTEGER as days_remaining,
                ac.last_notification_days
            FROM activation_codes ac
            JOIN farmer_activations fa ON ac.id = fa.activation_code_id
            JOIN farmers f ON fa.farmer_id = f.id
            WHERE ac.status = 'active'
              AND ac.expires_at IS NOT NULL
              AND ac.expires_at > NOW()
              AND ac.activated_at IS NOT NULL
            ORDER BY ac.expires_at ASC
        """)
        
        activations = cursor.fetchall()
        
        for activation in activations:
            days_remaining = activation['days_remaining']
            
            if days_remaining is None:
                continue
            
            # Check if we need to send notification for this threshold
            last_notified = activation.get('last_notification_days', [])
            if not isinstance(last_notified, list):
                last_notified = []
            
            for threshold in NOTIFICATION_THRESHOLDS:
                if days_remaining <= threshold and threshold not in last_notified:
                    expiring.append({
                        'activation_id': activation['id'],
                        'code': activation['code'],
                        'email': activation['email'],
                        'farmer_name': activation['farmer_name'] or activation['email'].split('@')[0],
                        'tenant': activation['tenant'],
                        'plan': activation['plan'],
                        'days_remaining': days_remaining,
                        'expires_at': activation['expires_at'],
                        'threshold': threshold
                    })
                    break  # Only send one notification per check
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error checking expiring activations: {e}")
        if conn:
            conn.close()
    
    return expiring

def send_expiration_notification(activation: Dict[str, Any]) -> bool:
    """Send expiration notification email"""
    try:
        email_response = requests.post(
            f'{EMAIL_SERVICE_URL}/send/expiration',
            json={
                'email': activation['email'],
                'farmer_name': activation['farmer_name'],
                'days_remaining': activation['days_remaining'],
                'expires_at': activation['expires_at'].isoformat() if isinstance(activation['expires_at'], datetime) else str(activation['expires_at']),
                'plan': activation['plan'],
                'tenant': activation['tenant']
            },
            timeout=10
        )
        
        if email_response.status_code == 200:
            logger.info(f"Expiration notification sent to {activation['email']} ({activation['days_remaining']} days remaining)")
            return True
        else:
            logger.warning(f"Failed to send expiration email: {email_response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"Error sending expiration notification: {e}")
        return False

def mark_notification_sent(activation_id: int, threshold: int) -> bool:
    """Mark that notification was sent for this threshold"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        
        # Get current notifications list
        cursor.execute(
            "SELECT last_notification_days FROM activation_codes WHERE id = %s",
            (activation_id,)
        )
        result = cursor.fetchone()
        
        current_notifications = result[0] if result and result[0] else []
        if not isinstance(current_notifications, list):
            current_notifications = []
        
        # Add threshold if not already present
        if threshold not in current_notifications:
            current_notifications.append(threshold)
            current_notifications.sort(reverse=True)  # Most recent first
        
        # Update database
        cursor.execute(
            "UPDATE activation_codes SET last_notification_days = %s, updated_at = NOW() WHERE id = %s",
            (current_notifications, activation_id)
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        logger.error(f"Error marking notification sent: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

def process_expiration_notifications():
    """Main function to check and send expiration notifications"""
    logger.info("Checking for expiring activations...")
    
    expiring = check_expiring_activations()
    
    if not expiring:
        logger.info("No expiring activations need notification")
        return
    
    logger.info(f"Found {len(expiring)} activations needing notification")
    
    for activation in expiring:
        success = send_expiration_notification(activation)
        
        if success:
            mark_notification_sent(activation['activation_id'], activation['threshold'])

if __name__ == '__main__':
    process_expiration_notifications()

