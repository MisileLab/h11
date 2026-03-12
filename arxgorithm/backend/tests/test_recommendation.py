"""Tests for content-based recommendation engine."""

import json
import struct
from typing import Any

import aiosqlite
import pytest
import pytest_asyncio
import sqlite_vec

from app.db import init_db
from app.services.arxiv import Paper
from app.services.recommendation import (
    EMBEDDING_DIMENSION,
    RecommendationEngine,
    _normalize,
    recommend,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_embedding(base_index: int = 0, dim: int = EMBEDDING_DIMENSION) -> list[float]:
    """Create a synthetic unit vector with 1.0 at base_index, zeros elsewhere.

    This gives predictable L2 distances between embeddings:
    - Same index → distance 0
    - Different indices → distance √2 ≈ 1.414
    """
    vec = [0.0] * dim
    vec[base_index] = 1.0
    return vec


def make_similar_embedding(
    base_index: int = 0,
    noise_index: int = 1,
    similarity: float = 0.9,
    dim: int = EMBEDDING_DIMENSION,
) -> list[float]:
    """Create a vector similar to make_embedding(base_index) but slightly different.

    L2 distance from the base vector is smaller than from a completely
    orthogonal vector, so sqlite-vec ranks it closer.
    """
    vec = [0.0] * dim
    vec[base_index] = similarity
    vec[noise_index] = 1.0 - similarity
    return _normalize(vec)


def _pack_embedding(vec: list[float]) -> bytes:
    """Pack a float list to binary blob for sqlite-vec insertion."""
    return struct.pack(f"{len(vec)}f", *vec)


async def _open(db_path: str) -> aiosqlite.Connection:
    """Open a connection with sqlite-vec loaded (for test assertions)."""
    db = await aiosqlite.connect(db_path)
    await db.enable_load_extension(True)
    await db.load_extension(sqlite_vec.loadable_path())
    await db.enable_load_extension(False)
    return db


async def insert_paper_with_embedding(
    db_path: str,
    arxiv_id: str,
    title: str,
    categories: list[str],
    embedding: list[float],
    published_at: int = 1704067200,
    abstract: str = "Test abstract.",
) -> int:
    """Insert a paper + embedding + paper_embeddings link. Returns paper_id."""
    db = await _open(db_path)
    try:
        cursor = await db.execute(
            """INSERT INTO papers
               (arxiv_id, title, abstract, authors, categories, published_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                arxiv_id,
                title,
                abstract,
                json.dumps(["Author A"]),
                json.dumps(categories),
                published_at,
                published_at,
            ),
        )
        paper_id: int = cursor.lastrowid  # type: ignore[assignment]

        # Insert embedding into vec0 virtual table
        await db.execute(
            "INSERT INTO embeddings (id, embedding) VALUES (?, ?)",
            [paper_id, _pack_embedding(embedding)],
        )

        # Link paper to embedding
        await db.execute(
            "INSERT INTO paper_embeddings (paper_id, embedding_id) VALUES (?, ?)",
            [paper_id, paper_id],
        )
        await db.commit()
        return paper_id
    finally:
        await db.close()


async def add_to_reading_list(
    db_path: str,
    paper_id: int,
    user_id: int | None = None,
    anonymous_id: str | None = None,
) -> None:
    """Add a paper to a user's reading list."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO reading_list (user_id, anonymous_id, paper_id) VALUES (?, ?, ?)",
            [user_id, anonymous_id, paper_id],
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_path(tmp_path) -> str:
    """File-backed DB with full schema + sqlite-vec, returns path string."""
    path = str(tmp_path / "test.db")
    conn = await init_db(path)
    conn.close()
    return path


# ===========================================================================
# TestRecommendFromHistory
# ===========================================================================


class TestRecommendFromHistory:
    """Tests for similarity-based recommendations from reading history."""

    @pytest.mark.asyncio
    async def test_returns_similar_papers(self, db_path):
        """User reads an AI paper → engine recommends other AI papers over physics."""
        # Paper the user has read: "AI" topic (unit vector at index 0)
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "AI Paper", ["cs.AI"], make_embedding(0)
        )

        # Similar paper (close to AI in embedding space)
        await insert_paper_with_embedding(
            db_path,
            "2401.00002",
            "Similar AI Paper",
            ["cs.AI"],
            make_similar_embedding(0, 1, 0.95),
            published_at=1704067300,
        )

        # Dissimilar paper (orthogonal: physics topic at index 2)
        await insert_paper_with_embedding(
            db_path,
            "2401.00003",
            "Physics Paper",
            ["physics.hep"],
            make_embedding(2),
            published_at=1704067400,
        )

        await add_to_reading_list(db_path, read_id, user_id=1)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=2)

        # Should return both unread papers, with AI paper ranked first
        assert len(results) >= 1
        assert results[0].arxiv_id == "2401.00002"

    @pytest.mark.asyncio
    async def test_excludes_already_read_papers(self, db_path):
        """Already-read papers must not appear in recommendations."""
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "Read Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00002", "Unread Paper", ["cs.AI"], make_embedding(0)
        )

        await add_to_reading_list(db_path, read_id, user_id=1)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=10)

        result_ids = {p.arxiv_id for p in results}
        assert "2401.00001" not in result_ids
        assert "2401.00002" in result_ids

    @pytest.mark.asyncio
    async def test_category_filter(self, db_path):
        """Category filtering narrows results to matching categories."""
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "Read Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00002", "AI Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00003", "ML Paper", ["cs.LG"], make_embedding(0)
        )

        await add_to_reading_list(db_path, read_id, user_id=1)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, categories=["cs.AI"], limit=10)

        result_ids = {p.arxiv_id for p in results}
        assert "2401.00002" in result_ids
        assert "2401.00003" not in result_ids

    @pytest.mark.asyncio
    async def test_anonymous_user(self, db_path):
        """Anonymous users (via cookie UUID) get recommendations too."""
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "Read Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00002", "Rec Paper", ["cs.AI"], make_embedding(0)
        )

        anon_id = "anon-uuid-12345"
        await add_to_reading_list(db_path, read_id, anonymous_id=anon_id)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(anonymous_id=anon_id, limit=10)

        assert len(results) >= 1
        assert results[0].arxiv_id == "2401.00002"

    @pytest.mark.asyncio
    async def test_limit_respected(self, db_path):
        """Engine returns at most `limit` papers."""
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "Read", ["cs.AI"], make_embedding(0)
        )
        # Insert 5 candidate papers
        for i in range(2, 7):
            await insert_paper_with_embedding(
                db_path,
                f"2401.0000{i}",
                f"Paper {i}",
                ["cs.AI"],
                make_embedding(0),
            )

        await add_to_reading_list(db_path, read_id, user_id=1)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=3)

        assert len(results) <= 3

    @pytest.mark.asyncio
    async def test_multiple_read_papers_build_profile(self, db_path):
        """Profile averages embeddings from multiple read papers."""
        # User reads both AI and ML papers → profile is between them
        ai_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "AI Paper", ["cs.AI"], make_embedding(0)
        )
        ml_id = await insert_paper_with_embedding(
            db_path, "2401.00002", "ML Paper", ["cs.LG"], make_embedding(1)
        )

        # Candidate closer to index 0 (AI)
        await insert_paper_with_embedding(
            db_path,
            "2401.00003",
            "AI-like Paper",
            ["cs.AI"],
            make_similar_embedding(0, 1, 0.95),
        )
        # Candidate closer to index 1 (ML)
        await insert_paper_with_embedding(
            db_path,
            "2401.00004",
            "ML-like Paper",
            ["cs.LG"],
            make_similar_embedding(1, 0, 0.95),
        )
        # Candidate far away (physics)
        await insert_paper_with_embedding(
            db_path,
            "2401.00005",
            "Physics Paper",
            ["physics.hep"],
            make_embedding(5),
        )

        await add_to_reading_list(db_path, ai_id, user_id=1)
        await add_to_reading_list(db_path, ml_id, user_id=1)

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=3)

        result_ids = [p.arxiv_id for p in results]
        # AI-like and ML-like should be returned before physics
        assert "2401.00005" not in result_ids[:2] or len(results) <= 2
        # Both AI-like and ML-like should appear
        assert "2401.00003" in result_ids
        assert "2401.00004" in result_ids


