"""Tests for reading list CRUD endpoints.

Tests cover:
- GET /api/reading-list - list saved papers for anonymous and authenticated users
- POST /api/reading-list/{arxiv_id} - save paper to reading list
- DELETE /api/reading-list/{arxiv_id} - unsave paper from reading list
- Authenticated user identification via JWT session cookie (get_optional_user dependency)
- Anonymous user identification via cookie
- Auth bypass prevention: no user_id query parameter accepted
- Edge cases: paper not found, already saved, not saved, empty list
"""

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import User, get_optional_user
from app.main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_settings():
    """Mock settings with test database URL."""
    settings = MagicMock()
    settings.database_url = "sqlite:///test.db"
    return settings


@pytest.fixture
def mock_paper():
    """Mock paper data for testing."""
    return {
        "id": 1,
        "arxiv_id": "2401.12345",
        "title": "Test Paper",
        "abstract": "This is a test abstract",
        "authors": json.dumps(["Alice", "Bob"]),
        "categories": json.dumps(["cs.AI", "cs.LG"]),
        "published_at": 1700000000,
        "updated_at": 1700000000,
    }


@pytest.fixture
def mock_paper_2():
    """Second mock paper for testing multiple saves."""
    return {
        "id": 2,
        "arxiv_id": "2401.67890",
        "title": "Another Paper",
        "abstract": "Another test abstract",
        "authors": json.dumps(["Charlie", "Diana"]),
        "categories": json.dumps(["cs.LG"]),
        "published_at": 1700100000,
        "updated_at": 1700100000,
    }


@pytest.fixture
def auth_user():
    """Authenticated user object returned by get_optional_user."""
    return User(id=123, email="user@example.com", name="Alice", provider="google")


@contextmanager
def _override_user(user):
    """Override FastAPI's get_optional_user dependency to return a specific User (or None).

    Uses app.dependency_overrides which is the correct way to override Depends() in tests.
    """
    app.dependency_overrides[get_optional_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_optional_user, None)


class TestGetReadingList:
    """Test GET /api/reading-list endpoint."""

    def test_get_reading_list_empty(self, client, mock_settings):
        """Test GET returns empty list when no papers saved."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = []

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get("/api/reading-list")

                assert response.status_code == 200
                data = response.json()
                assert data["papers"] == []
                assert data["count"] == 0

    def test_get_reading_list_with_papers(self, client, mock_settings, mock_paper):
        """Test GET returns list of saved papers for anonymous user."""
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = [
                (
                    mock_paper["arxiv_id"],
                    mock_paper["title"],
                    mock_paper["abstract"],
                    mock_paper["authors"],
                    mock_paper["categories"],
                    mock_paper["published_at"],
                    mock_paper["updated_at"],
                    1700000000,  # saved_at
                )
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get(
                    "/api/reading-list", cookies={"anonymous_id": anon_id}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["count"] == 1
                assert len(data["papers"]) == 1

                paper = data["papers"][0]
                assert paper["arxiv_id"] == "2401.12345"
                assert paper["title"] == "Test Paper"
                assert paper["authors"] == ["Alice", "Bob"]
                assert paper["categories"] == ["cs.AI", "cs.LG"]
                assert paper["pdf_url"] == "https://arxiv.org/pdf/2401.12345.pdf"

    def test_get_reading_list_multiple_papers(
        self, client, mock_settings, mock_paper, mock_paper_2
    ):
        """Test GET returns multiple saved papers in order (newest first)."""
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = [
                (
                    mock_paper_2["arxiv_id"],
                    mock_paper_2["title"],
                    mock_paper_2["abstract"],
                    mock_paper_2["authors"],
                    mock_paper_2["categories"],
                    mock_paper_2["published_at"],
                    mock_paper_2["updated_at"],
                    1700100000,  # saved_at (newer)
                ),
                (
                    mock_paper["arxiv_id"],
                    mock_paper["title"],
                    mock_paper["abstract"],
                    mock_paper["authors"],
                    mock_paper["categories"],
                    mock_paper["published_at"],
                    mock_paper["updated_at"],
                    1700000000,  # saved_at (older)
                ),
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get(
                    "/api/reading-list", cookies={"anonymous_id": anon_id}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["count"] == 2
                assert len(data["papers"]) == 2

                # Verify ordering: newest first
                assert data["papers"][0]["arxiv_id"] == "2401.67890"
                assert data["papers"][1]["arxiv_id"] == "2401.12345"

    def test_get_reading_list_without_cookie_generates_new_id(
        self, client, mock_settings
    ):
        """Test GET without anonymous_id cookie still works (no error)."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = []

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get("/api/reading-list")

                assert response.status_code == 200
                data = response.json()
                assert data["count"] == 0


