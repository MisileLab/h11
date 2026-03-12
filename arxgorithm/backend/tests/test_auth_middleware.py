"""Tests for authentication dependencies (protected routes middleware).

Tests three dependency functions:
1. get_current_user: Must return User or raise 401
2. get_optional_user: Must return User or None
3. get_anonymous_id: Must return UUID from cookie or raise 401

Covers:
- Valid JWT token (all fields present)
- Missing token (401)
- Invalid/tampered token (401)
- Expired token (401)
- Optional user with/without token
- Anonymous ID extraction
- Integration with FastAPI test client
"""

import json
import os
import time
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

# Set required environment variables before any imports that use get_settings()
os.environ.setdefault("SESSION_SECRET", "test-secret-key-for-unit-tests")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("ARXIV_RATE_LIMIT", "3.0")
os.environ.setdefault("NEBIUS_API_KEY", "test-nebius-key")
os.environ.setdefault("NEBIUS_API_URL", "https://api.test.com")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")

import pytest
from fastapi import Cookie, Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.dependencies import (
    User,
    get_anonymous_id,
    get_current_user,
    get_optional_user,
)


class TestGetCurrentUser:
    """Tests for get_current_user dependency (requires auth)."""

    @pytest.fixture
    def app(self):
        """FastAPI app with protected endpoint."""
        app = FastAPI()

        @app.get("/protected")
        async def protected_endpoint(user: User = Depends(get_current_user)):
            return {"user_id": user.id, "email": user.email, "name": user.name}

        return app

    @pytest.fixture
    def client(self, app):
        return TestClient(app)

    def test_protected_route_with_valid_jwt(self, client):
        """GET /protected with valid JWT in cookie returns user data (200)."""
        # Create valid JWT (non-expired, all fields)
        valid_token = _create_valid_jwt(
            user_id=123, email="user@example.com", name="Alice"
        )

        response = client.get("/protected", cookies={"session": valid_token})

        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == 123
        assert data["email"] == "user@example.com"
        assert data["name"] == "Alice"

    def test_protected_route_without_session_cookie(self, client):
        """GET /protected without session cookie returns 401."""
        response = client.get("/protected")

        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]

    def test_protected_route_with_invalid_jwt(self, client):
        """GET /protected with tampered JWT returns 401."""
        # Tampered token (wrong signature)
        tampered_token = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.TAMPERED"
        )

        response = client.get("/protected", cookies={"session": tampered_token})

        assert response.status_code == 401
        assert "Invalid or expired" in response.json()["detail"]

    def test_protected_route_with_expired_jwt(self, client):
        """GET /protected with expired JWT returns 401."""
        # Create expired JWT (exp in past)
        expired_token = _create_expired_jwt()

        response = client.get("/protected", cookies={"session": expired_token})

        assert response.status_code == 401
        assert "Invalid or expired" in response.json()["detail"]

    def test_protected_route_with_missing_required_fields(self, client):
        """GET /protected with JWT missing 'sub' or 'provider' returns 401."""
        # JWT with no 'sub' field
        invalid_token = _create_jwt_with_fields({"email": "user@example.com"})

        response = client.get("/protected", cookies={"session": invalid_token})

        assert response.status_code == 401
        assert "Invalid token structure" in response.json()["detail"]


class TestGetOptionalUser:
    """Tests for get_optional_user dependency (auth optional)."""

    @pytest.fixture
    def app(self):
        """FastAPI app with optional-auth endpoint."""
        app = FastAPI()

        @app.get("/optional")
        async def optional_endpoint(user: Optional[User] = Depends(get_optional_user)):
            if user:
                return {"authenticated": True, "user_id": user.id, "name": user.name}
            return {"authenticated": False}

        return app

    @pytest.fixture
    def client(self, app):
        return TestClient(app)

    def test_optional_route_with_valid_jwt(self, client):
        """GET /optional with valid JWT returns user data (authenticated=True)."""
        valid_token = _create_valid_jwt(
            user_id=456, email="bob@example.com", name="Bob"
        )

        response = client.get("/optional", cookies={"session": valid_token})

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["user_id"] == 456
        assert data["name"] == "Bob"

    def test_optional_route_without_token(self, client):
        """GET /optional without session cookie returns 200 with authenticated=False."""
        response = client.get("/optional")

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False

    def test_optional_route_with_invalid_jwt(self, client):
        """GET /optional with invalid JWT returns 200 with authenticated=False."""
        tampered_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.TAMPERED.TAMPERED"

        response = client.get("/optional", cookies={"session": tampered_token})

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False

    def test_optional_route_with_expired_jwt(self, client):
        """GET /optional with expired JWT returns 200 with authenticated=False."""
        expired_token = _create_expired_jwt()

        response = client.get("/optional", cookies={"session": expired_token})

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False


