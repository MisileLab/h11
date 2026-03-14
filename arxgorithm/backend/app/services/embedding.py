"""Embedding service using SaladCloud Inference Endpoints with SQLite caching."""

import asyncio
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
    Service for generating text embeddings via SaladCloud Inference Endpoints.

    Features:
    - Creates async jobs on SaladCloud inference endpoint for Qwen3-Embedding-8B
    - Polls for job completion with retry logic
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
            settings: Application settings (for SaladCloud API key and endpoint).
            db_path: Path to SQLite database for caching.
            http_client: Optional HTTPClient instance (creates new if not provided).
        """
        self.settings = settings
        self.db_path = db_path
        self.http_client = http_client or HTTPClient()

    async def embed(self, text: str) -> list[float]:
        """
        Generate embedding for text via SaladCloud API with cache.

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

        # Call SaladCloud API
        embedding = await self._call_saladcloud_api(text)

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

    async def _call_saladcloud_api(self, text: str) -> list[float]:
        """
        Call SaladCloud Inference Endpoint for embeddings (async job-based).

        Creates a job, polls for completion, and extracts the embedding.

        Job lifecycle:
        1. POST job with text input → get job_id
        2. Poll GET /jobs/{job_id} with exponential backoff (0.5s, 1s, 2s, 5s max)
        3. When status="succeeded", extract embeddings from output
        4. Timeout after 5 minutes

        Args:
            text: Text to embed.

        Returns:
            List of floats (1024 dimensions).

        Raises:
            ExternalServiceError: If API call fails, timeout, or output format invalid.
        """
        base_url = "https://api.salad.com/api/public"
        org = self.settings.salad_organization_name
        endpoint = self.settings.salad_inference_endpoint_name

        create_url = (
            f"{base_url}/organizations/{org}/inference-endpoints/{endpoint}/jobs"
        )
        headers = {
            "Salad-Api-Key": self.settings.salad_api_key,
            "Content-Type": "application/json",
        }

        job_input = {
            "input": text,
        }

        try:
            # Step 1: Create job
            job_response = await self.http_client.post(
                create_url,
                json_data=job_input,
                headers=headers,
                service="SaladCloud",
            )

            job_id = job_response.get("id")
            if not job_id:
                raise ExternalServiceError(
                    service="SaladCloud",
                    message="SaladCloud: job creation failed (missing id)",
                )

            result_url = f"{create_url}/{job_id}"

            # Step 2: Poll for completion with timeout
            backoff_times = [0.5, 1.0, 2.0, 5.0]  # exponential backoff up to 5s
            backoff_idx = 0
            start_time = time.time()
            max_wait_seconds = 300  # 5 minute timeout

            while True:
                elapsed = time.time() - start_time
                if elapsed > max_wait_seconds:
                    raise ExternalServiceError(
                        service="SaladCloud",
                        message=f"SaladCloud: job polling timeout ({max_wait_seconds}s)",
                    )

                job_status = await self.http_client.get(
                    result_url,
                    headers=headers,
                    service="SaladCloud",
                )

                status = job_status.get("status")
                
                # Step 3: Check final states
                if status == "succeeded":
                    output = job_status.get("output")
                    if output is None:
                        raise ExternalServiceError(
                            service="SaladCloud",
                            message="SaladCloud: job succeeded but missing output",
                        )

                    # Extract embedding from output
                    # Expected format: {"embeddings": [[0.1, 0.2, ..., 0.3]]}
                    embeddings_list = (
                        output.get("embeddings")
                        if isinstance(output, dict)
                        else None
                    )
                    
                    if (
                        not embeddings_list
                        or not isinstance(embeddings_list, list)
                        or len(embeddings_list) == 0
                    ):
                        raise ExternalServiceError(
                            service="SaladCloud",
                            message="SaladCloud: invalid output format (missing or empty embeddings array)",
                        )

                    embedding = embeddings_list[0]
                    
                    if not isinstance(embedding, list):
                        raise ExternalServiceError(
                            service="SaladCloud",
                            message="SaladCloud: invalid embedding format (expected array)",
                        )

                    if len(embedding) != self.EMBEDDING_DIMENSION:
                        raise ExternalServiceError(
                            service="SaladCloud",
                            message=f"SaladCloud: unexpected embedding dimension {len(embedding)}, expected {self.EMBEDDING_DIMENSION}",
                        )

                    return embedding

                if status == "failed":
                    raise ExternalServiceError(
                        service="SaladCloud",
                        message="SaladCloud: job failed (after max retries)",
                    )

                if status == "cancelled":
                    raise ExternalServiceError(
                        service="SaladCloud",
                        message="SaladCloud: job was cancelled",
                    )

                # Still pending/running: wait and retry
                wait_time = backoff_times[min(backoff_idx, len(backoff_times) - 1)]
                backoff_idx += 1
                await asyncio.sleep(wait_time)

        except ExternalServiceError:
            raise
        except Exception as e:
            raise ExternalServiceError(
                service="SaladCloud",
                message=f"SaladCloud API error: {str(e)}",
            )
