from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.database import get_session
from app.core.security import get_password_hash
from app.models.user import User

router = APIRouter()


class SetupStatus(BaseModel):
    is_setup: bool


class SetupRequest(BaseModel):
    username: str
    password: str


@router.get("/setup/status", response_model=SetupStatus)
async def get_setup_status(session: Session = Depends(get_session)):
    """Check if initial setup is complete"""
    statement = select(User)
    user = session.exec(statement).first()
    return SetupStatus(is_setup=user is not None)


@router.post("/setup")
async def setup(request: SetupRequest, session: Session = Depends(get_session)):
    """Initial setup - create admin user"""
    # Check if already setup
    statement = select(User)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup already completed",
        )

    # Validate input
    if len(request.username) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be at least 3 characters",
        )
    if len(request.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

    # Create admin user
    user = User(
        username=request.username,
        hashed_password=get_password_hash(request.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return {"message": "Setup completed successfully", "username": user.username}
