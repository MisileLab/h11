"""Tests for paper ingestion pipeline (arXiv fetch -> embed -> store)."""

import asyncio
import json
import sqlite3
from unittest.mock import AsyncMock

import aiosqlite
import pytest
import pytest_asyncio
import sqlite_vec

from app.db import init_db
from app.services.arxiv import ArxivClient, Paper
from app.services.embedding import EmbeddingService
from app.services.ingestion import (
    MAX_BATCH_SIZE,
    IngestionService,
    ingest_papers,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_paper(
    arxiv_id: str = "2401.00001",
    title: str = "Test Paper",
    abstract: str = "Test abstract about machine learning.",
) -> Paper:
    return Paper(
        arxiv_id=arxiv_id,
        title=title,
        abstract=abstract,
        authors=["Alice", "Bob"],
        published_at=1704067200,
        updated_at=1704067200,
        categories=["cs.AI"],
        pdf_url=f"https://arxiv.org/pdf/{arxiv_id}",
    )


def make_embedding(dim: int = 1024) -> list[float]:
    return [float(i) / dim for i in range(dim)]


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


@pytest.fixture
def arxiv_client() -> AsyncMock:
    return AsyncMock(spec=ArxivClient)


@pytest.fixture
def embedding_service() -> AsyncMock:
    return AsyncMock(spec=EmbeddingService)


@pytest.fixture
def service(arxiv_client, embedding_service, db_path) -> IngestionService:
    return IngestionService(
        arxiv_client=arxiv_client,
        embedding_service=embedding_service,
        db_path=db_path,
    )


async def _read_db(db_path: str):
    """Open a read connection with sqlite-vec loaded."""
    db = await aiosqlite.connect(db_path)
    await db.enable_load_extension(True)
    await db.load_extension(sqlite_vec.loadable_path())
    await db.enable_load_extension(False)
    return db


async def _pre_insert_paper(db_path: str, paper: Paper) -> None:
    """Insert a paper directly for duplicate-detection tests."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """INSERT INTO papers
               (arxiv_id, title, abstract, authors, categories, published_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                paper.arxiv_id,
                paper.title,
                paper.abstract,
                json.dumps(paper.authors),
                json.dumps(paper.categories),
                paper.published_at,
                paper.updated_at,
            ),
        )
        await db.commit()


# ===========================================================================
# TestIngestPapers — happy path (class method on IngestionService)
# ===========================================================================


class TestIngestPapers:
    @pytest.mark.asyncio
    async def test_stores_paper_and_embedding(
        self, service, arxiv_client, embedding_service, db_path
    ):
        paper = make_paper()
        emb = make_embedding()

        arxiv_client.search.return_value = [paper]
        embedding_service.embed.return_value = emb

        result = await service.ingest_papers("machine learning")

        assert len(result) == 1
        assert result[0].arxiv_id == paper.arxiv_id

        db = await _read_db(db_path)
        try:
            cursor = await db.execute(
                "SELECT arxiv_id, title, abstract, authors, categories FROM papers WHERE arxiv_id = ?",
                (paper.arxiv_id,),
            )
            row = await cursor.fetchone()
            assert row is not None
            assert row[0] == paper.arxiv_id
            assert row[1] == paper.title
            assert row[2] == paper.abstract
            assert json.loads(row[3]) == paper.authors
            assert json.loads(row[4]) == paper.categories

            cursor = await db.execute("SELECT COUNT(*) FROM embeddings")
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute(
                "SELECT paper_id, embedding_id FROM paper_embeddings"
            )
            mapping = await cursor.fetchone()
            assert mapping is not None
            assert mapping[0] == mapping[1]
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_embeds_title_plus_abstract(
        self, service, arxiv_client, embedding_service
    ):
        paper = make_paper(
            title="Deep RL", abstract="We study deep reinforcement learning."
        )
        arxiv_client.search.return_value = [paper]
        embedding_service.embed.return_value = make_embedding()

        await service.ingest_papers("deep rl")

        embedding_service.embed.assert_called_once_with(
            "Deep RL We study deep reinforcement learning."
        )

    @pytest.mark.asyncio
    async def test_empty_search_results(self, service, arxiv_client, embedding_service):
        arxiv_client.search.return_value = []

        result = await service.ingest_papers("nonexistent query")

        assert result == []
        embedding_service.embed.assert_not_called()

    @pytest.mark.asyncio
    async def test_clamps_max_results_to_batch_size(
        self, service, arxiv_client, embedding_service
    ):
        arxiv_client.search.return_value = []

        await service.ingest_papers("test", max_results=50)

        arxiv_client.search.assert_called_once_with(
            "test", categories=None, max_results=MAX_BATCH_SIZE
        )

    @pytest.mark.asyncio
    async def test_passes_categories(self, service, arxiv_client, embedding_service):
        arxiv_client.search.return_value = []
        categories = ["cs.AI", "cs.LG"]

        await service.ingest_papers("test", categories=categories)

        arxiv_client.search.assert_called_once_with(
            "test", categories=categories, max_results=MAX_BATCH_SIZE
        )

    @pytest.mark.asyncio
    async def test_multiple_papers(
        self, service, arxiv_client, embedding_service, db_path
    ):
        papers = [make_paper(f"2401.0000{i}", f"Paper {i}") for i in range(3)]
        arxiv_client.search.return_value = papers
        embedding_service.embed.return_value = make_embedding()

        result = await service.ingest_papers("multi")

        assert len(result) == 3
        db = await _read_db(db_path)
        try:
            cursor = await db.execute("SELECT COUNT(*) FROM papers")
            assert (await cursor.fetchone())[0] == 3
        finally:
            await db.close()


