"""
Search endpoint for arXiv papers.

GET /api/search?q={query}&categories={cat1,cat2}&limit=20

Returns a list of Paper objects with cached summary data (if available).
Triggers background ingestion for new search results without blocking the response.

CRITICAL BEHAVIOR:
- Request path: Query ONLY cached arXiv results (no real-time API calls)
- Background task: Trigger async refresh of cache (non-blocking)
- Summary: Include cached summary if available in DB
"""

import asyncio
import logging
import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.db import get_db_connection
from app.services.arxiv import ArxivClient, Paper
from app.services.ingestion import ingest_papers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


class PaperWithSummary(BaseModel):
    """Paper with optional cached summary."""

    arxiv_id: str = Field(description="Unique arXiv identifier")
    title: str = Field(description="Paper title")
    abstract: str = Field(description="Paper abstract")
    authors: list[str] = Field(description="List of author names")
    published_at: int = Field(description="Unix timestamp of publication")
    updated_at: int = Field(description="Unix timestamp of last update")
    categories: list[str] = Field(description="List of arXiv categories")
    pdf_url: str = Field(description="URL to PDF on arXiv")
    summary: Optional[str] = Field(
        default=None, description="LLM-generated summary if cached, null otherwise"
    )


class SearchResponse(BaseModel):
    """Search response with paper list and summary data."""

    papers: list[PaperWithSummary] = Field(
        description="List of papers with optional summaries"
    )
    query: str = Field(description="Original search query")
    categories: Optional[list[str]] = Field(
        default=None, description="Categories used for filtering"
    )
    count: int = Field(description="Number of papers returned")

    model_config = {
        "json_schema_extra": {
            "example": {
                "papers": [
                    {
                        "arxiv_id": "2401.12345",
                        "title": "Sample Paper Title",
                        "abstract": "Paper abstract...",
                        "authors": ["Author One", "Author Two"],
                        "published_at": 1704067200,
                        "updated_at": 1704067200,
                        "categories": ["cs.AI", "stat.ML"],
                        "pdf_url": "http://arxiv.org/pdf/2401.12345.pdf",
                        "summary": "This paper presents a novel approach to neural networks...",
                    }
                ],
                "query": "machine learning",
                "categories": ["cs.AI"],
                "count": 1,
            }
        }
    }


