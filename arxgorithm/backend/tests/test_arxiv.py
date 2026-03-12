"""Tests for arXiv API client with caching and rate limiting."""

import asyncio
import json
import sqlite3
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.arxiv import ArxivClient, Paper


@pytest.fixture
def in_memory_db():
    """Create an in-memory SQLite database for testing."""
    conn = sqlite3.connect(":memory:")
    yield conn
    conn.close()


@pytest.fixture
def arxiv_client(in_memory_db):
    """Create an ArxivClient instance with in-memory database."""
    return ArxivClient(
        db_connection=in_memory_db,
        delay_seconds=0.0,  # No delay for testing
        cache_ttl_seconds=3600,
    )


def create_mock_arxiv_entry(
    entry_id="http://arxiv.org/abs/2401.12345v1",
    title="Test Paper Title",
    summary="This is a test abstract.",
    authors_names=None,
    published_ts=1609459200,
    updated_ts=1609545600,
    categories=None,
    pdf_url="http://arxiv.org/pdf/2401.12345v1.pdf",
):
    """Helper to create properly configured mock arxiv.Result entries."""
    if authors_names is None:
        authors_names = ["Alice", "Bob"]
    if categories is None:
        categories = ["cs.AI", "cs.LG"]

    mock_entry = MagicMock()
    mock_entry.entry_id = entry_id
    mock_entry.title = title
    mock_entry.summary = summary

    # Mock authors as list of objects with .name attribute (not MagicMock)
    # Use simple objects with a .name attribute so they serialize properly
    Author = type("Author", (), {})
    mock_entry.authors = [Author() for name in authors_names]
    for mock_author, name in zip(mock_entry.authors, authors_names):
        mock_author.name = name

    mock_entry.published = MagicMock()
    mock_entry.published.timestamp.return_value = published_ts
    mock_entry.updated = MagicMock()
    mock_entry.updated.timestamp.return_value = updated_ts
    mock_entry.categories = categories
    mock_entry.pdf_url = pdf_url

    return mock_entry


class TestPaperDataclass:
    """Tests for Paper dataclass."""

    def test_from_arxiv_entry_conversion(self):
        """Test converting arxiv.Result to Paper dataclass."""
        mock_entry = create_mock_arxiv_entry()
        paper = Paper.from_arxiv_entry(mock_entry)

        assert paper.arxiv_id == "2401.12345v1"
        assert paper.title == "Test Paper Title"
        assert paper.abstract == "This is a test abstract."
        assert paper.authors == ["Alice", "Bob"]
        assert paper.published_at == 1609459200
        assert paper.updated_at == 1609545600
        assert paper.categories == ["cs.AI", "cs.LG"]
        assert paper.pdf_url == "http://arxiv.org/pdf/2401.12345v1.pdf"

    def test_to_dict_serialization(self):
        """Test Paper can be serialized to dictionary."""
        mock_entry = create_mock_arxiv_entry()
        paper = Paper.from_arxiv_entry(mock_entry)
        paper_dict = paper.to_dict()

        assert isinstance(paper_dict, dict)
        assert paper_dict["arxiv_id"] == "2401.12345v1"
        assert paper_dict["title"] == "Test Paper Title"
        assert json.dumps(paper_dict)  # Should be JSON-serializable

    def test_from_dict_deserialization(self):
        """Test Paper can be reconstructed from dictionary."""
        mock_entry = create_mock_arxiv_entry()
        paper1 = Paper.from_arxiv_entry(mock_entry)
        paper_dict = paper1.to_dict()
        paper2 = Paper.from_dict(paper_dict)

        assert paper2.arxiv_id == paper1.arxiv_id
        assert paper2.title == paper1.title
        assert paper2.abstract == paper1.abstract
        assert paper2.authors == paper1.authors


