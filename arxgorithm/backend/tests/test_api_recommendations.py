"""
Tests for the recommendations API endpoint.

Tests the GET /api/recommendations?categories=...&limit=... endpoint with:
- Content-based recommendations using reading history
- Support for both authenticated and anonymous users
- Fallback to recent papers when no history exists
- Optional category filtering
- Proper parameter validation and response shape
"""

import json
import uuid
import pytest
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.arxiv import Paper
from app.api.dependencies import get_optional_user, User


@pytest.fixture
def client():
    """FastAPI test client with overridden dependencies."""
    # Create a test client and override the dependencies
    test_client = TestClient(app)
    return test_client


@pytest.fixture
def auth_user():
    """Authenticated user object returned by get_optional_user."""
    return User(
        id=42, email="researcher@example.com", name="Researcher", provider="github"
    )


@contextmanager
def _override_user(user):
    """Override FastAPI's get_optional_user dependency to return a specific User (or None)."""
    app.dependency_overrides[get_optional_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_optional_user, None)


@pytest.fixture
def mock_paper():
    """Mock paper for recommendations."""
    return Paper(
        arxiv_id="2401.12345",
        title="Sample Paper on Neural Networks",
        abstract="This paper explores deep learning architectures.",
        authors=["Alice Smith", "Bob Jones"],
        published_at=1704067200,
        updated_at=1704067200,
        categories=["cs.AI", "cs.LG"],
        pdf_url="https://arxiv.org/pdf/2401.12345",
    )


@pytest.fixture
def mock_papers():
    """Mock list of papers for recommendations."""
    return [
        Paper(
            arxiv_id="2401.12345",
            title="Sample Paper on Neural Networks",
            abstract="This paper explores deep learning architectures.",
            authors=["Alice Smith", "Bob Jones"],
            published_at=1704067200,
            updated_at=1704067200,
            categories=["cs.AI", "cs.LG"],
            pdf_url="https://arxiv.org/pdf/2401.12345",
        ),
        Paper(
            arxiv_id="2401.67890",
            title="Advanced Machine Learning Techniques",
            abstract="A comprehensive overview of ML methods.",
            authors=["Charlie Brown"],
            published_at=1704153600,
            updated_at=1704153600,
            categories=["cs.LG", "stat.ML"],
            pdf_url="https://arxiv.org/pdf/2401.67890",
        ),
    ]


