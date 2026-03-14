"""Tests for EmbeddingService (SaladCloud-hosted TEI with SQLite cache)."""

import hashlib
import struct
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import Settings
from app.http_client import ExternalServiceError
from app.services.embedding import EmbeddingService


@pytest.fixture
def mock_settings():
    """Fixture for mock SaladCloud TEI settings."""
    settings = MagicMock(spec=Settings)
    settings.salad_embedding_url = "https://test-embed.salad.cloud"
    settings.salad_api_key = "test-salad-key"
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
async def test_embed_calls_tei_api_on_first_call(embedding_service):
    """Test that embed() calls TEI /v1/embeddings for new text."""
    text = "Test paper abstract about machine learning"
    expected_embedding = [0.1, 0.2, 0.3] + [0.0] * (1024 - 3)

    # TEI response format (OpenAI-compatible)
    tei_response = {
        "data": [{"embedding": expected_embedding}],
    }

    embedding_service.http_client.post = AsyncMock(return_value=tei_response)

    result = await embedding_service.embed(text)

    assert result == expected_embedding

    # Verify POST was called with correct params
    embedding_service.http_client.post.assert_called_once()
    call_args = embedding_service.http_client.post.call_args

    # Check URL
    assert call_args[0][0] == "https://test-embed.salad.cloud/v1/embeddings"

    # Check payload
    json_data = call_args[1]["json_data"]
    assert json_data["input"] == text
    assert json_data["model"] == "Qwen/Qwen3-Embedding-8B"
    assert json_data["encoding_format"] == "float"

    # Check headers
    headers = call_args[1]["headers"]
    assert headers["Authorization"] == "Bearer test-salad-key"
    assert headers["Content-Type"] == "application/json"

    # Check service name
    assert call_args[1]["service"] == "SaladCloud-TEI"


@pytest.mark.asyncio
async def test_embed_without_api_key(embedding_service):
    """Test that embed() works without API key (optional auth)."""
    embedding_service.settings.salad_api_key = None
    text = "Test without API key"
    expected_embedding = [0.5] * 1024

    tei_response = {"data": [{"embedding": expected_embedding}]}
    embedding_service.http_client.post = AsyncMock(return_value=tei_response)

    result = await embedding_service.embed(text)

    assert result == expected_embedding

    # Verify no Authorization header when API key is None
    call_args = embedding_service.http_client.post.call_args
    headers = call_args[1]["headers"]
    assert "Authorization" not in headers


@pytest.mark.asyncio
async def test_embed_uses_cache_on_second_call(embedding_service):
    """Test that embed() uses cache for duplicate text, avoiding API call."""
    text = "Cache test text"
    expected_embedding = [0.5] * 1024

    tei_response = {"data": [{"embedding": expected_embedding}]}
    embedding_service.http_client.post = AsyncMock(return_value=tei_response)

    # First call should hit API
    result1 = await embedding_service.embed(text)
    assert result1 == expected_embedding
    assert embedding_service.http_client.post.call_count == 1

    # Second call should use cache (no new API calls)
    result2 = await embedding_service.embed(text)
    assert result2 == expected_embedding
    assert embedding_service.http_client.post.call_count == 1  # Still 1, not 2


@pytest.mark.asyncio
async def test_embed_cache_expired_after_ttl(embedding_service):
    """Test that expired cache entries are re-fetched."""
    text = "TTL test text"
    old_embedding = [0.1] * 1024
    new_embedding = [0.9] * 1024

    # First response, second response
    tei_responses = [
        {"data": [{"embedding": old_embedding}]},
        {"data": [{"embedding": new_embedding}]},
    ]
    embedding_service.http_client.post = AsyncMock(side_effect=tei_responses)

    # First call
    result1 = await embedding_service.embed(text)
    assert result1 == old_embedding

    # Manually expire cache entry
    import aiosqlite

    text_hash = hashlib.sha256(text.encode()).hexdigest()
    async with aiosqlite.connect(embedding_service.db_path) as db:
        old_time = int(time.time()) - embedding_service.CACHE_TTL_SECONDS - 1
        await db.execute(
            "UPDATE embedding_cache SET created_at = ? WHERE text_hash = ?",
            (old_time, text_hash),
        )
        await db.commit()

    # Second call should fetch fresh data
    result2 = await embedding_service.embed(text)
    assert result2 == new_embedding
    assert embedding_service.http_client.post.call_count == 2


