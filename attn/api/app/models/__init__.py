from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"

    id: str = Field(primary_key=True)
    name: str
    container_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: int = Field(foreign_key="users.id")
    test_command: Optional[str] = None


class ConfigFile(SQLModel, table=True):
    __tablename__ = "config_files"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    file_size: int


__all__ = ["User", "Session", "Workspace", "ConfigFile"]
