"""Tests for EmbeddingService (Nebius embeddings with SQLite cache)."""

import hashlib
import struct
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.http_client import ExternalServiceError
from app.services.embedding import EmbeddingService


@pytest.fixture
def mock_settings():
    """Fixture for mock settings."""
    settings = MagicMock(spec=Settings)
    settings.nebius_api_key = "test-api-key"
    settings.nebius_api_url = "https://api.nebius.com"
    return settings


@pytest.fixture
def embedding_service(mock_settings, tmp_path):
    """Fixture for EmbeddingService with temporary database."""
    db_path = str(tmp_path / "test.db")

    mock_client = AsyncMock()
    service = EmbeddingService(
        settings=mock_settings,
        db_path=db_path,
        http_client=mock_client,
    )
    return service


@pytest.mark.asyncio
async def test_embed_calls_nebius_api_on_first_call(embedding_service, mock_settings):
    """Test that embed() calls Nebius API for new text."""
    text = "Test paper abstract about machine learning"
    expected_embedding = [0.1, 0.2, 0.3] + [0.0] * (1024 - 3)

    embedding_service.http_client.post = AsyncMock(
        return_value={
            "data": [{"embedding": expected_embedding}],
        }
    )

    result = await embedding_service.embed(text)

    assert result == expected_embedding

    embedding_service.http_client.post.assert_called_once()
    call_args = embedding_service.http_client.post.call_args

    assert call_args[1]["json_data"]["model"] == "Qwen/Qwen3-Embedding-8B"
    assert call_args[1]["json_data"]["input"] == text
    assert call_args[1]["json_data"]["encoding_format"] == "float"
    assert call_args[1]["headers"]["Authorization"] == "Bearer test-api-key"


@pytest.mark.asyncio
async def test_embed_uses_cache_on_second_call(embedding_service):
    """Test that embed() uses cache for duplicate text, avoiding API call."""
    text = "Duplicate test text"
    expected_embedding = [0.5] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={
            "data": [{"embedding": expected_embedding}],
        }
    )

    result1 = await embedding_service.embed(text)
    assert result1 == expected_embedding
    assert embedding_service.http_client.post.call_count == 1

    result2 = await embedding_service.embed(text)
    assert result2 == expected_embedding
    assert embedding_service.http_client.post.call_count == 1  # Still 1, not 2


@pytest.mark.asyncio
async def test_embed_cache_expired_after_ttl(embedding_service):
    """Test that expired cache entries are re-fetched."""
    text = "TTL test text"
    old_embedding = [0.1] * 1024
    new_embedding = [0.9] * 1024

    embedding_service.http_client.post = AsyncMock()
    embedding_service.http_client.post.side_effect = [
        {"data": [{"embedding": old_embedding}]},
        {"data": [{"embedding": new_embedding}]},
    ]

    result1 = await embedding_service.embed(text)
    assert result1 == old_embedding

    import aiosqlite
    import sqlite3

    text_hash = hashlib.sha256(text.encode()).hexdigest()

    async with aiosqlite.connect(embedding_service.db_path) as db:
        old_time = int(time.time()) - embedding_service.CACHE_TTL_SECONDS - 1
        await db.execute(
            "UPDATE embedding_cache SET created_at = ? WHERE text_hash = ?",
            (old_time, text_hash),
        )
        await db.commit()

    result2 = await embedding_service.embed(text)
    assert result2 == new_embedding
    assert embedding_service.http_client.post.call_count == 2


@pytest.mark.asyncio
async def test_embed_wraps_api_errors(embedding_service):
    """Test that API errors are wrapped in ExternalServiceError."""
    text = "Error test text"

    embedding_service.http_client.post = AsyncMock(
        side_effect=ExternalServiceError(status=502, service="Nebius")
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert exc_info.value.service == "Nebius"
    assert exc_info.value.status == 502


@pytest.mark.asyncio
async def test_embed_validates_response_format(embedding_service):
    """Test that missing embedding data raises error."""
    text = "Invalid response test"

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{}]}  # Missing "embedding" key
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "invalid response format" in str(exc_info.value)


@pytest.mark.asyncio
async def test_embed_validates_dimension(embedding_service):
    """Test that wrong embedding dimension raises error."""
    text = "Wrong dimension test"

    embedding_service.http_client.post = AsyncMock(
        return_value={
            "data": [
                {"embedding": [0.1] * 768}
            ]  # Wrong dimension (768 instead of 1024)
        }
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "unexpected embedding dimension" in str(exc_info.value)


@pytest.mark.asyncio
async def test_embed_deterministic_cache_key(embedding_service):
    """Test that same text always produces same cache key."""
    text = "Deterministic cache key test"
    embedding = [0.42] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    result1 = await embedding_service.embed(text)
    result2 = await embedding_service.embed(text)

    assert len(result1) == len(result2) == len(embedding)
    for i in range(len(embedding)):
        assert abs(result1[i] - result2[i]) < 1e-6  # Same cache hit
    assert embedding_service.http_client.post.call_count == 1


@pytest.mark.asyncio
async def test_embed_different_texts_different_cache_entries(embedding_service):
    """Test that different texts create different cache entries."""
    text1 = "First text"
    text2 = "Second text"
    embedding1 = [0.1] * 1024
    embedding2 = [0.2] * 1024

    embedding_service.http_client.post = AsyncMock()
    embedding_service.http_client.post.side_effect = [
        {"data": [{"embedding": embedding1}]},
        {"data": [{"embedding": embedding2}]},
    ]

    result1 = await embedding_service.embed(text1)
    result2 = await embedding_service.embed(text2)

    assert result1 == embedding1
    assert result2 == embedding2
    assert embedding_service.http_client.post.call_count == 2


@pytest.mark.asyncio
async def test_embed_cache_stores_768_dimensions_correctly(embedding_service):
    """Test that 1024-dimensional embeddings round-trip through cache correctly."""
    text = "1024D cache test"
    original_embedding = [float(i % 256) / 256.0 for i in range(1024)]

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": original_embedding}]}
    )

    result1 = await embedding_service.embed(text)

    result2 = await embedding_service.embed(text)

    assert len(result2) == 1024
    assert result1 == result2
    for i in range(1024):
        assert abs(result2[i] - original_embedding[i]) < 1e-6


