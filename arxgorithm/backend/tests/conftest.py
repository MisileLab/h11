"""Pytest configuration and fixtures for backend tests."""

import os
import pytest


def pytest_configure(config):
    test_env_vars = {
        "DATABASE_URL": "sqlite:///./test.db",
        "SALAD_API_KEY": "test-key",
        "SALAD_ORGANIZATION_NAME": "test-org",
        "SALAD_INFERENCE_ENDPOINT_NAME": "qwen3-embedding",
        "GEMINI_API_KEY": "test-key",
        "SESSION_SECRET": "test-secret",
        "ARXIV_RATE_LIMIT": "3.0",
        "BACKEND_URL": "http://localhost:8000",
        "FRONTEND_URL": "http://localhost:3000",
    }

    for key, value in test_env_vars.items():
        os.environ.setdefault(key, value)


@pytest.fixture(scope="session", autouse=True)
def setup_test_env():
    test_env_vars = {
        "DATABASE_URL": "sqlite:///./test.db",
        "SALAD_API_KEY": "test-key",
        "SALAD_ORGANIZATION_NAME": "test-org",
        "SALAD_INFERENCE_ENDPOINT_NAME": "qwen3-embedding",
        "GEMINI_API_KEY": "test-key",
        "SESSION_SECRET": "test-secret",
        "ARXIV_RATE_LIMIT": "3.0",
        "BACKEND_URL": "http://localhost:8000",
        "FRONTEND_URL": "http://localhost:3000",
    }

    for key, value in test_env_vars.items():
        os.environ.setdefault(key, value)
