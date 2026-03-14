import os
import pytest
from pydantic import ValidationError


class TestSettingsValidation:
    def test_valid_config_loads(self):
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "3.0",
                "SALAD_EMBEDDING_URL": "https://test.salad.cloud",
                "SALAD_API_KEY": "",
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
            assert config.salad_embedding_url == "https://test.salad.cloud"
            assert config.gemini_api_key == "test-gemini-key"
            assert config.session_secret == "test-secret"
            assert config.database_url == "sqlite:///./test.db"
            assert config.frontend_url == "http://localhost:3000"
        finally:
            for key in [
                "ARXIV_RATE_LIMIT",
                "SALAD_EMBEDDING_URL",
                "SALAD_API_KEY",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
            ]:
                os.environ.pop(key, None)

    def test_missing_required_var_raises_error(self):
        for key in [
            "ARXIV_RATE_LIMIT",
            "SALAD_EMBEDDING_URL",
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

    def test_optional_oauth_fields_can_be_present(self):
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "3.0",
                "SALAD_EMBEDDING_URL": "https://test.salad.cloud",
                "SALAD_API_KEY": "",
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
            for key in [
                "ARXIV_RATE_LIMIT",
                "SALAD_EMBEDDING_URL",
                "SALAD_API_KEY",
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
        os.environ.update(
            {
                "ARXIV_RATE_LIMIT": "not-a-number",
                "SALAD_EMBEDDING_URL": "https://test.salad.cloud",
                "SALAD_API_KEY": "",
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
            for key in [
                "ARXIV_RATE_LIMIT",
                "SALAD_EMBEDDING_URL",
                "SALAD_API_KEY",
                "GEMINI_API_KEY",
                "SESSION_SECRET",
                "DATABASE_URL",
                "BACKEND_URL",
                "FRONTEND_URL",
            ]:
                os.environ.pop(key, None)

    def test_field_annotation_for_arxiv_rate_limit(self):
        from app.config import Settings

        field = Settings.model_fields["arxiv_rate_limit"]
        assert field.annotation == float or str(field.annotation) == "float"
