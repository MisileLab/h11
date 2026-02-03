from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from sqlmodel import Session, select
from app.core.database import get_session
from app.core.security import verify_password, generate_session_id, get_session_expiry
from app.core.config import SESSION_COOKIE_NAME, SESSION_MAX_AGE
from app.core.deps import get_current_user
from app.models import User, Session as DBSession

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    message: str


class MeResponse(BaseModel):
    id: int
    username: str


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest, response: Response, session: Session = Depends(get_session)
):
    user = session.exec(select(User).where(User.username == request.username)).first()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session_id = generate_session_id()
    expires_at = get_session_expiry()

    db_session = DBSession(id=session_id, user_id=user.id, expires_at=expires_at)
    session.add(db_session)
    session.commit()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )

    return LoginResponse(message="Login successful")


@router.post("/logout", response_model=dict)
async def logout(
    response: Response,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    db_sessions = session.exec(
        select(DBSession).where(DBSession.user_id == user.id)
    ).all()
    for db_session in db_sessions:
        session.delete(db_session)
    session.commit()

    response.delete_cookie(key=SESSION_COOKIE_NAME)

    return {"message": "Logout successful"}


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(id=user.id, username=user.username)
