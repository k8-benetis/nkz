"""
Minimal AEMET OpenData client with in-memory caching.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)


class AemetClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://opendata.aemet.es/opendata/api",
        timeout: int = 15,
        cache_seconds: int = 1800,
    ) -> None:
        if not api_key:
            raise ValueError("AEMET API key is required")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.cache_seconds = cache_seconds
        self.session = requests.Session()
        self._cache: Dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def get_municipality_catalog(self) -> Any:
        """
        Retrieve the full municipality catalog.
        Cached for 24 hours irrespective of default cache setting.
        """
        return self._cached_request(
            endpoint="/maestro/municipios",
            cache_seconds=86400,
        )

    def get_daily_forecast(self, ine_code: str) -> Any:
        """
        Retrieve daily forecast for the specified municipality INE code.
        """
        path = f"/prediccion/especifica/municipio/diaria/{ine_code}"
        return self._cached_request(path)

    def get_daily_observation(self, ine_code: str) -> Any:
        """
        Retrieve latest daily observations for the municipality.
        """
        path = f"/observacion/municipio/diaria/{ine_code}"
        return self._cached_request(path)

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _cached_request(self, endpoint: str, cache_seconds: Optional[int] = None) -> Any:
        cache_key = endpoint
        ttl = cache_seconds if cache_seconds is not None else self.cache_seconds

        with self._lock:
            cached = self._cache.get(cache_key)
            if cached:
                expires_at, data = cached
                if time.time() < expires_at:
                    return data

        data = self._request(endpoint)

        with self._lock:
            self._cache[cache_key] = (time.time() + ttl, data)

        return data

    def _request(self, endpoint: str) -> Any:
        url = f"{self.base_url}{endpoint}"
        logger.debug("AEMET request: %s", url)

        response = self.session.get(
            url,
            params={"api_key": self.api_key},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()

        estado = payload.get("estado")
        if estado and int(estado) != 200:
            logger.error("AEMET returned estado=%s for %s", estado, endpoint)
            raise RuntimeError(f"AEMET error estado={estado}")

        datos_url = payload.get("datos")
        if not datos_url:
            raise RuntimeError(f"AEMET response missing datos URL for {endpoint}")

        datos_response = self.session.get(datos_url, timeout=self.timeout)
        datos_response.raise_for_status()
        content_type = datos_response.headers.get("Content-Type", "")

        if "application/json" in content_type or datos_response.text.strip().startswith("["):
            return datos_response.json()

        # Some endpoints return text/CSV; fallback to raw text
        return datos_response.text


