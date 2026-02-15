"""
Pydantic models for the ingestion API.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, validator


class Measurement(BaseModel):
    type: str = Field(..., description="Semantic type, e.g. soilMoisture")
    value: float
    unit: Optional[str]
    observedAt: datetime
    attributes: Dict[str, Optional[str]] = Field(default_factory=dict)


class TelemetryPayload(BaseModel):
    tenant: str
    deviceId: str
    profile: str
    measurements: List[Measurement]
    metadata: Dict[str, str] = Field(default_factory=dict)

    @validator("measurements")
    def ensure_measurements(cls, value: List[Measurement]) -> List[Measurement]:
        if not value:
            raise ValueError("measurements must not be empty")
        return value


class TelemetryResponse(BaseModel):
    status: Literal["accepted", "queued"]
    queued: bool = False
    message: str = "accepted"