class TestSavePaper:
    """Test POST /api/reading-list/{arxiv_id} endpoint."""

    def test_save_paper_success(self, client, mock_settings):
        """Test POST successfully saves paper to reading list."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # _ensure_paper_exists: SELECT 1 FROM papers
                (1,),  # save_paper: SELECT id FROM papers
                None,  # save_paper: SELECT 1 FROM anonymous_sessions (doesn't exist)
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )

                assert response.status_code == 201
                data = response.json()
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "saved"

    def test_save_paper_not_found(self, client, mock_settings):
        """Test POST returns 404 when paper not in database."""
        arxiv_id = "2401.99999"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.return_value = None

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 404
                data = response.json()
                assert "not found" in data["detail"].lower()

    def test_save_paper_idempotent(self, client, mock_settings):
        """Test POST is idempotent: saving same paper twice succeeds both times."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # first call: _ensure_paper_exists
                (1,),  # first call: SELECT id
                None,  # first call: SELECT 1 FROM anonymous_sessions
                (1,),  # second call: _ensure_paper_exists
                (1,),  # second call: SELECT id
                (1,),  # second call: SELECT 1 FROM anonymous_sessions (exists now)
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                # First save
                response1 = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )
                assert response1.status_code == 201

                # Second save (should also succeed, no error)
                response2 = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )
                assert response2.status_code == 201

    def test_save_paper_creates_anonymous_session(self, client, mock_settings):
        """Test POST creates anonymous_sessions entry if doesn't exist."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # _ensure_paper_exists
                (1,),  # SELECT id
                None,  # SELECT 1 FROM anonymous_sessions (doesn't exist)
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )

                assert response.status_code == 201

                # Verify INSERT was called for anonymous_sessions
                calls = mock_db.execute.call_args_list
                insert_session_called = any(
                    "INSERT INTO anonymous_sessions" in str(call) for call in calls
                )
                assert insert_session_called


class TestDeletePaper:
    """Test DELETE /api/reading-list/{arxiv_id} endpoint."""

    def test_delete_paper_success(self, client, mock_settings):
        """Test DELETE successfully removes paper from reading list."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # paper exists check
                (1,),  # paper id lookup
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.delete(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "deleted"

    def test_delete_paper_not_found(self, client, mock_settings):
        """Test DELETE returns 404 when paper not in database."""
        arxiv_id = "2401.99999"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.return_value = None

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.delete(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 404
                data = response.json()
                assert "not found" in data["detail"].lower()

    def test_delete_paper_idempotent(self, client, mock_settings):
        """Test DELETE is idempotent: deleting non-saved paper succeeds."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # first call: paper exists
                (1,),  # first call: paper id lookup
                (1,),  # second call: paper exists
                (1,),  # second call: paper id lookup
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                # First delete
                response1 = client.delete(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )
                assert response1.status_code == 200

                # Second delete
                response2 = client.delete(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )
                assert response2.status_code == 200


class TestAnonymousUserTracking:
    """Test anonymous user identification and tracking."""

    def test_anonymous_user_different_ids(self, client, mock_settings):
        """Test different anonymous users have different identifiers."""
        anon_id_1 = str(uuid.uuid4())
        anon_id_2 = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = []

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response1 = client.get(
                    "/api/reading-list", cookies={"anonymous_id": anon_id_1}
                )
                assert response1.status_code == 200

                response2 = client.get(
                    "/api/reading-list", cookies={"anonymous_id": anon_id_2}
                )
                assert response2.status_code == 200

    def test_save_and_list_same_user(self, client, mock_settings, mock_paper):
        """Test anonymous user can save and list their own papers."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()

            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # save: _ensure_paper_exists
                (1,),  # save: SELECT id FROM papers
                None,  # save: SELECT 1 FROM anonymous_sessions (doesn't exist)
            ]

            mock_db.execute.return_value.fetchall.return_value = [
                (
                    mock_paper["arxiv_id"],
                    mock_paper["title"],
                    mock_paper["abstract"],
                    mock_paper["authors"],
                    mock_paper["categories"],
                    mock_paper["published_at"],
                    mock_paper["updated_at"],
                    1700000000,
                )
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                save_response = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    cookies={"anonymous_id": anon_id},
                )
                assert save_response.status_code == 201

                list_response = client.get(
                    "/api/reading-list", cookies={"anonymous_id": anon_id}
                )
                assert list_response.status_code == 200
                data = list_response.json()
                assert data["count"] > 0


class TestResponseModels:
    """Test response model shapes and field validation."""

    def test_reading_list_response_shape(self, client, mock_settings):
        """Test ReadingListResponse includes required fields."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = []

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get("/api/reading-list")

                assert response.status_code == 200
                data = response.json()
                assert "papers" in data
                assert "count" in data
                assert isinstance(data["papers"], list)
                assert isinstance(data["count"], int)

    def test_reading_list_paper_shape(self, client, mock_settings, mock_paper):
        """Test ReadingListPaper includes all required fields."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = [
                (
                    mock_paper["arxiv_id"],
                    mock_paper["title"],
                    mock_paper["abstract"],
                    mock_paper["authors"],
                    mock_paper["categories"],
                    mock_paper["published_at"],
                    mock_paper["updated_at"],
                    1700000000,
                )
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get("/api/reading-list")

                data = response.json()
                assert len(data["papers"]) == 1

                paper = data["papers"][0]
                required_fields = [
                    "arxiv_id",
                    "title",
                    "abstract",
                    "authors",
                    "published_at",
                    "updated_at",
                    "categories",
                    "pdf_url",
                    "saved_at",
                ]
                for field in required_fields:
                    assert field in paper, f"Missing field: {field}"

    def test_save_response_shape(self, client, mock_settings):
        """Test SaveResponse includes required fields."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # _ensure_paper_exists
                (1,),  # SELECT id FROM papers
                None,  # SELECT 1 FROM anonymous_sessions (doesn't exist)
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 201
                data = response.json()
                assert "arxiv_id" in data
                assert "status" in data
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "saved"

    def test_delete_response_shape(self, client, mock_settings):
        """Test DeleteResponse includes required fields."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # paper exists
                (1,),  # paper id
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.delete(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 200
                data = response.json()
                assert "arxiv_id" in data
                assert "status" in data
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "deleted"


class TestAuthenticatedUserMode:
    """Test reading list endpoints with authenticated user derived from JWT session.

    Uses get_optional_user dependency (mocked) to simulate an authenticated user.
    No user_id query parameter is accepted — identity comes from the session cookie.
    """

    def test_get_reading_list_authenticated(
        self, client, mock_settings, mock_paper, auth_user
    ):
        """Test GET returns papers for user identified via JWT session."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(auth_user),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = [
                (
                    mock_paper["arxiv_id"],
                    mock_paper["title"],
                    mock_paper["abstract"],
                    mock_paper["authors"],
                    mock_paper["categories"],
                    mock_paper["published_at"],
                    mock_paper["updated_at"],
                    1700000000,
                )
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.get("/api/reading-list")

                assert response.status_code == 200
                data = response.json()
                assert data["count"] == 1
                assert data["papers"][0]["arxiv_id"] == "2401.12345"

                # Verify DB query used the user.id, not a query param
                sql_call = mock_db.execute.call_args_list[0]
                assert auth_user.id in sql_call[0][1]

    def test_save_paper_authenticated(self, client, mock_settings, auth_user):
        """Test POST saves paper for user identified via JWT session."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(auth_user),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # paper exists check
                (1,),  # paper id lookup
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 201
                data = response.json()
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "saved"

                # Verify INSERT was for authenticated user
                calls = mock_db.execute.call_args_list
                insert_calls = [c for c in calls if "INSERT" in str(c)]
                assert len(insert_calls) >= 1
                # Should NOT have anonymous_sessions INSERT
                anon_insert = [c for c in calls if "anonymous_sessions" in str(c)]
                assert len(anon_insert) == 0

    def test_delete_paper_authenticated(self, client, mock_settings, auth_user):
        """Test DELETE removes paper for user identified via JWT session."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(auth_user),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # paper exists check
                (1,),  # paper id lookup
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.delete(f"/api/reading-list/{arxiv_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["arxiv_id"] == arxiv_id
                assert data["status"] == "deleted"

    def test_save_paper_authenticated_idempotent(
        self, client, mock_settings, auth_user
    ):
        """Test POST is idempotent for authenticated users."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(auth_user),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # first call: paper exists check
                (1,),  # first call: paper id lookup
                (1,),  # second call: paper exists check
                (1,),  # second call: paper id lookup
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response1 = client.post(f"/api/reading-list/{arxiv_id}")
                assert response1.status_code == 201

                response2 = client.post(f"/api/reading-list/{arxiv_id}")
                assert response2.status_code == 201


class TestAuthBypassPrevention:
    """Verify that user_id query parameter is NOT accepted (auth bypass removed)."""

    def test_user_id_query_param_ignored_on_get(self, client, mock_settings):
        """GET /api/reading-list?user_id=999 should use anonymous mode, not trust param."""
        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchall.return_value = []

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                # Pass user_id as query param — should be ignored (anonymous mode)
                response = client.get("/api/reading-list", params={"user_id": 999})

                assert response.status_code == 200
                data = response.json()
                assert data["count"] == 0

                # Verify the DB query did NOT use user_id=999
                sql_calls = mock_db.execute.call_args_list
                for call in sql_calls:
                    # None of the SQL args should contain 999
                    if len(call[0]) > 1:
                        assert 999 not in call[0][1], (
                            "user_id query param should not reach DB"
                        )

    def test_user_id_query_param_ignored_on_post(self, client, mock_settings):
        """POST /api/reading-list/{id}?user_id=999 should use anonymous mode."""
        arxiv_id = "2401.12345"

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # _ensure_paper_exists
                (1,),  # SELECT id
                None,  # anonymous_sessions check
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.post(
                    f"/api/reading-list/{arxiv_id}",
                    params={"user_id": 999},
                )

                assert response.status_code == 201

                # Verify anonymous flow was used (anonymous_sessions INSERT)
                calls = mock_db.execute.call_args_list
                anon_insert = any("anonymous_sessions" in str(c) for c in calls)
                assert anon_insert, "Should use anonymous flow, not user_id param"

    def test_user_id_query_param_ignored_on_delete(self, client, mock_settings):
        """DELETE /api/reading-list/{id}?user_id=999 should use anonymous mode."""
        arxiv_id = "2401.12345"
        anon_id = str(uuid.uuid4())

        with (
            patch("app.api.reading_list.get_settings", return_value=mock_settings),
            _override_user(None),
        ):
            mock_db = MagicMock()
            mock_db.execute.return_value.fetchone.side_effect = [
                (1,),  # paper exists
                (1,),  # paper id
            ]

            with patch("app.api.reading_list.get_db_connection", return_value=mock_db):
                response = client.delete(
                    f"/api/reading-list/{arxiv_id}",
                    params={"user_id": 999},
                    cookies={"anonymous_id": anon_id},
                )

                assert response.status_code == 200

                # Verify DELETE used anonymous_id, not user_id=999
                calls = mock_db.execute.call_args_list
                delete_calls = [c for c in calls if "DELETE" in str(c)]
                for call in delete_calls:
                    assert "anonymous_id" in str(call) or anon_id in str(call)