class TestGetAnonymousId:
    """Tests for get_anonymous_id dependency."""

    @pytest.fixture
    def app(self):
        """FastAPI app with anon endpoint."""
        app = FastAPI()

        @app.get("/anon")
        async def anon_endpoint(anon_id: str = Depends(get_anonymous_id)):
            return {"anonymous_id": anon_id}

        return app

    @pytest.fixture
    def client(self, app):
        return TestClient(app)

    def test_anon_endpoint_with_cookie(self, client):
        """GET /anon with anonymous_id cookie returns the UUID."""
        test_uuid = "550e8400-e29b-41d4-a716-446655440000"

        response = client.get("/anon", cookies={"anonymous_id": test_uuid})

        assert response.status_code == 200
        data = response.json()
        assert data["anonymous_id"] == test_uuid

    def test_anon_endpoint_without_cookie(self, client):
        """GET /anon without anonymous_id cookie returns 401."""
        response = client.get("/anon")

        assert response.status_code == 401
        assert "Anonymous tracking cookie not found" in response.json()["detail"]

    def test_anon_endpoint_with_empty_cookie(self, client):
        """GET /anon with empty anonymous_id cookie returns 401."""
        response = client.get("/anon", cookies={"anonymous_id": ""})

        assert response.status_code == 401
        assert "Anonymous tracking cookie not found" in response.json()["detail"]


class TestDependencyIntegration:
    """Integration tests for all three dependencies together."""

    @pytest.fixture
    def app(self):
        """FastAPI app with multiple endpoints."""
        app = FastAPI()

        @app.get("/protected")
        async def protected(user: User = Depends(get_current_user)):
            return {"user_id": user.id}

        @app.get("/optional")
        async def optional(user: Optional[User] = Depends(get_optional_user)):
            return {"authenticated": user is not None}

        @app.get("/anon")
        async def anon(anon_id: str = Depends(get_anonymous_id)):
            return {"anonymous_id": anon_id}

        @app.get("/mixed")
        async def mixed(
            user: Optional[User] = Depends(get_optional_user),
            anon_id: str = Depends(get_anonymous_id),
        ):
            """Endpoint supporting both authenticated and anonymous users."""
            if user:
                return {
                    "mode": "authenticated",
                    "user_id": user.id,
                    "anonymous_id": anon_id,
                }
            return {"mode": "anonymous", "anonymous_id": anon_id}

        return app

    @pytest.fixture
    def client(self, app):
        return TestClient(app)

    def test_protected_requires_auth_anon_does_not(self, client):
        """Protected endpoint 401, anon endpoint 200 without token."""
        # Protected fails
        resp_protected = client.get("/protected")
        assert resp_protected.status_code == 401

        # Anon fails (no cookie at all)
        resp_anon = client.get("/anon")
        assert resp_anon.status_code == 401

    def test_authenticated_user_can_access_all(self, client):
        """Authenticated user can access protected, optional, anon, and mixed."""
        valid_token = _create_valid_jwt(user_id=789, name="Charlie")
        anon_uuid = "550e8400-e29b-41d4-a716-446655440001"
        cookies = {"session": valid_token, "anonymous_id": anon_uuid}

        # Protected
        resp = client.get("/protected", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["user_id"] == 789

        # Optional
        resp = client.get("/optional", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["authenticated"] is True

        # Anon
        resp = client.get("/anon", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["anonymous_id"] == anon_uuid

        # Mixed (both)
        resp = client.get("/mixed", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["mode"] == "authenticated"
        assert resp.json()["user_id"] == 789

    def test_anonymous_user_can_access_optional_and_anon(self, client):
        """Anonymous user can access optional and anon, but not protected or mixed's anon part."""
        anon_uuid = "550e8400-e29b-41d4-a716-446655440002"
        cookies = {"anonymous_id": anon_uuid}

        # Protected fails
        resp = client.get("/protected", cookies=cookies)
        assert resp.status_code == 401

        # Optional succeeds
        resp = client.get("/optional", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["authenticated"] is False

        # Anon succeeds
        resp = client.get("/anon", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["anonymous_id"] == anon_uuid

        # Mixed succeeds with anon_id
        resp = client.get("/mixed", cookies=cookies)
        assert resp.status_code == 200
        assert resp.json()["mode"] == "anonymous"
        assert resp.json()["anonymous_id"] == anon_uuid


# ── Helper Functions ──────────────────────────────────────────────────


def _create_valid_jwt(
    user_id: int = 1,
    email: Optional[str] = "test@example.com",
    name: Optional[str] = "Test User",
    provider: str = "google",
) -> str:
    """Create a valid, non-expired JWT token for testing."""
    import jwt

    from app.config import get_settings

    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "provider": provider,
        "iat": now,
        "exp": now + 3600,  # 1 hour from now
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256")


def _create_expired_jwt() -> str:
    """Create an expired JWT token for testing."""
    import jwt

    from app.config import get_settings

    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": "999",
        "email": "expired@example.com",
        "name": "Expired User",
        "provider": "google",
        "iat": now - 7200,  # 2 hours ago
        "exp": now - 3600,  # 1 hour ago (expired)
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256")


def _create_jwt_with_fields(fields: dict) -> str:
    """Create a JWT with custom fields (for testing missing fields)."""
    import jwt

    from app.config import get_settings

    settings = get_settings()
    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + 3600,
        **fields,  # Override defaults
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256")
