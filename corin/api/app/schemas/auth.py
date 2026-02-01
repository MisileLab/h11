"""Authentication schemas."""

from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    """Payload for Google OAuth token exchange."""

    id_token: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Refresh token payload."""

    refresh_token: str