@pytest.mark.asyncio
async def test_embed_uses_correct_headers_and_auth(embedding_service, mock_settings):
    """Test that bearer token and content-type are set correctly."""
    text = "Auth header test"
    embedding = [0.0] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    await embedding_service.embed(text)

    call_args = embedding_service.http_client.post.call_args
    headers = call_args[1]["headers"]

    assert headers["Authorization"] == "Bearer test-api-key"
    assert headers["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_embed_uses_correct_endpoint_url(embedding_service, mock_settings):
    """Test that correct Nebius endpoint URL is used."""
    text = "URL test"
    embedding = [0.0] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    await embedding_service.embed(text)

    call_args = embedding_service.http_client.post.call_args
    url = call_args[0][0]

    assert url == "https://api.nebius.com/v1/embeddings"


@pytest.mark.asyncio
async def test_embed_normalizes_url_with_v1_suffix(embedding_service, mock_settings):
    """Test that URL with /v1 suffix is normalized to avoid /v1/v1/embeddings."""
    text = "URL normalization test"
    embedding = [0.0] * 1024

    # Simulate .env.example format where NEBIUS_API_URL includes /v1
    mock_settings.nebius_api_url = "https://api.nebius.ai/v1"

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    result = await embedding_service.embed(text)

    call_args = embedding_service.http_client.post.call_args
    url = call_args[0][0]

    # Should normalize to /v1/embeddings, not /v1/v1/embeddings
    assert url == "https://api.nebius.ai/v1/embeddings"
    assert result == embedding


@pytest.mark.asyncio
async def test_embed_normalizes_url_without_v1_suffix(embedding_service, mock_settings):
    """Test that URL without /v1 suffix still works correctly."""
    text = "URL without v1 test"
    embedding = [0.0] * 1024

    # Base URL without /v1
    mock_settings.nebius_api_url = "https://api.nebius.ai"

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    result = await embedding_service.embed(text)

    call_args = embedding_service.http_client.post.call_args
    url = call_args[0][0]

    # Should append /v1/embeddings
    assert url == "https://api.nebius.ai/v1/embeddings"
    assert result == embedding


@pytest.mark.asyncio
async def test_embed_normalizes_url_with_trailing_slash(
    embedding_service, mock_settings
):
    """Test that trailing slash is stripped before normalization."""
    text = "URL with trailing slash test"
    embedding = [0.0] * 1024

    # Base URL with /v1 and trailing slash
    mock_settings.nebius_api_url = "https://api.nebius.ai/v1/"

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    result = await embedding_service.embed(text)

    call_args = embedding_service.http_client.post.call_args
    url = call_args[0][0]

    # Should normalize to /v1/embeddings, not /v1/v1/embeddings
    assert url == "https://api.nebius.ai/v1/embeddings"
    assert result == embedding


@pytest.mark.asyncio
async def test_embed_recovers_from_cache_read_error(embedding_service):
    """Test that cache read errors are logged but don't prevent API fallback."""
    text = "Cache read error recovery test"
    embedding = [0.3] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    # Corrupt the database path to trigger read error
    embedding_service.db_path = "/nonexistent/path/to/db.db"

    # Should fall back to API call despite cache read error
    with patch("app.services.embedding.logger") as mock_logger:
        result = await embedding_service.embed(text)

    assert result == embedding
    assert embedding_service.http_client.post.call_count == 1
    # Both read and write fail with bad path, so check at least one warning logged
    assert mock_logger.warning.call_count >= 1
    warning_messages = [str(call[0][0]) for call in mock_logger.warning.call_args_list]
    assert any("Cache read error" in msg for msg in warning_messages)


@pytest.mark.asyncio
async def test_embed_continues_on_cache_write_error(embedding_service):
    """Test that cache write errors are logged but don't fail the embedding request."""
    text = "Cache write error test"
    embedding = [0.4] * 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": embedding}]}
    )

    # Corrupt the database path to trigger write error
    embedding_service.db_path = "/nonexistent/path/to/db.db"

    with patch("app.services.embedding.logger") as mock_logger:
        result = await embedding_service.embed(text)

    assert result == embedding
    assert embedding_service.http_client.post.call_count == 1
    # Both read and write fail with bad path, so check at least one warning logged
    assert mock_logger.warning.call_count >= 1
    warning_messages = [str(call[0][0]) for call in mock_logger.warning.call_args_list]
    assert any("Cache write error" in msg for msg in warning_messages)
