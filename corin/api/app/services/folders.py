"""Folder service functions."""

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import FolderCreate, FolderUpdate


def _active_folder_query(db: Session, user_id: int):
    return db.query(Folder).filter(Folder.user_id == user_id).filter(text("is_deleted = false"))


def _get_active_folder(db: Session, user_id: int, folder_id: int) -> Folder:
    folder = _active_folder_query(db, user_id).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def create_folder(db: Session, user: User, payload: FolderCreate) -> Folder:
    """Create a new folder."""

    if payload.parent_id is not None:
        _get_active_folder(db, user.id, payload.parent_id)

    folder = Folder(user_id=user.id, name=payload.name, parent_id=payload.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folders(db: Session, user: User) -> list[Folder]:
    """List folders for a user."""

    return _active_folder_query(db, user.id).order_by(Folder.created_at.desc()).all()


def get_folder(db: Session, user: User, folder_id: int) -> Folder:
    """Get a single folder."""

    return _get_active_folder(db, user.id, folder_id)


def update_folder(db: Session, user: User, folder_id: int, payload: FolderUpdate) -> Folder:
    """Update a folder."""

    folder = _get_active_folder(db, user.id, folder_id)

    if payload.parent_id is not None:
        if payload.parent_id == folder_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid parent")
        _get_active_folder(db, user.id, payload.parent_id)
        folder.parent_id = payload.parent_id

    if payload.name is not None:
        folder.name = payload.name

    db.commit()
    db.refresh(folder)
    return folder


def delete_folder(db: Session, user: User, folder_id: int) -> None:
    """Soft delete a folder."""

    result = db.execute(
        text(
            """
            UPDATE folders
            SET is_deleted = true, updated_at = now()
            WHERE id = :folder_id AND user_id = :user_id AND is_deleted = false
            """
        ),
        {"folder_id": folder_id, "user_id": user.id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    db.commit()