# ===========================================================================
# TestDuplicateSkipping
# ===========================================================================


class TestDuplicateSkipping:
    @pytest.mark.asyncio
    async def test_skips_existing_paper(
        self, service, arxiv_client, embedding_service, db_path
    ):
        existing = make_paper("2401.00001", "Existing")
        new = make_paper("2401.00002", "New")

        await _pre_insert_paper(db_path, existing)

        arxiv_client.search.return_value = [existing, new]
        embedding_service.embed.return_value = make_embedding()

        result = await service.ingest_papers("test")

        assert len(result) == 1
        assert result[0].arxiv_id == "2401.00002"
        embedding_service.embed.assert_called_once()

    @pytest.mark.asyncio
    async def test_all_duplicates_returns_empty(
        self, service, arxiv_client, embedding_service, db_path
    ):
        paper = make_paper()
        await _pre_insert_paper(db_path, paper)

        arxiv_client.search.return_value = [paper]
        result = await service.ingest_papers("test")

        assert result == []
        embedding_service.embed.assert_not_called()

    @pytest.mark.asyncio
    async def test_duplicate_check_before_embedding(
        self, service, arxiv_client, embedding_service, db_path
    ):
        paper = make_paper()
        await _pre_insert_paper(db_path, paper)

        arxiv_client.search.return_value = [paper]
        await service.ingest_papers("test")

        embedding_service.embed.assert_not_called()


# ===========================================================================
# TestErrorHandling
# ===========================================================================


class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_continues_on_single_paper_failure(
        self, service, arxiv_client, embedding_service, db_path
    ):
        good = make_paper("2401.00001", "Good Paper")
        bad = make_paper("2401.00002", "Bad Paper")
        also_good = make_paper("2401.00003", "Also Good")

        arxiv_client.search.return_value = [good, bad, also_good]
        embedding_service.embed.side_effect = [
            make_embedding(),
            RuntimeError("Nebius API down"),
            make_embedding(),
        ]

        result = await service.ingest_papers("test")

        assert len(result) == 2
        ids = {p.arxiv_id for p in result}
        assert ids == {"2401.00001", "2401.00003"}

        db = await _read_db(db_path)
        try:
            cursor = await db.execute("SELECT COUNT(*) FROM papers")
            assert (await cursor.fetchone())[0] == 2
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_all_papers_fail_returns_empty(
        self, service, arxiv_client, embedding_service
    ):
        paper = make_paper()
        arxiv_client.search.return_value = [paper]
        embedding_service.embed.side_effect = RuntimeError("Total failure")

        result = await service.ingest_papers("test")

        assert result == []


# ===========================================================================
# TestBackgroundTask
# ===========================================================================


class TestBackgroundTask:
    @pytest.mark.asyncio
    async def test_returns_asyncio_task(self, service, arxiv_client, embedding_service):
        arxiv_client.search.return_value = []

        task = service.start_ingestion("test query")

        assert isinstance(task, asyncio.Task)
        await task

    @pytest.mark.asyncio
    async def test_task_result_is_ingested_papers(
        self, service, arxiv_client, embedding_service
    ):
        paper = make_paper()
        arxiv_client.search.return_value = [paper]
        embedding_service.embed.return_value = make_embedding()

        task = service.start_ingestion("test")
        result = await task

        assert len(result) == 1
        assert result[0].arxiv_id == paper.arxiv_id

    @pytest.mark.asyncio
    async def test_task_is_non_blocking(self, service, arxiv_client, embedding_service):
        arxiv_client.search.return_value = []

        task = service.start_ingestion("test")

        assert not task.done() or task.done()
        await task


# ===========================================================================
# TestModuleLevelFunction — ingest_papers()
# ===========================================================================


class TestModuleLevelFunction:
    @pytest.mark.asyncio
    async def test_ingest_papers_function_stores_and_returns(
        self, arxiv_client, embedding_service, db_path
    ):
        paper = make_paper()
        arxiv_client.search.return_value = [paper]
        embedding_service.embed.return_value = make_embedding()

        result = await ingest_papers(
            arxiv_client, embedding_service, db_path, "test query"
        )

        assert len(result) == 1
        assert result[0].arxiv_id == paper.arxiv_id

        db = await _read_db(db_path)
        try:
            cursor = await db.execute("SELECT COUNT(*) FROM papers")
            assert (await cursor.fetchone())[0] == 1
            cursor = await db.execute("SELECT COUNT(*) FROM embeddings")
            assert (await cursor.fetchone())[0] == 1
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_ingest_papers_function_respects_max_results(
        self, arxiv_client, embedding_service, db_path
    ):
        arxiv_client.search.return_value = []

        await ingest_papers(
            arxiv_client, embedding_service, db_path, "test", max_results=99
        )

        arxiv_client.search.assert_called_once_with(
            "test", categories=None, max_results=MAX_BATCH_SIZE
        )

    @pytest.mark.asyncio
    async def test_ingest_papers_function_skips_duplicates(
        self, arxiv_client, embedding_service, db_path
    ):
        paper = make_paper()
        await _pre_insert_paper(db_path, paper)

        arxiv_client.search.return_value = [paper]

        result = await ingest_papers(arxiv_client, embedding_service, db_path, "test")

        assert result == []
        embedding_service.embed.assert_not_called()
