"""
Generic async HTTP wrapper with retry logic and configurable concurrency limiting.

Provides a reusable interface for external service calls (arXiv, Nebius, Gemini).
Retries only on transient failures (429, 5xx, connection/timeout errors).
Non-retryable 4xx errors fail immediately.
"""

import asyncio
from typing import Any

import httpx


class ExternalServiceError(Exception):
    """Raised when an external service request fails after retries or with non-retryable error."""

    def __init__(
        self,
        status: int | None = None,
        message: str | None = None,
        service: str = "external_service",
    ):
        self.status = status
        self.service = service
        if message is None:
            if status is not None:
                message = f"{service}: HTTP {status}"
            else:
                message = f"{service}: request failed"
        super().__init__(message)


class HTTPClient:
    """
    Async HTTP client with automatic retry on transient failures.

    Features:
    - Explicit retry logic with exponential backoff (1s -> 2s -> 4s capped)
    - Configurable concurrency limiting via asyncio.Semaphore
    - Default User-Agent header
    - Custom error wrapping for all failures
    """

    def __init__(
        self,
        max_concurrent: int = 10,
        default_user_agent: str = "arXgorithm/1.0",
        _sleep_fn=None,
    ):
        """
        Initialize HTTP client.

        Args:
            max_concurrent: Maximum concurrent requests (default 10).
            default_user_agent: Default User-Agent header (default "arXgorithm/1.0").
            _sleep_fn: Optional async sleep function for testing (default: asyncio.sleep).
        """
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.default_user_agent = default_user_agent
        self._sleep_fn = _sleep_fn or asyncio.sleep

    async def get(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        service: str = "external_service",
    ) -> dict[str, Any]:
        """
        Perform a GET request with automatic retry and error handling.

        Args:
            url: URL to request.
            headers: Optional additional headers (User-Agent auto-added).
            service: Service name for error context (default "external_service").

        Returns:
            Parsed JSON response.

        Raises:
            ExternalServiceError: If request fails after retries or with non-retryable error.
        """
        return await self._request("GET", url, headers=headers, service=service)

    async def post(
        self,
        url: str,
        json_data: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        service: str = "external_service",
    ) -> dict[str, Any]:
        """
        Perform a POST request with automatic retry and error handling.

        Args:
            url: URL to request.
            json_data: Optional JSON body.
            headers: Optional additional headers (User-Agent auto-added).
            service: Service name for error context (default "external_service").

        Returns:
            Parsed JSON response.

        Raises:
            ExternalServiceError: If request fails after retries or with non-retryable error.
        """
        return await self._request(
            "POST", url, json=json_data, headers=headers, service=service
        )

    async def _request(
        self,
        method: str,
        url: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        service: str = "external_service",
    ) -> dict[str, Any]:
        """
        Internal method to perform HTTP request with retry logic.

        Retries on:
        - 429 (rate limit)
        - 500, 502, 503, 504 (server errors)
        - Connection errors, timeouts

        Does NOT retry:
        - 4xx errors (except 429)
        - Other transport errors

        Args:
            method: HTTP method.
            url: URL to request.
            json: Optional JSON body.
            headers: Optional additional headers (User-Agent auto-added).
            service: Service name for error context.

        Returns:
            Parsed JSON response.

        Raises:
            ExternalServiceError: If request fails after retries or with non-retryable error.
        """
        async with self.semaphore:
            backoff_delays = [1.0, 2.0, 4.0]  # seconds, capped at 4s
            last_error: Exception | None = None

            # Initial attempt + retries
            for attempt in range(len(backoff_delays) + 1):
                try:
                    async with httpx.AsyncClient() as client:
                        req_headers = {
                            "User-Agent": self.default_user_agent,
                            **(headers or {}),
                        }
                        response = await client.request(
                            method, url, json=json, headers=req_headers, timeout=30.0
                        )

                        # Check for non-retryable 4xx errors
                        if (
                            400 <= response.status_code < 500
                            and response.status_code != 429
                        ):
                            raise ExternalServiceError(
                                status=response.status_code,
                                service=service,
                                message=f"{service}: HTTP {response.status_code}",
                            )

                        # Successful response
                        if 200 <= response.status_code < 300:
                            return response.json()

                        # Retryable server error
                        if response.status_code in (429, 500, 502, 503, 504):
                            last_error = ExternalServiceError(
                                status=response.status_code,
                                service=service,
                                message=f"{service}: HTTP {response.status_code}",
                            )
                            # Fall through to retry logic
                        else:
                            raise ExternalServiceError(
                                status=response.status_code,
                                service=service,
                                message=f"{service}: HTTP {response.status_code}",
                            )

                except (httpx.NetworkError, httpx.TimeoutException) as e:
                    last_error = ExternalServiceError(
                        service=service,
                        message=f"{service}: {type(e).__name__}",
                    )
                    # Fall through to retry logic

                # Retry logic
                if attempt < len(backoff_delays):
                    delay = backoff_delays[attempt]
                    await self._sleep_fn(delay)
                elif last_error is not None:
                    raise last_error

            # Should not reach here, but safety fallback
            if last_error is not None:
                raise last_error
            raise ExternalServiceError(
                service=service, message=f"{service}: request failed"
            )
