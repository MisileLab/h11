"""Tests for the main FastAPI application."""

from app.main import app


def test_app_title():
    """Test that app has correct title."""
    assert app.title == "arXgorithm API"


def test_app_version():
    """Test that app has correct version."""
    assert app.version == "0.1.0"


def test_health_check():
    """Test health check endpoint."""
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
