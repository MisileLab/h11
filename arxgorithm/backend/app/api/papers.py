"""Papers endpoint for retrieving paper details and triggering summary generation.

Implements:
- GET /api/papers/{arxiv_id} - Retrieve paper detail with cached summary
- POST /api/papers/{arxiv_id}/summarize - Trigger async summary generation

Pattern: Cache-first for detail retrieval, async-only for summary generation.
"""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db import get_db_connection
from app.services.arxiv import ArxivClient, Paper
from app.services.summary import SummaryService

router = APIRouter(prefix="/api", tags=["papers"])


# Response Models
class PaperDetail(BaseModel):
    """Paper with optional cached summary."""

    arxiv_id: str = Field(..., description="arXiv paper ID")
    title: str = Field(..., description="Paper title")
    abstract: str = Field(..., description="Paper abstract")
    authors: list[str] = Field(..., description="List of author names")
    published_at: int = Field(..., description="Unix timestamp of publication")
    updated_at: int = Field(..., description="Unix timestamp of last update")
    categories: list[str] = Field(..., description="arXiv categories")
    pdf_url: str = Field(..., description="URL to PDF on arXiv")
    summary: Optional[str] = Field(
        default=None, description="LLM-generated summary if cached, null otherwise"
    )


class PaperDetailResponse(BaseModel):
    """Response model for paper detail endpoint."""

    paper: PaperDetail


class SummarizeResponse(BaseModel):
    """Response model for summarize endpoint."""

    arxiv_id: str = Field(..., description="arXiv paper ID")
    status: str = Field(..., description="Status of summary generation (queued)")


# Helpers


def _get_cached_paper_with_summary(db_conn, arxiv_id: str) -> Optional[dict]:
    """
    Retrieve paper from DB with cached summary if available.

    Query pattern: LEFT JOIN on summary_cache to get summary if cached.
    pdf_url is computed from arxiv_id using standard arXiv URL format.

    Args:
        db_conn: SQLite connection
        arxiv_id: arXiv paper ID

    Returns:
        Dictionary with paper data + optional summary, or None if paper not found
    """
    cursor = db_conn.execute(
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
        WHERE p.arxiv_id = ?
        LIMIT 1
        """,
        (arxiv_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None

    (
        arxiv_id_ret,
        title,
        abstract,
        authors_json,
        categories_json,
        published_at,
        updated_at,
        summary,
    ) = row

    return {
        "arxiv_id": arxiv_id_ret,
        "title": title,
        "abstract": abstract,
        "authors": json.loads(authors_json),
        "categories": json.loads(categories_json),
        "published_at": published_at,
        "updated_at": updated_at,
        "pdf_url": f"https://arxiv.org/pdf/{arxiv_id_ret}.pdf",
        "summary": summary,
    }


async def _trigger_summary_generation(db_path: str, arxiv_id: str) -> None:
    """
    Background task to generate summary asynchronously.

    Args:
        db_path: SQLite database path (from connection URL)
        arxiv_id: arXiv paper ID
    """
    try:
        settings = get_settings()
        db_conn = get_db_connection(settings.database_url)

        # Get paper data for summary generation
        paper_row = db_conn.execute(
            "SELECT title, abstract FROM papers WHERE arxiv_id = ? LIMIT 1",
            (arxiv_id,),
        ).fetchone()

        if not paper_row:
            return  # Paper not found, skip

        title, abstract = paper_row

        # Initialize summary service and generate
        summary_service = SummaryService(
            settings=settings,
            db_conn=db_conn,
        )
        await summary_service.summarize(
            title=title, abstract=abstract, paper_id=arxiv_id
        )

        db_conn.close()
    except Exception:
        # Silently fail background tasks to avoid breaking request path
        pass


# Endpoints


@router.get("/papers/{arxiv_id}", response_model=PaperDetailResponse)
async def get_paper_detail(arxiv_id: str) -> PaperDetailResponse:
    """
    Retrieve paper detail with cached summary (if available).

    Returns paper metadata and LLM-generated summary if cached in DB.
    Summary field is null if not yet cached.

    Args:
        arxiv_id: arXiv paper ID (e.g., "2401.12345")

    Returns:
        PaperDetailResponse with paper metadata + optional summary

    Raises:
        HTTPException 404: Paper not found in local cache
    """
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        paper_data = _get_cached_paper_with_summary(db_conn, arxiv_id)
        if not paper_data:
            raise HTTPException(
                status_code=404, detail=f"Paper {arxiv_id} not found in cache"
            )

        paper_detail = PaperDetail(**paper_data)
        return PaperDetailResponse(paper=paper_detail)
    finally:
        db_conn.close()


@router.post(
    "/papers/{arxiv_id}/summarize", response_model=SummarizeResponse, status_code=202
)
async def trigger_summary_generation(arxiv_id: str) -> SummarizeResponse:
    """
    Trigger async summary generation for a paper.

    Returns 202 Accepted immediately without waiting for summary generation.
    Summary is generated in background and cached for retrieval via GET /api/papers/{arxiv_id}.

    If summary already cached, returns 202 immediately (no action taken).

    Args:
        arxiv_id: arXiv paper ID (e.g., "2401.12345")

    Returns:
        SummarizeResponse with status "queued"

    Raises:
        HTTPException 404: Paper not found in local cache
    """
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        # Verify paper exists in DB
        paper_exists = db_conn.execute(
            "SELECT 1 FROM papers WHERE arxiv_id = ? LIMIT 1",
            (arxiv_id,),
        ).fetchone()

        if not paper_exists:
            raise HTTPException(
                status_code=404, detail=f"Paper {arxiv_id} not found in cache"
            )

        # Trigger background task (fire-and-forget)
        asyncio.create_task(
            _trigger_summary_generation(settings.database_url, arxiv_id)
        )

        return SummarizeResponse(arxiv_id=arxiv_id, status="queued")
    finally:
        db_conn.close()
