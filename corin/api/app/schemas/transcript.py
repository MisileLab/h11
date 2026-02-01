"""Transcript-related schemas."""

from pydantic import BaseModel


class TranscriptSegmentResponse(BaseModel):
    """Transcript segment response."""

    id: int
    speaker_id: int | None
    text: str
    start_time: float
    end_time: float
    confidence: float | None


class SpeakerResponse(BaseModel):
    """Speaker response."""

    id: int
    speaker_label: str
    assigned_name: str | None
    color: str | None


class TranscriptResponse(BaseModel):
    """Full transcript response."""

    meeting_id: int
    segments: list[TranscriptSegmentResponse]
    speakers: list[SpeakerResponse]


class TranscriptSegmentUpdate(BaseModel):
    """Update transcript segment."""

    text: str | None = None
    speaker_id: int | None = None


class SpeakerUpdate(BaseModel):
    """Update speaker."""

    assigned_name: str | None = None
    color: str | None = None
