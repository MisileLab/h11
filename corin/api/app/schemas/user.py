"""User schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Shared user attributes."""

    email: EmailStr
    name: str
    picture: Optional[str] = None


class UserCreate(UserBase):
    """Attributes for creating a user."""

    google_sub: str


class UserUpdate(BaseModel):
    """Attributes for updating a user."""

    name: Optional[str] = None
    picture: Optional[str] = None


class UserResponse(UserBase):
    """User response schema."""

    id: int
    google_sub: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
