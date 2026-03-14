"""Tests for HTTP client with retry logic and error handling."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.http_client import ExternalServiceError, HTTPClient


@pytest.fixture
def mock_response_200():
    """Create a mock 200 response."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"status": "ok", "data": 42}
    return response


@pytest.fixture
def mock_response_429():
    """Create a mock 429 response."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = 429
    return response


@pytest.fixture
def mock_response_503():
    """Create a mock 503 response."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = 503
    return response


@pytest.fixture
def mock_response_404():
    """Create a mock 404 response."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = 404
    return response


@pytest.mark.asyncio
async def test_successful_get_request_with_mock_transport():
    """Test successful GET request using httpx.MockTransport."""

    def mock_transport(request):
        """Route requests through MockTransport."""
        return httpx.Response(200, json={"status": "ok", "data": 42})

    transport = httpx.MockTransport(mock_transport)
    async with httpx.AsyncClient(transport=transport) as http_client:
        # Use the real client with MockTransport
        client = HTTPClient()
        # Patch the AsyncClient context manager to use our transport-equipped client
        with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = http_client
            mock_client_class.return_value.__aexit__.return_value = None

            result = await client.get("http://example.com", service="test")

            assert result["status"] == "ok"
            assert result["data"] == 42


@pytest.mark.asyncio
async def test_user_agent_header_added():
    """Test that default User-Agent header is added to requests."""
    client = HTTPClient(default_user_agent="arXgorithm/1.0")
    assert client.default_user_agent == "arXgorithm/1.0"


@pytest.mark.asyncio
async def test_retry_on_429():
    """Test that 429 (rate limit) triggers retry without real sleep delays."""
    attempt_count = 0

    async def mock_request(method, url, **kwargs):
        nonlocal attempt_count
        attempt_count += 1
        response = MagicMock(spec=httpx.Response)
        if attempt_count < 3:
            response.status_code = 429
        else:
            response.status_code = 200
            response.json.return_value = {"success": True}
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.request.side_effect = mock_request
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            client = HTTPClient()
            result = await client.get("http://example.com", service="test")

            assert result["success"] is True
            assert attempt_count == 3
            # Verify sleep was called (for backoff)
            assert mock_sleep.call_count == 2


@pytest.mark.asyncio
async def test_retry_on_500_502_503_504():
    """Test that server errors trigger retry without real sleep delays."""
    for error_code in [500, 502, 503, 504]:
        attempt_count = 0

        async def make_mock_request(code):
            async def mock_request(method, url, **kwargs):
                nonlocal attempt_count
                attempt_count += 1
                response = MagicMock(spec=httpx.Response)
                if attempt_count == 1:
                    response.status_code = code
                else:
                    response.status_code = 200
                    response.json.return_value = {"recovered": True}
                return response

            return mock_request

        with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                mock_client = AsyncMock()
                mock_client.request.side_effect = await make_mock_request(error_code)
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                mock_client_class.return_value = mock_client

                client = HTTPClient()
                result = await client.get("http://example.com", service="test")

                assert result["recovered"] is True
                assert attempt_count == 2
                # Verify sleep was called (for backoff)
                assert mock_sleep.call_count == 1


@pytest.mark.asyncio
async def test_no_retry_on_non_retryable_4xx():
    """Test that non-retryable 4xx errors fail immediately without retry."""
    for error_code in [400, 401, 403, 404]:
        client = HTTPClient()
        attempt_count = 0

        async def mock_request(method, url, **kwargs):
            nonlocal attempt_count
            attempt_count += 1
            response = MagicMock(spec=httpx.Response)
            response.status_code = error_code
            return response

        with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.request.side_effect = mock_request
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            with pytest.raises(ExternalServiceError) as exc_info:
                await client.get("http://example.com", service="test")

            assert exc_info.value.status == error_code
            assert attempt_count == 1


@pytest.mark.asyncio
async def test_custom_error_wrapping():
    """Test that ExternalServiceError wraps failures with service context."""
    client = HTTPClient()

    async def mock_request(method, url, **kwargs):
        response = MagicMock(spec=httpx.Response)
        response.status_code = 503
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.request.side_effect = mock_request
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_client

        with pytest.raises(ExternalServiceError) as exc_info:
            await client.get("http://example.com", service="SaladCloud-TEI")

        error = exc_info.value
        assert error.status == 503
        assert error.service == "SaladCloud-TEI"
        assert "SaladCloud-TEI" in str(error)


@pytest.mark.asyncio
async def test_concurrency_limiting_behavior():
    """Test that semaphore actually limits concurrent in-flight work."""
    client = HTTPClient(max_concurrent=2)
    in_flight = []
    max_concurrent_observed = [0]

    async def slow_request(method, url, **kwargs):
        # Record entry into in-flight work
        in_flight.append(1)
        current_count = len(in_flight)
        max_concurrent_observed[0] = max(max_concurrent_observed[0], current_count)

        # Use very small sleep to avoid real delays
        await asyncio.sleep(0.001)

        # Record exit
        in_flight.pop()

        response = MagicMock(spec=httpx.Response)
        response.status_code = 200
        response.json.return_value = {"ok": True}
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.request.side_effect = slow_request
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_client

        # Run 5 concurrent requests; with max_concurrent=2, no more than 2 should be in-flight
        tasks = [
            client.get(f"http://example.com/{i}", service="test") for i in range(5)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)

        # Verify all requests succeeded
        assert len(results) == 5
        assert all(r["ok"] is True for r in results)

        # Verify concurrency was actually limited
        assert max_concurrent_observed[0] <= 2


@pytest.mark.asyncio
async def test_post_request():
    """Test that POST requests work with JSON body."""
    client = HTTPClient()

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"echoed": True}

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.request.return_value = response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_client

        result = await client.post(
            "http://example.com",
            json_data={"key": "value"},
            service="test",
        )

        assert result["echoed"] is True
        # Verify POST request was called with json parameter
        mock_client.request.assert_called_once()
        call_args = mock_client.request.call_args
        assert call_args[0][0] == "POST"
        assert call_args[1]["json"] == {"key": "value"}


@pytest.mark.asyncio
async def test_headers_include_user_agent():
    """Test that request includes default User-Agent header."""
    client = HTTPClient(default_user_agent="arXgorithm/1.0")

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"ok": True}

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.request.return_value = response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_client

        await client.get("http://example.com")

        # Verify User-Agent was included in headers
        call_args = mock_client.request.call_args
        headers = call_args[1]["headers"]
        assert headers["User-Agent"] == "arXgorithm/1.0"


@pytest.mark.asyncio
async def test_retry_with_backoff():
    """Test that retries happen with expected backoff delays (mocked)."""
    attempt_count = 0

    async def mock_request(method, url, **kwargs):
        nonlocal attempt_count
        attempt_count += 1
        response = MagicMock(spec=httpx.Response)
        if attempt_count <= 3:
            response.status_code = 503
        else:
            response.status_code = 200
            response.json.return_value = {"ok": True}
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.request.side_effect = mock_request
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            client = HTTPClient()
            result = await client.get("http://example.com", service="test")

            assert result["ok"] is True
            assert attempt_count == 4  # Initial + 3 retries
            # Verify sleep was called 3 times (for each retry backoff)
            assert mock_sleep.call_count == 3


@pytest.mark.asyncio
async def test_timeout_is_retryable():
    """Test that timeouts trigger retry without real sleep delays."""
    attempt_count = 0

    async def mock_request(method, url, **kwargs):
        nonlocal attempt_count
        attempt_count += 1
        if attempt_count == 1:
            raise httpx.TimeoutException("Request timeout")
        response = MagicMock(spec=httpx.Response)
        response.status_code = 200
        response.json.return_value = {"recovered": True}
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.request.side_effect = mock_request
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            client = HTTPClient()
            result = await client.get("http://example.com", service="test")

            assert result["recovered"] is True
            assert attempt_count == 2
            # Verify sleep was called (for backoff)
            assert mock_sleep.call_count == 1


@pytest.mark.asyncio
async def test_network_error_is_retryable():
    """Test that network errors trigger retry without real sleep delays."""
    attempt_count = 0

    async def mock_request(method, url, **kwargs):
        nonlocal attempt_count
        attempt_count += 1
        if attempt_count == 1:
            raise httpx.NetworkError("Connection refused")
        response = MagicMock(spec=httpx.Response)
        response.status_code = 200
        response.json.return_value = {"recovered": True}
        return response

    with patch("app.http_client.httpx.AsyncClient") as mock_client_class:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.request.side_effect = mock_request
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            client = HTTPClient()
            result = await client.get("http://example.com", service="test")

            assert result["recovered"] is True
            assert attempt_count == 2
            # Verify sleep was called (for backoff)
            assert mock_sleep.call_count == 1


@pytest.mark.asyncio
async def test_external_service_error_properties():
    """Test ExternalServiceError exposes status and service context."""
    error = ExternalServiceError(status=503, service="gemini")
    assert error.status == 503
    assert error.service == "gemini"
    assert "gemini" in str(error)
    assert "503" in str(error)
