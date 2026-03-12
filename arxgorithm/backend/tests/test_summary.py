"""Tests for SummaryService (Gemini API integration and caching)."""

import hashlib
import sqlite3
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.http_client import ExternalServiceError, HTTPClient
from app.services.summary import SummaryService


@pytest.fixture
def settings():
    """Fixture: Settings with Gemini API key."""
    return Settings(
        arxiv_rate_limit=3.0,
        nebius_api_key="test-nebius-key",
        nebius_api_url="https://api.nebius.com",
        gemini_api_key="test-gemini-key",
        session_secret="test-session-secret",
        database_url="sqlite:///:memory:",
        backend_url="http://localhost:8000",
        frontend_url="http://localhost:3000",
    )


@pytest.fixture
def db_conn():
    """Fixture: In-memory SQLite database."""
    conn = sqlite3.connect(":memory:")
    conn.enable_load_extension(True)
    # Skip sqlite-vec loading for unit tests; we only need the summary_cache table
    conn.enable_load_extension(False)
    return conn


@pytest.fixture
def http_client():
    """Fixture: HTTPClient instance."""
    return HTTPClient()


@pytest.fixture
def summary_service(settings, db_conn, http_client):
    """Fixture: SummaryService instance."""
    return SummaryService(settings, db_conn, http_client)


class TestSummaryServiceInitialization:
    """Tests for SummaryService initialization."""

    def test_service_initializes_with_settings_and_db(self, settings, db_conn):
        """Test that service initializes with settings and database connection."""
        service = SummaryService(settings, db_conn)
        assert service.settings is settings
        assert service.db_conn is db_conn

    def test_service_creates_http_client_if_not_provided(self, settings, db_conn):
        """Test that HTTPClient is created if not provided."""
        service = SummaryService(settings, db_conn)
        assert isinstance(service.http_client, HTTPClient)

    def test_service_uses_provided_http_client(self, settings, db_conn, http_client):
        """Test that provided HTTPClient is used."""
        service = SummaryService(settings, db_conn, http_client)
        assert service.http_client is http_client

    def test_cache_table_created_on_init(self, summary_service, db_conn):
        """Test that summary_cache table is created during initialization."""
        cursor = db_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='summary_cache'"
        )
        assert cursor.fetchone() is not None

    def test_gemini_model_endpoint_is_flash_lite(self, summary_service):
        """Test that service uses the correct Gemini flash-lite model endpoint."""
        assert "gemini-2.5-flash-lite" in summary_service.GEMINI_API_URL
        assert summary_service.GEMINI_API_URL == (
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
        )


class TestCacheKeyGeneration:
    """Tests for cache key generation."""

    def test_cache_key_with_paper_id(self, summary_service):
        """Test cache key generation with paper_id."""
        title = "Test Title"
        abstract = "Test Abstract"
        paper_id = "1234.5678"

        pid, content_hash = summary_service._get_cache_key(title, abstract, paper_id)

        assert pid == paper_id
        assert isinstance(content_hash, str)
        assert len(content_hash) == 64  # SHA256 hex digest length

    def test_cache_key_without_paper_id(self, summary_service):
        """Test cache key generation without paper_id."""
        title = "Test Title"
        abstract = "Test Abstract"

        pid, content_hash = summary_service._get_cache_key(title, abstract)

        assert pid is None
        assert isinstance(content_hash, str)
        assert len(content_hash) == 64

    def test_deterministic_content_hash(self, summary_service):
        """Test that content hash is deterministic."""
        title = "Test Title"
        abstract = "Test Abstract"

        pid1, hash1 = summary_service._get_cache_key(title, abstract)
        pid2, hash2 = summary_service._get_cache_key(title, abstract)

        assert hash1 == hash2

    def test_different_content_different_hash(self, summary_service):
        """Test that different content produces different hashes."""
        title1 = "Test Title 1"
        abstract1 = "Test Abstract 1"

        title2 = "Test Title 2"
        abstract2 = "Test Abstract 2"

        _, hash1 = summary_service._get_cache_key(title1, abstract1)
        _, hash2 = summary_service._get_cache_key(title2, abstract2)

        assert hash1 != hash2


