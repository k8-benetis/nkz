#!/usr/bin/env python3
# =============================================================================
# Task Queue Module - Redis Streams Integration
# =============================================================================
# Provides task queue functionality using Redis Streams for async processing

import os
import json
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import dataclass, asdict
from urllib.parse import quote

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logging.warning("Redis not available, task queue will be disabled")

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://redis-service:6379')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', os.getenv('REDIS_PASS'))  # Support both variants

# Debug logging (only at module level, not during import)
# Will log when TaskQueue is initialized

# Redis connection pool
_redis_pool = None


@dataclass
class Task:
    """Task structure for queue"""
    id: str
    tenant_id: str
    task_type: str
    payload: Dict[str, Any]
    status: str = 'pending'  # pending, processing, completed, failed
    retry_count: int = 0
    max_retries: int = 3
    created_at: str = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow().isoformat()


class TaskQueue:
    """Redis Streams based task queue"""
    
    def __init__(self, stream_name: str = 'task_queue'):
        self.stream_name = stream_name
        self.redis_client = None
        
        # Log password status at initialization
        if REDIS_PASSWORD:
            logger.info(f"REDIS_PASSWORD is set (length: {len(REDIS_PASSWORD)})")
        else:
            logger.warning("REDIS_PASSWORD is NOT set - Redis connection may fail")
        
        if REDIS_AVAILABLE:
            try:
                self.redis_client = self._get_redis_client()
                if self.redis_client:
                    logger.info(f"Task queue initialized: {stream_name}")
                else:
                    logger.error(f"Task queue initialization failed: Redis client is None")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self.redis_client = None
    
    def _clean_none_values(self, data):
        """Recursively remove None values from dict/list for Redis compatibility"""
        if isinstance(data, dict):
            return {k: self._clean_none_values(v) for k, v in data.items() if v is not None}
        elif isinstance(data, list):
            return [self._clean_none_values(item) for item in data if item is not None]
        else:
            return data
    
    def _get_redis_client(self):
        """Get or create Redis client"""
        global _redis_pool
        # Always try to create pool if it doesn't exist (retry on failure)
        if _redis_pool is None and REDIS_AVAILABLE:
            try:
                # Build Redis URL with password if provided
                redis_url = REDIS_URL
                if REDIS_PASSWORD and 'redis://' in redis_url and '@' not in redis_url:
                    # URL-encode password to handle special characters (/, +, etc.)
                    encoded_password = quote(REDIS_PASSWORD, safe='')
                    # Add password to URL if not already present
                    redis_url = redis_url.replace('redis://', f'redis://:{encoded_password}@')
                    logger.info(f"Redis URL configured with password: {redis_url.split('@')[0]}@***")
                else:
                    logger.warning(f"Redis URL without password: {redis_url}")
                
                # Create connection pool with password in URL
                _redis_pool = redis.ConnectionPool.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_keepalive=True
                )
                
                # Test connection immediately
                test_client = redis.Redis(connection_pool=_redis_pool)
                test_client.ping()
                logger.info(f"Redis connection pool created successfully with authentication")
                
            except redis.exceptions.AuthenticationError as e:
                logger.error(f"Redis authentication failed: {e}. REDIS_PASSWORD={'set' if REDIS_PASSWORD else 'NOT set'}")
                _redis_pool = None
                return None
            except Exception as e:
                logger.error(f"Failed to create Redis pool: {e}", exc_info=True)
                _redis_pool = None
                return None
        
        if _redis_pool:
            return redis.Redis(connection_pool=_redis_pool)
        return None
    
    def enqueue_task(
        self,
        tenant_id: str,
        task_type: str,
        payload: Dict[str, Any],
        max_retries: int = 3
    ) -> Optional[str]:
        """
        Enqueue a new task
        
        Args:
            tenant_id: Tenant ID
            task_type: Type of task
            payload: Task payload
            max_retries: Maximum retry attempts
            
        Returns:
            Task ID or None if failed
        """
        # Try to get Redis client if not available (retry connection)
        if not self.redis_client:
            logger.warning("Redis client not available, attempting to reconnect...")
            self.redis_client = self._get_redis_client()
            if self.redis_client:
                logger.info("Redis client reconnected successfully")
            else:
                logger.error("Redis not available, cannot enqueue task")
                return None
        
        try:
            task_id = str(uuid.uuid4())
            task = Task(
                id=task_id,
                tenant_id=tenant_id,
                task_type=task_type,
                payload=payload,
                max_retries=max_retries
            )
            
            # Add to Redis Stream
            message = asdict(task)
            # Serialize payload - ensure all values are JSON-serializable
            try:
                # Clean None values from payload before serialization
                cleaned_payload = self._clean_none_values(payload)
                # Pre-serialize to catch any JSON errors early
                payload_json = json.dumps(cleaned_payload, default=str)  # Use default=str for non-serializable types
                message['payload'] = payload_json
            except (TypeError, ValueError) as e:
                logger.error(f"Failed to serialize payload: {e}. Payload keys: {list(payload.keys())}")
                # Try to serialize each key individually to identify the problem
                for key, value in payload.items():
                    try:
                        json.dumps(value, default=str)
                    except (TypeError, ValueError) as ve:
                        logger.error(f"Key '{key}' is not JSON-serializable: {ve}. Type: {type(value)}")
                raise
            
            # Clean None values from message dict for Redis (Redis doesn't accept None)
            cleaned_message = self._clean_none_values(message)
            
            self.redis_client.xadd(
                self.stream_name,
                cleaned_message,
                id='*'  # Auto-generate ID
            )
            
            logger.info(f"Task enqueued: {task_id} ({task_type}) for tenant {tenant_id}")
            return task_id
            
        except Exception as e:
            logger.error(f"Failed to enqueue task: {e}")
            return None
    
    def consume_tasks(self, consumer_group: str, consumer_name: str, count: int = 10) -> List[Dict[str, Any]]:
        """
        Consume tasks from stream
        
        Args:
            consumer_group: Consumer group name
            consumer_name: Consumer name (unique per worker)
            count: Number of tasks to consume
            
        Returns:
            List of tasks
        """
        if not self.redis_client:
            logger.error("Redis not available, cannot consume tasks")
            return []
        
        try:
            # Create consumer group if not exists
            try:
                self.redis_client.xgroup_create(
                    name=self.stream_name,
                    groupname=consumer_group,
                    id='0',
                    mkstream=True
                )
            except redis.exceptions.ResponseError:
                # Group already exists, that's OK
                pass
            
            # Read from stream
            messages = self.redis_client.xreadgroup(
                groupname=consumer_group,
                consumername=consumer_name,
                streams={self.stream_name: '>'},
                count=count,
                block=1000  # Block for 1 second
            )
            
            tasks = []
            for stream, msgs in messages:
                for msg_id, data in msgs:
                    try:
                        task_dict = data.copy()
                        task_dict['id'] = msg_id
                        # Deserialize payload
                        if 'payload' in task_dict and isinstance(task_dict['payload'], str):
                            task_dict['payload'] = json.loads(task_dict['payload'])
                        tasks.append(task_dict)
                    except Exception as e:
                        logger.error(f"Failed to parse task: {e}")
            
            return tasks
            
        except Exception as e:
            logger.error(f"Failed to consume tasks: {e}")
            return []
    
    def acknowledge_task(self, consumer_group: str, task_id: str) -> bool:
        """
        Acknowledge task completion
        
        Args:
            consumer_group: Consumer group name
            task_id: Task ID from stream
            
        Returns:
            True if acknowledged
        """
        if not self.redis_client:
            return False
        
        try:
            self.redis_client.xack(self.stream_name, consumer_group, task_id)
            return True
        except Exception as e:
            logger.error(f"Failed to acknowledge task: {e}")
            return False
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get task status
        
        Note: This checks a status store, not the stream
        
        Args:
            task_id: Task ID
            
        Returns:
            Task status info
        """
        if not self.redis_client:
            return None
        
        try:
            status_key = f"task:status:{task_id}"
            data = self.redis_client.get(status_key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.error(f"Failed to get task status: {e}")
            return None
    
    def update_task_status(
        self,
        task_id: str,
        status: str,
        error_message: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Update task status
        
        Args:
            task_id: Task ID
            status: New status
            error_message: Error if failed
            result: Result if succeeded
            
        Returns:
            True if updated
        """
        if not self.redis_client:
            return False
        
        try:
            status_key = f"task:status:{task_id}"
            status_data = {
                'task_id': task_id,
                'status': status,
                'updated_at': datetime.utcnow().isoformat()
            }
            
            if error_message:
                status_data['error_message'] = error_message
            if result:
                status_data['result'] = result
            
            # Store with 1 hour TTL
            self.redis_client.setex(
                status_key,
                3600,
                json.dumps(status_data)
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update task status: {e}")
            return False


# Global task queue instances
_queues = {}

def get_task_queue(queue_name: str = 'default') -> TaskQueue:
    """
    Get or create task queue instance
    
    Args:
        queue_name: Queue name
        
    Returns:
        TaskQueue instance
    """
    if queue_name not in _queues:
        _queues[queue_name] = TaskQueue(stream_name=f'tasks:{queue_name}')
    return _queues[queue_name]


def enqueue_task(
    tenant_id: str,
    task_type: str,
    payload: Dict[str, Any],
    queue_name: str = 'default',
    max_retries: int = 3
) -> Optional[str]:
    """
    Quick enqueue task helper
    
    Args:
        tenant_id: Tenant ID
        task_type: Task type
        payload: Task payload
        queue_name: Queue name
        max_retries: Max retries
        
    Returns:
        Task ID
    """
    queue = get_task_queue(queue_name)
    return queue.enqueue_task(tenant_id, task_type, payload, max_retries)


# =============================================================================
# Task Types
# =============================================================================

class TaskType:
    """Predefined task types"""
    NDVI_PROCESSING = 'ndvi_processing'
    DATA_EXPORT = 'data_export'
    REPORT_GENERATION = 'report_generation'
    NOTIFICATION = 'notification'
    ALERT_EVALUATION = 'alert_evaluation'
    CUSTOM = 'custom'

