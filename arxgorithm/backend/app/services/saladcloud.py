"""
SaladCloud Container API client for TEI instance management.

Start/stop TEI embedding instances on demand to save costs.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from app.config import Settings
from app.http_client import ExternalServiceError, HTTPClient

logger = logging.getLogger(__name__)


class ContainerStatus(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    PENDING = "pending"
    ERROR = "error"


@dataclass
class ContainerInstance:
    id: str
    status: ContainerStatus
    created_at: datetime | None
    url: str | None


class SaladCloudService:
    def __init__(self, settings: Settings, http_client: HTTPClient | None = None):
        self.settings = settings
        self.http_client = http_client or HTTPClient()
        self._base_url = "https://api.salad.com/api/public"

    @property
    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.salad_api_key:
            headers["Authorization"] = f"Bearer {self.settings.salad_api_key}"
        return headers

    async def get_container_status(self) -> ContainerInstance | None:
        url = f"{self._base_url}/containers/tei-embedding"
        try:
            response = await self.http_client.get(
                url,
                headers=self._headers,
                service="SaladCloud",
            )
            return ContainerInstance(
                id=response.get("id", ""),
                status=ContainerStatus(response.get("status", "stopped")),
                created_at=datetime.fromisoformat(response["created_at"])
                if response.get("created_at")
                else None,
                url=response.get("url"),
            )
        except ExternalServiceError:
            logger.warning("Failed to get container status")
            return None

    async def start_container(self) -> ContainerInstance | None:
        url = f"{self._base_url}/containers/tei-embedding/start"
        try:
            response = await self.http_client.post(
                url,
                headers=self._headers,
                service="SaladCloud",
            )
            logger.info("Started TEI container")
            return ContainerInstance(
                id=response.get("id", ""),
                status=ContainerStatus.RUNNING,
                created_at=datetime.now(),
                url=response.get("url"),
            )
        except ExternalServiceError as e:
            logger.error("Failed to start container: %s", e)
            return None

    async def stop_container(self) -> bool:
        url = f"{self._base_url}/containers/tei-embedding/stop"
        try:
            await self.http_client.post(
                url,
                headers=self._headers,
                service="SaladCloud",
            )
            logger.info("Stopped TEI container")
            return True
        except ExternalServiceError as e:
            logger.error("Failed to stop container: %s", e)
            return False

    async def ensure_running(self) -> ContainerInstance | None:
        status = await self.get_container_status()
        if status and status.status == ContainerStatus.RUNNING:
            return status
        return await self.start_container()