class TestCaching:
    """Tests for caching behavior."""

    def test_cache_summary(self, summary_service, db_conn):
        """Test that a summary is cached."""
        paper_id = "1234.5678"
        content_hash = "abc123"
        summary = "This is a summary."

        summary_service._cache_summary(paper_id, content_hash, summary)

        cursor = db_conn.execute(
            "SELECT paper_id, content_hash, summary FROM summary_cache WHERE content_hash = ?",
            (content_hash,),
        )
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == paper_id
        assert row[1] == content_hash
        assert row[2] == summary

    def test_get_cached_summary_by_paper_id(self, summary_service, db_conn):
        """Test retrieving cached summary by paper_id."""
        paper_id = "1234.5678"
        content_hash = "abc123"
        summary = "This is a summary."

        summary_service._cache_summary(paper_id, content_hash, summary)

        cached = summary_service._get_cached_summary(paper_id, content_hash)
        assert cached == summary

    def test_get_cached_summary_by_content_hash_fallback(
        self, summary_service, db_conn
    ):
        """Test retrieving cached summary by content_hash when paper_id doesn't match."""
        paper_id = "1234.5678"
        content_hash = "abc123"
        summary = "This is a summary."

        summary_service._cache_summary(paper_id, content_hash, summary)

        # Try to retrieve with different paper_id but same content_hash
        cached = summary_service._get_cached_summary(None, content_hash)
        assert cached == summary

    def test_cache_miss_returns_none(self, summary_service):
        """Test that cache miss returns None."""
        cached = summary_service._get_cached_summary("nonexistent", "nonexistent_hash")
        assert cached is None


class TestPromptBuilding:
    """Tests for prompt building."""

    def test_prompt_includes_title_and_abstract(self, summary_service):
        """Test that prompt includes title and abstract."""
        title = "Understanding Neural Networks"
        abstract = "This paper explores the mathematical foundations..."

        prompt = summary_service._build_prompt(title, abstract)

        assert title in prompt
        assert abstract in prompt

    def test_prompt_includes_instructions(self, summary_service):
        """Test that prompt includes summarization instructions."""
        title = "Test"
        abstract = "Test abstract"

        prompt = summary_service._build_prompt(title, abstract)

        assert "2-3 sentences" in prompt
        assert "academic" in prompt.lower()

    def test_prompt_is_string(self, summary_service):
        """Test that prompt is a string."""
        title = "Test"
        abstract = "Test abstract"

        prompt = summary_service._build_prompt(title, abstract)

        assert isinstance(prompt, str)
        assert len(prompt) > 0


class TestSuccessfulSummarization:
    """Tests for successful summarization."""

    @pytest.mark.asyncio
    async def test_successful_summary_extraction(self, summary_service):
        """Test successful summary generation and extraction from Gemini response."""
        title = "Understanding Neural Networks"
        abstract = "This paper explores..."

        # Mock HTTPClient response
        expected_summary = "This paper explores neural network architectures and their applications in deep learning."
        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": expected_summary,
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await summary_service.summarize(
                title, abstract, paper_id="1234.5678"
            )

            assert result == expected_summary
            mock_post.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_hit_avoids_api_call(self, summary_service):
        """Test that cache hit avoids duplicate Gemini API call."""
        title = "Understanding Neural Networks"
        abstract = "This paper explores..."
        paper_id = "1234.5678"
        expected_summary = "This is a cached summary."

        # Pre-cache a summary
        _, content_hash = summary_service._get_cache_key(title, abstract, paper_id)
        summary_service._cache_summary(paper_id, content_hash, expected_summary)

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            result = await summary_service.summarize(title, abstract, paper_id=paper_id)

            # API should not be called
            mock_post.assert_not_called()
            assert result == expected_summary

    @pytest.mark.asyncio
    async def test_successful_summary_is_cached(self, summary_service, db_conn):
        """Test that successful summary is cached after generation."""
        title = "Understanding Neural Networks"
        abstract = "This paper explores..."
        paper_id = "1234.5678"
        expected_summary = "Generated summary text."

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": expected_summary,
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            await summary_service.summarize(title, abstract, paper_id=paper_id)

            # Verify it's in cache
            cursor = db_conn.execute("SELECT COUNT(*) FROM summary_cache")
            count = cursor.fetchone()[0]
            assert count == 1

    @pytest.mark.asyncio
    async def test_summary_uses_low_temperature(self, summary_service):
        """Test that summarization uses low temperature for consistency."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "Summary",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            await summary_service.summarize(title, abstract)

            # Verify request includes low temperature
            call_args = mock_post.call_args
            json_data = call_args.kwargs.get("json_data")
            assert json_data is not None
            assert json_data["generationConfig"]["temperature"] == 0.3

    @pytest.mark.asyncio
    async def test_summary_respects_output_token_limit(self, summary_service):
        """Test that summarization respects maxOutputTokens."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "Summary",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            await summary_service.summarize(title, abstract)

            # Verify request includes output token limit
            call_args = mock_post.call_args
            json_data = call_args.kwargs.get("json_data")
            assert json_data is not None
            assert json_data["generationConfig"]["maxOutputTokens"] == 200


