"""
Search API routes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.services.search import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    """Search request model."""

    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    search_type: str = Field(default="hybrid", pattern="^(fulltext|vector|hybrid)$")
    folder_id: Optional[int] = Field(default=None, description="Filter by folder")
    meeting_ids: Optional[List[int]] = Field(
        default=None, description="Filter by specific meetings"
    )
    limit: int = Field(default=20, ge=1, le=100, description="Maximum results")


class SearchResultItem(BaseModel):
    """Search result item."""

    meeting_id: int
    meeting_title: str
    meeting_date: str
    segment_id: Optional[int]
    text: str
    start_sec: Optional[float]
    end_sec: Optional[float]
    score: float
    relevance_type: str


class SearchResponse(BaseModel):
    """Search response model."""

    query: str
    results: List[SearchResultItem]
    total: int


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Search across meetings using full-text, vector, or hybrid search.

    **Search Types:**
    - `fulltext`: PostgreSQL full-text search (fast, keyword matching)
    - `vector`: Semantic similarity search using embeddings (slower, context-aware)
    - `hybrid`: Combined approach with weighted scores (recommended)

    **Filters:**
    - `folder_id`: Limit search to specific folder
    - `meeting_ids`: Limit search to specific meetings

    **Returns:**
    - List of matching segments with timestamps and relevance scores
    - Results are sorted by relevance (highest first)
    """
    try:
        results = search_service(
            db=db,
            query=request.query,
            user_id=user_id,
            search_type=request.search_type,
            folder_id=request.folder_id,
            meeting_ids=request.meeting_ids,
            limit=request.limit,
        )

        return SearchResponse(
            query=request.query,
            results=[SearchResultItem(**r) for r in results],
            total=len(results),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
