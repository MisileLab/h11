"""Authentication routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.schemas.auth import GoogleAuthRequest, TokenRefresh, TokenResponse
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_or_create_user,
    validate_google_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=TokenResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate with Google OAuth ID token."""

    google_payload = validate_google_token(payload.id_token)
    user = get_or_create_user(db, google_payload)
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: TokenRefresh, db: Session = Depends(get_db)) -> TokenResponse:
    """Refresh access token."""

    token_payload = decode_token(payload.refresh_token, token_type="refresh")
    user_id = token_payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