class TestErrorHandling:
    """Tests for error handling and wrapping."""

    @pytest.mark.asyncio
    async def test_http_client_error_propagates_as_external_service_error(
        self, summary_service
    ):
        """Test that HTTPClient errors are propagated as ExternalServiceError."""
        title = "Test"
        abstract = "Test abstract"

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.side_effect = ExternalServiceError(status=500, service="Gemini")

            with pytest.raises(ExternalServiceError):
                await summary_service.summarize(title, abstract)

    @pytest.mark.asyncio
    async def test_missing_candidates_raises_error(self, summary_service):
        """Test that missing candidates in response raises error."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": []  # Empty candidates
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            with pytest.raises(ExternalServiceError) as exc_info:
                await summary_service.summarize(title, abstract)

            assert "No candidates" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_missing_parts_raises_error(self, summary_service):
        """Test that missing parts in content raises error."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": []  # Empty parts
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            with pytest.raises(ExternalServiceError) as exc_info:
                await summary_service.summarize(title, abstract)

            assert "No parts" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_empty_text_raises_error(self, summary_service):
        """Test that empty text in response raises error."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "",  # Empty text
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            with pytest.raises(ExternalServiceError) as exc_info:
                await summary_service.summarize(title, abstract)

            assert "Empty text" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_malformed_response_raises_error(self, summary_service):
        """Test that malformed response raises error."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    # Missing "content" key; .get("content", {}) returns empty dict, then parts is empty
                    "some_other_key": "value"
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            with pytest.raises(ExternalServiceError) as exc_info:
                await summary_service.summarize(title, abstract)

            # When content is missing, we get "No parts in content" error
            assert "No parts" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_error_includes_service_context(self, summary_service):
        """Test that errors include 'Gemini' service context."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {"candidates": []}

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            with pytest.raises(ExternalServiceError) as exc_info:
                await summary_service.summarize(title, abstract)

            assert exc_info.value.service == "Gemini"


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_summary_without_paper_id(self, summary_service):
        """Test summarization without paper_id (uses content_hash only)."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "Summary text",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await summary_service.summarize(title, abstract)

            assert result == "Summary text"

    @pytest.mark.asyncio
    async def test_whitespace_trimmed_from_summary(self, summary_service):
        """Test that whitespace is trimmed from summary text."""
        title = "Test"
        abstract = "Test abstract"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "  Summary text with spaces  \n",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await summary_service.summarize(title, abstract)

            assert result == "Summary text with spaces"
            assert not result.startswith(" ")
            assert not result.endswith(" ")

    @pytest.mark.asyncio
    async def test_very_long_title_and_abstract(self, summary_service):
        """Test with very long title and abstract."""
        title = "A" * 500
        abstract = "B" * 5000

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "Summary",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await summary_service.summarize(title, abstract)

            assert result == "Summary"
            mock_post.assert_called_once()

    @pytest.mark.asyncio
    async def test_special_characters_in_title_and_abstract(self, summary_service):
        """Test with special characters in title and abstract."""
        title = 'Test\'s "Title" with <special> & characters'
        abstract = "Abstract with émojis 🚀 and symbols ©™"

        mock_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "Summary",
                            }
                        ]
                    }
                }
            ]
        }

        with patch.object(
            summary_service.http_client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await summary_service.summarize(title, abstract)

            assert result == "Summary"
