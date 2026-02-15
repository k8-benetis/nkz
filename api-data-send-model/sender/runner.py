"""
High level orchestration for sending telemetry.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict

from .client import ApiClient, ApiClientError
from .config import SenderConfig
from .payloads import build_payload_from_dict
from .queue import PayloadQueue

logger = logging.getLogger(__name__)


class SenderRunner:
    def __init__(self, config: SenderConfig):
        self.config = config
        self.client = ApiClient(config)
        self.queue = (
            PayloadQueue(config.queue.db_path) if config.queue.enabled else None
        )

    def send_once(self, payload: Dict) -> None:
        try:
            self.client.post_payload(payload)
        except (ApiClientError, Exception) as exc:
            logger.error("Failed to deliver payload: %s", exc)
            if self.queue:
                self.queue.enqueue(payload)
            else:
                raise

    def drain_queue(self) -> None:
        if not self.queue:
            logger.info("Queue disabled; nothing to drain")
            return

        batch = self.queue.dequeue_batch(self.config.queue.max_batch_size)
        if not batch:
            logger.info("Queue empty")
            return

        delivered_ids = []
        for queue_id, payload in batch:
            try:
                self.client.post_payload(payload)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Failed to flush queued payload (id=%s): %s", queue_id, exc
                )
                break
            else:
                delivered_ids.append(queue_id)

        self.queue.delete_ids(delivered_ids)

    def _load_json_file(self, path: Path) -> Dict:
        content = path.read_text(encoding="utf-8")
        return json.loads(content)

    def run_daemon(self) -> None:
        watch_path = self.config.input.watch_path
        if not watch_path:
            logger.error("input.watch_path not configured; cannot run daemon loop")
            raise SystemExit(1)

        directory = Path(watch_path)
        if not directory.exists():
            logger.info("Creating watch directory %s", directory)
            directory.mkdir(parents=True, exist_ok=True)

        logger.info("Watching %s for new JSON files", directory)
        poll_interval = self.config.input.poll_interval

        processed_marker = directory / ".nekazari-processed"
        processed_marker.touch(exist_ok=True)
        processed_files = set(processed_marker.read_text().splitlines())

        try:
            while True:
                self._process_directory(directory, processed_files, processed_marker)
                if self.queue:
                    self.drain_queue()
                time.sleep(poll_interval)
        except KeyboardInterrupt:
            logger.info("Daemon interrupted; exiting")

    def _process_directory(
        self,
        directory: Path,
        processed_files: set[str],
        marker_file: Path,
    ) -> None:
        for json_file in sorted(directory.glob("*.json")):
            if json_file.name in processed_files:
                continue
            logger.info("Processing file %s", json_file)
            raw_data = self._load_json_file(json_file)
            payload = build_payload_from_dict(self.config, raw_data)
            self.send_once(payload)
            processed_files.add(json_file.name)
            marker_file.write_text("\n".join(sorted(processed_files)))

