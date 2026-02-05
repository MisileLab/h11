from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.models.base import Base, TimestampMixin


class Embedding(Base, TimestampMixin):
    __tablename__ = "embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    segment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), nullable=True, index=True
    )

    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Vector] = mapped_column(Vector(3072), nullable=False)


class STTUsageLog(Base, TimestampMixin):
    __tablename__ = "stt_usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )

    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    clip_duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    audio_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    cost_usd: Mapped[float] = mapped_column(Float, nullable=False)
    raw_response_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
