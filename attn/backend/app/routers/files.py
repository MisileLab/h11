from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlmodel import Session
from pydantic import BaseModel
from typing import List, Optional
import os
from pathlib import Path

from app.core.database import get_session
from app.core.auth import get_current_user
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter()


class FileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None


class FileContent(BaseModel):
    content: str


def validate_path(workspace_id: int, relative_path: str) -> Path:
    """Validate and resolve path to prevent traversal attacks"""
    base_path = Path(f"/data/workspaces/{workspace_id}/repo")

    # Normalize and resolve path
    target_path = (base_path / relative_path).resolve()

    # Ensure target is within base path
    if not str(target_path).startswith(str(base_path)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid path: path traversal detected",
        )

    return target_path


def get_workspace_or_403(
    workspace_id: int, user_id: int, session: Session
) -> Workspace:
    """Get workspace and verify ownership"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    if workspace.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workspace",
        )

    return workspace


@router.get("/{workspace_id}/files", response_model=List[FileInfo])
async def list_files(
    workspace_id: int,
    path: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List files in workspace directory"""
    get_workspace_or_403(workspace_id, current_user.id, session)

    target_path = validate_path(workspace_id, path)

    if not target_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Path not found",
        )

    if not target_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a directory",
        )

    files = []
    try:
        for entry in sorted(
            target_path.iterdir(), key=lambda x: (not x.is_dir(), x.name)
        ):
            rel_path = str(
                entry.relative_to(Path(f"/data/workspaces/{workspace_id}/repo"))
            )
            files.append(
                FileInfo(
                    name=entry.name,
                    path=rel_path,
                    is_dir=entry.is_dir(),
                    size=entry.stat().st_size if entry.is_file() else None,
                )
            )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )

    return files


@router.get("/{workspace_id}/file", response_model=FileContent)
async def read_file(
    workspace_id: int,
    path: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Read file content"""
    get_workspace_or_403(workspace_id, current_user.id, session)

    target_path = validate_path(workspace_id, path)

    if not target_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    if not target_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a file",
        )

    try:
        content = target_path.read_text(encoding="utf-8")
        return FileContent(content=content)
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a text file",
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )


@router.put("/{workspace_id}/file")
async def write_file(
    workspace_id: int,
    path: str,
    content: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Write file content"""
    get_workspace_or_403(workspace_id, current_user.id, session)

    target_path = validate_path(workspace_id, path)

    # Create parent directories if needed
    target_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        target_path.write_text(content, encoding="utf-8")
        return {"message": "File saved successfully", "path": path}
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
