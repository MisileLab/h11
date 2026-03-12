"""
Paper ingestion pipeline: arXiv fetch -> embedding generation -> storage.

Orchestrates the full ingestion flow as an async background task:
1. Search arXiv for papers matching a query
2. Filter out already-ingested papers (duplicate detection)
3. Generate embeddings for new papers via Nebius API
4. Store paper metadata, embedding vectors, and mappings in SQLite

Batch size is capped at MAX_BATCH_SIZE (10) per ingestion run.
"""

import asyncio
import json
import logging
import struct
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

import aiosqlite
import sqlite_vec

from app.services.arxiv import ArxivClient, Paper
from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)

MAX_BATCH_SIZE = 10


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


class IngestionService:
    """
    Orchestrates paper ingestion from arXiv into the local database.

    Pipeline: arXiv search -> duplicate filter -> embedding generation -> DB storage.
    Designed to run as an async background task via asyncio.create_task.
    """

    def __init__(
        self,
        arxiv_client: ArxivClient,
        embedding_service: EmbeddingService,
        db_path: str,
    ):
        """
        Initialize ingestion service.

        Args:
            arxiv_client: ArxivClient for fetching papers from arXiv.
            embedding_service: EmbeddingService for generating text embeddings.
            db_path: Path to SQLite database file (with schema already applied).
        """
        self.arxiv = arxiv_client
        self.embedding = embedding_service
        self.db_path = db_path

    async def ingest_papers(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        max_results: int = 10,
    ) -> list[Paper]:
        """
        Ingest papers from arXiv: search -> filter duplicates -> embed -> store.

        Args:
            query: arXiv search query string.
            categories: Optional arXiv categories to filter by.
            max_results: Maximum papers to process (clamped to MAX_BATCH_SIZE).

        Returns:
            List of newly ingested Paper objects.

        Raises:
            Exception: If arXiv search fails entirely (individual paper
                failures are caught and logged).
        """
        # Clamp batch size
        max_results = min(max_results, MAX_BATCH_SIZE)

        # 1. Fetch papers from arXiv
        logger.info(
            "Searching arXiv: query='%s', categories=%s, max_results=%d",
            query,
            categories,
            max_results,
        )
        papers = await self.arxiv.search(
            query, categories=categories, max_results=max_results
        )

        if not papers:
            logger.info("No papers found for query")
            return []

        # 2. Filter already-ingested papers (before embedding to save API calls)
        async with _open_db(self.db_path) as db:
            new_papers = await _filter_new_papers(db, papers)

        logger.info("Found %d papers, %d are new", len(papers), len(new_papers))

        if not new_papers:
            return []

        # 3. Embed and store each new paper
        ingested: list[Paper] = []
        for paper in new_papers:
            try:
                # Generate embedding from title + abstract
                text = f"{paper.title} {paper.abstract}"
                embedding = await self.embedding.embed(text)

                # Store paper + embedding + mapping atomically
                async with _open_db(self.db_path) as db:
                    await _store_paper(db, paper, embedding)
                ingested.append(paper)
                logger.info(
                    "Ingested paper: %s - %s",
                    paper.arxiv_id,
                    paper.title[:60],
                )
            except Exception as e:
                logger.warning("Failed to ingest paper %s: %s", paper.arxiv_id, e)
                continue

        logger.info(
            "Ingestion complete: %d/%d papers stored",
            len(ingested),
            len(new_papers),
        )
        return ingested

    def start_ingestion(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        max_results: int = 10,
    ) -> asyncio.Task:
        """
        Start paper ingestion as a non-blocking background task.

        Uses asyncio.create_task to avoid blocking the caller.

        Args:
            query: arXiv search query string.
            categories: Optional arXiv categories to filter by.
            max_results: Maximum papers to process (clamped to 10).

        Returns:
            asyncio.Task that can be awaited or cancelled.
        """
        return asyncio.create_task(
            self.ingest_papers(query, categories=categories, max_results=max_results)
        )


async def _filter_new_papers(
    db: aiosqlite.Connection, papers: list[Paper]
) -> list[Paper]:
    """
    Filter out papers that already exist in the database.

    Args:
        db: aiosqlite connection.
        papers: List of Paper objects from arXiv search.

    Returns:
        Subset of papers not yet in the papers table.
    """
    if not papers:
        return []

    arxiv_ids = [p.arxiv_id for p in papers]
    placeholders = ",".join("?" * len(arxiv_ids))
    cursor = await db.execute(
        f"SELECT arxiv_id FROM papers WHERE arxiv_id IN ({placeholders})",
        arxiv_ids,
    )
    rows = await cursor.fetchall()
    existing_ids = {row[0] for row in rows}
    return [p for p in papers if p.arxiv_id not in existing_ids]


async def _store_paper(
    db: aiosqlite.Connection, paper: Paper, embedding: list[float]
) -> None:
    """
    Store paper metadata, embedding vector, and paper-embedding link.

    All three inserts happen in a single transaction.

    Args:
        db: aiosqlite connection.
        paper: Paper metadata to store.
        embedding: 1024-dim float vector for the paper.
    """
    now = int(time.time())

    # Insert paper metadata
    cursor = await db.execute(
        """
        INSERT INTO papers
            (arxiv_id, title, abstract, authors, categories,
             published_at, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            paper.arxiv_id,
            paper.title,
            paper.abstract,
            json.dumps(paper.authors),
            json.dumps(paper.categories),
            paper.published_at,
            paper.updated_at,
            now,
        ),
    )
    paper_id = cursor.lastrowid

    # Insert embedding into sqlite-vec virtual table
    embedding_blob = struct.pack(f"{len(embedding)}f", *embedding)
    await db.execute(
        "INSERT INTO embeddings (id, embedding) VALUES (?, ?)",
        [paper_id, embedding_blob],
    )

    # Link paper to embedding in mapping table
    await db.execute(
        """
        INSERT INTO paper_embeddings (paper_id, embedding_id, created_at)
        VALUES (?, ?, ?)
        """,
        (paper_id, paper_id, now),
    )

    await db.commit()


async def ingest_papers(
    arxiv_client: ArxivClient,
    embedding_service: EmbeddingService,
    db_path: str,
    query: str,
    categories: Optional[list[str]] = None,
    max_results: int = 10,
) -> list[Paper]:
    """
    Module-level convenience function for paper ingestion.

    Orchestrates: arXiv search -> filter new papers -> embed -> store in DB.

    Args:
        arxiv_client: ArxivClient for fetching papers from arXiv.
        embedding_service: EmbeddingService for generating text embeddings.
        db_path: Path to SQLite database file (with schema already applied).
        query: arXiv search query string.
        categories: Optional arXiv categories to filter by.
        max_results: Maximum papers to process (clamped to MAX_BATCH_SIZE).

    Returns:
        List of newly ingested Paper objects.
    """
    service = IngestionService(arxiv_client, embedding_service, db_path)
    return await service.ingest_papers(
        query, categories=categories, max_results=max_results
    )
