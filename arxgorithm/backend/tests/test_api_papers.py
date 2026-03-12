"""Tests for papers API endpoints.

Tests the:
- GET /api/papers/{arxiv_id} - Paper detail with cached summary
- POST /api/papers/{arxiv_id}/summarize - Async summary generation trigger

Pattern: Cache-first retrieval, async-only summary generation (non-blocking).
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_paper_row():
    """Mock paper row from database (8 columns: no pdf_url, computed from arxiv_id)."""
    return (
        "2401.12345",
        "Transformer Models in NLP",
        "This paper introduces a novel transformer architecture for natural language processing.",
        json.dumps(["Alice Smith", "Bob Jones"]),
        json.dumps(["cs.CL", "cs.AI"]),
        1704067200,
        1704067200,
        "The paper introduces a novel transformer architecture optimized for...",  # Cached summary
    )


@pytest.fixture
def mock_paper_row_no_summary():
    """Mock paper row without summary (8 columns: no pdf_url, computed from arxiv_id)."""
    return (
        "2401.54321",
        "Deep Learning Basics",
        "An introduction to deep learning concepts.",
        json.dumps(["Charlie Brown"]),
        json.dumps(["cs.LG"]),
        1704067200,
        1704067200,
        None,  # No cached summary
    )


def test_paper_detail_returns_with_summary(client, mock_paper_row):
    """Test GET /api/papers/{arxiv_id} returns paper with cached summary."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = mock_paper_row
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.get("/api/papers/2401.12345")

        # Verify
        assert response.status_code == 200
        data = response.json()

        # Verify response structure
        assert "paper" in data
        paper = data["paper"]

        # Verify paper fields
        assert paper["arxiv_id"] == "2401.12345"
        assert paper["title"] == "Transformer Models in NLP"
        assert (
            paper["abstract"]
            == "This paper introduces a novel transformer architecture for natural language processing."
        )
        assert paper["authors"] == ["Alice Smith", "Bob Jones"]
        assert paper["categories"] == ["cs.CL", "cs.AI"]
        assert paper["published_at"] == 1704067200
        assert paper["updated_at"] == 1704067200
        assert paper["pdf_url"] == "https://arxiv.org/pdf/2401.12345.pdf"

        # CRITICAL: Verify cached summary is included
        assert paper["summary"] is not None
        assert "transformer architecture" in paper["summary"]


def test_paper_detail_returns_without_summary(client, mock_paper_row_no_summary):
    """Test GET /api/papers/{arxiv_id} returns paper with null summary when not cached."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = mock_paper_row_no_summary
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.get("/api/papers/2401.54321")

        # Verify
        assert response.status_code == 200
        data = response.json()
        paper = data["paper"]

        # CRITICAL: Summary field is null when not cached
        assert paper["arxiv_id"] == "2401.54321"
        assert paper["summary"] is None


def test_paper_detail_not_found(client):
    """Test GET /api/papers/{arxiv_id} returns 404 when paper not found."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # Paper not found
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.get("/api/papers/9999.99999")

        # Verify
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()


def test_summarize_returns_202_queued(client):
    """Test POST /api/papers/{arxiv_id}/summarize returns 202 Accepted."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
        patch("app.api.papers.asyncio.create_task") as mock_create_task,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)  # Paper exists
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Mock create_task to return a completed coroutine wrapper
        mock_task = MagicMock()
        mock_create_task.return_value = mock_task

        # Request
        response = client.post("/api/papers/2401.12345/summarize")

        # Verify
        assert response.status_code == 202
        data = response.json()
        assert data["arxiv_id"] == "2401.12345"
        assert data["status"] == "queued"

        # CRITICAL: Verify background task was created (fire-and-forget)
        mock_create_task.assert_called_once()


def test_summarize_triggers_background_task(client):
    """Test POST /api/papers/{arxiv_id}/summarize triggers async task."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
        patch("app.api.papers.asyncio.create_task") as mock_create_task,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Mock create_task to prevent coroutine warning
        mock_task = MagicMock()
        mock_create_task.return_value = mock_task

        # Request
        response = client.post("/api/papers/2401.12345/summarize")

        # Verify background task called
        assert response.status_code == 202
        mock_create_task.assert_called_once()


def test_summarize_paper_not_found(client):
    """Test POST /api/papers/{arxiv_id}/summarize returns 404 if paper not found."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        # Setup mocks
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # Paper not found
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.post("/api/papers/9999.99999/summarize")

        # Verify
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()


def test_paper_detail_response_shape(client, mock_paper_row):
    """Test GET /api/papers/{arxiv_id} response includes all required fields."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = mock_paper_row
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.get("/api/papers/2401.12345")

        # Verify all required fields present
        assert response.status_code == 200
        data = response.json()
        paper = data["paper"]

        required_fields = [
            "arxiv_id",
            "title",
            "abstract",
            "authors",
            "published_at",
            "updated_at",
            "categories",
            "pdf_url",
            "summary",
        ]
        for field in required_fields:
            assert field in paper, f"Missing field: {field}"


def test_summarize_response_shape(client):
    """Test POST /api/papers/{arxiv_id}/summarize response includes all required fields."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
        patch("app.api.papers.asyncio.create_task"),
    ):
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.post("/api/papers/2401.12345/summarize")

        # Verify all required fields
        assert response.status_code == 202
        data = response.json()

        required_fields = ["arxiv_id", "status"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"


def test_paper_detail_handles_json_parsing(client):
    """Test GET /api/papers/{arxiv_id} correctly parses JSON fields."""
    with (
        patch("app.api.papers.get_settings") as mock_settings,
        patch("app.api.papers.get_db_connection") as mock_db,
    ):
        mock_settings_obj = MagicMock()
        mock_settings_obj.database_url = "sqlite:///./test.db"
        mock_settings.return_value = mock_settings_obj

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (
            "2401.11111",
            "Test Paper",
            "Test abstract",
            json.dumps(["Author A", "Author B", "Author C"]),
            json.dumps(["cs.AI", "cs.LG", "stat.ML"]),
            1704067200,
            1704067200,
            "Test summary",
        )
        mock_db_conn.execute.return_value = mock_cursor
        mock_db.return_value = mock_db_conn

        # Request
        response = client.get("/api/papers/2401.11111")

        # Verify
        assert response.status_code == 200
        paper = response.json()["paper"]

        # Verify JSON parsing
        assert paper["authors"] == ["Author A", "Author B", "Author C"]
        assert paper["categories"] == ["cs.AI", "cs.LG", "stat.ML"]
        assert isinstance(paper["authors"], list)
        assert isinstance(paper["categories"], list)
        # Verify pdf_url is derived from arxiv_id
        assert paper["pdf_url"] == "https://arxiv.org/pdf/2401.11111.pdf"
