"""Meeting service functions."""

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.meeting import Meeting
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingUpdate


def _active_folder_query(db: Session, user_id: int):
    return db.query(Folder).filter(Folder.user_id == user_id).filter(text("is_deleted = false"))


def _validate_folder(db: Session, user_id: int, folder_id: int) -> None:
    folder = _active_folder_query(db, user_id).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")


def create_meeting(db: Session, user: User, payload: MeetingCreate) -> Meeting:
    """Create a new meeting."""

    if payload.folder_id is not None:
        _validate_folder(db, user.id, payload.folder_id)

    meeting = Meeting(
        user_id=user.id,
        folder_id=payload.folder_id,
        title=payload.title,
        meeting_date=payload.meeting_date,
        tags=payload.tags or [],
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def list_meetings(
    db: Session,
    user: User,
    folder_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
) -> list[Meeting]:
    """List meetings with optional filters."""

    query = db.query(Meeting).filter(Meeting.user_id == user.id, Meeting.is_deleted.is_(False))

    if folder_id is not None:
        query = query.filter(Meeting.folder_id == folder_id)
    if status_filter is not None:
        query = query.filter(Meeting.status == status_filter)
    if search:
        query = query.filter(Meeting.title.ilike(f"%{search}%"))

    return query.order_by(Meeting.meeting_date.desc(), Meeting.created_at.desc()).all()


def get_meeting(db: Session, user: User, meeting_id: int) -> Meeting:
    """Get a meeting."""

    meeting = (
        db.query(Meeting)
        .filter(Meeting.user_id == user.id, Meeting.is_deleted.is_(False))
        .filter(Meeting.id == meeting_id)
        .first()
    )
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


def update_meeting(db: Session, user: User, meeting_id: int, payload: MeetingUpdate) -> Meeting:
    """Update a meeting."""

    meeting = get_meeting(db, user, meeting_id)

    if payload.folder_id is not None:
        _validate_folder(db, user.id, payload.folder_id)
        meeting.folder_id = payload.folder_id

    if payload.title is not None:
        meeting.title = payload.title
    if payload.meeting_date is not None:
        meeting.meeting_date = payload.meeting_date
    if payload.tags is not None:
        meeting.tags = payload.tags
    if payload.status is not None:
        meeting.status = payload.status.value
    if payload.error_message is not None:
        meeting.error_message = payload.error_message
    if payload.progress_json is not None:
        meeting.progress_json = payload.progress_json
    if payload.duration_sec is not None:
        meeting.duration_sec = payload.duration_sec

    meeting.updated_at = func.now()
    db.commit()
    db.refresh(meeting)
    return meeting


def delete_meeting(db: Session, user: User, meeting_id: int) -> None:
    """Soft delete a meeting."""

    meeting = get_meeting(db, user, meeting_id)
    meeting.is_deleted = True
    meeting.updated_at = func.now()
    db.commit()
