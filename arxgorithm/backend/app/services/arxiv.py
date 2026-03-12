"""
arXiv API client with aggressive caching and rate limit compliance.

This module provides a wrapper around the `arxiv` Python library with:
- Configurable rate limiting (3.0s delay by default)
- SQLite-based query/result caching with 1-hour TTL
- Normalized Paper dataclass for consistent metadata handling
- Support for keyword search and arXiv ID lookups
- Async-safe wrapper for the synchronous arxiv library (runs in thread pool)
"""

import asyncio
import hashlib
import json
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Optional

import arxiv


@dataclass
class Paper:
    """Normalized arXiv paper metadata."""

    arxiv_id: str
    """Unique arXiv identifier (e.g., '2401.12345')."""

    title: str
    """Paper title."""

    abstract: str
    """Paper abstract."""

    authors: list[str]
    """List of author names."""

    published_at: int
    """Unix timestamp of publication date."""

    updated_at: int
    """Unix timestamp of last update."""

    categories: list[str]
    """List of arXiv categories (e.g., ['cs.AI', 'stat.ML'])."""

    pdf_url: str
    """URL to the PDF."""

    @classmethod
    def from_arxiv_entry(cls, entry: Any) -> "Paper":
        """
        Convert arxiv.Result entry to Paper dataclass.

        Args:
            entry: arxiv.Result object from arxiv library search.

        Returns:
            Paper instance with normalized metadata.
        """
        return cls(
            arxiv_id=entry.entry_id.split("/abs/")[-1],
            title=entry.title,
            abstract=entry.summary,
            authors=[author.name for author in entry.authors],
            published_at=int(entry.published.timestamp()),
            updated_at=int(entry.updated.timestamp()),
            categories=entry.categories,
            pdf_url=entry.pdf_url,
        )

    def to_dict(self) -> dict:
        """Convert Paper to dictionary for JSON serialization."""
        return {
            "arxiv_id": self.arxiv_id,
            "title": self.title,
            "abstract": self.abstract,
            "authors": self.authors,
            "published_at": self.published_at,
            "updated_at": self.updated_at,
            "categories": self.categories,
            "pdf_url": self.pdf_url,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Paper":
        """Reconstruct Paper from dictionary."""
        return cls(
            arxiv_id=data["arxiv_id"],
            title=data["title"],
            abstract=data["abstract"],
            authors=data["authors"],
            published_at=data["published_at"],
            updated_at=data["updated_at"],
            categories=data["categories"],
            pdf_url=data["pdf_url"],
        )


class ArxivClient:
    """
    arXiv API client with caching and rate limiting.

    Features:
    - Search papers by query string with optional category filtering
    - Get paper by arXiv ID
    - Automatic caching with 1-hour TTL (configurable)
    - Rate limiting with configurable delay (default 3.0s per arxiv API docs)
    - SQLite-backed cache to prevent repeated API calls
    - Async-safe: wraps synchronous arxiv library calls in thread pool
    """

    def __init__(
        self,
        db_connection: sqlite3.Connection,
        delay_seconds: float = 3.0,
        cache_ttl_seconds: int = 3600,
    ):
        """
        Initialize ArxivClient.

        Args:
            db_connection: sqlite3.Connection for cache storage.
            delay_seconds: Delay between API requests in seconds (default 3.0).
            cache_ttl_seconds: Cache time-to-live in seconds (default 3600 = 1 hour).

        Raises:
            ValueError: If delay_seconds < 0 or cache_ttl_seconds < 0.
        """
        if delay_seconds < 0:
            raise ValueError("delay_seconds must be non-negative")
        if cache_ttl_seconds < 0:
            raise ValueError("cache_ttl_seconds must be non-negative")

        self.db = db_connection
        self.delay_seconds = delay_seconds
        self.cache_ttl_seconds = cache_ttl_seconds
        self._last_request_time = 0.0

        # Initialize cache table
        self._init_cache_table()

    def _init_cache_table(self) -> None:
        """Create arxiv_cache table if it does not exist."""
        self.db.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_hash TEXT UNIQUE NOT NULL,
                response_json TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        self.db.commit()

    def _hash_query(self, query: str, categories: Optional[list[str]] = None) -> str:
        """
        Generate a hash of the query and categories for cache lookup.

        Args:
            query: Search query string.
            categories: Optional list of arXiv categories to filter by.

        Returns:
            SHA256 hash of normalized query parameters.
        """
        category_str = "|".join(sorted(categories)) if categories else ""
        normalized = f"{query}:{category_str}"
        return hashlib.sha256(normalized.encode()).hexdigest()

    def _get_cached_result(self, query_hash: str) -> Optional[list[Paper]]:
        """
        Retrieve cached result if not expired.

        Args:
            query_hash: Hash of query and categories.

        Returns:
            List of Paper objects if cached and not expired, else None.
        """
        now = int(time.time())
        cursor = self.db.execute(
            """
            SELECT response_json FROM arxiv_cache
            WHERE query_hash = ? AND expires_at > ?
            LIMIT 1
            """,
            (query_hash, now),
        )
        row = cursor.fetchone()
        if row:
            response_data = json.loads(row[0])
            return [Paper.from_dict(p) for p in response_data]
        return None

    def _cache_result(self, query_hash: str, papers: list[Paper]) -> None:
        """
        Store search result in cache.

        Args:
            query_hash: Hash of query and categories.
            papers: List of Paper objects to cache.
        """
        now = int(time.time())
        expires_at = now + self.cache_ttl_seconds
        response_json = json.dumps([p.to_dict() for p in papers])

        self.db.execute(
            """
            INSERT OR REPLACE INTO arxiv_cache (query_hash, response_json, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (query_hash, response_json, expires_at, now),
        )
        self.db.commit()

    async def _apply_rate_limit(self) -> None:
        """Apply rate limiting delay before next API call (async-safe)."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.delay_seconds:
            await asyncio.sleep(self.delay_seconds - elapsed)

    async def search(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        max_results: int = 20,
    ) -> list[Paper]:
        """
        Search arXiv for papers matching query with optional category filter.

        Results are cached for 1 hour (configurable). Respects rate limiting.

        Args:
            query: Search query string (e.g., "neural networks", "deep learning").
            categories: Optional list of arXiv categories to filter by
                (e.g., ["cs.AI", "cs.LG"]).
            max_results: Maximum number of results to return (default 20).

        Returns:
            List of Paper objects matching the query.

        Raises:
            Exception: If arxiv API returns an error.
        """
        query_hash = self._hash_query(query, categories)

        # Try cache first
        cached = self._get_cached_result(query_hash)
        if cached is not None:
            return cached

        # Rate limit before API call
        await self._apply_rate_limit()

        # Build search with optional category filter
        if categories:
            category_filter = " AND ".join(f"cat:{cat}" for cat in categories)
            full_query = f"({query}) AND ({category_filter})"
        else:
            full_query = query

        # Execute search via arxiv library in thread pool (sync -> async wrapper)
        papers = await self._execute_search(full_query, max_results)

        self._last_request_time = time.time()

        # Cache result
        self._cache_result(query_hash, papers)

        return papers

    async def _execute_search(self, query: str, max_results: int) -> list[Paper]:
        """
        Execute arxiv search in thread pool (wraps sync arxiv library).

        Args:
            query: Full query string (already formatted with categories if needed).
            max_results: Maximum number of results.

        Returns:
            List of Paper objects.
        """
        loop = asyncio.get_event_loop()

        def _sync_search():
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.SubmittedDate,
            )
            papers = []
            for entry in search.results():
                papers.append(Paper.from_arxiv_entry(entry))
            return papers

        return await loop.run_in_executor(None, _sync_search)

    async def get_paper(self, arxiv_id: str) -> Paper:
        """
        Retrieve a specific paper by arXiv ID.

        Results are cached for 1 hour (configurable). Respects rate limiting.

        Args:
            arxiv_id: arXiv ID (e.g., "2401.12345" or "2401.12345v1").

        Returns:
            Paper object with metadata for the requested paper.

        Raises:
            arxiv.HTTPError: If paper not found or API error.
        """
        # Normalize ID (remove version suffix if present)
        if "v" in arxiv_id:
            arxiv_id = arxiv_id.split("v")[0]

        query_hash = self._hash_query(f"id:{arxiv_id}", None)

        # Try cache first
        cached = self._get_cached_result(query_hash)
        if cached:
            return cached[0]

        # Rate limit before API call
        await self._apply_rate_limit()

        # Fetch by ID in thread pool
        loop = asyncio.get_event_loop()

        def _sync_get():
            search = arxiv.Search(query=f"id:{arxiv_id}", max_results=1)
            try:
                entry = next(search.results())
                return Paper.from_arxiv_entry(entry)
            except StopIteration:
                raise arxiv.HTTPError(
                    url=f"http://arxiv.org/api/query?search_query=id:{arxiv_id}",
                    retry=0,
                    status=404,
                )

        paper = await loop.run_in_executor(None, _sync_get)
        self._last_request_time = time.time()
        self._cache_result(query_hash, [paper])
        return paper
