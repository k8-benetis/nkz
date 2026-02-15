"""
FastAPI routers.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status

from .config import get_settings
from .models import TelemetryPayload, TelemetryResponse
from .sdm import process_payload


logger = logging.getLogger(__name__)


health_router = APIRouter()
telemetry_router = APIRouter()


@health_router.get("/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "ok"}


@telemetry_router.post(
    "/telemetry",
    response_model=TelemetryResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_telemetry(
    payload: TelemetryPayload,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    settings = get_settings()

    if payload.tenant != x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant mismatch between payload and headers",
        )

    try:
        await process_payload(payload, api_key=x_api_key, settings=settings)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to ingest payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to ingest payload",
        ) from exc

    return TelemetryResponse(status="accepted", queued=False, message="ok")

