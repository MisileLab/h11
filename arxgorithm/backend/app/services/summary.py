"""Summary service for academic paper summaries using Google Gemini API.

Generates concise 2-3 sentence academic summaries from paper titles and abstracts.
Caches results in SQLite keyed by paper_id (or content hash as fallback).
Wraps failures in ExternalServiceError for consistent error handling.
"""

import hashlib
import json
import sqlite3
from typing import Optional

from app.config import Settings
from app.http_client import ExternalServiceError, HTTPClient


class SummaryService:
    """Generate and cache academic paper summaries using Gemini API."""

    # Gemini API endpoint (using flash-lite for efficient summarization)
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

    def __init__(
        self,
        settings: Settings,
        db_conn: sqlite3.Connection,
        http_client: HTTPClient | None = None,
    ):
        """
        Initialize the summary service.

        Args:
            settings: Application settings containing gemini_api_key.
            db_conn: SQLite database connection for caching summaries.
            http_client: Optional HTTPClient instance for HTTP requests (created if None).
        """
        self.settings = settings
        self.db_conn = db_conn
        self.http_client = http_client or HTTPClient()
        self._ensure_cache_table()

    def _ensure_cache_table(self) -> None:
        """Ensure the summary_cache table exists in the database."""
        self.db_conn.execute(
            """
            CREATE TABLE IF NOT EXISTS summary_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paper_id TEXT,
                content_hash TEXT NOT NULL UNIQUE,
                summary TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                UNIQUE(paper_id, content_hash)
            );
            """
        )
        self.db_conn.commit()

    def _get_cache_key(
        self, title: str, abstract: str, paper_id: Optional[str] = None
    ) -> tuple[Optional[str], str]:
        """
        Generate cache keys for a paper.

        Returns:
            Tuple of (paper_id_for_cache, content_hash).
            paper_id_for_cache is None if not provided; content_hash is always available as fallback.
        """
        # Deterministic hash of content for fallback key
        content_str = f"{title}|{abstract}"
        content_hash = hashlib.sha256(content_str.encode()).hexdigest()
        return paper_id, content_hash

    def _get_cached_summary(
        self, paper_id: Optional[str], content_hash: str
    ) -> Optional[str]:
        """
        Retrieve a cached summary if it exists.

        Args:
            paper_id: Optional paper ID (primary cache key).
            content_hash: Content hash (fallback cache key).

        Returns:
            Cached summary string or None if not found.
        """
        if paper_id:
            # Try by paper_id first
            cursor = self.db_conn.execute(
                "SELECT summary FROM summary_cache WHERE paper_id = ? LIMIT 1",
                (paper_id,),
            )
            row = cursor.fetchone()
            if row:
                return row[0]

        # Try by content_hash (fallback)
        cursor = self.db_conn.execute(
            "SELECT summary FROM summary_cache WHERE content_hash = ? LIMIT 1",
            (content_hash,),
        )
        row = cursor.fetchone()
        if row:
            return row[0]

        return None

    def _cache_summary(
        self, paper_id: Optional[str], content_hash: str, summary: str
    ) -> None:
        """
        Cache a generated summary.

        Args:
            paper_id: Optional paper ID.
            content_hash: Content hash.
            summary: Summary text to cache.
        """
        self.db_conn.execute(
            """
            INSERT OR IGNORE INTO summary_cache (paper_id, content_hash, summary)
            VALUES (?, ?, ?)
            """,
            (paper_id, content_hash, summary),
        )
        self.db_conn.commit()

    def _build_prompt(self, title: str, abstract: str) -> str:
        """
        Build a concise prompt for Gemini summarization.

        Args:
            title: Paper title.
            abstract: Paper abstract.

        Returns:
            Prompt string for Gemini.
        """
        return f"""Summarize this academic paper in exactly 2-3 sentences, focusing on the key finding and its significance.

Title: {title}

Abstract: {abstract}

Provide only the summary, no additional text."""

    async def summarize(
        self, title: str, abstract: str, paper_id: Optional[str] = None
    ) -> str:
        """
        Generate a 2-3 sentence academic summary using Gemini API.

        Caches result by paper_id (primary) or content hash (fallback).
        Returns cached summary if available; otherwise calls Gemini and caches result.

        Args:
            title: Paper title.
            abstract: Paper abstract.
            paper_id: Optional paper ID for better cache tracking.

        Returns:
            Summary string (2-3 sentences).

        Raises:
            ExternalServiceError: If Gemini API fails or response is malformed.
        """
        # Generate cache keys
        pid, content_hash = self._get_cache_key(title, abstract, paper_id)

        # Try cache first
        cached = self._get_cached_summary(pid, content_hash)
        if cached:
            return cached

        # Build request for Gemini
        prompt = self._build_prompt(title, abstract)
        url = f"{self.GEMINI_API_URL}?key={self.settings.gemini_api_key}"

        request_body = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt,
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,  # Low temperature for consistency
                "maxOutputTokens": 200,  # Cap output for short summaries
            },
        }

        try:
            response = await self.http_client.post(
                url,
                json_data=request_body,
                service="Gemini",
            )
        except ExternalServiceError:
            # Re-raise with service context
            raise

        # Extract summary from response
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                raise ExternalServiceError(
                    service="Gemini",
                    message="Gemini: No candidates in response",
                )

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                raise ExternalServiceError(
                    service="Gemini",
                    message="Gemini: No parts in content",
                )

            summary = parts[0].get("text", "").strip()
            if not summary:
                raise ExternalServiceError(
                    service="Gemini",
                    message="Gemini: Empty text in response",
                )

        except (KeyError, IndexError, TypeError) as e:
            raise ExternalServiceError(
                service="Gemini",
                message=f"Gemini: Malformed response - {type(e).__name__}",
            )

        # Cache and return
        self._cache_summary(pid, content_hash, summary)
        return summary
