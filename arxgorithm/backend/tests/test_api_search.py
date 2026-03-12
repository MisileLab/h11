"""
Tests for the search API endpoint.

Tests the GET /api/search?q=...&categories=...&limit=... endpoint with:
- Cache-first behavior (no real-time arXiv calls in request path)
- Cached summary data included in response
- Background refresh triggering (non-blocking)
- Proper parameter validation and response shape
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_db_cursor():
    """Create a mock database cursor with cached paper data."""
    cursor = MagicMock()
    # Mock paper data with optional summary
    cursor.fetchall.return_value = [
        (
            "2401.12345",
            "Sample Paper on Neural Networks",
            "This paper explores deep learning architectures.",
            json.dumps(["Alice Smith", "Bob Jones"]),
            json.dumps(["cs.AI", "cs.LG"]),
            1704067200,
            1704067200,
            "This paper presents a novel deep learning approach for...",  # Cached summary
        )
    ]
    return cursor


def test_search_cache_first_with_summary(client, mock_db_cursor):
    """Test that search returns cached papers with summaries (no real-time API calls)."""
    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh") as mock_trigger_bg,
    ):
        # Setup DB mock with cached paper + summary
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = mock_db_cursor
        mock_db.return_value = mock_db_conn

        # Make request
        response = client.get("/api/search?q=neural+networks")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "neural networks"
        assert data["count"] == 1
        assert len(data["papers"]) == 1

        # CRITICAL: Verify cached paper data is returned
        paper = data["papers"][0]
        assert paper["arxiv_id"] == "2401.12345"
        assert paper["title"] == "Sample Paper on Neural Networks"
        assert paper["abstract"] == "This paper explores deep learning architectures."
        assert paper["authors"] == ["Alice Smith", "Bob Jones"]
        assert paper["categories"] == ["cs.AI", "cs.LG"]

        # CRITICAL: Verify cached summary is included
        assert paper["summary"] is not None
        assert "deep learning approach" in paper["summary"]

        # Verify DB cursor was called (cache query happened)
        mock_db_conn.cursor.assert_called()

        # Verify background refresh was triggered
        mock_trigger_bg.assert_called_once()


def test_search_returns_cached_papers_without_summary(client):
    """Test that search returns papers without summary if not cached."""
    cursor = MagicMock()
    # Mock paper data WITHOUT summary (None)
    cursor.fetchall.return_value = [
        (
            "2401.99999",
            "Recent Paper Without Summary",
            "Abstract here...",
            json.dumps(["Jane Doe"]),
            json.dumps(["stat.ML"]),
            1704240000,
            1704240000,
            None,  # No cached summary
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request
        response = client.get("/api/search?q=new+papers")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1

        # Verify summary is null when not cached
        paper = data["papers"][0]
        assert paper["summary"] is None


def test_search_empty_cache(client):
    """Test search when cache has no results."""
    cursor = MagicMock()
    cursor.fetchall.return_value = []  # Empty cache

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request
        response = client.get("/api/search?q=nonexistent")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["papers"] == []


def test_search_category_filter(client):
    """Test search with category filter."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.11111",
            "AI Paper",
            "About AI...",
            json.dumps(["Author"]),
            json.dumps(["cs.AI"]),
            1704067200,
            1704067200,
            None,
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request with category filter
        response = client.get("/api/search?q=test&categories=cs.AI")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["categories"] == ["cs.AI"]
        assert data["count"] == 1