@pytest.mark.asyncio
async def test_embed_wraps_post_errors(embedding_service):
    """Test that API errors are wrapped in ExternalServiceError."""
    text = "Error test text"

    embedding_service.http_client.post = AsyncMock(
        side_effect=ExternalServiceError(
            service="SaladCloud-TEI", message="Connection failed"
        )
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert exc_info.value.service == "SaladCloud-TEI"


@pytest.mark.asyncio
async def test_embed_handles_missing_data(embedding_service):
    """Test that response missing 'data' key raises error."""
    text = "Missing data test"

    embedding_service.http_client.post = AsyncMock(return_value={"no_data_key": []})

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "missing data" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_empty_data_array(embedding_service):
    """Test that empty 'data' array raises error."""
    text = "Empty data test"

    embedding_service.http_client.post = AsyncMock(return_value={"data": []})

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "missing data" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_missing_embedding(embedding_service):
    """Test that data item missing 'embedding' key raises error."""
    text = "Missing embedding test"

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"no_embedding_key": 123}]}
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "missing embedding" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_validates_dimension(embedding_service):
    """Test that wrong embedding dimension raises error."""
    text = "Dimension test"
    wrong_embedding = [0.5] * 512  # Should be 1024

    embedding_service.http_client.post = AsyncMock(
        return_value={"data": [{"embedding": wrong_embedding}]}
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "dimension mismatch" in str(exc_info.value).lower()
    assert "512" in str(exc_info.value)


@pytest.mark.asyncio
async def test_cache_deterministic_hash(embedding_service):
    """Test that same text produces same cache key."""
    text = "Deterministic cache test"
    expected_embedding = [0.7] * 1024

    tei_response = {"data": [{"embedding": expected_embedding}]}
    embedding_service.http_client.post = AsyncMock(return_value=tei_response)

    # Same text, different spacing
    text_with_spaces = "Deterministic cache test"
    result = await embedding_service.embed(text)

    # Verify cache hash is deterministic (same text = same key)
    text_hash1 = hashlib.sha256(text.encode()).hexdigest()
    text_hash2 = hashlib.sha256(text_with_spaces.encode()).hexdigest()
    assert text_hash1 == text_hash2  # Same text -> same hash


@pytest.mark.asyncio
async def test_cache_write_error_continues(embedding_service):
    """Test that cache write error doesn't fail the operation."""
    text = "Cache error test"
    expected_embedding = [0.3] * 1024

    tei_response = {"data": [{"embedding": expected_embedding}]}
    embedding_service.http_client.post = AsyncMock(return_value=tei_response)

    # The operation should still succeed despite cache errors being logged
    result = await embedding_service.embed(text)
    assert result == expected_embedding


@pytest.mark.asyncio
async def test_different_texts_different_cache_keys(embedding_service):
    """Test that different texts produce different cache keys."""
    text1 = "First text"
    text2 = "Second text"
    embedding1 = [0.1] * 1024
    embedding2 = [0.9] * 1024

    embedding_service.http_client.post = AsyncMock(
        side_effect=[
            {"data": [{"embedding": embedding1}]},
            {"data": [{"embedding": embedding2}]},
        ]
    )

    result1 = await embedding_service.embed(text1)
    result2 = await embedding_service.embed(text2)

    assert result1 == embedding1
    assert result2 == embedding2
    assert embedding_service.http_client.post.call_count == 2  # Both hit API


@pytest.mark.asyncio
async def test_service_name_in_errors(embedding_service):
    """Test that ExternalServiceError includes 'SaladCloud-TEI' service name."""
    text = "Service name test"

    embedding_service.http_client.post = AsyncMock(
        side_effect=ExternalServiceError(service="SaladCloud-TEI", message="Test error")
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert exc_info.value.service == "SaladCloud-TEI"