# ===========================================================================
# TestFallback
# ===========================================================================


class TestFallback:
    """Tests for fallback behavior (no reading history)."""

    @pytest.mark.asyncio
    async def test_no_history_returns_recent_papers(self, db_path):
        """When user has no reading history, returns recent papers."""
        await insert_paper_with_embedding(
            db_path,
            "2401.00001",
            "Old Paper",
            ["cs.AI"],
            make_embedding(0),
            published_at=1000000000,
        )
        await insert_paper_with_embedding(
            db_path,
            "2401.00002",
            "New Paper",
            ["cs.AI"],
            make_embedding(1),
            published_at=1704067200,
        )

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=10)

        assert len(results) == 2
        # Newest first
        assert results[0].arxiv_id == "2401.00002"
        assert results[1].arxiv_id == "2401.00001"

    @pytest.mark.asyncio
    async def test_no_user_returns_recent_papers(self, db_path):
        """When no user_id or anonymous_id is provided, returns recent papers."""
        await insert_paper_with_embedding(
            db_path,
            "2401.00001",
            "Paper A",
            ["cs.AI"],
            make_embedding(0),
            published_at=1704067200,
        )

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(limit=10)

        assert len(results) == 1
        assert results[0].arxiv_id == "2401.00001"

    @pytest.mark.asyncio
    async def test_fallback_respects_categories(self, db_path):
        """Fallback path also respects category filtering."""
        await insert_paper_with_embedding(
            db_path, "2401.00001", "AI Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00002", "Physics Paper", ["physics.hep"], make_embedding(1)
        )

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(categories=["cs.AI"], limit=10)

        assert len(results) == 1
        assert results[0].arxiv_id == "2401.00001"

    @pytest.mark.asyncio
    async def test_empty_db_returns_empty_list(self, db_path):
        """Empty database returns an empty list, no errors."""
        engine = RecommendationEngine(db_path)
        results = await engine.recommend(user_id=1, limit=10)

        assert results == []

    @pytest.mark.asyncio
    async def test_fallback_respects_limit(self, db_path):
        """Fallback path also respects the limit parameter."""
        for i in range(5):
            await insert_paper_with_embedding(
                db_path,
                f"2401.0000{i}",
                f"Paper {i}",
                ["cs.AI"],
                make_embedding(0),
                published_at=1704067200 + i,
            )

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(limit=2)

        assert len(results) == 2


