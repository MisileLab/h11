"""Redis connection management."""

from functools import lru_cache
from typing import Optional

import redis
from redis import Redis

from app.config import get_settings


@lru_cache()
def get_redis_client() -> Redis:
    """
    Get cached Redis client instance.

    Returns:
        Redis: Configured Redis client
    """
    settings = get_settings()

    # Parse Redis URL to get connection parameters
    return redis.from_url(
        settings.redis_url,
        decode_responses=False,  # Keep binary for RQ compatibility
        socket_connect_timeout=5,
        socket_timeout=5,
    )


def get_redis_connection() -> Redis:
    """
    Get Redis connection for RQ workers.

    This is a convenience wrapper that returns the cached client.
    Used by RQ workers to get a connection.

    Returns:
        Redis: Redis connection instance
    """
    return get_redis_client()


def ping_redis() -> bool:
    """
    Test Redis connectivity.

    Returns:
        bool: True if Redis is reachable, False otherwise
    """
    try:
        client = get_redis_client()
        return client.ping()
    except Exception:
        return False
