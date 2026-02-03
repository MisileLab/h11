from typing import Optional
from datetime import datetime
from fastapi import Cookie, HTTPException, Depends
from sqlmodel import Session, select
from app.core.database import get_session
from app.core.config import SESSION_COOKIE_NAME
from app.models import User, Session as DBSession


async def get_current_user(
    session: Session = Depends(get_session),
    session_id: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
) -> User:
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db_session = session.exec(
        select(DBSession).where(DBSession.id == session_id)
    ).first()

    if not db_session:
        raise HTTPException(status_code=401, detail="Invalid session")

    if db_session.expires_at < datetime.utcnow():
        session.delete(db_session)
        session.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    user = session.exec(select(User).where(User.id == db_session.user_id)).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
