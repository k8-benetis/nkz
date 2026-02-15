"""
Configuration models for the sensor sender.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from pydantic import BaseModel, Field, HttpUrl, validator


logger = logging.getLogger(__name__)


class EndpointConfig(BaseModel):
    base_url: HttpUrl
    path: str = Field(..., description="Relative path, e.g. /api/telemetry")
    timeout: int = Field(10, ge=1, le=120)

    @property
    def url(self) -> str:
        return f"{self.base_url.rstrip('/')}{self.path}"


class AuthConfig(BaseModel):
    api_key: str = Field(..., min_length=16)
    tenant: str = Field(..., min_length=2)


class DeviceConfig(BaseModel):
    id: str = Field(..., description="Device identifier (usually slugified)")
    profile: str = Field(..., description="Sensor profile mapping key")


class QueueConfig(BaseModel):
    enabled: bool = True
    db_path: str = "queue.db"
    retry_interval: int = Field(60, ge=5, le=3600)
    max_batch_size: int = Field(100, ge=1, le=500)


class PayloadConfig(BaseModel):
    builder: str = Field(..., description="Payload builder identifier")
    meta: Dict[str, Any] = Field(default_factory=dict)


class InputConfig(BaseModel):
    format: str = Field("json")
    watch_path: Optional[str]
    poll_interval: int = Field(30, ge=5, le=600)


class SenderConfig(BaseModel):
    endpoint: EndpointConfig
    auth: AuthConfig
    device: DeviceConfig
    queue: QueueConfig = QueueConfig()
    payload: PayloadConfig
    input: InputConfig = InputConfig()

    raw: Dict[str, Any] = Field(default_factory=dict, repr=False)

    @validator("payload")
    def ensure_builder(cls, value: PayloadConfig) -> PayloadConfig:
        if not value.builder:
            raise ValueError("payload.builder must not be empty")
        return value


def load_config(path: Path) -> SenderConfig:
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    config = SenderConfig(**data, raw=data)
    logger.debug("Loaded configuration: %s", config)
    return config

