"""Meeting schemas."""

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class MeetingStatus(str, Enum):
    """Meeting processing status."""

    pending_upload = "pending_upload"
    uploading = "uploading"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class MeetingBase(BaseModel):
    """Shared meeting attributes."""

    title: str
    meeting_date: date
    tags: list[str] = []
    folder_id: Optional[int] = None


class MeetingCreate(MeetingBase):
    """Attributes for creating a meeting."""


class MeetingUpdate(BaseModel):
    """Attributes for updating a meeting."""

    title: Optional[str] = None
    meeting_date: Optional[date] = None
    tags: Optional[list[str]] = None
    folder_id: Optional[int] = None
    status: Optional[MeetingStatus] = None
    error_message: Optional[str] = None
    progress_json: Optional[dict] = None
    duration_sec: Optional[float] = None


class MeetingResponse(MeetingBase):
    """Meeting response schema."""

    id: int
    user_id: int
    status: str
    error_message: Optional[str] = None
    progress_json: Optional[dict] = None
    duration_sec: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
