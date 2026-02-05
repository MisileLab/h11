"""Summary routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies.auth import get_current_user
from app.models.meeting import Meeting
from app.models.ai import Summary
from app.models.user import User
from app.schemas.summary import SummaryResponse, SummaryRequest
from app.workers.jobs import enqueue_job
from app.workers.tasks.summarization import generate_summary

router = APIRouter(prefix="/meetings", tags=["summaries"])


@router.get("/{meeting_id}/summaries", response_model=list[SummaryResponse])
def list_summaries(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SummaryResponse]:
    """List meeting summaries."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    summaries = db.query(Summary).filter(Summary.meeting_id == meeting_id).all()

    return [
        SummaryResponse(
            id=summary.id,
            meeting_id=summary.meeting_id,
            summary_type=summary.summary_type,
            content=summary.content,
            created_at=summary.created_at.isoformat(),
        )
        for summary in summaries
    ]


@router.post("/{meeting_id}/summaries", status_code=status.HTTP_202_ACCEPTED)
def request_summary(
    meeting_id: int,
    payload: SummaryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Request new summary generation."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Enqueue summarization job
    job = enqueue_job(
        generate_summary,
        meeting_id=meeting_id,
        summary_type=payload.summary_type,
        queue_name="summarization",
    )

    return {"status": "processing", "job_id": job.id}


@router.delete("/{meeting_id}/summaries/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_summary(
    meeting_id: int,
    summary_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a summary."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    summary = (
        db.query(Summary)
        .filter(
            Summary.id == summary_id,
            Summary.meeting_id == meeting_id,
        )
        .first()
    )
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Summary not found")

    db.delete(summary)
    db.commit()
