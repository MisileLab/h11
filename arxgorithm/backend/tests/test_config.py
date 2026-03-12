"""Tests for application configuration."""

import os
import pytest
from pydantic import ValidationError


class TestSettingsValidation:
    """Test Settings class validation."""

    def test_valid_config_loads(self):
        """Test that Settings loads with valid environment variables."""
        # Set required environment variables
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "3.0",
                "NEBIUS_API_KEY": "test-key",
                "NEBIUS_API_URL": "https://api.nebius.ai/v1",
                "GEMINI_API_KEY": "test-gemini-key",
                "SESSION_SECRET": "test-secret",
                "DATABASE_URL": "sqlite:///./test.db",
                "BACKEND_URL": "http://localhost:8000",
                "FRONTEND_URL": "http://localhost:3000",
            }
        )

        try:
            from app.config import Settings

            config = Settings()
            assert config.arxiv_rate_limit == 3.0
            assert config.nebius_api_key == "test-key"
            assert config.gemini_api_key == "test-gemini-key"
            assert config.session_secret == "test-secret"
            assert config.database_url == "sqlite:///./test.db"
            assert config.frontend_url == "http://localhost:3000"
        finally:
            # Clean up environment
            for key in [
                "ARXIV_RATE_LIMIT",
                "NEBIUS_API_KEY",
                "NEBIUS_API_URL",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
            ]:
                os.environ.pop(key, None)

    def test_missing_required_var_raises_error(self):
        """Test that missing required environment variable raises ValidationError."""
        # Remove all required vars
        for key in [
            "ARXIV_RATE_LIMIT",
            "NEBIUS_API_KEY",
            "NEBIUS_API_URL",
            "GEMINI_API_KEY",
            "SESSION_SECRET",
            "DATABASE_URL",
            "BACKEND_URL",
            "FRONTEND_URL",
        ]:
            os.environ.pop(key, None)

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings()

    def test_optional_oauth_fields_can_be_absent(self):
        """Test that optional OAuth fields can be missing without error."""
        # Set only required variables
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "3.0",
                "NEBIUS_API_KEY": "test-key",
                "NEBIUS_API_URL": "https://api.nebius.ai/v1",
                "GEMINI_API_KEY": "test-gemini-key",
                "SESSION_SECRET": "test-secret",
                "DATABASE_URL": "sqlite:///./test.db",
                "BACKEND_URL": "http://localhost:8000",
                "FRONTEND_URL": "http://localhost:3000",
            }
        )

        try:
            from app.config import Settings

            config = Settings()
            # OAuth fields should be None
            assert config.google_client_id is None
            assert config.google_client_secret is None
            assert config.github_client_id is None
            assert config.github_client_secret is None
        finally:
            # Clean up environment
            for key in [
                "ARXIV_RATE_LIMIT",
                "NEBIUS_API_KEY",
                "NEBIUS_API_URL",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
            ]:
                os.environ.pop(key, None)

    def test_optional_oauth_fields_can_be_present(self):
        """Test that optional OAuth fields work when provided."""
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "3.0",
                "NEBIUS_API_KEY": "test-key",
                "NEBIUS_API_URL": "https://api.nebius.ai/v1",
                "GEMINI_API_KEY": "test-gemini-key",
                "SESSION_SECRET": "test-secret",
                "DATABASE_URL": "sqlite:///./test.db",
                "BACKEND_URL": "http://localhost:8000",
                "FRONTEND_URL": "http://localhost:3000",
                "GOOGLE_CLIENT_ID": "google-id",
                "GOOGLE_CLIENT_SECRET": "google-secret",
                "GITHUB_CLIENT_ID": "github-id",
                "GITHUB_CLIENT_SECRET": "github-secret",
            }
        )

        try:
            from app.config import Settings

            config = Settings()
            assert config.google_client_id == "google-id"
            assert config.google_client_secret == "google-secret"
            assert config.github_client_id == "github-id"
            assert config.github_client_secret == "github-secret"
        finally:
            # Clean up environment
            for key in [
                "ARXIV_RATE_LIMIT",
                "NEBIUS_API_KEY",
                "NEBIUS_API_URL",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
                "GOOGLE_CLIENT_ID",
                "GOOGLE_CLIENT_SECRET",
                "GITHUB_CLIENT_ID",
                "GITHUB_CLIENT_SECRET",
            ]:
                os.environ.pop(key, None)

    def test_arxiv_rate_limit_must_be_float(self):
        """Test that ARXIV_RATE_LIMIT validates as float."""
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "not-a-number",
                "NEBIUS_API_KEY": "test-key",
                "NEBIUS_API_URL": "https://api.nebius.ai/v1",
                "GEMINI_API_KEY": "test-gemini-key",
                "SESSION_SECRET": "test-secret",
                "DATABASE_URL": "sqlite:///./test.db",
                "BACKEND_URL": "http://localhost:8000",
                "FRONTEND_URL": "http://localhost:3000",
            }
        )

        try:
            from app.config import Settings

            with pytest.raises(ValidationError):
                Settings()
        finally:
            # Clean up environment
            for key in [
                "ARXIV_RATE_LIMIT",
                "NEBIUS_API_KEY",
                "NEBIUS_API_URL",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
            ]:
                os.environ.pop(key, None)

    def test_config_field_names_map_to_env_vars(self):
        """Test that field names map cleanly to environment variable names."""
        # Verify the Settings class has expected fields
        from app.config import Settings

        model_fields = Settings.model_fields

        # Required fields
        assert "arxiv_rate_limit" in model_fields
        assert "nebius_api_key" in model_fields
        assert "nebius_api_url" in model_fields
        assert "gemini_api_key" in model_fields
        assert "session_secret" in model_fields
        assert "database_url" in model_fields
        assert "backend_url" in model_fields
        assert "frontend_url" in model_fields

        # Optional OAuth fields
        assert "google_client_id" in model_fields
        assert "google_client_secret" in model_fields
        assert "github_client_id" in model_fields
        assert "github_client_secret" in model_fields

    def test_field_annotation_for_arxiv_rate_limit(self):
        """Test that arxiv_rate_limit field has correct annotation."""
        from app.config import Settings

        field = Settings.model_fields["arxiv_rate_limit"]
        assert field.annotation == float or str(field.annotation) == "float"
