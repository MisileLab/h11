"""
Content-based recommendation engine using vector similarity on pre-computed embeddings.

Builds a user profile from the average embedding of saved/read papers (via
reading_list), queries sqlite-vec for nearest-neighbor papers, excludes
already-read papers, and optionally filters by arXiv category. Falls back
to recent papers ordered by published_at when no reading history exists.

This module is strictly content-based: pure vector similarity, no
collaborative filtering, no LLM reranking, no hybrid score mixing.
"""

import json
import logging
import math
import sqlite3
import struct
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite
import sqlite_vec

from app.services.arxiv import Paper

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSION = 1024
OVER_FETCH_MULTIPLIER = 3


@asynccontextmanager
async def _open_db(db_path: str) -> AsyncIterator[aiosqlite.Connection]:
    """
    Open an aiosqlite connection with sqlite-vec loaded.

    Args:
        db_path: Path to SQLite database file.

    Yields:
        aiosqlite.Connection with sqlite-vec extension ready.
    """
    db = await aiosqlite.connect(db_path)
    try:
        await db.enable_load_extension(True)
        await db.load_extension(sqlite_vec.loadable_path())
        await db.enable_load_extension(False)
        yield db
    finally:
        await db.close()


def _normalize(vec: list[float]) -> list[float]:
    """
    L2-normalize a vector for cosine-equivalent distance ranking.

    When all stored embeddings and the query vector are L2-normalized,
    L2 distance ordering is equivalent to cosine distance ordering.

    Args:
        vec: Input vector.

    Returns:
        Unit-length vector, or original if norm is zero.
    """
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0.0:
        return vec
    return [x / norm for x in vec]