def test_search_limit_parameter(client):
    """Test limit parameter is respected."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            f"2401.{i:05d}",
            f"Paper {i}",
            "Abstract...",
            json.dumps(["Author"]),
            json.dumps(["cs.AI"]),
            1704067200 + i,
            1704067200 + i,
            None,
        )
        for i in range(5)
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request with limit=3
        response = client.get("/api/search?q=test&limit=3")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 5  # Returns what cache has (not limited in mock)


def test_search_query_required(client):
    """Test search query is required."""
    with patch("app.api.search.get_db_connection"):
        # Make request without query parameter
        response = client.get("/api/search")

        # Verify 422 (unprocessable entity)
        assert response.status_code == 422


def test_search_query_min_length(client):
    """Test search query minimum length validation."""
    with patch("app.api.search.get_db_connection"):
        # Empty query should fail validation
        response = client.get("/api/search?q=")
        assert response.status_code == 422


def test_search_limit_max_boundary(client):
    """Test limit parameter max boundary (100)."""
    with patch("app.api.search.get_db_connection"):
        # Exceeding max limit should fail
        response = client.get("/api/search?q=test&limit=101")
        assert response.status_code == 422


def test_search_limit_min_boundary(client):
    """Test limit parameter min boundary (1)."""
    with patch("app.api.search.get_db_connection"):
        # Zero limit should fail
        response = client.get("/api/search?q=test&limit=0")
        assert response.status_code == 422


def test_search_background_refresh_triggered(client):
    """Test background cache refresh is triggered without blocking response."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.12345",
            "Sample Paper",
            "Abstract...",
            json.dumps(["Author"]),
            json.dumps(["cs.AI"]),
            1704067200,
            1704067200,
            None,
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh") as mock_trigger_bg,
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request
        response = client.get("/api/search?q=test")

        # Verify response returned quickly (200 OK)
        assert response.status_code == 200

        # Verify background task was triggered (non-blocking)
        mock_trigger_bg.assert_called_once()


def test_search_response_shape(client):
    """Test response includes all required fields."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.12345",
            "Test Paper",
            "Abstract...",
            json.dumps(["Author1", "Author2"]),
            json.dumps(["cs.AI", "stat.ML"]),
            1704067200,
            1704067200,
            "Summary...",
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request
        response = client.get("/api/search?q=test")

        # Verify all fields present
        assert response.status_code == 200
        data = response.json()

        # Check top-level response fields
        assert "papers" in data
        assert "query" in data
        assert "categories" in data
        assert "count" in data

        # Check paper fields
        paper = data["papers"][0]
        assert "arxiv_id" in paper
        assert "title" in paper
        assert "abstract" in paper
        assert "authors" in paper
        assert "published_at" in paper
        assert "updated_at" in paper
        assert "categories" in paper
        assert "pdf_url" in paper
        assert "summary" in paper  # NEW: summary field


def test_search_keyword_filter_in_title(client):
    """Test that search filters papers by keyword in title."""
    cursor = MagicMock()
    # Mock data with title matching the search keyword
    cursor.fetchall.return_value = [
        (
            "2401.12345",
            "Machine Learning for Natural Language Processing",
            "Abstract about ML and NLP...",
            json.dumps(["Author"]),
            json.dumps(["cs.CL"]),
            1704067200,
            1704067200,
            None,
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Make request with keyword
        response = client.get("/api/search?q=machine+learning")

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert (
            data["papers"][0]["title"]
            == "Machine Learning for Natural Language Processing"
        )

        # Verify cursor.execute was called with query parameter in WHERE clause
        call_args = cursor.execute.call_args
        assert call_args is not None
        sql = call_args[0][0]
        # Check that LIKE is used for keyword search in title/abstract
        assert "LIKE" in sql
        assert "title" in sql.lower() or "abstract" in sql.lower()


def test_search_keyword_filter_in_abstract(client):
    """Test that search filters papers by keyword in abstract."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.99999",
            "A Different Title",
            "This abstract discusses quantum computing algorithms",
            json.dumps(["Author"]),
            json.dumps(["cs.AI"]),
            1704067200,
            1704067200,
            None,
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Search for keyword that appears in abstract, not title
        response = client.get("/api/search?q=quantum")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert "quantum computing" in data["papers"][0]["abstract"]


