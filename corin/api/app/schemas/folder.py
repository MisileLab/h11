"""Folder schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FolderBase(BaseModel):
    """Shared folder attributes."""

    name: str
    parent_id: Optional[int] = None


class FolderCreate(FolderBase):
    """Attributes for creating a folder."""


class FolderUpdate(BaseModel):
    """Attributes for updating a folder."""

    name: Optional[str] = None
    parent_id: Optional[int] = None


class FolderResponse(FolderBase):
    """Folder response schema."""

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class FolderWithCounts(FolderResponse):
    """Folder response with aggregated counts."""

    meetings_count: int = 0
    subfolders_count: int = 0
