"""
Background worker for processing queued telemetry ingestion tasks.

Supports two modes:
1. Individual processing (default): Process each message separately
2. Batch processing: Accumulate messages and flush in batches to Orion-LD/TimescaleDB

Batch mode is enabled when TELEMETRY_BATCH_MODE=true (env var)
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from task_queue import get_task_queue, TaskType

from .config import Settings
from .sdm import process_payload_dict, TelemetryBatch

logger = logging.getLogger(__name__)

# Batch processing configuration
BATCH_MODE_ENABLED = os.getenv('TELEMETRY_BATCH_MODE', 'true').lower() == 'true'
BATCH_MAX_SIZE = int(os.getenv('TELEMETRY_BATCH_SIZE', '100'))
BATCH_MAX_WAIT_SECONDS = float(os.getenv('TELEMETRY_BATCH_WAIT', '1.0'))


class SensorIngestWorker:
    """
    Redis Stream consumer that processes queued telemetry payloads.
    
    Supports batch mode for high-throughput scenarios:
    - Accumulates up to BATCH_MAX_SIZE messages
    - Flushes after BATCH_MAX_WAIT_SECONDS even if batch isn't full
    - Uses batch Orion-LD API (entityOperations/update) for efficiency
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.queue = get_task_queue(settings.queue_name)
        self.consumer_group = settings.queue_consumer_group
        self.consumer_name = (
            settings.queue_consumer_name
            or f"sensor-worker-{uuid.uuid4().hex[:8]}"
        )
        self.poll_interval = max(settings.queue_poll_interval, 0.5)
        self.batch_size = max(settings.worker_batch_size, 1)
        
        # Batch processing
        self.batch_mode = BATCH_MODE_ENABLED
        self._batch: Optional[TelemetryBatch] = None
        if self.batch_mode:
            self._batch = TelemetryBatch(
                settings,
                max_size=BATCH_MAX_SIZE,
                max_wait_seconds=BATCH_MAX_WAIT_SECONDS
            )
            logger.info(
                f"Batch mode enabled: max_size={BATCH_MAX_SIZE}, max_wait={BATCH_MAX_WAIT_SECONDS}s"
            )

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._pending_acks: List[str] = []  # Stream IDs to acknowledge after batch flush

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"sensor-ingest-worker-{self.consumer_name}",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "Sensor ingest worker started (group=%s, consumer=%s, queue=%s)",
            self.consumer_group,
            self.consumer_name,
            self.settings.queue_name,
        )

    def stop(self, timeout: float = 5.0) -> None:
        self._stop_event.set()
        
        # Flush any pending batch before stopping
        if self.batch_mode and self._batch and len(self._batch) > 0:
            logger.info(f"Flushing {len(self._batch)} pending items before stop...")
            self._flush_batch()
        
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
            if self._thread.is_alive():
                logger.warning("Sensor ingest worker did not stop within timeout")
        logger.info("Sensor ingest worker stopped")

    # --------------------------------------------------------------------- #
    # Internal helpers
    # --------------------------------------------------------------------- #

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                tasks = self.queue.consume_tasks(
                    consumer_group=self.consumer_group,
                    consumer_name=self.consumer_name,
                    count=self.batch_size,
                )

                if not tasks:
                    # No new tasks - check if we should flush pending batch
                    if self.batch_mode and self._batch and self._batch.is_ready():
                        self._flush_batch()
                    self._stop_event.wait(self.poll_interval)
                    continue

                for task in tasks:
                    self._process_task(task)
                
                # Check if batch is ready after processing
                if self.batch_mode and self._batch and self._batch.is_ready():
                    self._flush_batch()

            except Exception as exc:  # noqa: BLE001
                logger.exception("Unhandled error in sensor ingest worker: %s", exc)
                self._stop_event.wait(self.poll_interval)
    
    def _flush_batch(self) -> None:
        """Flush pending batch and acknowledge all processed messages"""
        if not self._batch:
            return
        
        try:
            success, errors = self._batch.flush()
            
            # Acknowledge all pending stream IDs
            for stream_id in self._pending_acks:
                try:
                    self.queue.acknowledge_task(self.consumer_group, stream_id)
                except Exception as e:
                    logger.warning(f"Failed to ack stream_id={stream_id}: {e}")
            
            logger.info(
                f"Batch flushed: {success} success, {errors} errors, {len(self._pending_acks)} acked"
            )
        except Exception as e:
            logger.error(f"Error flushing batch: {e}")
        finally:
            self._pending_acks = []

    def _process_task(self, task: Dict[str, Any]) -> None:
        task_type = task.get("task_type")
        if task_type != TaskType.SENSOR_INGEST:
            logger.debug("Skipping task %s with type %s", task.get("id"), task_type)
            return

        payload_wrapper = task.get("payload") or {}
        telemetry_payload = payload_wrapper.get("telemetry") or payload_wrapper
        api_key = payload_wrapper.get("api_key", "")
        task_uuid = task.get("task_uuid")
        stream_id = task.get("id")
        tenant_id = task.get("tenant_id")

        if not telemetry_payload:
            logger.error("Task %s missing telemetry payload", stream_id)
            return

        # Batch mode: Add to batch instead of processing immediately
        if self.batch_mode and self._batch:
            self._batch.add(telemetry_payload, api_key)
            self._pending_acks.append(stream_id)
            
            if task_uuid:
                self.queue.update_task_status(
                    task_uuid,
                    status="processing",
                )
            
            logger.debug(
                "Added to batch: stream_id=%s (batch size=%d)",
                stream_id,
                len(self._batch),
            )
            return

        # Individual processing mode (fallback)
        if task_uuid:
            self.queue.update_task_status(
                task_uuid,
                status="processing",
            )

        try:
            process_payload_dict(
                telemetry_payload,
                api_key=api_key,
                settings=self.settings,
                task_id=task_uuid,
            )
            self.queue.acknowledge_task(self.consumer_group, stream_id)

            if task_uuid:
                self.queue.update_task_status(
                    task_uuid,
                    status="completed",
                    result={"tenant_id": tenant_id},
                )

            logger.info(
                "Processed telemetry task stream_id=%s task_uuid=%s tenant=%s",
                stream_id,
                task_uuid,
                tenant_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Failed to process telemetry task stream_id=%s task_uuid=%s: %s",
                stream_id,
                task_uuid,
                exc,
            )
            if task_uuid:
                self.queue.update_task_status(
                    task_uuid,
                    status="failed",
                    error_message=str(exc),
                )

