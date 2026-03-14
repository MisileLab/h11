"""Tests for OAuth authentication endpoints.

Mocked-provider tests covering:
- GET  /api/auth/me               (JWT session cookie)
- POST /api/auth/logout           (cookie clearance)
- GET  /api/auth/{provider}       (OAuth redirect)
- GET  /api/auth/{provider}/callback (OAuth callback, user upsert, JWT)
- JWT helper round-trips
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.responses import RedirectResponse

from app.main import app

# ── Helpers ────────────────────────────────────────────────────────

SESSION_SECRET = "test-secret-key-for-jwt"


@pytest.fixture(autouse=True)
def _reset_oauth_cache():
    """Reset global OAuth client between tests."""
    import app.api.auth as auth_mod

    auth_mod._oauth = None
    yield
    auth_mod._oauth = None


def _settings(**overrides):
    """Create a mock Settings object with sensible defaults."""
    mock = MagicMock()
    defaults = {
        "session_secret": SESSION_SECRET,
        "google_client_id": "g-id",
        "google_client_secret": "g-secret",
        "github_client_id": "gh-id",
        "github_client_secret": "gh-secret",
        "backend_url": "http://localhost:8000",
        "frontend_url": "http://localhost:3000",
        "database_url": "sqlite:///test.db",
        "arxiv_rate_limit": 1.0,
        "salad_embedding_url": "https://test-embed.salad.cloud",
        "salad_api_key": "k",
        "gemini_api_key": "k",
    }
    defaults.update(overrides)
    for k, v in defaults.items():
        setattr(mock, k, v)
    return mock


def _jwt(
    user_id=1,
    email="u@test.com",
    name="User",
    provider="google",
    expired=False,
):
    """Create a test JWT token."""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "provider": provider,
        "iat": now if not expired else now - 7200,
        "exp": (now + 3600) if not expired else (now - 3600),
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=False)


# ── GET /api/auth/me ───────────────────────────────────────────────


class TestGetCurrentUser:
    """Tests for the /me endpoint."""

    def test_returns_user_info_from_valid_jwt(self, client):
        token = _jwt(user_id=42, email="alice@x.com", name="Alice", provider="github")
        with patch("app.api.auth.get_settings", return_value=_settings()):
            resp = client.get("/api/auth/me", cookies={"session": token})

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == 42
        assert data["email"] == "alice@x.com"
        assert data["name"] == "Alice"
        assert data["provider"] == "github"

    def test_returns_401_without_cookie(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401
        assert "Not authenticated" in resp.json()["detail"]

    def test_returns_401_with_invalid_jwt(self, client):
        with patch("app.api.auth.get_settings", return_value=_settings()):
            resp = client.get("/api/auth/me", cookies={"session": "bad.token.here"})
        assert resp.status_code == 401

    def test_returns_401_with_expired_jwt(self, client):
        token = _jwt(expired=True)
        with patch("app.api.auth.get_settings", return_value=_settings()):
            resp = client.get("/api/auth/me", cookies={"session": token})
        assert resp.status_code == 401


# ── POST /api/auth/logout ─────────────────────────────────────────


class TestLogout:
    """Tests for the /logout endpoint."""

    def test_returns_logged_out_and_clears_cookie(self, client):
        resp = client.post("/api/auth/logout", cookies={"session": _jwt()})
        assert resp.status_code == 200
        assert resp.json()["status"] == "logged_out"
        # Cookie deletion header present
        sc = resp.headers.get("set-cookie", "")
        assert "session" in sc

    def test_works_without_existing_session(self, client):
        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["status"] == "logged_out"


# ── GET /api/auth/{provider} (redirect) ───────────────────────────


class TestOAuthRedirect:
    """Tests for the OAuth redirect endpoint."""

    def test_unsupported_provider_returns_400(self, client):
        with patch("app.api.auth.get_settings", return_value=_settings()):
            resp = client.get("/api/auth/facebook", follow_redirects=False)
        assert resp.status_code == 400
        assert "Unsupported provider" in resp.json()["detail"]

    def test_google_calls_authorize_redirect(self, client):
        mock_oauth = MagicMock()
        mock_google = MagicMock()
        mock_google.authorize_redirect = AsyncMock(
            return_value=RedirectResponse(
                "https://accounts.google.com/o/oauth2/auth?x=1",
                status_code=302,
            )
        )
        mock_oauth.google = mock_google

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
        ):
            resp = client.get("/api/auth/google", follow_redirects=False)

        assert resp.status_code == 302
        assert "google.com" in resp.headers["location"]
        mock_google.authorize_redirect.assert_called_once()
        # Verify callback URI points to backend, not frontend
        call_args = mock_google.authorize_redirect.call_args
        redirect_uri = call_args[0][1]  # second positional arg
        assert redirect_uri == "http://localhost:8000/api/auth/google/callback"

    def test_github_calls_authorize_redirect(self, client):
        mock_oauth = MagicMock()
        mock_gh = MagicMock()
        mock_gh.authorize_redirect = AsyncMock(
            return_value=RedirectResponse(
                "https://github.com/login/oauth/authorize?x=1",
                status_code=302,
            )
        )
        mock_oauth.github = mock_gh

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
        ):
            resp = client.get("/api/auth/github", follow_redirects=False)

        assert resp.status_code == 302
        mock_gh.authorize_redirect.assert_called_once()
        # Verify callback URI points to backend, not frontend
        call_args = mock_gh.authorize_redirect.call_args
        redirect_uri = call_args[0][1]  # second positional arg
        assert redirect_uri == "http://localhost:8000/api/auth/github/callback"

    def test_unconfigured_provider_returns_400(self, client):
        mock_oauth = MagicMock()
        mock_oauth.google = None  # not configured

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
        ):
            resp = client.get("/api/auth/google", follow_redirects=False)

        assert resp.status_code == 400
        assert "not configured" in resp.json()["detail"]


# ── GET /api/auth/{provider}/callback ──────────────────────────────


class TestOAuthCallback:
    """Tests for the OAuth callback endpoint."""

    def test_google_callback_creates_new_user(self, client):
        mock_oauth = MagicMock()
        mock_google = MagicMock()
        mock_google.authorize_access_token = AsyncMock(
            return_value={
                "userinfo": {
                    "sub": "g-123",
                    "email": "alice@gmail.com",
                    "name": "Alice",
                }
            }
        )
        mock_oauth.google = mock_google

        # DB: user not found → INSERT
        mock_db = MagicMock()
        mock_select = MagicMock()
        mock_select.fetchone.return_value = None
        mock_insert = MagicMock()
        mock_insert.lastrowid = 1
        mock_db.execute.side_effect = [mock_select, mock_insert]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 302
        assert resp.headers["location"] == "http://localhost:3000"
        sc = resp.headers.get("set-cookie", "")
        assert "session=" in sc
        assert "httponly" in sc.lower()

    def test_github_callback_creates_new_user(self, client):
        mock_oauth = MagicMock()
        mock_gh = MagicMock()
        mock_gh.authorize_access_token = AsyncMock(
            return_value={"access_token": "gho_test"}
        )
        mock_user_resp = MagicMock()
        mock_user_resp.json.return_value = {
            "id": 456,
            "email": "bob@gh.com",
            "name": "Bob",
            "login": "bobdev",
        }
        mock_gh.get = AsyncMock(return_value=mock_user_resp)
        mock_oauth.github = mock_gh

        mock_db = MagicMock()
        mock_select = MagicMock()
        mock_select.fetchone.return_value = None
        mock_insert = MagicMock()
        mock_insert.lastrowid = 2
        mock_db.execute.side_effect = [mock_select, mock_insert]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/github/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 302
        sc = resp.headers.get("set-cookie", "")
        assert "session=" in sc

    def test_callback_finds_existing_user(self, client):
        mock_oauth = MagicMock()
        mock_google = MagicMock()
        mock_google.authorize_access_token = AsyncMock(
            return_value={
                "userinfo": {
                    "sub": "g-existing",
                    "email": "alice@gmail.com",
                    "name": "Alice",
                }
            }
        )
        mock_oauth.google = mock_google

        # DB: user found (same email/name → no UPDATE)
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = (
            42,
            "alice@gmail.com",
            "Alice",
        )

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 302
        # Decode JWT from cookie to verify user_id
        sc = resp.headers.get("set-cookie", "")
        assert "session=" in sc
        # Extract token value
        token_value = sc.split("session=")[1].split(";")[0]
        payload = jwt.decode(token_value, SESSION_SECRET, algorithms=["HS256"])
        assert payload["sub"] == "42"
        assert payload["provider"] == "google"

    def test_callback_unsupported_provider_returns_400(self, client):
        with patch("app.api.auth.get_settings", return_value=_settings()):
            resp = client.get(
                "/api/auth/facebook/callback?code=c",
                follow_redirects=False,
            )
        assert resp.status_code == 400

    def test_callback_empty_oauth_id_returns_400(self, client):
        mock_oauth = MagicMock()
        mock_google = MagicMock()
        mock_google.authorize_access_token = AsyncMock(
            return_value={"userinfo": {"sub": "", "email": "x@x.com"}}
        )
        mock_oauth.google = mock_google

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 400
        assert "user ID" in resp.json()["detail"]

    def test_github_callback_uses_login_as_name_fallback(self, client):
        """GitHub: if name is null, fall back to login."""
        mock_oauth = MagicMock()
        mock_gh = MagicMock()
        mock_gh.authorize_access_token = AsyncMock(return_value={"access_token": "t"})
        mock_user_resp = MagicMock()
        mock_user_resp.json.return_value = {
            "id": 789,
            "email": None,
            "name": None,
            "login": "octocat",
        }
        mock_gh.get = AsyncMock(return_value=mock_user_resp)
        mock_oauth.github = mock_gh

        mock_db = MagicMock()
        mock_select = MagicMock()
        mock_select.fetchone.return_value = None
        mock_insert = MagicMock()
        mock_insert.lastrowid = 3
        mock_db.execute.side_effect = [mock_select, mock_insert]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/github/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 302
        # Verify INSERT was called with login as name
        insert_call = mock_db.execute.call_args_list[1]
        args = insert_call[0]  # positional args
        # INSERT INTO users (oauth_provider, oauth_id, email, name) VALUES (?, ?, ?, ?)
        assert args[1] == ("github", "789", None, "octocat")


# ── JWT Helper Tests ───────────────────────────────────────────────


class TestJWTHelpers:
    """Tests for create_jwt_token / verify_jwt_token."""

    def test_roundtrip_create_verify(self):
        with patch("app.api.auth.get_settings", return_value=_settings()):
            from app.api.auth import create_jwt_token, verify_jwt_token

            token = create_jwt_token(
                user_id=99, email="t@t.com", name="T", provider="google"
            )
            payload = verify_jwt_token(token)

        assert payload is not None
        assert payload["sub"] == "99"
        assert payload["email"] == "t@t.com"
        assert payload["provider"] == "google"

    def test_rejects_tampered_token(self):
        with patch("app.api.auth.get_settings", return_value=_settings()):
            from app.api.auth import verify_jwt_token

            assert verify_jwt_token("tampered.jwt.here") is None

    def test_rejects_expired_token(self):
        expired = _jwt(expired=True)
        with patch("app.api.auth.get_settings", return_value=_settings()):
            from app.api.auth import verify_jwt_token

            assert verify_jwt_token(expired) is None
