"""Reading list CRUD endpoints for managing saved papers.

Implements:
- GET /api/reading-list - List saved papers for authenticated or anonymous user
- POST /api/reading-list/{arxiv_id} - Save a paper to reading list
- DELETE /api/reading-list/{arxiv_id} - Remove a paper from reading list

Auth pattern: Authenticated user identity is derived from the JWT ``session``
cookie via ``get_optional_user``.  Anonymous users are identified by the
``anonymous_id`` cookie set by ``AnonymousTrackingMiddleware``.  The ``user_id``
query-parameter bypass has been removed to prevent unauthorized access.
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import User, get_optional_user
from app.config import get_settings
from app.db import get_db_connection

router = APIRouter(prefix="/api", tags=["reading-list"])


# Response Models


class ReadingListPaper(BaseModel):
    """Paper entry in reading list."""

    arxiv_id: str = Field(..., description="arXiv paper ID")
    title: str = Field(..., description="Paper title")
    abstract: str = Field(..., description="Paper abstract")
    authors: list[str] = Field(..., description="List of author names")
    published_at: int = Field(..., description="Unix timestamp of publication")
    updated_at: int = Field(..., description="Unix timestamp of last update")
    categories: list[str] = Field(..., description="arXiv categories")
    pdf_url: str = Field(..., description="URL to PDF on arXiv")
    saved_at: int = Field(
        ..., description="Unix timestamp when paper was saved to reading list"
    )


class ReadingListResponse(BaseModel):
    """Response model for reading list endpoint."""

    papers: list[ReadingListPaper] = Field(
        default_factory=list, description="List of saved papers"
    )
    count: int = Field(..., description="Number of saved papers")


class SaveResponse(BaseModel):
    """Response model for save paper endpoint."""

    arxiv_id: str = Field(..., description="arXiv paper ID")
    status: str = Field(..., description="Status (saved)")


class DeleteResponse(BaseModel):
    """Response model for unsave paper endpoint."""

    arxiv_id: str = Field(..., description="arXiv paper ID")
    status: str = Field(..., description="Status (deleted)")


# Helpers


def _get_or_create_anonymous_id(anonymous_id: Optional[str]) -> str:
    """
    Get or create anonymous user ID.

    If anonymous_id cookie exists, use it. Otherwise, generate new UUID.

    Args:
        anonymous_id: Cookie value (optional)

    Returns:
        Anonymous user ID (UUID string)
    """
    return anonymous_id or str(uuid.uuid4())


def _ensure_paper_exists(db_conn, arxiv_id: str) -> None:
    """
    Verify paper exists in database.

    Args:
        db_conn: SQLite connection
        arxiv_id: arXiv paper ID

    Raises:
        HTTPException 404: Paper not found
    """
    paper_exists = db_conn.execute(
        "SELECT 1 FROM papers WHERE arxiv_id = ? LIMIT 1",
        (arxiv_id,),
    ).fetchone()

    if not paper_exists:
        raise HTTPException(
            status_code=404, detail=f"Paper {arxiv_id} not found in database"
        )


def _get_reading_list_papers(
    db_conn,
    user_id: Optional[int] = None,
    anonymous_id: Optional[str] = None,
) -> list[ReadingListPaper]:
    """
    Retrieve papers in reading list for user or anonymous user.

    Query pattern: Join reading_list with papers to get full metadata.
    Returns papers ordered by saved_at descending (most recently saved first).

    Args:
        db_conn: SQLite connection
        user_id: Authenticated user ID (optional)
        anonymous_id: Anonymous user ID from cookie (optional)

    Returns:
        List of ReadingListPaper objects with paper data + saved_at timestamp
    """
    if user_id:
        # Authenticated user
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
                rl.saved_at
            FROM reading_list rl
            JOIN papers p ON rl.paper_id = p.id
            WHERE rl.user_id = ?
            ORDER BY rl.saved_at DESC
            """,
            (user_id,),
        )
    else:
        # Anonymous user
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
                rl.saved_at
            FROM reading_list rl
            JOIN papers p ON rl.paper_id = p.id
            WHERE rl.anonymous_id = ?
            ORDER BY rl.saved_at DESC
            """,
            (anonymous_id,),
        )

    papers = []
    for row in cursor.fetchall():
        (
            arxiv_id,
            title,
            abstract,
            authors_json,
            categories_json,
            published_at,
            updated_at,
            saved_at,
        ) = row

        papers.append(
            ReadingListPaper(
                arxiv_id=arxiv_id,
                title=title,
                abstract=abstract,
                authors=json.loads(authors_json),
                categories=json.loads(categories_json),
                published_at=published_at,
                updated_at=updated_at,
                pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
                saved_at=saved_at,
            )
        )

    return papers


# Endpoints


@router.get("/reading-list", response_model=ReadingListResponse)
async def get_reading_list(
    user: Optional[User] = Depends(get_optional_user),
    anonymous_id: Optional[str] = Cookie(None),
) -> ReadingListResponse:
    """
    Retrieve saved papers for current user (authenticated or anonymous).

    Supports two modes:
    - Authenticated: Identity derived from JWT ``session`` cookie
    - Anonymous: Tracked via ``anonymous_id`` cookie

    Args:
        user: Authenticated user from JWT (injected by dependency, or None)
        anonymous_id: Cookie value (optional, for anonymous users)

    Returns:
        ReadingListResponse with list of saved papers
    """
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        if user:
            # Authenticated user mode – identity from JWT
            papers = _get_reading_list_papers(
                db_conn,
                user_id=user.id,
                anonymous_id=None,
            )
        else:
            # Anonymous user mode
            anon_id = _get_or_create_anonymous_id(anonymous_id)
            papers = _get_reading_list_papers(
                db_conn,
                user_id=None,
                anonymous_id=anon_id,
            )

        return ReadingListResponse(papers=papers, count=len(papers))
    finally:
        db_conn.close()


@router.post("/reading-list/{arxiv_id}", response_model=SaveResponse, status_code=201)
async def save_paper(
    arxiv_id: str,
    user: Optional[User] = Depends(get_optional_user),
    anonymous_id: Optional[str] = Cookie(None),
) -> SaveResponse:
    """
    Save a paper to reading list.

    Supports two modes:
    - Authenticated: Identity derived from JWT ``session`` cookie
    - Anonymous: Tracked via ``anonymous_id`` cookie

    Idempotent: saving the same paper twice returns 201 (no error).

    Args:
        arxiv_id: arXiv paper ID (e.g., "2401.12345")
        user: Authenticated user from JWT (injected by dependency, or None)
        anonymous_id: Cookie value (optional, for anonymous users)

    Returns:
        SaveResponse with status "saved"

    Raises:
        HTTPException 404: Paper not found in database
    """
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        # Verify paper exists
        _ensure_paper_exists(db_conn, arxiv_id)

        # Get paper id from arxiv_id
        paper_row = db_conn.execute(
            "SELECT id FROM papers WHERE arxiv_id = ? LIMIT 1",
            (arxiv_id,),
        ).fetchone()

        if not paper_row:
            raise HTTPException(status_code=404, detail=f"Paper {arxiv_id} not found")

        paper_id = paper_row[0]

        if user:
            # Authenticated user mode – identity from JWT
            db_conn.execute(
                """
                INSERT OR IGNORE INTO reading_list (user_id, paper_id, saved_at)
                VALUES (?, ?, unixepoch())
                """,
                (user.id, paper_id),
            )
        else:
            # Anonymous user mode
            anon_id = _get_or_create_anonymous_id(anonymous_id)

            # Ensure anonymous session exists
            session_exists = db_conn.execute(
                "SELECT 1 FROM anonymous_sessions WHERE cookie_uuid = ? LIMIT 1",
                (anon_id,),
            ).fetchone()

            if not session_exists:
                db_conn.execute(
                    "INSERT INTO anonymous_sessions (cookie_uuid, created_at, last_seen_at) VALUES (?, unixepoch(), unixepoch())",
                    (anon_id,),
                )

            # Insert or ignore (upsert pattern for idempotency)
            db_conn.execute(
                """
                INSERT OR IGNORE INTO reading_list (anonymous_id, paper_id, saved_at)
                VALUES (?, ?, unixepoch())
                """,
                (anon_id, paper_id),
            )

        db_conn.commit()

        return SaveResponse(arxiv_id=arxiv_id, status="saved")
    finally:
        db_conn.close()


@router.delete("/reading-list/{arxiv_id}", response_model=DeleteResponse)
async def unsave_paper(
    arxiv_id: str,
    user: Optional[User] = Depends(get_optional_user),
    anonymous_id: Optional[str] = Cookie(None),
) -> DeleteResponse:
    """
    Remove a paper from reading list.

    Supports two modes:
    - Authenticated: Identity derived from JWT ``session`` cookie
    - Anonymous: Tracked via ``anonymous_id`` cookie

    Idempotent: deleting a paper that's not saved returns 200 (no error).

    Args:
        arxiv_id: arXiv paper ID (e.g., "2401.12345")
        user: Authenticated user from JWT (injected by dependency, or None)
        anonymous_id: Cookie value (optional, for anonymous users)

    Returns:
        DeleteResponse with status "deleted"

    Raises:
        HTTPException 404: Paper not found in database
    """
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        # Verify paper exists
        _ensure_paper_exists(db_conn, arxiv_id)

        # Get paper id from arxiv_id
        paper_row = db_conn.execute(
            "SELECT id FROM papers WHERE arxiv_id = ? LIMIT 1",
            (arxiv_id,),
        ).fetchone()

        if not paper_row:
            raise HTTPException(status_code=404, detail=f"Paper {arxiv_id} not found")

        paper_id = paper_row[0]

        # Delete (idempotent: no error if not found)
        if user:
            # Authenticated user mode – identity from JWT
            db_conn.execute(
                """
                DELETE FROM reading_list
                WHERE user_id = ? AND paper_id = ?
                """,
                (user.id, paper_id),
            )
        else:
            # Anonymous user mode
            anon_id = _get_or_create_anonymous_id(anonymous_id)
            db_conn.execute(
                """
                DELETE FROM reading_list
                WHERE anonymous_id = ? AND paper_id = ?
                """,
                (anon_id, paper_id),
            )

        db_conn.commit()

        return DeleteResponse(arxiv_id=arxiv_id, status="deleted")
    finally:
        db_conn.close()
