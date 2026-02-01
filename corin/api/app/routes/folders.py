"""Folder routes."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.folder import FolderCreate, FolderResponse, FolderUpdate
from app.services.folders import (
    create_folder,
    delete_folder,
    get_folder,
    list_folders,
    update_folder,
)

router = APIRouter(prefix="/folders", tags=["folders"])


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder_route(
    payload: FolderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FolderResponse:
    """Create a folder."""

    return create_folder(db, user, payload)


@router.get("", response_model=list[FolderResponse])
def list_folders_route(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FolderResponse]:
    """List folders."""

    return list_folders(db, user)


@router.get("/{folder_id}", response_model=FolderResponse)
def get_folder_route(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FolderResponse:
    """Get a folder."""

    return get_folder(db, user, folder_id)


@router.put("/{folder_id}", response_model=FolderResponse)
def update_folder_route(
    folder_id: int,
    payload: FolderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FolderResponse:
    """Update a folder."""

    return update_folder(db, user, folder_id, payload)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder_route(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a folder."""

    delete_folder(db, user, folder_id)
    return None
