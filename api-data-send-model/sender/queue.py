"""
Simple SQLite-backed queue for telemetry payloads.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Iterable, List, Tuple

logger = logging.getLogger(__name__)


SCHEMA = """
CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


class PayloadQueue:
    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(SCHEMA)
            conn.commit()
        logger.debug("Queue database initialised at %s", self.db_path)

    def enqueue(self, payload: dict) -> None:
        serialized = json.dumps(payload)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT INTO queue (payload) VALUES (?)", (serialized,))
            conn.commit()
        logger.info("Queued payload (db=%s)", self.db_path)

    def dequeue_batch(self, max_items: int) -> List[Tuple[int, dict]]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT id, payload FROM queue ORDER BY id ASC LIMIT ?",
                (max_items,),
            )
            rows = cursor.fetchall()

        items: List[Tuple[int, dict]] = []
        for queue_id, payload_str in rows:
            items.append((queue_id, json.loads(payload_str)))
        return items

    def delete_ids(self, ids: Iterable[int]) -> None:
        ids_list = list(ids)
        if not ids_list:
            return
        placeholders = ",".join("?" for _ in ids_list)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"DELETE FROM queue WHERE id IN ({placeholders})", ids_list)
            conn.commit()
        logger.info("Removed %d delivered payload(s) from queue", len(ids_list))

    def size(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            (count,) = conn.execute("SELECT COUNT(*) FROM queue").fetchone()
        return int(count)

