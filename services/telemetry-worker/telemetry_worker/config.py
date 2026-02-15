"""
Application settings.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_prefix: str = "/api"
    postgres_url: str = Field(..., env="POSTGRES_URL")
    enable_queue: bool = Field(True, env="ENABLE_QUEUE")
    queue_dsn: Optional[str] = Field(None, env="QUEUE_DSN")
    log_level: str = Field("INFO", env="LOG_LEVEL")
    orion_url: str = Field("http://orion-ld-service:1026", env="ORION_URL")

    class Config:
        env_prefix = "SENSOR_"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()

