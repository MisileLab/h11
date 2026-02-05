from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.database import get_session
from app.core.security import verify_password, create_session_token, get_password_hash
from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(
    request: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
):
    """Login user"""
    statement = select(User).where(User.username == request.username)
    user = session.exec(statement).first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # Create session token
    token = create_session_token(user.id)

    # Set HTTP-only cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=86400,  # 24 hours
    )

    return {
        "message": "Login successful",
        "user": UserResponse(id=user.id, username=user.username),
    }


@router.post("/logout")
async def logout(response: Response, current_user: User = Depends(get_current_user)):
    """Logout user"""
    response.delete_cookie(key="session_token", httponly=True, samesite="lax")
    return {"message": "Logout successful"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user"""
    return UserResponse(id=current_user.id, username=current_user.username)


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Change user password"""
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long",
        )

    current_user.hashed_password = get_password_hash(request.new_password)
    session.add(current_user)
    session.commit()

    return {"message": "Password changed successfully"}
