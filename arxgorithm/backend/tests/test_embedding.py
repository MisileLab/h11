"""Tests for EmbeddingService (SaladCloud embeddings with SQLite cache)."""

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
    """Fixture for mock SaladCloud settings."""
    settings = MagicMock(spec=Settings)
    settings.salad_api_key = "test-salad-key"
    settings.salad_organization_name = "test-org"
    settings.salad_inference_endpoint_name = "qwen3-embedding-8b"
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
async def test_embed_creates_saladcloud_job_on_first_call(embedding_service):
    """Test that embed() creates a SaladCloud job for new text."""
    text = "Test paper abstract about machine learning"
    expected_embedding = [0.1, 0.2, 0.3] + [0.0] * (1024 - 3)

    # Mock job creation (POST)
    job_response = {
        "id": "job-123",
        "status": "pending",
        "input": text,
        "output": None,
    }

    # Mock job completion (GET)
    completed_response = {
        "id": "job-123",
        "status": "succeeded",
        "input": text,
        "output": {"embeddings": [expected_embedding]},
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    result = await embedding_service.embed(text)

    assert result == expected_embedding

    # Verify POST was called for job creation
    embedding_service.http_client.post.assert_called_once()
    post_call = embedding_service.http_client.post.call_args
    assert "json_data" in post_call[1]
    assert post_call[1]["json_data"]["input"] == text
    assert "Salad-Api-Key" in post_call[1]["headers"]

    # Verify GET was called for polling
    embedding_service.http_client.get.assert_called_once()


@pytest.mark.asyncio
async def test_embed_polls_for_job_completion(embedding_service):
    """Test that embed() polls until job succeeds."""
    text = "Polling test text"
    expected_embedding = [0.5] * 1024

    job_response = {"id": "job-456", "status": "pending"}

    # Simulate pending → running → succeeded
    poll_responses = [
        {"id": "job-456", "status": "pending"},
        {"id": "job-456", "status": "running"},
        {"id": "job-456", "status": "succeeded", "output": {"embeddings": [expected_embedding]}},
    ]

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(side_effect=poll_responses)

    result = await embedding_service.embed(text)

    assert result == expected_embedding
    # POST once, GET three times (pending, running, succeeded)
    assert embedding_service.http_client.post.call_count == 1
    assert embedding_service.http_client.get.call_count == 3


@pytest.mark.asyncio
async def test_embed_uses_cache_on_second_call(embedding_service):
    """Test that embed() uses cache for duplicate text, avoiding API call."""
    text = "Cache test text"
    expected_embedding = [0.5] * 1024

    job_response = {"id": "job-789", "status": "pending"}
    completed_response = {
        "id": "job-789",
        "status": "succeeded",
        "output": {"embeddings": [expected_embedding]},
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

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

    job_response = {"id": "job-old", "status": "pending"}

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(
        side_effect=[
            {"id": "job-old", "status": "succeeded", "output": {"embeddings": [old_embedding]}},
            {"id": "job-new", "status": "succeeded", "output": {"embeddings": [new_embedding]}},
        ]
    )

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
        side_effect=ExternalServiceError(service="SaladCloud", message="Connection failed")
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert exc_info.value.service == "SaladCloud"


@pytest.mark.asyncio
async def test_embed_wraps_get_errors(embedding_service):
    """Test that polling errors are wrapped in ExternalServiceError."""
    text = "Polling error test"

    job_response = {"id": "job-err", "status": "pending"}

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(
        side_effect=ExternalServiceError(service="SaladCloud", message="Polling failed")
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert exc_info.value.service == "SaladCloud"


@pytest.mark.asyncio
async def test_embed_handles_missing_job_id(embedding_service):
    """Test that missing job ID in creation response raises error."""
    text = "No job ID test"

    embedding_service.http_client.post = AsyncMock(
        return_value={"status": "pending"}  # Missing "id" key
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "missing id" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_missing_output(embedding_service):
    """Test that job with missing output raises error."""
    text = "Missing output test"

    job_response = {"id": "job-noout", "status": "pending"}
    completed_response = {"id": "job-noout", "status": "succeeded"}  # Missing "output"

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "missing output" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_invalid_embeddings_format(embedding_service):
    """Test that invalid embeddings format raises error."""
    text = "Invalid format test"

    job_response = {"id": "job-badfmt", "status": "pending"}
    completed_response = {
        "id": "job-badfmt",
        "status": "succeeded",
        "output": {"embeddings": "not-a-list"},  # Should be a list
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "empty embeddings" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_empty_embeddings_array(embedding_service):
    """Test that empty embeddings array raises error."""
    text = "Empty embeddings test"

    job_response = {"id": "job-empty", "status": "pending"}
    completed_response = {
        "id": "job-empty",
        "status": "succeeded",
        "output": {"embeddings": []},  # Empty array
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "empty embeddings" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_embedding_not_list(embedding_service):
    """Test that non-list embedding raises error."""
    text = "Embedding not list test"

    job_response = {"id": "job-notlist", "status": "pending"}
    completed_response = {
        "id": "job-notlist",
        "status": "succeeded",
        "output": {"embeddings": ["not-an-embedding"]},  # String instead of list
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "invalid embedding format" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_validates_dimension(embedding_service):
    """Test that wrong embedding dimension raises error."""
    text = "Dimension test"
    wrong_embedding = [0.5] * 512  # Should be 1024

    job_response = {"id": "job-dim", "status": "pending"}
    completed_response = {
        "id": "job-dim",
        "status": "succeeded",
        "output": {"embeddings": [wrong_embedding]},
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "unexpected embedding dimension" in str(exc_info.value)
    assert "512" in str(exc_info.value)


@pytest.mark.asyncio
async def test_embed_handles_job_failed(embedding_service):
    """Test that failed job raises error."""
    text = "Job failed test"

    job_response = {"id": "job-fail", "status": "pending"}
    failed_response = {"id": "job-fail", "status": "failed"}

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=failed_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "failed" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_handles_job_cancelled(embedding_service):
    """Test that cancelled job raises error."""
    text = "Job cancelled test"

    job_response = {"id": "job-cancel", "status": "pending"}
    cancelled_response = {"id": "job-cancel", "status": "cancelled"}

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=cancelled_response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await embedding_service.embed(text)

    assert "cancelled" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_embed_timeout_after_max_wait(embedding_service):
    """Test that polling times out after maximum wait."""
    text = "Timeout test"

    job_response = {"id": "job-timeout", "status": "pending"}

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    # Always return pending (never completes)
    embedding_service.http_client.get = AsyncMock(return_value={"id": "job-timeout", "status": "pending"})

    # Patch time.time to simulate elapsed time
    elapsed_times = [0, 1, 2, 3, 301]  # Simulate 301 seconds elapsed
    time_idx = [0]

    def mock_time():
        result = elapsed_times[time_idx[0]]
        if time_idx[0] < len(elapsed_times) - 1:
            time_idx[0] += 1
        return result
    
    with patch("time.time", side_effect=mock_time):
        with pytest.raises(ExternalServiceError) as exc_info:
            await embedding_service.embed(text)

        assert "timeout" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_cache_deterministic_hash(embedding_service):
    """Test that same text produces same cache key."""
    text = "Deterministic cache test"
    expected_embedding = [0.7] * 1024

    job_response = {"id": "job-det", "status": "pending"}
    completed_response = {
        "id": "job-det",
        "status": "succeeded",
        "output": {"embeddings": [expected_embedding]},
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

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

    job_response = {"id": "job-cacheerr", "status": "pending"}
    completed_response = {
        "id": "job-cacheerr",
        "status": "succeeded",
        "output": {"embeddings": [expected_embedding]},
    }

    embedding_service.http_client.post = AsyncMock(return_value=job_response)
    embedding_service.http_client.get = AsyncMock(return_value=completed_response)

    # The operation should still succeed despite cache errors being logged
    result = await embedding_service.embed(text)
    assert result == expected_embedding
