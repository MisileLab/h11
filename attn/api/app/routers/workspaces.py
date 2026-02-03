import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from pathlib import Path

from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.config import WORKSPACES_DIR
from app.models import User, Workspace
from app.services.docker_service import (
    create_workspace_container,
    stop_and_remove_container,
    list_running_containers,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceCreate(BaseModel):
    name: str
    test_command: Optional[str] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    container_id: Optional[str]
    created_at: datetime
    user_id: int
    test_command: Optional[str]


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceResponse]


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    request: WorkspaceCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Create a new workspace with Docker container."""

    # Generate unique workspace ID
    workspace_id = str(uuid.uuid4())

    # Create workspace directory
    workspace_path = WORKSPACES_DIR / workspace_id / "repo"
    workspace_path.mkdir(parents=True, exist_ok=True)

    try:
        # Create Docker container
        container_id = create_workspace_container(workspace_id)

        # Save workspace to database
        workspace = Workspace(
            id=workspace_id,
            name=request.name,
            container_id=container_id,
            user_id=user.id,
            test_command=request.test_command,
        )
        session.add(workspace)
        session.commit()
        session.refresh(workspace)

        return WorkspaceResponse(
            id=workspace.id,
            name=workspace.name,
            container_id=workspace.container_id,
            created_at=workspace.created_at,
            user_id=workspace.user_id,
            test_command=workspace.test_command,
        )
    except Exception as e:
        # Clean up on failure
        import shutil

        workspace_root = WORKSPACES_DIR / workspace_id
        if workspace_root.exists():
            shutil.rmtree(workspace_root)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """List all workspaces for the current user."""

    workspaces = session.exec(
        select(Workspace).where(Workspace.user_id == user.id)
    ).all()

    return WorkspaceListResponse(
        workspaces=[
            WorkspaceResponse(
                id=ws.id,
                name=ws.name,
                container_id=ws.container_id,
                created_at=ws.created_at,
                user_id=ws.user_id,
                test_command=ws.test_command,
            )
            for ws in workspaces
        ]
    )


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete a workspace and remove its container."""

    # Fetch workspace
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        # Stop and remove container
        if workspace.container_id:
            stop_and_remove_container(workspace.container_id)

        # Delete workspace directory
        import shutil

        workspace_root = WORKSPACES_DIR / workspace_id
        if workspace_root.exists():
            shutil.rmtree(workspace_root)

        # Delete from database
        session.delete(workspace)
        session.commit()

        return {"message": "Workspace deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