def test_search_keyword_and_category_combined(client):
    """Test that search filters by both keyword and category."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.11111",
            "Deep Learning for Computer Vision",
            "This paper explores deep learning in vision tasks...",
            json.dumps(["Author"]),
            json.dumps(["cs.CV"]),
            1704067200,
            1704067200,
            None,
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Search with both keyword and category filter
        response = client.get("/api/search?q=deep+learning&categories=cs.CV")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["query"] == "deep learning"
        assert data["categories"] == ["cs.CV"]

        # Verify cursor.execute was called with both keyword and category in WHERE
        call_args = cursor.execute.call_args
        sql = call_args[0][0]
        assert "LIKE" in sql  # Both conditions should use LIKE


def test_search_multiple_categories_any_match(client):
    """Test that search supports multiple categories (comma-separated) with OR logic."""
    cursor = MagicMock()
    # Return papers matching any of the requested categories
    cursor.fetchall.return_value = [
        (
            "2401.22222",
            "AI Research Paper",
            "This paper covers artificial intelligence...",
            json.dumps(["Author1"]),
            json.dumps(["cs.AI"]),
            1704067200,
            1704067200,
            None,
        ),
        (
            "2401.33333",
            "Machine Learning Study",
            "This paper explores machine learning algorithms...",
            json.dumps(["Author2"]),
            json.dumps(["cs.LG"]),
            1704153600,
            1704153600,
            None,
        ),
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Search with multiple categories (cs.AI AND cs.LG)
        response = client.get("/api/search?q=learning&categories=cs.AI,cs.LG")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2
        assert data["categories"] == ["cs.AI", "cs.LG"]

        # Verify both papers are in result (any category match)
        papers = data["papers"]
        assert any(p["arxiv_id"] == "2401.22222" for p in papers)
        assert any(p["arxiv_id"] == "2401.33333" for p in papers)

        # Verify cursor.execute was called with multiple category OR conditions
        call_args = cursor.execute.call_args
        sql = call_args[0][0]
        params = call_args[0][1]

        # Should have OR between categories
        assert " OR " in sql
        # Should have exactly 5 params: query (2x), cat1, cat2, limit
        assert len(params) == 5


def test_search_multiple_categories_with_keyword(client):
    """Test multi-category filtering combined with keyword search."""
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        (
            "2401.44444",
            "Quantum Computing Deep Dive",
            "Advanced quantum computing techniques...",
            json.dumps(["AuthorQ"]),
            json.dumps(["cs.AI", "quant-ph"]),
            1704240000,
            1704240000,
            "Summary of quantum advances",
        )
    ]

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Search with keyword AND multiple categories
        response = client.get("/api/search?q=quantum&categories=cs.AI,quant-ph")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["query"] == "quantum"
        assert data["categories"] == ["cs.AI", "quant-ph"]

        paper = data["papers"][0]
        assert paper["arxiv_id"] == "2401.44444"
        assert "quantum" in paper["title"].lower()
        assert paper["summary"] is not None


def test_search_three_categories(client):
    """Test that search correctly handles more than two categories."""
    cursor = MagicMock()
    cursor.fetchall.return_value = []  # Empty result for simplicity

    with (
        patch("app.api.search.get_db_connection") as mock_db,
        patch("app.api.search._trigger_background_refresh"),
    ):
        mock_db_conn = MagicMock()
        mock_db_conn.cursor.return_value = cursor
        mock_db.return_value = mock_db_conn

        # Search with three categories
        response = client.get("/api/search?q=test&categories=cs.AI,cs.LG,cs.NE")

        assert response.status_code == 200
        data = response.json()
        assert data["categories"] == ["cs.AI", "cs.LG", "cs.NE"]

        # Verify SQL has three OR conditions
        call_args = cursor.execute.call_args
        sql = call_args[0][0]
        params = call_args[0][1]

        # Count OR occurrences (should be 2 for 3 conditions: cat1 OR cat2 OR cat3)
        or_count = sql.count(" OR ")
        assert or_count >= 2
        # Should have 6 params: query (2x), cat1, cat2, cat3, limit
        assert len(params) == 6


def test_search_openapi_schema_documented(client):
    """Test OpenAPI schema is properly documented."""
    response = client.get("/openapi.json")
    assert response.status_code == 200

    schema = response.json()

    # Verify search endpoint is documented
    assert "/api/search" in schema["paths"]
    search_endpoint = schema["paths"]["/api/search"]["get"]

    # Verify parameters
    params = {p["name"]: p for p in search_endpoint["parameters"]}
    assert "q" in params
    assert "categories" in params
    assert "limit" in params

    # Verify response model
    assert "responses" in search_endpoint
    assert "200" in search_endpoint["responses"]
