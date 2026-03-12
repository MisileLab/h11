"""Embedding service using Nebius API with SQLite caching."""

import hashlib
import logging
import sqlite3
import struct
import time
from typing import Any

import aiosqlite

from app.config import Settings
from app.http_client import ExternalServiceError, HTTPClient

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service for generating text embeddings via Nebius API.

    Features:
    - Calls Nebius embeddings endpoint with bearer token authentication
    - Caches embeddings in SQLite using text hash as key
    - 1-hour TTL for cached embeddings (or longer for durability)
    - Returns list of floats (1024 dimensions for Qwen3-Embedding-8B)
    - Wraps failures in ExternalServiceError
    """

    # Cache TTL in seconds: 1 hour for freshness, but embeddings are stable (unlikely to change)
    CACHE_TTL_SECONDS = 3600

    # Model identifier (1024 dimensions output)
    MODEL_ID = "Qwen/Qwen3-Embedding-8B"

    # Expected embedding dimension (official Qwen3-Embedding-8B output)
    EMBEDDING_DIMENSION = 1024

    def __init__(
        self,
        settings: Settings,
        db_path: str,
        http_client: HTTPClient | None = None,
    ):
        """
        Initialize embedding service.

        Args:
            settings: Application settings (for Nebius API key and URL).
            db_path: Path to SQLite database for caching.
            http_client: Optional HTTPClient instance (creates new if not provided).
        """
        self.settings = settings
        self.db_path = db_path
        self.http_client = http_client or HTTPClient()

    async def embed(self, text: str) -> list[float]:
        """
        Generate embedding for text via Nebius API with cache.

        Args:
            text: Text to embed.

        Returns:
            List of floats representing the embedding (1024 dimensions).

        Raises:
            ExternalServiceError: If API call fails or cache error occurs.
        """
        # Compute deterministic hash for caching
        text_hash = hashlib.sha256(text.encode()).hexdigest()

        # Check cache first
        cached = await self._get_cached_embedding(text_hash)
        if cached is not None:
            return cached

        # Call Nebius API
        embedding = await self._call_nebius_api(text)

        # Store in cache
        await self._cache_embedding(text_hash, embedding)

        return embedding

    async def _get_cached_embedding(self, text_hash: str) -> list[float] | None:
        """
        Retrieve embedding from cache if fresh.

        Args:
            text_hash: SHA256 hash of text.

        Returns:
            List of floats if cached and fresh, None otherwise.
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await self._ensure_cache_table(db)
                cursor = await db.execute(
                    "SELECT embedding_vector, created_at FROM embedding_cache WHERE text_hash = ?",
                    (text_hash,),
                )
                row = await cursor.fetchone()

                if row is None:
                    return None

                embedding_blob, created_at = row
                age_seconds = time.time() - created_at

                # Check TTL
                if age_seconds > self.CACHE_TTL_SECONDS:
                    # Expired, delete it
                    await db.execute(
                        "DELETE FROM embedding_cache WHERE text_hash = ?",
                        (text_hash,),
                    )
                    await db.commit()
                    return None

                # Decode binary blob to float list (1024 floats, 4 bytes each)
                embedding = struct.unpack(
                    f"{self.EMBEDDING_DIMENSION}f", embedding_blob
                )
                return list(embedding)

        except (sqlite3.Error, Exception) as e:
            logger.warning(
                f"Cache read error for text_hash {text_hash}: {e}. Treating as cache miss."
            )
        return None

    async def _cache_embedding(self, text_hash: str, embedding: list[float]) -> None:
        """
        Store embedding in cache.

        Args:
            text_hash: SHA256 hash of text.
            embedding: List of floats.
        """
        try:
            # Encode floats to binary blob
            embedding_blob = struct.pack(f"{len(embedding)}f", *embedding)

            async with aiosqlite.connect(self.db_path) as db:
                await self._ensure_cache_table(db)
                await db.execute(
                    """
                    INSERT OR REPLACE INTO embedding_cache (text_hash, embedding_vector, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (text_hash, embedding_blob, int(time.time())),
                )
                await db.commit()

        except (sqlite3.Error, Exception) as e:
            logger.warning(
                f"Cache write error for text_hash {text_hash}: {e}. Continuing without cache."
            )

    async def _ensure_cache_table(self, db: aiosqlite.Connection) -> None:
        """
        Ensure embedding_cache table exists in the database.

        Args:
            db: aiosqlite database connection.
        """
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS embedding_cache (
                text_hash TEXT PRIMARY KEY,
                embedding_vector BLOB NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            )
            """
        )
        await db.commit()

    async def _call_nebius_api(self, text: str) -> list[float]:
        """
        Call Nebius embeddings API.

        Args:
            text: Text to embed.

        Returns:
            List of floats (1024 dimensions).

        Raises:
            ExternalServiceError: If API call fails.
        """
        # Normalize base URL: remove /v1 suffix if present, then append /v1/embeddings
        # This ensures consistency with .env.example which includes /v1 in the base URL
        base_url = self.settings.nebius_api_url.rstrip("/")
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]  # Remove /v1 suffix
        url = f"{base_url}/v1/embeddings"
        headers = {
            "Authorization": f"Bearer {self.settings.nebius_api_key}",
            "Content-Type": "application/json",
        }

        request_body = {
            "model": self.MODEL_ID,
            "input": text,
            "encoding_format": "float",
        }

        try:
            response = await self.http_client.post(
                url,
                json_data=request_body,
                headers=headers,
                service="Nebius",
            )

            # Extract embedding from response
            # Expected format: {"data": [{"embedding": [float, ...]}], ...}
            if "data" not in response or not response["data"]:
                raise ExternalServiceError(
                    service="Nebius",
                    message="Nebius: invalid response format (missing data)",
                )

            embedding = response["data"][0].get("embedding")
            if embedding is None:
                raise ExternalServiceError(
                    service="Nebius",
                    message="Nebius: invalid response format (missing embedding)",
                )

            # Validate dimension
            if len(embedding) != self.EMBEDDING_DIMENSION:
                raise ExternalServiceError(
                    service="Nebius",
                    message=f"Nebius: unexpected embedding dimension {len(embedding)}, expected {self.EMBEDDING_DIMENSION}",
                )

            return embedding

        except ExternalServiceError:
            raise
        except Exception as e:
            raise ExternalServiceError(
                service="Nebius",
                message=f"Nebius: {e}",
            )
