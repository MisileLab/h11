"""
Recommendations endpoint for personalized paper suggestions.

GET /api/recommendations?categories={cat1,cat2}&limit=10

Returns a list of papers recommended based on the user's reading history
(authenticated or anonymous). Uses the content-based recommendation engine
with vector similarity on pre-computed embeddings.

When no reading history exists, falls back to recent papers ordered by
published_at descending.

Pattern: Support both authenticated users (via user_id) and anonymous users
(via anonymous_id cookie).
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_optional_user, User
from app.services.arxiv import Paper
from app.services.recommendation import recommend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recommendations"])


class PaperResponse(BaseModel):
    """Paper response model for recommendations."""

    arxiv_id: str = Field(..., description="Unique arXiv identifier")
    title: str = Field(..., description="Paper title")
    abstract: str = Field(..., description="Paper abstract")
    authors: list[str] = Field(..., description="List of author names")
    published_at: int = Field(..., description="Unix timestamp of publication")
    updated_at: int = Field(..., description="Unix timestamp of last update")
    categories: list[str] = Field(..., description="List of arXiv categories")
    pdf_url: str = Field(..., description="URL to PDF on arXiv")


class RecommendationsResponse(BaseModel):
    """Response model for recommendations endpoint."""

    papers: list[PaperResponse] = Field(
        default_factory=list, description="List of recommended papers"
    )
    count: int = Field(..., description="Number of recommended papers")


def _paper_to_response(paper: Paper) -> PaperResponse:
    """Convert Paper dataclass to response model."""
    return PaperResponse(
        arxiv_id=paper.arxiv_id,
        title=paper.title,
        abstract=paper.abstract,
        authors=paper.authors,
        published_at=paper.published_at,
        updated_at=paper.updated_at,
        categories=paper.categories,
        pdf_url=paper.pdf_url,
    )


@router.get(
    "/recommendations",
    response_model=RecommendationsResponse,
    summary="Get personalized paper recommendations",
    description="Returns papers recommended based on user reading history or recent papers if no history exists.",
)
async def get_recommendations(
    categories: Optional[str] = Query(
        None,
        description="Comma-separated list of arXiv categories to filter by (e.g., 'cs.AI,stat.ML')",
    ),
    limit: int = Query(
        10,
        ge=1,
        le=100,
        description="Maximum number of papers to return (1-100)",
    ),
    user: Optional[User] = Depends(get_optional_user),
    anonymous_id: Optional[str] = Cookie(None),
) -> RecommendationsResponse:
    """
    Get personalized paper recommendations.

    For authenticated users, uses their reading list to build a user profile.
    For anonymous users, uses the anonymous_id cookie.
    For users with no reading history, returns recent papers.

    Args:
        categories: Optional comma-separated arXiv categories filter
        limit: Number of papers to return (default 10, max 100)
        user: Optional authenticated user (auto-extracted from JWT)
        anonymous_id: Optional anonymous session UUID (auto-extracted from cookie)

    Returns:
        RecommendationsResponse with list of recommended papers and count
    """
    # Parse categories if provided
    categories_list = None
    if categories:
        categories_list = [cat.strip() for cat in categories.split(",") if cat.strip()]

    # Get recommendations from the engine
    database_url = os.environ.get("DATABASE_URL", "sqlite:///arxgorithm.db")

    # Normalize sqlite:// URL format to filesystem path
    if database_url.startswith("sqlite:///"):
        db_path = database_url[10:]  # Remove 'sqlite:///' prefix
    elif database_url.startswith("sqlite://"):
        db_path = database_url[9:]  # Remove 'sqlite://' prefix
    else:
        db_path = database_url

    user_id = user.id if user else None

    papers = await recommend(
        db_path=db_path,
        user_id=user_id,
        anonymous_id=anonymous_id,
        categories=categories_list,
        limit=limit,
    )

    # Convert to response models
    paper_responses = [_paper_to_response(p) for p in papers]

    return RecommendationsResponse(papers=paper_responses, count=len(paper_responses))
