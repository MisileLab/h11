from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.core.database import get_session
from app.core.auth import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.services.docker_manager import (
    create_workspace_container,
    stop_and_remove_container,
)
import os
import shutil

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str
    repo_url: Optional[str] = None


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    container_id: Optional[str]
    container_name: str
    repo_url: Optional[str]
    created_at: datetime


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    request: WorkspaceCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create new workspace"""
    # Generate unique container name
    container_name = (
        f"workspace_{request.name.lower().replace(' ', '_')}_{current_user.id}"
    )

    # Check if workspace with same container name exists
    statement = select(Workspace).where(Workspace.container_name == container_name)
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace with this name already exists",
        )

    # Create workspace record
    workspace = Workspace(
        name=request.name,
        container_name=container_name,
        repo_url=request.repo_url,
        user_id=current_user.id,
    )
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    try:
        # Create container
        container_id = create_workspace_container(workspace.id, container_name)
        workspace.container_id = container_id
        session.add(workspace)
        session.commit()
        session.refresh(workspace)

        # Clone repo if provided
        if request.repo_url:
            from app.services.docker_manager import exec_in_container

            exit_code, output = exec_in_container(
                container_id,
                ["git", "clone", request.repo_url, "."],
                workdir="/workspace",
            )
            if exit_code != 0:
                # Non-fatal, just log
                print(f"Failed to clone repo: {output}")

        return WorkspaceResponse(
            id=workspace.id,
            name=workspace.name,
            container_id=workspace.container_id,
            container_name=workspace.container_name,
            repo_url=workspace.repo_url,
            created_at=workspace.created_at,
        )
    except Exception as e:
        # Cleanup on failure
        session.delete(workspace)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create workspace container: {str(e)}",
        )


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all workspaces for current user"""
    statement = select(Workspace).where(Workspace.user_id == current_user.id)
    workspaces = session.exec(statement).all()

    return [
        WorkspaceResponse(
            id=ws.id,
            name=ws.name,
            container_id=ws.container_id,
            container_name=ws.container_name,
            repo_url=ws.repo_url,
            created_at=ws.created_at,
        )
        for ws in workspaces
    ]


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete workspace"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    if workspace.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this workspace",
        )

    # Stop and remove container
    if workspace.container_id:
        try:
            stop_and_remove_container(workspace.container_id)
        except Exception as e:
            print(f"Failed to remove container: {e}")

    # Remove workspace directory
    workspace_dir = f"/data/workspaces/{workspace_id}"
    if os.path.exists(workspace_dir):
        shutil.rmtree(workspace_dir)

    # Delete from database
    session.delete(workspace)
    session.commit()

    return {"message": "Workspace deleted successfully"}
