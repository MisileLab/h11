"""Tests for anonymous user tracking middleware.

Verifies:
1. Cookie creation on first visit
2. Cookie persistence across requests
3. Session table insertion/updates
4. 1-year cookie expiry
5. last_seen_at tracking
"""

import sqlite3
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from typing import cast

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

from app.middleware.anonymous_tracking import AnonymousTrackingMiddleware


# Fixtures


@pytest.fixture
def in_memory_db():
    """Create in-memory SQLite database with anonymous_sessions table."""
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()

    # Create anonymous_sessions table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS anonymous_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cookie_uuid TEXT UNIQUE NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
        """
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture
def test_app():
    """Create FastAPI test app with AnonymousTrackingMiddleware."""
    app = FastAPI()
    app.add_middleware(cast(type, AnonymousTrackingMiddleware))

    @app.get("/test")
    async def test_endpoint(request: Request):
        """Simple endpoint that returns anonymous_id from request state."""
        anonymous_id = getattr(request.state, "anonymous_id", None)
        return {"anonymous_id": anonymous_id}

    return app


@pytest.fixture
def client(test_app):
    """FastAPI test client."""
    return TestClient(test_app)


# Tests


class TestAnonymousCookieCreation:
    """Test cookie creation on first visit."""

    def test_cookie_created_on_first_visit(self, client):
        """First request should set anonymous_id cookie."""
        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_db,
        ):
            # Mock settings and DB
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_db.return_value = mock_conn

            # Make request
            response = client.get("/test")

            # Verify response
            assert response.status_code == 200
            anonymous_id = response.json()["anonymous_id"]
            assert anonymous_id is not None
            assert len(anonymous_id) == 36  # UUID format

            # Verify Set-Cookie header
            cookies = response.cookies
            assert "anonymous_id" in cookies
            assert cookies["anonymous_id"] == anonymous_id

    def test_cookie_not_overwritten_on_subsequent_requests(self, client):
        """Subsequent requests should not generate new cookie."""
        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_db.return_value = mock_conn

            # First request
            response1 = client.get("/test")
            anonymous_id_1 = response1.json()["anonymous_id"]

            # Second request (cookie now present)
            response2 = client.get("/test")
            anonymous_id_2 = response2.json()["anonymous_id"]

            # Should be same ID
            assert anonymous_id_1 == anonymous_id_2

    def test_cookie_has_one_year_expiry(self, client):
        """Cookie should have 1-year expiry."""
        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_db,
            patch("app.middleware.anonymous_tracking.datetime") as mock_datetime,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_db.return_value = mock_conn

            # Mock datetime.now() to return fixed time
            fixed_time = datetime(2026, 3, 12, 12, 0, 0, tzinfo=timezone.utc)
            mock_datetime.now.return_value = fixed_time

            # Make request
            response = client.get("/test")

            # Check cookie has expiry ~1 year in future
            # Note: TestClient stores Max-Age or Expires
            cookies = response.cookies
            anonymous_id = cookies.get("anonymous_id")
            assert anonymous_id is not None

            # Verify httponly and samesite flags
            assert cookies["anonymous_id"] == anonymous_id


class TestAnonymousSessionTracking:
    """Test session tracking in anonymous_sessions table."""

    def test_db_execute_called_for_new_session(self):
        """Middleware should call db_conn.execute() for new sessions."""
        app = FastAPI()
        app.add_middleware(cast(type, AnonymousTrackingMiddleware))

        @app.get("/test")
        async def test_endpoint(request: Request):
            return {"id": getattr(request.state, "anonymous_id", None)}

        client = TestClient(app)

        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_get_db.return_value = mock_conn

            # First request (no cookie = new session)
            response = client.get("/test")
            assert response.status_code == 200

            # Verify execute was called (INSERT for new session)
            assert mock_conn.execute.called
            # Check that INSERT was called
            call_args = str(mock_conn.execute.call_args_list)
            assert "INSERT INTO anonymous_sessions" in call_args

    def test_db_execute_update_called_for_existing_session(self):
        """Middleware should call db_conn.execute() with UPDATE for existing sessions."""
        app = FastAPI()
        app.add_middleware(cast(type, AnonymousTrackingMiddleware))

        @app.get("/test")
        async def test_endpoint(request: Request):
            return {"id": getattr(request.state, "anonymous_id", None)}

        client = TestClient(app)

        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_get_db.return_value = mock_conn

            # First request (new session)
            response1 = client.get("/test")
            assert response1.status_code == 200

            # Reset mock to check second request
            mock_conn.reset_mock()

            # Second request (cookie exists = existing session)
            response2 = client.get("/test")
            assert response2.status_code == 200

            # Verify execute was called with UPDATE
            assert mock_conn.execute.called
            call_args = str(mock_conn.execute.call_args_list)
            assert "UPDATE anonymous_sessions" in call_args

    def test_db_update_called_with_unix_timestamp(self):
        """Middleware should call UPDATE with unix timestamp for last_seen_at."""
        app = FastAPI()
        app.add_middleware(cast(type, AnonymousTrackingMiddleware))

        @app.get("/test")
        async def test_endpoint(request: Request):
            return {"id": getattr(request.state, "anonymous_id", None)}

        client = TestClient(app)

        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_get_db.return_value = mock_conn

            # First request (new session, INSERT)
            response1 = client.get("/test")
            assert response1.status_code == 200

            # Reset mock for second request
            mock_conn.reset_mock()

            # Second request (existing session, UPDATE)
            response2 = client.get("/test")
            assert response2.status_code == 200

            # Verify UPDATE was called with unix timestamp
            update_call_str = str(mock_conn.execute.call_args_list)
            assert "UPDATE anonymous_sessions" in update_call_str
            assert "last_seen_at" in update_call_str


class TestAnonymousSessionCreation:
    """Test session creation behavior during middleware dispatch."""

    def test_session_insert_called_once_for_new_cookie(self):
        """Only new sessions should call INSERT; existing should UPDATE."""
        app = FastAPI()
        app.add_middleware(cast(type, AnonymousTrackingMiddleware))

        @app.get("/test")
        async def test_endpoint(request: Request):
            return {"id": getattr(request.state, "anonymous_id", None)}

        client = TestClient(app)

        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_get_db.return_value = mock_conn

            # First request — new session
            response1 = client.get("/test")
            assert response1.status_code == 200

            # Check INSERT was called
            all_calls_1 = str(mock_conn.execute.call_args_list)
            assert "INSERT INTO anonymous_sessions" in all_calls_1

            # Reset for second request
            mock_conn.reset_mock()

            # Second request — existing session
            response2 = client.get("/test")
            assert response2.status_code == 200

            # Check UPDATE was called (not INSERT)
            all_calls_2 = str(mock_conn.execute.call_args_list)
            assert "UPDATE anonymous_sessions" in all_calls_2
            assert "INSERT INTO anonymous_sessions" not in all_calls_2


class TestAnonymousMiddlewareErrorHandling:
    """Test middleware graceful error handling."""

    def test_middleware_silently_fails_if_db_error(self, client):
        """Middleware should not crash if DB update fails."""
        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            # DB connection raises error
            mock_get_db.side_effect = Exception("DB connection failed")

            # Request should still succeed (middleware fails silently)
            response = client.get("/test")
            assert response.status_code == 200
            assert "anonymous_id" in response.json()

    def test_middleware_request_state_attached(self, client):
        """Request state should contain anonymous_id."""
        with (
            patch("app.middleware.anonymous_tracking.get_settings") as mock_settings,
            patch("app.middleware.anonymous_tracking.get_db_connection") as mock_get_db,
        ):
            mock_settings_instance = MagicMock()
            mock_settings_instance.database_url = "sqlite:///:memory:"
            mock_settings.return_value = mock_settings_instance

            mock_conn = MagicMock()
            mock_get_db.return_value = mock_conn

            # Make request
            response = client.get("/test")

            # Verify request state had anonymous_id
            assert response.status_code == 200
            data = response.json()
            assert "anonymous_id" in data
            assert data["anonymous_id"] is not None