def _get_cached_papers(
    db_conn: sqlite3.Connection,
    query: str,
    categories: Optional[list[str]],
    limit: int,
) -> list[PaperWithSummary]:
    """
    Query papers from local cache with optional summaries.

    This function serves ONLY cached data; it does NOT call arXiv API.

    Args:
        db_conn: SQLite database connection
        query: Search query to filter papers by keyword in title/abstract
        categories: Optional list of categories to filter by (any match)
        limit: Maximum papers to return

    Returns:
        List of PaperWithSummary objects with cached summaries (if available)
    """
    try:
        cursor = db_conn.cursor()

        # Build query with keyword and category filtering
        # Note: pdf_url is NOT in the schema; derived from arxiv_id in Python
        query_param = f"%{query}%"

        if categories:
            # Filter by both query keyword (title/abstract) and ANY matching category
            # Build OR clause: p.categories LIKE ?1 OR p.categories LIKE ?2 OR ...
            category_conditions = " OR ".join(["p.categories LIKE ?"] * len(categories))
            category_params = [f"%{cat}%" for cat in categories]

            cursor.execute(
                f"""
                SELECT
                    p.arxiv_id,
                    p.title,
                    p.abstract,
                    p.authors,
                    p.categories,
                    p.published_at,
                    p.updated_at,
                    s.summary
                FROM papers p
                LEFT JOIN summary_cache s ON s.paper_id = p.arxiv_id
                WHERE (p.title LIKE ? OR p.abstract LIKE ?)
                  AND ({category_conditions})
                ORDER BY p.published_at DESC
                LIMIT ?
                """,
                (query_param, query_param, *category_params, limit),
            )
        else:
            # Filter by query keyword only (title/abstract)
            cursor.execute(
                """
                SELECT
                    p.arxiv_id,
                    p.title,
                    p.abstract,
                    p.authors,
                    p.categories,
                    p.published_at,
                    p.updated_at,
                    s.summary
                FROM papers p
                LEFT JOIN summary_cache s ON s.paper_id = p.arxiv_id
                WHERE (p.title LIKE ? OR p.abstract LIKE ?)
                ORDER BY p.published_at DESC
                LIMIT ?
                """,
                (query_param, query_param, limit),
            )

        rows = cursor.fetchall()
        papers = []

        for row in rows:
            (
                arxiv_id,
                title,
                abstract,
                authors_json,
                categories_json,
                published_at,
                updated_at,
                summary,
            ) = row

            # Parse JSON fields
            import json

            try:
                authors = json.loads(authors_json) if authors_json else []
                cats = json.loads(categories_json) if categories_json else []
            except json.JSONDecodeError:
                authors = []
                cats = []

            # Derive pdf_url from arxiv_id (standard arXiv URL format)
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

            papers.append(
                PaperWithSummary(
                    arxiv_id=arxiv_id,
                    title=title,
                    abstract=abstract,
                    authors=authors,
                    categories=cats,
                    published_at=published_at,
                    updated_at=updated_at,
                    pdf_url=pdf_url,
                    summary=summary,  # Cached summary if available, else None
                )
            )

        return papers

    except sqlite3.Error as e:
        logger.error(f"Database error querying cached papers: {e}")
        return []


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query (required)"),
    categories: Optional[str] = Query(
        None, description="Comma-separated list of arXiv categories (e.g., cs.AI,cs.LG)"
    ),
    limit: int = Query(
        20, ge=1, le=100, description="Maximum number of papers to return"
    ),
) -> SearchResponse:
    """
    Search for arXiv papers by keyword with optional category filtering.

    **Request path behavior (CACHE-FIRST, NO REAL-TIME API CALLS):**
    1. Query cached arXiv results from local database
    2. Apply category filter if specified
    3. Return immediately with cached papers + summaries (if cached)

    **Background refresh (NON-BLOCKING):**
    - Async task triggered to refresh cache with new results
    - Does not block HTTP response
    - Allows next request to see fresh data

    Args:
        q: Search query string
        categories: Optional comma-separated list of arXiv categories
        limit: Maximum results (1-100, default 20)

    Returns:
        SearchResponse with paper list, summaries (if cached), and metadata

    Raises:
        HTTPException: If database errors occur
    """
    # Parse categories from comma-separated string
    category_list = None
    if categories:
        category_list = [cat.strip() for cat in categories.split(",") if cat.strip()]

    # Get database connection using only DATABASE_URL env var (or safe default)
    # This avoids requiring full settings validation for cache-only reads
    database_url = os.environ.get("DATABASE_URL", "sqlite:///./arxgorithm.db")
    db_conn = get_db_connection(database_url)
    db_path = _extract_db_path(database_url)

    try:
        # CACHE-FIRST: Query papers from local arXiv cache
        papers_with_summaries = _get_cached_papers(
            db_conn=db_conn,
            query=q,
            categories=category_list,
            limit=limit,
        )

        # BACKGROUND REFRESH: Trigger async ingestion to update cache
        # This does NOT block the response
        _trigger_background_refresh(
            db_path=db_path,
            query=q,
            categories=category_list,
            limit=limit,
        )

        # Return cached papers with summaries (if cached)
        return SearchResponse(
            papers=papers_with_summaries,
            query=q,
            categories=category_list,
            count=len(papers_with_summaries),
        )

    finally:
        db_conn.close()


def _trigger_background_refresh(
    db_path: str,
    query: str,
    categories: Optional[list[str]],
    limit: int,
) -> None:
    """
    Trigger background cache refresh without blocking response.

    This function wraps the background task creation with proper error handling
    to avoid unawaited coroutine warnings.

    Args:
        db_path: Path to SQLite database file
        query: Search query
        categories: Optional list of categories
        limit: Maximum results to ingest
    """
    try:
        from app.config import get_settings
        from app.services.embedding import EmbeddingService
        from app.http_client import HTTPClient

        # Load full settings only for background refresh (best-effort)
        settings = get_settings()

        # Create a fresh database connection for the background task
        database_url = os.environ.get("DATABASE_URL", "sqlite:///./arxgorithm.db")
        bg_db_conn = get_db_connection(database_url)

        arxiv_client = ArxivClient(
            db_connection=bg_db_conn,
            delay_seconds=settings.arxiv_rate_limit,
        )
        http_client = HTTPClient()
        embedding_service = EmbeddingService(
            settings=settings,
            db_path=db_path,
            http_client=http_client,
        )

        # Create background task - properly wrapped to avoid unawaited warnings
        task = asyncio.create_task(
            ingest_papers(
                arxiv_client=arxiv_client,
                embedding_service=embedding_service,
                db_path=db_path,
                query=query,
                categories=categories,
                max_results=limit,
            )
        )
        # Add a callback to log any errors from the background task
        task.add_done_callback(
            lambda t: (
                logger.warning(f"Background refresh failed: {t.exception()}")
                if t.exception()
                else None
            )
        )
    except Exception as e:
        # Background refresh is optional; log warning and continue
        logger.warning(f"Failed to start background cache refresh: {e}")


def _extract_db_path(database_url: str) -> str:
    """
    Extract file path from SQLite database URL.

    Args:
        database_url: Database URL (e.g., 'sqlite:///./arxgorithm.db')

    Returns:
        File path for the database
    """
    # Handle sqlite:/// format
    if database_url.startswith("sqlite:///"):
        return database_url[10:]  # Remove 'sqlite:///' prefix
    elif database_url.startswith("sqlite://"):
        return database_url[9:]  # Remove 'sqlite://' prefix
    return database_url
