from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class Workspace(SQLModel, table=True):
    """Workspace model"""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    container_id: Optional[str] = None
    container_name: str = Field(unique=True, index=True)
    repo_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: int = Field(foreign_key="user.id")


class TestConfig(SQLModel, table=True):
    """Test configuration for workspace"""

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspace.id", unique=True, index=True)
    command: str = Field(default="echo 'No test command configured'")
    updated_at: datetime = Field(default_factory=datetime.utcnow)
