from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Meeting(Base, TimestampMixin):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(512), nullable=False)
    meeting_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="pending_upload", index=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    progress_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    duration_sec: Mapped[Optional[float]] = mapped_column(nullable=True)
    is_deleted: Mapped[bool] = mapped_column(nullable=False, server_default="false", index=True)