# ===========================================================================
# TestPaperMetadata
# ===========================================================================


class TestPaperMetadata:
    """Tests that returned Paper objects have correct metadata."""

    @pytest.mark.asyncio
    async def test_paper_fields_populated(self, db_path):
        """Returned Paper dataclass has all expected fields from DB."""
        await insert_paper_with_embedding(
            db_path,
            "2401.12345",
            "Test Title",
            ["cs.AI", "cs.LG"],
            make_embedding(0),
            published_at=1704067200,
            abstract="Detailed test abstract.",
        )

        engine = RecommendationEngine(db_path)
        results = await engine.recommend(limit=1)

        assert len(results) == 1
        paper = results[0]
        assert paper.arxiv_id == "2401.12345"
        assert paper.title == "Test Title"
        assert paper.abstract == "Detailed test abstract."
        assert paper.authors == ["Author A"]
        assert paper.categories == ["cs.AI", "cs.LG"]
        assert paper.published_at == 1704067200
        assert paper.pdf_url == "https://arxiv.org/pdf/2401.12345"


# ===========================================================================
# TestModuleLevelFunction
# ===========================================================================


class TestModuleLevelFunction:
    """Tests for the module-level recommend() convenience function."""

    @pytest.mark.asyncio
    async def test_convenience_function_works(self, db_path):
        """Module-level recommend() delegates to RecommendationEngine."""
        await insert_paper_with_embedding(
            db_path, "2401.00001", "Paper A", ["cs.AI"], make_embedding(0)
        )

        results = await recommend(db_path, limit=10)

        assert len(results) == 1
        assert results[0].arxiv_id == "2401.00001"

    @pytest.mark.asyncio
    async def test_convenience_function_with_user(self, db_path):
        """Module-level recommend() forwards user_id correctly."""
        read_id = await insert_paper_with_embedding(
            db_path, "2401.00001", "Read Paper", ["cs.AI"], make_embedding(0)
        )
        await insert_paper_with_embedding(
            db_path, "2401.00002", "Rec Paper", ["cs.AI"], make_embedding(0)
        )

        await add_to_reading_list(db_path, read_id, user_id=1)

        results = await recommend(db_path, user_id=1, limit=10)

        result_ids = {p.arxiv_id for p in results}
        assert "2401.00001" not in result_ids
        assert "2401.00002" in result_ids


# ===========================================================================
# TestNormalize
# ===========================================================================


class TestNormalize:
    """Tests for the _normalize utility function."""

    def test_unit_vector_unchanged(self):
        """Already-normalized vector stays the same."""
        vec = [1.0] + [0.0] * 1023
        result = _normalize(vec)
        assert abs(result[0] - 1.0) < 1e-6
        assert all(abs(v) < 1e-6 for v in result[1:])

    def test_zero_vector_unchanged(self):
        """Zero vector is returned as-is (avoid division by zero)."""
        vec = [0.0] * 1024
        result = _normalize(vec)
        assert result == vec

    def test_scaling(self):
        """Non-unit vector is scaled to unit length."""
        vec = [3.0, 4.0] + [0.0] * 1022
        result = _normalize(vec)
        assert abs(result[0] - 0.6) < 1e-6
        assert abs(result[1] - 0.8) < 1e-6