class TestArxivClientInit:
    """Tests for ArxivClient initialization."""

    def test_init_creates_cache_table(self, in_memory_db):
        """Test that initialization creates arxiv_cache table."""
        client = ArxivClient(db_connection=in_memory_db)

        cursor = in_memory_db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='arxiv_cache'"
        )
        assert cursor.fetchone() is not None

    def test_init_with_negative_delay_raises_error(self, in_memory_db):
        """Test that negative delay_seconds raises ValueError."""
        with pytest.raises(ValueError, match="delay_seconds must be non-negative"):
            ArxivClient(db_connection=in_memory_db, delay_seconds=-1)

    def test_init_with_negative_ttl_raises_error(self, in_memory_db):
        """Test that negative cache_ttl_seconds raises ValueError."""
        with pytest.raises(ValueError, match="cache_ttl_seconds must be non-negative"):
            ArxivClient(db_connection=in_memory_db, cache_ttl_seconds=-1)


class TestCaching:
    """Tests for caching behavior."""

    @pytest.mark.asyncio
    async def test_cache_hit_avoids_api_call(self, arxiv_client):
        """Test that second search uses cache and doesn't call API."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            # First call should hit API
            results1 = await arxiv_client.search("neural networks", max_results=1)
            assert len(results1) == 1
            assert mock_search_class.call_count == 1

            # Second call with same query should use cache
            results2 = await arxiv_client.search("neural networks", max_results=1)
            assert len(results2) == 1
            assert mock_search_class.call_count == 1  # Should not increment

            # Results should be identical
            assert results1[0].arxiv_id == results2[0].arxiv_id
            assert results1[0].title == results2[0].title

    @pytest.mark.asyncio
    async def test_cache_expiry(self, in_memory_db):
        """Test that expired cache entries are not used."""
        client = ArxivClient(
            db_connection=in_memory_db,
            delay_seconds=0.0,
            cache_ttl_seconds=1,
        )

        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            # First call
            results1 = await client.search("test", max_results=1)
            assert mock_search_class.call_count == 1

            # Wait for cache to expire
            await asyncio.sleep(1.1)

            # Second call should hit API again
            results2 = await client.search("test", max_results=1)
            assert mock_search_class.call_count == 2

    @pytest.mark.asyncio
    async def test_cache_with_categories(self, arxiv_client):
        """Test that category filtering is properly cached."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            # First search with categories
            await arxiv_client.search("AI", categories=["cs.AI"], max_results=10)
            assert mock_search_class.call_count == 1

            # Same query with same categories should use cache
            await arxiv_client.search("AI", categories=["cs.AI"], max_results=10)
            assert mock_search_class.call_count == 1  # No new call

            # Different categories should trigger new search
            await arxiv_client.search("AI", categories=["cs.LG"], max_results=10)
            assert mock_search_class.call_count == 2  # New call


class TestSearch:
    """Tests for search functionality."""

    @pytest.mark.asyncio
    async def test_search_returns_papers(self, arxiv_client):
        """Test that search returns list of Paper objects."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            results = await arxiv_client.search("neural networks", max_results=1)

            assert isinstance(results, list)
            assert len(results) == 1
            assert isinstance(results[0], Paper)
            assert results[0].title == "Test Paper Title"

    @pytest.mark.asyncio
    async def test_search_with_multiple_results(self, arxiv_client):
        """Test search with multiple results."""
        mock_entries = [
            create_mock_arxiv_entry(
                entry_id=f"http://arxiv.org/abs/2401.1234{i}v1",
                title=f"Test Paper {i}",
                summary=f"Abstract {i}",
                authors_names=[f"Author{i}"],
                pdf_url=f"http://arxiv.org/pdf/2401.1234{i}v1.pdf",
            )
            for i in range(3)
        ]

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = mock_entries
            mock_search_class.return_value = mock_search_instance

            results = await arxiv_client.search("test", max_results=3)

            assert len(results) == 3
            assert all(isinstance(r, Paper) for r in results)

    @pytest.mark.asyncio
    async def test_search_with_category_filter(self, arxiv_client):
        """Test that search properly builds query with category filter."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            await arxiv_client.search(
                "AI", categories=["cs.AI", "cs.LG"], max_results=10
            )

            # Verify Search was called with combined query
            mock_search_class.assert_called()
            call_args = mock_search_class.call_args
            query = call_args[1]["query"]
            assert "AI" in query
            assert "cat:cs.AI" in query
            assert "cat:cs.LG" in query


