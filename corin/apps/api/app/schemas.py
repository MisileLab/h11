from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MeetingCreate(BaseModel):
    title: str
    meeting_date: date | None = None
    tags: list[str] = Field(default_factory=list)
    folder: str | None = None


class MediaAssetOut(OrmBase):
    id: UUID
    original_object_key: str
    normalized_object_key: str | None
    playable_object_key: str | None
    original_filename: str | None
    original_content_type: str | None
    duration_ms: int | None


class VadSegmentOut(OrmBase):
    id: UUID
    start_ms: int
    end_ms: int
    padded_start_ms: int
    padded_end_ms: int
    energy_score: float | None


class TranscriptSegmentOut(OrmBase):
    id: UUID
    start_ms: int
    end_ms: int
    speaker_key: str
    text: str
    confidence: float | None


class TranscriptRevisionOut(OrmBase):
    id: UUID
    revision_no: int
    snapshot_json: dict
    created_at: datetime


class SummaryOut(OrmBase):
    id: UUID
    kind: str
    content_json: dict
    created_at: datetime


class SpeakerLabelOut(OrmBase):
    id: UUID
    speaker_key: str
    display_name: str


class ShareLinkOut(OrmBase):
    id: UUID
    token: str
    created_at: datetime


class MeetingOut(OrmBase):
    id: UUID
    title: str
    meeting_date: date | None
    tags: list[str]
    folder: str | None
    status: str
    progress_json: dict
    stt_provider: str | None = None
    stt_audio_tokens: int | None = None
    stt_input_text_tokens: int | None = None
    stt_output_tokens: int | None = None
    stt_cost_usd: float | None = None
    created_at: datetime


class MeetingDetail(MeetingOut):
    media_assets: list[MediaAssetOut]
    vad_segments: list[VadSegmentOut]
    transcript_segments: list[TranscriptSegmentOut]
    transcript_revisions: list[TranscriptRevisionOut]
    summaries: list[SummaryOut]
    share_links: list[ShareLinkOut]
    speaker_labels: list[SpeakerLabelOut]
    playable_url: str | None = None


class UploadResponse(BaseModel):
    meeting_id: UUID
    object_key: str


class SegmentUpdate(BaseModel):
    text: str


class SpeakerRename(BaseModel):
    display_name: str


class QaRequest(BaseModel):
    question: str


class QaCitation(BaseModel):
    segment_id: UUID
    start_ms: int
    end_ms: int
    text: str


class QaResponse(BaseModel):
    answer: str
    citations: list[QaCitation]
