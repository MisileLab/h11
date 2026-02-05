"""Summary-related schemas."""

from pydantic import BaseModel


class SummaryResponse(BaseModel):
    """Summary response."""

    id: int
    meeting_id: int
    summary_type: str
    content: str
    created_at: str


class SummaryRequest(BaseModel):
    """Request summary generation."""

    summary_type: str  # "work" or "timeline"