class TestGetPaper:
    """Tests for get_paper functionality."""

    @pytest.mark.asyncio
    async def test_get_paper_by_id(self, arxiv_client):
        """Test retrieving paper by arXiv ID."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = iter([mock_entry])
            mock_search_class.return_value = mock_search_instance

            paper = await arxiv_client.get_paper("2401.12345")

            assert isinstance(paper, Paper)
            assert paper.arxiv_id == "2401.12345v1"
            assert paper.title == "Test Paper Title"

    @pytest.mark.asyncio
    async def test_get_paper_normalizes_id_with_version(self, arxiv_client):
        """Test that paper IDs with version suffix are normalized."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = iter([mock_entry])
            mock_search_class.return_value = mock_search_instance

            # Request with version suffix
            await arxiv_client.get_paper("2401.12345v2")

            # Should search for normalized ID without version
            call_args = mock_search_class.call_args
            query = call_args[1]["query"]
            assert "id:2401.12345" in query

    @pytest.mark.asyncio
    async def test_get_paper_cache_hit(self, arxiv_client):
        """Test that get_paper uses cache on second call."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = iter([mock_entry])
            mock_search_class.return_value = mock_search_instance

            # First call
            paper1 = await arxiv_client.get_paper("2401.12345")
            assert mock_search_class.call_count == 1

            # Second call should use cache
            paper2 = await arxiv_client.get_paper("2401.12345")
            assert mock_search_class.call_count == 1  # No new call

            assert paper1.arxiv_id == paper2.arxiv_id

    @pytest.mark.asyncio
    async def test_get_paper_not_found(self, arxiv_client):
        """Test that get_paper raises error when paper not found."""
        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = iter([])  # Empty results
            mock_search_class.return_value = mock_search_instance

            import arxiv

            with pytest.raises(arxiv.HTTPError):
                await arxiv_client.get_paper("invalid.id")


class TestRateLimiting:
    """Tests for rate limiting behavior."""

    @pytest.mark.asyncio
    async def test_rate_limit_delay_applied(self, in_memory_db):
        """Test that rate limiting delay is applied between calls."""
        client = ArxivClient(
            db_connection=in_memory_db,
            delay_seconds=0.1,  # 100ms delay
        )

        mock_entries = [
            create_mock_arxiv_entry(
                entry_id=f"http://arxiv.org/abs/2401.0000{i}v1",
                title=f"Paper {i}",
            )
            for i in range(2)
        ]

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.side_effect = mock_entries
            mock_search_class.return_value = mock_search_instance

            start = time.time()
            await client.search("test1", max_results=1)
            await client.search("test2", max_results=1)
            elapsed = time.time() - start

            # Should take at least 100ms due to rate limit
            assert elapsed >= 0.09  # Allow small margin

    @pytest.mark.asyncio
    async def test_no_delay_on_cache_hit(self, arxiv_client):
        """Test that cache hits don't trigger rate limit delays."""
        mock_entry = create_mock_arxiv_entry()

        with patch("app.services.arxiv.arxiv.Search") as mock_search_class:
            mock_search_instance = MagicMock()
            mock_search_instance.results.return_value = [mock_entry]
            mock_search_class.return_value = mock_search_instance

            # First call
            await arxiv_client.search("test", max_results=1)

            # Cache the result
            start = time.time()
            for _ in range(5):
                await arxiv_client.search("test", max_results=1)
            elapsed = time.time() - start

            # Multiple cache hits should be very fast (no delays)
            assert elapsed < 0.1
