"""Meeting routes."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingResponse, MeetingUpdate
from app.services.meetings import (
    create_meeting,
    delete_meeting,
    get_meeting,
    list_meetings,
    update_meeting,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
def create_meeting_route(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeetingResponse:
    """Create a meeting."""

    return create_meeting(db, user, payload)


@router.get("", response_model=list[MeetingResponse])
def list_meetings_route(
    folder_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MeetingResponse]:
    """List meetings."""

    return list_meetings(db, user, folder_id=folder_id, status_filter=status_filter, search=search)


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeetingResponse:
    """Get a meeting."""

    return get_meeting(db, user, meeting_id)


@router.put("/{meeting_id}", response_model=MeetingResponse)
def update_meeting_route(
    meeting_id: int,
    payload: MeetingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeetingResponse:
    """Update a meeting."""

    return update_meeting(db, user, meeting_id, payload)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a meeting."""

    delete_meeting(db, user, meeting_id)
    return None
