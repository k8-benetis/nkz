"""
EventSink abstraction for telemetry persistence.

Current implementation: PostgreSQL/TimescaleDB via asyncpg connection pool.
Future: swap in KafkaSink when scale demands it (>2000 devices).
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

import asyncpg

logger = logging.getLogger(__name__)


class TelemetryEvent:
    """Single telemetry event ready for persistence."""

    __slots__ = (
        "tenant_id",
        "observed_at",
        "device_id",
        "entity_id",
        "entity_type",
        "payload",
    )

    def __init__(
        self,
        tenant_id: Optional[str],
        observed_at: datetime,
        device_id: str,
        entity_id: str,
        entity_type: str,
        payload: Dict[str, Any],
    ):
        self.tenant_id = tenant_id
        self.observed_at = observed_at
        self.device_id = device_id
        self.entity_id = entity_id
        self.entity_type = entity_type
        self.payload = payload

    def as_tuple(self) -> tuple:
        """Return values as a tuple for batch insertion."""
        return (
            self.tenant_id,
            self.observed_at,
            self.device_id,
            self.entity_id,
            self.entity_type,
            json.dumps(self.payload),
        )


class EventSink(ABC):
    """Abstract interface for telemetry event persistence."""

    @abstractmethod
    async def start(self) -> None:
        """Initialize resources (connection pools, etc.)."""

    @abstractmethod
    async def stop(self) -> None:
        """Release resources."""

    @abstractmethod
    async def write(self, event: TelemetryEvent) -> None:
        """Persist a single event."""

    @abstractmethod
    async def write_batch(self, events: List[TelemetryEvent]) -> None:
        """Persist a batch of events."""


class PostgreSQLSink(EventSink):
    """
    Async PostgreSQL/TimescaleDB sink using asyncpg connection pool.

    - Pool: 5-20 connections (configurable)
    - Batch: uses copy_records_to_table for high throughput
    - Single events: prepared statement for low latency
    """

    INSERT_SQL = """
        INSERT INTO telemetry_events (
            tenant_id, observed_at, device_id,
            entity_id, entity_type, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    """

    COLUMNS = [
        "tenant_id",
        "observed_at",
        "device_id",
        "entity_id",
        "entity_type",
        "payload",
    ]

    def __init__(
        self,
        dsn: str,
        min_pool: int = 5,
        max_pool: int = 20,
    ):
        self._dsn = dsn
        self._min_pool = min_pool
        self._max_pool = max_pool
        self._pool: Optional[asyncpg.Pool] = None

    async def start(self) -> None:
        """Create the connection pool."""
        self._pool = await asyncpg.create_pool(
            dsn=self._dsn,
            min_size=self._min_pool,
            max_size=self._max_pool,
            command_timeout=30,
        )
        logger.info(
            f"PostgreSQLSink pool started (min={self._min_pool}, max={self._max_pool})"
        )

    async def stop(self) -> None:
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            logger.info("PostgreSQLSink pool closed")

    async def write(self, event: TelemetryEvent) -> None:
        """Persist a single event using a prepared statement."""
        if not self._pool:
            raise RuntimeError("PostgreSQLSink not started")

        async with self._pool.acquire() as conn:
            await conn.execute(
                self.INSERT_SQL,
                event.tenant_id,
                event.observed_at,
                event.device_id,
                event.entity_id,
                event.entity_type,
                json.dumps(event.payload),
            )

    async def write_batch(self, events: List[TelemetryEvent]) -> None:
        """
        Persist a batch of events using copy_records_to_table for maximum throughput.

        Falls back to individual inserts if COPY fails (e.g., schema mismatch).
        """
        if not self._pool:
            raise RuntimeError("PostgreSQLSink not started")

        if not events:
            return

        records = [e.as_tuple() for e in events]

        async with self._pool.acquire() as conn:
            try:
                await conn.copy_records_to_table(
                    "telemetry_events",
                    records=records,
                    columns=self.COLUMNS,
                )
            except Exception as e:
                logger.warning(f"COPY failed ({e}), falling back to individual inserts")
                async with conn.transaction():
                    for record in records:
                        await conn.execute(self.INSERT_SQL, *record)

        logger.debug(f"Batch persisted {len(events)} events")
