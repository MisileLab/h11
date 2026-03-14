import asyncio
import hashlib
import logging
import sqlite3
import struct
import time

import aiosqlite

from app.config import Settings
from app.http_client import ExternalServiceError, HTTPClient

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service for generating text embeddings via SaladCloud-hosted TEI.

    Features:
    - Calls TEI /v1/embeddings endpoint (OpenAI-compatible API)
    - Caches embeddings in SQLite using text hash as key
    - 1-hour TTL for cached embeddings
    - Returns list of floats (1024 dimensions for Qwen3-Embedding-8B)
    - Wraps failures in ExternalServiceError
    """

    CACHE_TTL_SECONDS = 3600
    EMBEDDING_DIMENSION = 1024

    def __init__(
        self,
        settings: Settings,
        db_path: str,
        http_client: HTTPClient | None = None,
    ):
        self.settings = settings
        self.db_path = db_path
        self.http_client = http_client or HTTPClient()

    async def embed(self, text: str) -> list[float]:
        text_hash = hashlib.sha256(text.encode()).hexdigest()

        cached = await self._get_cached_embedding(text_hash)
        if cached is not None:
            return cached

        embedding = await self._call_tei_api(text)

        await self._cache_embedding(text_hash, embedding)

        return embedding

    async def _get_cached_embedding(self, text_hash: str) -> list[float] | None:
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

                if age_seconds > self.CACHE_TTL_SECONDS:
                    await db.execute(
                        "DELETE FROM embedding_cache WHERE text_hash = ?",
                        (text_hash,),
                    )
                    await db.commit()
                    return None

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
        try:
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

    async def _call_tei_api(self, text: str) -> list[float]:
        url = f"{self.settings.salad_embedding_url}/v1/embeddings"
        headers = {
            "Content-Type": "application/json",
        }
        if self.settings.salad_api_key:
            headers["Authorization"] = f"Bearer {self.settings.salad_api_key}"

        payload = {
            "input": text,
            "model": "Qwen/Qwen3-Embedding-8B",
            "encoding_format": "float",
        }

        try:
            response = await self.http_client.post(
                url,
                json_data=payload,
                headers=headers,
                service="SaladCloud-TEI",
            )

            if "data" not in response or not response["data"]:
                raise ExternalServiceError(
                    service="SaladCloud-TEI",
                    message="SaladCloud-TEI: invalid response (missing data)",
                )

            embedding = response["data"][0].get("embedding")
            if embedding is None:
                raise ExternalServiceError(
                    service="SaladCloud-TEI",
                    message="SaladCloud-TEI: invalid response (missing embedding)",
                )

            if len(embedding) != self.EMBEDDING_DIMENSION:
                raise ExternalServiceError(
                    service="SaladCloud-TEI",
                    message=f"SaladCloud-TEI: dimension mismatch {len(embedding)}, expected {self.EMBEDDING_DIMENSION}",
                )

            return embedding

        except ExternalServiceError:
            raise
        except Exception as e:
            raise ExternalServiceError(
                service="SaladCloud-TEI",
                message=f"SaladCloud-TEI: {e}",
            )