class TestGetRecommendations:
    """Test GET /api/recommendations endpoint."""

    def test_recommendations_with_history(self, client, mock_papers):
        """Test recommendations with user reading history."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = mock_papers

            response = client.get(
                "/api/recommendations", cookies={"anonymous_id": anon_id}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 2
            assert len(data["papers"]) == 2

            # Verify response structure
            paper = data["papers"][0]
            assert paper["arxiv_id"] == "2401.12345"
            assert paper["title"] == "Sample Paper on Neural Networks"
            assert (
                paper["abstract"] == "This paper explores deep learning architectures."
            )
            assert paper["authors"] == ["Alice Smith", "Bob Jones"]
            assert paper["categories"] == ["cs.AI", "cs.LG"]
            assert paper["published_at"] == 1704067200
            assert paper["updated_at"] == 1704067200
            assert paper["pdf_url"] == "https://arxiv.org/pdf/2401.12345"

    def test_recommendations_anonymous_user(self, client, mock_papers):
        """Test recommendations for anonymous user."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = mock_papers

            response = client.get(
                "/api/recommendations", cookies={"anonymous_id": anon_id}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 2
            assert len(data["papers"]) == 2

    def test_recommendations_with_categories_filter(self, client, mock_paper):
        """Test recommendations with category filtering."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = [mock_paper]

            response = client.get(
                "/api/recommendations?categories=cs.AI,stat.ML",
                cookies={"anonymous_id": anon_id},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 1

            # Verify recommend was called with parsed categories
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["categories"] == ["cs.AI", "stat.ML"]

    def test_recommendations_with_limit(self, client, mock_papers):
        """Test recommendations with custom limit."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = mock_papers[:1]

            response = client.get(
                "/api/recommendations?limit=5", cookies={"anonymous_id": anon_id}
            )

            assert response.status_code == 200
            data = response.json()

            # Verify recommend was called with custom limit
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["limit"] == 5

    def test_recommendations_empty_results(self, client):
        """Test recommendations when no papers found."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = []

            response = client.get(
                "/api/recommendations", cookies={"anonymous_id": anon_id}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 0
            assert data["papers"] == []

    def test_recommendations_limit_validation(self, client):
        """Test that limit parameter is validated."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = []

            # Test limit > 100 should fail (max is 100)
            response = client.get(
                "/api/recommendations?limit=101", cookies={"anonymous_id": anon_id}
            )
            assert response.status_code == 422  # Validation error

            # Test limit < 1 should fail (min is 1)
            response = client.get(
                "/api/recommendations?limit=0", cookies={"anonymous_id": anon_id}
            )
            assert response.status_code == 422

            # Test valid limit
            response = client.get(
                "/api/recommendations?limit=50", cookies={"anonymous_id": anon_id}
            )
            assert response.status_code == 200

    def test_recommendations_default_limit(self, client):
        """Test that default limit is 10."""
        anon_id = str(uuid.uuid4())

        with patch(
            "app.api.recommendations.recommend", new_callable=AsyncMock
        ) as mock_recommend:
            mock_recommend.return_value = []

            response = client.get(
                "/api/recommendations", cookies={"anonymous_id": anon_id}
            )

            assert response.status_code == 200

            # Verify default limit was used
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["limit"] == 10


class TestAuthenticatedRecommendations:
    """Test recommendations endpoint with authenticated users (JWT session).

    Authenticated users should get recommendations based on their user_id,
    without needing an anonymous_id cookie.
    """

    def test_recommendations_authenticated_user(self, client, mock_papers, auth_user):
        """Test recommendations for authenticated user without anonymous cookie."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            _override_user(auth_user),
        ):
            mock_recommend.return_value = mock_papers

            # No anonymous_id cookie — should still work for authenticated user
            response = client.get("/api/recommendations")

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 2

            # Verify recommend was called with user_id from JWT, not anonymous_id
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["user_id"] == auth_user.id
            assert call_kwargs["anonymous_id"] is None

    def test_recommendations_authenticated_user_with_categories(
        self, client, mock_paper, auth_user
    ):
        """Test authenticated user can filter by categories."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            _override_user(auth_user),
        ):
            mock_recommend.return_value = [mock_paper]

            response = client.get("/api/recommendations?categories=cs.AI")

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 1

            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["user_id"] == auth_user.id
            assert call_kwargs["categories"] == ["cs.AI"]

    def test_recommendations_anonymous_no_cookie_returns_200(self, client):
        """Test anonymous user without cookie gets 200 (not 401) after auth fix."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            _override_user(None),
        ):
            mock_recommend.return_value = []

            # No anonymous_id cookie, no auth — should still return 200
            response = client.get("/api/recommendations")

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 0


class TestDatabaseURLHandling:
    """Test database URL normalization in recommendations endpoint."""

    def test_sqlite_triple_slash_url_normalized(self, client, mock_paper):
        """Test that sqlite:/// URL format is normalized to filesystem path."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            patch("os.environ.get") as mock_env_get,
            _override_user(None),
        ):
            # Mock environment to return sqlite:/// URL
            def env_side_effect(key, default=None):
                if key == "DATABASE_URL":
                    return "sqlite:///./arxgorithm.db"
                return default

            mock_env_get.side_effect = env_side_effect
            mock_recommend.return_value = [mock_paper]

            response = client.get("/api/recommendations")

            assert response.status_code == 200

            # Verify recommend was called with normalized filesystem path
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            # Should be normalized from sqlite:///./arxgorithm.db to ./arxgorithm.db
            assert call_kwargs["db_path"] == "./arxgorithm.db"

    def test_sqlite_double_slash_url_normalized(self, client, mock_paper):
        """Test that sqlite:// URL format is normalized to filesystem path."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            patch("os.environ.get") as mock_env_get,
            _override_user(None),
        ):
            # Mock environment to return sqlite:// URL (double slash)
            def env_side_effect(key, default=None):
                if key == "DATABASE_URL":
                    return "sqlite://arxgorithm.db"
                return default

            mock_env_get.side_effect = env_side_effect
            mock_recommend.return_value = [mock_paper]

            response = client.get("/api/recommendations")

            assert response.status_code == 200

            # Verify recommend was called with normalized filesystem path
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            # Should be normalized from sqlite://arxgorithm.db to arxgorithm.db
            assert call_kwargs["db_path"] == "arxgorithm.db"

    def test_filesystem_path_unchanged(self, client, mock_paper):
        """Test that raw filesystem paths pass through unchanged."""
        with (
            patch(
                "app.api.recommendations.recommend", new_callable=AsyncMock
            ) as mock_recommend,
            patch("os.environ.get") as mock_env_get,
            _override_user(None),
        ):
            # Mock environment to return plain filesystem path
            def env_side_effect(key, default=None):
                if key == "DATABASE_URL":
                    return "/var/lib/arxgorithm.db"
                return default

            mock_env_get.side_effect = env_side_effect
            mock_recommend.return_value = [mock_paper]

            response = client.get("/api/recommendations")

            assert response.status_code == 200

            # Verify recommend was called with path unchanged
            mock_recommend.assert_called_once()
            call_kwargs = mock_recommend.call_args[1]
            assert call_kwargs["db_path"] == "/var/lib/arxgorithm.db"