class RecommendationEngine:
    """
    Content-based paper recommendation using vector similarity.

    Builds a user profile from the average embedding of their saved/read
    papers, then queries the sqlite-vec virtual table for nearest-neighbor
    papers. Already-read papers are excluded and optional category filtering
    is applied post-retrieval.

    When no reading history exists, falls back to recent papers ordered by
    published_at descending.
    """

    def __init__(self, db_path: str):
        """
        Initialize recommendation engine.

        Args:
            db_path: Path to SQLite database file (with schema already applied).
        """
        self.db_path = db_path

    async def recommend(
        self,
        user_id: int | None = None,
        anonymous_id: str | None = None,
        categories: list[str] | None = None,
        limit: int = 10,
    ) -> list[Paper]:
        """
        Recommend papers based on user's reading history.

        Builds a user profile from the average embedding of saved/read papers,
        then queries sqlite-vec for top-k similar papers. Excludes already-read
        papers and optionally filters by category.

        Falls back to recent papers when no reading history exists.

        Args:
            user_id: Authenticated user ID (nullable).
            anonymous_id: Cookie-based anonymous user UUID (nullable).
            categories: Optional list of arXiv categories to filter by.
            limit: Maximum number of papers to return (default 10).

        Returns:
            List of recommended Paper objects, ordered by similarity
            (or recency for fallback).
        """
        async with _open_db(self.db_path) as db:
            # 1. Get user's reading list paper IDs
            read_ids = await self._get_read_paper_ids(db, user_id, anonymous_id)

            # 2. If no history, fall back to recent papers
            if not read_ids:
                return await self._fallback_recent(db, categories, limit)

            # 3. Build user profile embedding (average of read papers)
            profile = await self._build_user_profile(db, read_ids)
            if profile is None:
                return await self._fallback_recent(db, categories, limit)

            # 4. Query sqlite-vec for similar papers, filter, return
            candidates = await self._query_similar(
                db, profile, limit, read_ids, categories
            )
            return candidates

    async def _get_read_paper_ids(
        self,
        db: aiosqlite.Connection,
        user_id: int | None,
        anonymous_id: str | None,
    ) -> set[int]:
        """
        Get paper IDs from user's reading list.

        Args:
            db: aiosqlite connection.
            user_id: Authenticated user ID (nullable).
            anonymous_id: Anonymous session UUID (nullable).

        Returns:
            Set of paper IDs the user has saved/read.
        """
        if user_id is None and anonymous_id is None:
            return set()

        conditions = []
        params: list[int | str] = []
        if user_id is not None:
            conditions.append("user_id = ?")
            params.append(user_id)
        if anonymous_id is not None:
            conditions.append("anonymous_id = ?")
            params.append(anonymous_id)

        where = " OR ".join(conditions)
        cursor = await db.execute(
            f"SELECT paper_id FROM reading_list WHERE {where}",
            params,
        )
        rows = await cursor.fetchall()
        return {row[0] for row in rows}

    async def _build_user_profile(
        self,
        db: aiosqlite.Connection,
        paper_ids: set[int],
    ) -> list[float] | None:
        """
        Average the embeddings of the user's read papers to build a profile.

        The resulting average vector is L2-normalized so that the subsequent
        sqlite-vec L2 distance query produces cosine-equivalent ranking.

        Args:
            db: aiosqlite connection.
            paper_ids: Set of paper IDs the user has read.

        Returns:
            Normalized 1024-dim profile vector, or None if no embeddings found.
        """
        if not paper_ids:
            return None

        placeholders = ",".join("?" * len(paper_ids))
        cursor = await db.execute(
            f"""
            SELECT e.embedding FROM embeddings e
            JOIN paper_embeddings pe ON pe.embedding_id = e.id
            WHERE pe.paper_id IN ({placeholders})
            """,
            list(paper_ids),
        )
        rows = await cursor.fetchall()

        if not rows:
            return None

        # Decode and average embeddings
        avg = [0.0] * EMBEDDING_DIMENSION
        count = 0
        for row in rows:
            blob = row[0]
            vec = struct.unpack(f"{EMBEDDING_DIMENSION}f", blob)
            for i in range(EMBEDDING_DIMENSION):
                avg[i] += vec[i]
            count += 1

        for i in range(EMBEDDING_DIMENSION):
            avg[i] /= count

        # Normalize for cosine-equivalent ranking via L2 distance
        return _normalize(avg)

    async def _query_similar(
        self,
        db: aiosqlite.Connection,
        profile: list[float],
        limit: int,
        exclude_ids: set[int],
        categories: list[str] | None = None,
    ) -> list[Paper]:
        """
        Query sqlite-vec for papers similar to the profile embedding.

        Over-fetches candidates to account for post-retrieval exclusions
        and category filtering.

        Args:
            db: aiosqlite connection.
            profile: Normalized user profile embedding.
            limit: Desired number of results.
            exclude_ids: Paper IDs to exclude (already-read).
            categories: Optional category filter.

        Returns:
            List of Paper objects ordered by similarity.
        """
        # Over-fetch to account for exclusions and category filtering
        fetch_limit = limit * OVER_FETCH_MULTIPLIER + len(exclude_ids)

        # Encode profile to binary blob for sqlite-vec MATCH
        profile_blob = struct.pack(f"{EMBEDDING_DIMENSION}f", *profile)

        # sqlite-vec nearest-neighbor query (L2 distance)
        cursor = await db.execute(
            """
            SELECT id, distance FROM embeddings
            WHERE embedding MATCH ?
            ORDER BY distance
            LIMIT ?
            """,
            [profile_blob, fetch_limit],
        )
        rows = await cursor.fetchall()

        # Filter out already-read papers
        candidate_ids = [row[0] for row in rows if row[0] not in exclude_ids]

        if not candidate_ids:
            return []

        # Fetch full paper metadata (preserving similarity order)
        papers = await self._fetch_papers_by_ids(db, candidate_ids)

        # Filter by categories if specified
        if categories:
            cat_set = set(categories)
            papers = [p for p in papers if any(c in cat_set for c in p.categories)]

        return papers[:limit]

    async def _fallback_recent(
        self,
        db: aiosqlite.Connection,
        categories: list[str] | None,
        limit: int,
    ) -> list[Paper]:
        """
        Return recent papers as fallback when no user history exists.

        Papers are ordered by published_at descending (most recent first).

        Args:
            db: aiosqlite connection.
            categories: Optional category filter.
            limit: Maximum number of papers.

        Returns:
            List of recent Paper objects.
        """
        if categories:
            # Filter by categories using json_each on the JSON categories column
            placeholders = ",".join("?" * len(categories))
            cursor = await db.execute(
                f"""
                SELECT DISTINCT p.id, p.arxiv_id, p.title, p.abstract,
                       p.authors, p.categories, p.published_at, p.updated_at
                FROM papers p, json_each(p.categories) AS jc
                WHERE jc.value IN ({placeholders})
                ORDER BY p.published_at DESC
                LIMIT ?
                """,
                [*categories, limit],
            )
        else:
            cursor = await db.execute(
                """
                SELECT id, arxiv_id, title, abstract, authors, categories,
                       published_at, updated_at
                FROM papers
                ORDER BY published_at DESC
                LIMIT ?
                """,
                [limit],
            )

        rows = await cursor.fetchall()
        return [self._row_to_paper(row) for row in rows]

    async def _fetch_papers_by_ids(
        self,
        db: aiosqlite.Connection,
        paper_ids: list[int],
    ) -> list[Paper]:
        """
        Fetch paper metadata for given IDs, preserving input order.

        Args:
            db: aiosqlite connection.
            paper_ids: List of paper IDs in desired order.

        Returns:
            List of Paper objects in the same order as paper_ids.
        """
        if not paper_ids:
            return []

        placeholders = ",".join("?" * len(paper_ids))
        cursor = await db.execute(
            f"""
            SELECT id, arxiv_id, title, abstract, authors, categories,
                   published_at, updated_at
            FROM papers
            WHERE id IN ({placeholders})
            """,
            paper_ids,
        )
        rows = await cursor.fetchall()

        # Build lookup and return in original order (similarity order)
        paper_map: dict[int, Paper] = {}
        for row in rows:
            paper_map[row[0]] = self._row_to_paper(row)

        return [paper_map[pid] for pid in paper_ids if pid in paper_map]

    @staticmethod
    def _row_to_paper(row: sqlite3.Row) -> Paper:
        """
        Convert a database row to Paper dataclass.

        Args:
            row: Tuple of (id, arxiv_id, title, abstract, authors_json,
                 categories_json, published_at, updated_at).

        Returns:
            Paper instance.
        """
        return Paper(
            arxiv_id=row[1],
            title=row[2],
            abstract=row[3],
            authors=json.loads(row[4]),
            categories=json.loads(row[5]),
            published_at=row[6],
            updated_at=row[7],
            pdf_url=f"https://arxiv.org/pdf/{row[1]}",
        )


async def recommend(
    db_path: str,
    user_id: int | None = None,
    anonymous_id: str | None = None,
    categories: list[str] | None = None,
    limit: int = 10,
) -> list[Paper]:
    """
    Module-level convenience function for getting recommendations.

    Args:
        db_path: Path to SQLite database file.
        user_id: Authenticated user ID (nullable).
        anonymous_id: Anonymous session UUID (nullable).
        categories: Optional list of arXiv categories to filter by.
        limit: Maximum number of papers to return.

    Returns:
        List of recommended Paper objects.
    """
    engine = RecommendationEngine(db_path)
    return await engine.recommend(
        user_id=user_id,
        anonymous_id=anonymous_id,
        categories=categories,
        limit=limit,
    )
