"""
Search service for full-text and vector search across meetings.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy import text, or_, and_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Meeting, TranscriptSegment, Embedding

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Search result with relevance score and context."""

    meeting_id: int
    meeting_title: str
    meeting_date: str
    segment_id: Optional[int]
    text: str
    start_sec: Optional[float]
    end_sec: Optional[float]
    score: float
    relevance_type: str  # "fulltext", "vector", or "hybrid"


def search_fulltext(
    db: Session,
    query: str,
    user_id: int,
    folder_id: Optional[int] = None,
    meeting_ids: Optional[List[int]] = None,
    limit: int = 20,
) -> List[SearchResult]:
    """
    Full-text search using PostgreSQL's to_tsquery.

    Args:
        db: Database session
        query: Search query
        user_id: User ID (for access control)
        folder_id: Optional folder filter
        meeting_ids: Optional meeting IDs filter
        limit: Maximum results

    Returns:
        List of SearchResult objects
    """
    # Build PostgreSQL full-text search query
    # ts_rank returns relevance score
    sql = text(
        """
        SELECT 
            ts.id as segment_id,
            ts.meeting_id,
            ts.text,
            ts.start_sec,
            ts.end_sec,
            m.title as meeting_title,
            m.date as meeting_date,
            ts_rank(to_tsvector('english', ts.text), plainto_tsquery('english', :query)) as score
        FROM transcript_segments ts
        JOIN meetings m ON ts.meeting_id = m.id
        WHERE m.user_id = :user_id
        AND to_tsvector('english', ts.text) @@ plainto_tsquery('english', :query)
        {folder_filter}
        {meeting_filter}
        ORDER BY score DESC
        LIMIT :limit
    """.format(
            folder_filter="AND m.folder_id = :folder_id" if folder_id else "",
            meeting_filter="AND m.id = ANY(:meeting_ids)" if meeting_ids else "",
        )
    )

    params = {"query": query, "user_id": user_id, "limit": limit}
    if folder_id:
        params["folder_id"] = folder_id
    if meeting_ids:
        params["meeting_ids"] = meeting_ids

    result = db.execute(sql, params)
    rows = result.fetchall()

    return [
        SearchResult(
            meeting_id=row.meeting_id,
            meeting_title=row.meeting_title,
            meeting_date=str(row.meeting_date),
            segment_id=row.segment_id,
            text=row.text,
            start_sec=row.start_sec,
            end_sec=row.end_sec,
            score=row.score,
            relevance_type="fulltext",
        )
        for row in rows
    ]


def search_vector(
    db: Session,
    query: str,
    user_id: int,
    folder_id: Optional[int] = None,
    meeting_ids: Optional[List[int]] = None,
    limit: int = 20,
) -> List[SearchResult]:
    """
    Vector similarity search using pgvector.

    Args:
        db: Database session
        query: Search query
        user_id: User ID (for access control)
        folder_id: Optional folder filter
        meeting_ids: Optional meeting IDs filter
        limit: Maximum results

    Returns:
        List of SearchResult objects
    """
    settings = get_settings()

    # Generate embedding for query
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-large", input=[query], encoding_format="float"
    )
    query_embedding = response.data[0].embedding

    # Build vector similarity query using cosine similarity
    # pgvector's <=> operator computes cosine distance (1 - cosine similarity)
    # Lower distance = higher similarity
    sql = text(
        """
        SELECT 
            e.id as embedding_id,
            e.meeting_id,
            e.segment_id,
            e.chunk_text as text,
            ts.start_sec,
            ts.end_sec,
            m.title as meeting_title,
            m.date as meeting_date,
            1 - (e.embedding <=> :query_embedding) as score
        FROM embeddings e
        JOIN meetings m ON e.meeting_id = m.id
        LEFT JOIN transcript_segments ts ON e.segment_id = ts.id
        WHERE m.user_id = :user_id
        {folder_filter}
        {meeting_filter}
        ORDER BY e.embedding <=> :query_embedding
        LIMIT :limit
    """.format(
            folder_filter="AND m.folder_id = :folder_id" if folder_id else "",
            meeting_filter="AND m.id = ANY(:meeting_ids)" if meeting_ids else "",
        )
    )

    params = {"query_embedding": str(query_embedding), "user_id": user_id, "limit": limit}
    if folder_id:
        params["folder_id"] = folder_id
    if meeting_ids:
        params["meeting_ids"] = meeting_ids

    result = db.execute(sql, params)
    rows = result.fetchall()

    return [
        SearchResult(
            meeting_id=row.meeting_id,
            meeting_title=row.meeting_title,
            meeting_date=str(row.meeting_date),
            segment_id=row.segment_id,
            text=row.text,
            start_sec=row.start_sec,
            end_sec=row.end_sec,
            score=row.score,
            relevance_type="vector",
        )
        for row in rows
    ]


