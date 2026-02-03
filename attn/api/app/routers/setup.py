from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from app.core.database import get_session
from app.core.security import hash_password
from app.models import User

router = APIRouter(prefix="/api/setup", tags=["setup"])


class SetupRequest(BaseModel):
    username: str
    password: str


class SetupResponse(BaseModel):
    message: str


class StatusResponse(BaseModel):
    is_setup: bool


@router.get("/status", response_model=StatusResponse)
async def setup_status(session: Session = Depends(get_session)):
    user_exists = session.exec(select(User)).first() is not None
    return StatusResponse(is_setup=user_exists)


@router.post("/", response_model=SetupResponse)
async def setup(request: SetupRequest, session: Session = Depends(get_session)):
    user_exists = session.exec(select(User)).first() is not None

    if user_exists:
        raise HTTPException(status_code=400, detail="Setup already completed")

    hashed_password = hash_password(request.password)
    new_user = User(username=request.username, password_hash=hashed_password)
    session.add(new_user)
    session.commit()

    return SetupResponse(message="User created successfully")
