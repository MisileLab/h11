"""Background paper ingestion with citation-based filtering."""

import asyncio
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import Settings
from app.http_client import HTTPClient
from app.services.arxiv import ArxivClient, Paper
from app.services.embedding import EmbeddingService
from app.services.ingestion import _filter_new_papers, _open_db, _store_paper
from app.services.semantic_scholar import SemanticScholarClient

logger = logging.getLogger(__name__)


class BackgroundIngestionService:
    def __init__(
        self,
        settings: Settings,
        arxiv_client: ArxivClient,
        embedding_service: EmbeddingService,
        semantic_scholar: SemanticScholarClient,
        db_path: str,
    ):
        self.settings = settings
        self.arxiv = arxiv_client
        self.embedding = embedding_service
        self.semantic_scholar = semantic_scholar
        self.db_path = db_path

        self._scheduler: AsyncIOScheduler | None = None
        self._running = False
        self._last_run: datetime | None = None

    @property
    def running(self) -> bool:
        return self._running

    @property
    def last_run(self) -> datetime | None:
        return self._last_run

    def _get_categories(self) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for cat in self.settings.ingestion_categories.split(","):
            cat = cat.strip()
            if cat and cat not in seen:
                seen.add(cat)
                result.append(cat)
        return result

    async def run_ingestion_cycle(self) -> None:
        if self._running:
            logger.warning("Ingestion cycle already running, skipping")
            return

        self._running = True
        categories = self._get_categories()
        threshold = self.settings.ingestion_citation_threshold
        max_per_cat = self.settings.ingestion_max_papers_per_category
        total_ingested = 0

        logger.info(
            "Starting ingestion cycle: %d categories, threshold=%d, max_per_cat=%d",
            len(categories),
            threshold,
            max_per_cat,
        )

        try:
            for category in categories:
                try:
                    ingested = await self._ingest_category(
                        category, threshold, max_per_cat
                    )
                    total_ingested += ingested
                except Exception:
                    logger.exception("Failed to ingest category %s", category)

            self._last_run = datetime.now()
            logger.info(
                "Ingestion cycle complete: %d papers ingested across %d categories",
                total_ingested,
                len(categories),
            )
        finally:
            self._running = False

    async def _ingest_category(
        self, category: str, threshold: int, max_results: int
    ) -> int:
        # 1. Search arXiv for this category
        papers: list[Paper] = await self.arxiv.search(
            query="", categories=[category], max_results=max_results
        )
        if not papers:
            logger.info("No papers found for category %s", category)
            return 0

        # 2. Filter out already-ingested papers
        async with _open_db(self.db_path) as db:
            new_papers = await _filter_new_papers(db, papers)

        if not new_papers:
            logger.info("No new papers for category %s", category)
            return 0

        logger.info(
            "Category %s: %d papers found, %d new",
            category,
            len(papers),
            len(new_papers),
        )

        # 3. Get citation counts from Semantic Scholar
        arxiv_ids = [p.arxiv_id for p in new_papers]
        citation_counts = await self.semantic_scholar.get_citation_counts(arxiv_ids)

        # 4. Filter by citation threshold
        high_citation_papers = [
            p for p in new_papers if citation_counts.get(p.arxiv_id, 0) >= threshold
        ]

        if not high_citation_papers:
            logger.info(
                "Category %s: no papers above citation threshold %d",
                category,
                threshold,
            )
            return 0

        logger.info(
            "Category %s: %d papers above citation threshold %d",
            category,
            len(high_citation_papers),
            threshold,
        )

        # 5. Embed and store each paper
        ingested = 0
        for paper in high_citation_papers:
            try:
                text = f"{paper.title} {paper.abstract}"
                embedding = await self.embedding.embed(text)

                async with _open_db(self.db_path) as db:
                    await _store_paper(db, paper, embedding)

                ingested += 1
                logger.info("Ingested: %s - %s", paper.arxiv_id, paper.title[:60])
            except Exception:
                logger.warning(
                    "Failed to ingest paper %s", paper.arxiv_id, exc_info=True
                )

        return ingested

    def start_scheduler(self) -> None:
        if self._scheduler is not None:
            logger.warning("Scheduler already started")
            return

        self._scheduler = AsyncIOScheduler()
        self._scheduler.add_job(
            self.run_ingestion_cycle,
            "interval",
            hours=self.settings.ingestion_interval_hours,
            id="background_ingestion",
            name="Background paper ingestion",
        )
        self._scheduler.start()
        logger.info(
            "Background ingestion scheduler started (interval=%dh)",
            self.settings.ingestion_interval_hours,
        )

    def stop_scheduler(self) -> None:
        if self._scheduler is None:
            return

        self._scheduler.shutdown(wait=False)
        self._scheduler = None
        logger.info("Background ingestion scheduler stopped")
