"""
Q&A API routes for RAG-based question answering.
"""

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Meeting, QAThread, QAMessage
from app.services.qa import generate_answer

router = APIRouter(prefix="/api/meetings/{meeting_id}/qa", tags=["qa"])


class AskQuestionRequest(BaseModel):
    """Request to ask a question."""

    question: str = Field(..., min_length=1, max_length=1000)
    thread_id: Optional[int] = Field(default=None, description="Existing thread for follow-up")


class Citation(BaseModel):
    """Citation with timestamp."""

    citation_number: int
    segment_id: Optional[int]
    start_sec: Optional[float]
    end_sec: Optional[float]
    text: str
    speaker_name: Optional[str]


class AskQuestionResponse(BaseModel):
    """Response with answer and citations."""

    thread_id: int
    answer: str
    citations: List[Citation]
    usage: Dict[str, int]


class QAMessageItem(BaseModel):
    """Q&A message item."""

    id: int
    role: str
    content: str
    citations: Optional[List[Citation]]
    created_at: str


class QAThreadItem(BaseModel):
    """Q&A thread item."""

    id: int
    meeting_id: int
    messages: List[QAMessageItem]
    created_at: str


@router.post("", response_model=AskQuestionResponse)
async def ask_question(
    meeting_id: int = Path(..., description="Meeting ID"),
    request: AskQuestionRequest = ...,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ask a question about a meeting using RAG.

    **Features:**
    - Retrieves relevant transcript segments using vector similarity
    - Generates answer using GPT-4o with context
    - Returns citations with timestamps for verification
    - Supports follow-up questions via thread_id

    **Usage:**
    1. First question: Leave thread_id empty
    2. Follow-up: Use returned thread_id
    """
    # Check meeting access
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Verify thread belongs to meeting if provided
    if request.thread_id:
        thread = (
            db.query(QAThread)
            .filter(QAThread.id == request.thread_id, QAThread.meeting_id == meeting_id)
            .first()
        )
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

    try:
        result = generate_answer(
            db=db, meeting_id=meeting_id, question=request.question, thread_id=request.thread_id
        )

        return AskQuestionResponse(
            thread_id=result["thread_id"],
            answer=result["answer"],
            citations=[Citation(**c) for c in result["citations"]],
            usage=result["usage"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Q&A generation failed: {str(e)}")


@router.get("", response_model=List[QAThreadItem])
async def list_threads(
    meeting_id: int = Path(..., description="Meeting ID"),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all Q&A threads for a meeting.

    Returns all threads with their messages and citations.
    """
    # Check meeting access
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Get all threads
    threads = (
        db.query(QAThread)
        .filter(QAThread.meeting_id == meeting_id)
        .order_by(QAThread.created_at.desc())
        .all()
    )

    result = []
    for thread in threads:
        messages = (
            db.query(QAMessage)
            .filter(QAMessage.thread_id == thread.id)
            .order_by(QAMessage.created_at)
            .all()
        )

        thread_item = QAThreadItem(
            id=thread.id,
            meeting_id=thread.meeting_id,
            created_at=str(thread.created_at),
            messages=[
                QAMessageItem(
                    id=msg.id,
                    role=msg.role,
                    content=msg.content,
                    citations=[Citation(**c) for c in msg.citations_json.get("citations", [])]
                    if msg.citations_json
                    else None,
                    created_at=str(msg.created_at),
                )
                for msg in messages
            ],
        )
        result.append(thread_item)

    return result


@router.get("/{thread_id}", response_model=QAThreadItem)
async def get_thread(
    meeting_id: int = Path(..., description="Meeting ID"),
    thread_id: int = Path(..., description="Thread ID"),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a specific Q&A thread with all messages.
    """
    # Check meeting access
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Get thread
    thread = (
        db.query(QAThread)
        .filter(QAThread.id == thread_id, QAThread.meeting_id == meeting_id)
        .first()
    )

    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Get messages
    messages = (
        db.query(QAMessage)
        .filter(QAMessage.thread_id == thread.id)
        .order_by(QAMessage.created_at)
        .all()
    )

    return QAThreadItem(
        id=thread.id,
        meeting_id=thread.meeting_id,
        created_at=str(thread.created_at),
        messages=[
            QAMessageItem(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                citations=[Citation(**c) for c in msg.citations_json.get("citations", [])]
                if msg.citations_json
                else None,
                created_at=str(msg.created_at),
            )
            for msg in messages
        ],
    )


@router.delete("/{thread_id}", status_code=204)
async def delete_thread(
    meeting_id: int = Path(..., description="Meeting ID"),
    thread_id: int = Path(..., description="Thread ID"),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a Q&A thread and all its messages.
    """
    # Check meeting access
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Get thread
    thread = (
        db.query(QAThread)
        .filter(QAThread.id == thread_id, QAThread.meeting_id == meeting_id)
        .first()
    )

    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Delete (cascade will handle messages)
    db.delete(thread)
    db.commit()

    return None
