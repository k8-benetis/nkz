"""
HTTP client that sends payloads to the Nekazari API gateway.
"""

from __future__ import annotations

import logging
from typing import Dict

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import SenderConfig

logger = logging.getLogger(__name__)


class ApiClientError(Exception):
    pass


class ApiClient:
    def __init__(self, config: SenderConfig):
        self.config = config

    @retry(
        retry=retry_if_exception_type(requests.RequestException),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def post_payload(self, payload: Dict) -> None:
        # Extract context URL from payload if present
        context_url = payload.get("@context", "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld")
        
        headers = {
            "Content-Type": "application/ld+json",
            "X-API-Key": self.config.auth.api_key,
            "Fiware-Service": self.config.auth.tenant,
            "Fiware-ServicePath": "/",
            "Link": f'<{context_url}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
        }
        url = self.config.endpoint.url
        logger.debug("POST %s payload=%s", url, payload)
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=self.config.endpoint.timeout,
        )
        if response.status_code >= 400:
            raise ApiClientError(
                f"API error {response.status_code}: {response.text}"
            )
        logger.info("Payload delivered to %s", url)

