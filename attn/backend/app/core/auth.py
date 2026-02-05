from fastapi import Depends, HTTPException, status, Cookie
from sqlmodel import Session, select
from typing import Optional, Annotated

from app.core.database import get_session
from app.core.security import verify_session_token
from app.models.user import User


async def get_current_user(
    session_token: Annotated[Optional[str], Cookie()] = None,
    session: Session = Depends(get_session),
) -> User:
    """Get current authenticated user from session cookie"""
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user_id = verify_session_token(session_token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user
