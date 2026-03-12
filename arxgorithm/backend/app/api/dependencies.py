"""Authentication dependencies for protected routes.

Provides three dependencies for route handlers:
1. get_current_user: Returns User or raises 401
2. get_optional_user: Returns User or None (no auth required)
3. get_anonymous_id: Returns UUID from cookie

These dependencies wrap JWT verification and cookie handling,
enabling clean endpoint contracts and automatic OpenAPI documentation.
"""

import uuid
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.auth import verify_jwt_token

__all__ = ["User", "get_current_user", "get_optional_user", "get_anonymous_id"]


class User(BaseModel):
    """Authenticated user extracted from JWT token."""

    id: int = Field(..., description="User database ID")
    email: Optional[str] = Field(None, description="Email from OAuth provider")
    name: Optional[str] = Field(None, description="Display name")
    provider: str = Field(..., description="OAuth provider (google or github)")


def get_current_user(request: Request) -> User:
    """Dependency: Return authenticated user or raise 401.

    Expects JWT token in ``session`` cookie. Raises HTTPException 401 if:
    - Cookie not present
    - Token invalid or expired
    - Token missing required fields (sub, provider)

    Usage:
        @router.get("/api/protected")
        async def protected_endpoint(user: User = Depends(get_current_user)):
            return {"message": f"Hello, {user.name}"}
    """
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_jwt_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # Validate required fields
    try:
        user_id = int(payload.get("sub", 0))
        provider = payload.get("provider", "")
        if not user_id or not provider:
            raise ValueError("Missing required token fields")
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token structure")

    return User(
        id=user_id,
        email=payload.get("email"),
        name=payload.get("name"),
        provider=provider,
    )


def get_optional_user(request: Request) -> Optional[User]:
    """Dependency: Return authenticated user or None.

    Never raises 401. Returns None if:
    - Cookie not present
    - Token invalid or expired
    - Token missing required fields

    Usage:
        @router.get("/api/optional-auth")
        async def optional_endpoint(user: Optional[User] = Depends(get_optional_user)):
            if user:
                return {"message": f"Logged in as {user.name}"}
            return {"message": "Anonymous user"}
    """
    try:
        return get_current_user(request)
    except HTTPException:
        return None


def get_anonymous_id(
    request: Request, anonymous_id: Optional[str] = Cookie(None)
) -> str:
    """Dependency: Return UUID from anonymous_id cookie.

    The cookie is set by AnonymousTrackingMiddleware on first request.
    This dependency extracts it for use in endpoints that support anonymous access.

    Returns:
        UUID string from cookie, or raises 401 if not present (likely middleware not configured).

    Usage:
        @router.get("/api/anon-only")
        async def anon_endpoint(anon_id: str = Depends(get_anonymous_id)):
            return {"anonymous_id": anon_id}
    """
    if not anonymous_id:
        raise HTTPException(
            status_code=401,
            detail="Anonymous tracking cookie not found. Ensure AnonymousTrackingMiddleware is registered.",
        )
    return anonymous_id