def search_hybrid(
    db: Session,
    query: str,
    user_id: int,
    folder_id: Optional[int] = None,
    meeting_ids: Optional[List[int]] = None,
    limit: int = 20,
    fulltext_weight: float = 0.4,
    vector_weight: float = 0.6,
) -> List[SearchResult]:
    """
    Hybrid search combining full-text and vector search.

    Args:
        db: Database session
        query: Search query
        user_id: User ID (for access control)
        folder_id: Optional folder filter
        meeting_ids: Optional meeting IDs filter
        limit: Maximum results
        fulltext_weight: Weight for full-text score (0-1)
        vector_weight: Weight for vector score (0-1)

    Returns:
        List of SearchResult objects, deduplicated and ranked
    """
    # Get results from both methods
    fulltext_results = search_fulltext(db, query, user_id, folder_id, meeting_ids, limit * 2)
    vector_results = search_vector(db, query, user_id, folder_id, meeting_ids, limit * 2)

    # Normalize scores (both should be 0-1 range)
    # Fulltext scores are already normalized by ts_rank
    # Vector scores are already cosine similarity (0-1)

    # Combine and deduplicate by segment_id
    combined: Dict[int, SearchResult] = {}

    for result in fulltext_results:
        key = result.segment_id or f"ft_{result.meeting_id}_{result.text[:50]}"
        if key not in combined:
            result.score = result.score * fulltext_weight
            result.relevance_type = "fulltext"
            combined[key] = result
        else:
            combined[key].score += result.score * fulltext_weight

    for result in vector_results:
        key = result.segment_id or f"vec_{result.meeting_id}_{result.text[:50]}"
        if key not in combined:
            result.score = result.score * vector_weight
            result.relevance_type = "vector"
            combined[key] = result
        else:
            # Mark as hybrid if found in both
            combined[key].score += result.score * vector_weight
            combined[key].relevance_type = "hybrid"

    # Sort by combined score
    sorted_results = sorted(combined.values(), key=lambda x: x.score, reverse=True)

    return sorted_results[:limit]


def search(
    db: Session,
    query: str,
    user_id: int,
    search_type: str = "hybrid",
    folder_id: Optional[int] = None,
    meeting_ids: Optional[List[int]] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Main search function with configurable search type.

    Args:
        db: Database session
        query: Search query
        user_id: User ID (for access control)
        search_type: "fulltext", "vector", or "hybrid"
        folder_id: Optional folder filter
        meeting_ids: Optional meeting IDs filter
        limit: Maximum results

    Returns:
        List of search result dictionaries
    """
    if search_type == "fulltext":
        results = search_fulltext(db, query, user_id, folder_id, meeting_ids, limit)
    elif search_type == "vector":
        results = search_vector(db, query, user_id, folder_id, meeting_ids, limit)
    else:  # hybrid
        results = search_hybrid(db, query, user_id, folder_id, meeting_ids, limit)

    # Convert to dict
    return [
        {
            "meeting_id": r.meeting_id,
            "meeting_title": r.meeting_title,
            "meeting_date": r.meeting_date,
            "segment_id": r.segment_id,
            "text": r.text,
            "start_sec": r.start_sec,
            "end_sec": r.end_sec,
            "score": r.score,
            "relevance_type": r.relevance_type,
        }
        for r in results
    ]
