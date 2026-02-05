"""Authentication service functions."""

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def validate_google_token(id_token: str) -> dict[str, Any]:
    """Validate Google ID token and return claims."""

    settings = get_settings()
    try:
        response = httpx.get(GOOGLE_TOKENINFO_URL, params={"id_token": id_token}, timeout=10)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to validate Google token",
        ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    payload = response.json()
    if payload.get("aud") != settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token audience"
        )

    return payload


def get_or_create_user(db: Session, payload: dict[str, Any]) -> User:
    """Create or update a user from Google payload."""

    google_sub = payload.get("sub")
    if not google_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if not user:
        user_in = UserCreate(
            google_sub=google_sub,
            email=payload.get("email", ""),
            name=payload.get("name", ""),
            picture=payload.get("picture"),
        )
        user = User(**user_in.model_dump())
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    update = UserUpdate(
        name=payload.get("name") or user.name,
        picture=payload.get("picture") or user.picture,
    )
    user.email = payload.get("email", user.email)
    user.name = update.name or user.name
    user.picture = update.picture
    db.commit()
    db.refresh(user)
    return user


def _create_token(user_id: int, token_type: str, expires_delta: timedelta) -> str:
    settings = get_settings()
    expire_at = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "exp": expire_at,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    """Create access token for a user."""

    settings = get_settings()
    expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    return _create_token(user_id, "access", expires)


def create_refresh_token(user_id: int) -> str:
    """Create refresh token for a user."""

    settings = get_settings()
    expires = timedelta(days=settings.jwt_refresh_token_expire_days)
    return _create_token(user_id, "refresh", expires)


def decode_token(token: str, token_type: str) -> dict[str, Any]:
    """Decode and validate JWT token."""

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    if payload.get("type") != token_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    return payload
