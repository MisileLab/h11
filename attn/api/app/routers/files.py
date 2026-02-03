from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.config import WORKSPACES_DIR, MAX_FILE_SIZE
from app.models import User, Workspace

router = APIRouter(prefix="/api/workspaces", tags=["files"])


class FileInfo(BaseModel):
    name: str
    type: str
    size: Optional[int] = None


class FilesListResponse(BaseModel):
    files: list[FileInfo]


class FileContentResponse(BaseModel):
    content: str


class FileWriteRequest(BaseModel):
    content: str


def _resolve_safe_path(workspace_id: str, path: str) -> Path:
    workspace_root = WORKSPACES_DIR / workspace_id / "repo"

    if not path.startswith("/"):
        path = "/" + path

    requested_path = workspace_root / path.lstrip("/")

    try:
        resolved = requested_path.resolve()
        workspace_root_resolved = workspace_root.resolve()

        if not str(resolved).startswith(str(workspace_root_resolved)):
            raise ValueError("Path traversal detected")

        return resolved
    except (ValueError, RuntimeError):
        raise ValueError("Invalid path")


@router.get("/{workspace_id}/files", response_model=FilesListResponse)
async def list_files(
    workspace_id: str,
    path: str = "/",
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        target_path = _resolve_safe_path(workspace_id, path)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if not target_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    files = []
    try:
        for item in target_path.iterdir():
            if item.is_dir():
                files.append(FileInfo(name=item.name, type="dir"))
            else:
                files.append(
                    FileInfo(name=item.name, type="file", size=item.stat().st_size)
                )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return FilesListResponse(files=files)


@router.get("/{workspace_id}/file", response_model=FileContentResponse)
async def read_file(
    workspace_id: str,
    path: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        target_path = _resolve_safe_path(workspace_id, path)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not target_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    file_size = target_path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    try:
        content = target_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not UTF-8 text")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return FileContentResponse(content=content)


@router.put("/{workspace_id}/file")
async def write_file(
    workspace_id: str,
    path: str,
    request: FileWriteRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        target_path = _resolve_safe_path(workspace_id, path)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(request.content, encoding="utf-8")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "File written successfully"}
