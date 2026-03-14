"""
Application configuration using pydantic-settings.

All configuration is loaded from environment variables.
Required fields fail fast if missing; optional OAuth secrets default to None.
"""

import sys
from pydantic_settings import BaseSettings, SettingsConfigDict


def _unique_non_empty(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


class Settings(BaseSettings):
    """Application configuration with environment variable loading."""

    model_config = SettingsConfigDict(
        extra="ignore",
    )

    # arXiv API Configuration
    arxiv_rate_limit: float
    """Rate limit (seconds) between arXiv API requests."""

    # SaladCloud TEI Embedding Service (required)
    salad_embedding_url: str
    """Base URL for SaladCloud-hosted TEI embedding service (e.g., https://container.salad.cloud)."""

    salad_api_key: str | None = None
    """Optional API key for SaladCloud embedding service authentication."""

    # Gemini Summary Service (required)
    gemini_api_key: str
    """API key for Google Gemini API."""

    # OAuth Providers (optional - app works without OAuth for anonymous mode)
    google_client_id: str | None = None
    """Google OAuth client ID. Optional for anonymous-only mode."""

    google_client_secret: str | None = None
    """Google OAuth client secret. Optional for anonymous-only mode."""

    github_client_id: str | None = None
    """GitHub OAuth client ID. Optional for anonymous-only mode."""

    github_client_secret: str | None = None
    """GitHub OAuth client secret. Optional for anonymous-only mode."""

    # Session Management (required)
    session_secret: str
    """Secret key for session signing. Must be changed in production."""

    # Database (required)
    database_url: str
    """Database connection URL (e.g., sqlite:///./arxgorithm.db)."""

    # URL Configuration (required)
    backend_url: str
    """Base URL of the backend API for OAuth callback URIs (e.g., http://localhost:8000)."""

    frontend_url: str
    """Base URL of frontend for CORS and post-login redirects."""

    cors_allowed_origins: str | None = None
    """Optional comma-separated list of additional allowed CORS origins."""

    def get_cors_origins(self) -> list[str]:
        configured_origins = []
        if self.cors_allowed_origins:
            configured_origins = self.cors_allowed_origins.split(",")

        return _unique_non_empty(
            [
                self.frontend_url,
                "http://localhost:3000",
                "https://arxgorithm.misile.xyz",
                *configured_origins,
            ]
        )


def get_settings() -> Settings:
    """Get application settings. Instantiated on-demand to support testing."""
    settings_factory = Settings
    return settings_factory()
