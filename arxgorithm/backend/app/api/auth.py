"""OAuth authentication endpoints using Authlib.

Routes (static before parametric to avoid path-parameter capture):
- GET  /api/auth/me                 → current user from JWT cookie
- POST /api/auth/logout             → clear session cookie
- GET  /api/auth/{provider}         → redirect to OAuth consent screen
- GET  /api/auth/{provider}/callback → handle callback, upsert user, set JWT

Supported providers: google, github.
Session state: JWT in httpOnly cookie named ``session``.
"""

import time
from typing import Optional

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db import get_db_connection

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Constants ──────────────────────────────────────────────────────

SUPPORTED_PROVIDERS = {"google", "github"}
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days
SESSION_COOKIE = "session"

# ── JWT Helpers ────────────────────────────────────────────────────


def create_jwt_token(
    user_id: int,
    email: Optional[str],
    name: Optional[str],
    provider: str,
) -> str:
    """Create a signed JWT for user session."""
    settings = get_settings()
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "provider": provider,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY_SECONDS,
    }
    return jwt.encode(payload, settings.session_secret, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT. Returns payload dict or None."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.session_secret, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def _set_session_cookie(response, token: str) -> None:
    """Set JWT as httpOnly secure cookie."""
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=JWT_EXPIRY_SECONDS,
        path="/",
    )


def _clear_session_cookie(response) -> None:
    """Delete the session cookie."""
    response.delete_cookie(key=SESSION_COOKIE, path="/")


def _merge_anonymous_reading_list(db_conn, anonymous_id: str, user_id: int) -> int:
    """Transfer anonymous reading list entries to the authenticated user.

    Uses union semantics: INSERT OR IGNORE prevents duplicates when both
    anonymous and authenticated users have saved the same paper.

    Args:
        db_conn: SQLite connection (caller manages lifecycle).
        anonymous_id: Cookie UUID of the anonymous session.
        user_id: Authenticated user's database ID.

    Returns:
        Number of entries newly transferred (excludes duplicates).
    """
    rows = db_conn.execute(
        "SELECT paper_id, saved_at FROM reading_list WHERE anonymous_id = ?",
        (anonymous_id,),
    ).fetchall()

    transferred = 0
    for paper_id, saved_at in rows:
        cursor = db_conn.execute(
            "INSERT OR IGNORE INTO reading_list (user_id, paper_id, saved_at) "
            "VALUES (?, ?, ?)",
            (user_id, paper_id, saved_at),
        )
        if cursor.rowcount and cursor.rowcount > 0:
            transferred += 1

    # Remove the now-migrated anonymous entries
    db_conn.execute(
        "DELETE FROM reading_list WHERE anonymous_id = ?",
        (anonymous_id,),
    )

    db_conn.commit()
    return transferred


# ── OAuth Client ───────────────────────────────────────────────────

_oauth: Optional[OAuth] = None


def get_oauth() -> OAuth:
    """Lazily initialize the Authlib OAuth registry."""
    global _oauth
    if _oauth is not None:
        return _oauth

    settings = get_settings()
    _oauth = OAuth()

    if settings.google_client_id and settings.google_client_secret:
        _oauth.register(
            name="google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url=(
                "https://accounts.google.com/.well-known/openid-configuration"
            ),
            client_kwargs={"scope": "openid email profile"},
        )

    if settings.github_client_id and settings.github_client_secret:
        _oauth.register(
            name="github",
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            authorize_url="https://github.com/login/oauth/authorize",
            access_token_url="https://github.com/login/oauth/access_token",
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "user:email"},
        )

    return _oauth


# ── Response Models ────────────────────────────────────────────────


class UserInfo(BaseModel):
    """Authenticated user info returned by /me."""

    id: int = Field(..., description="User database ID")
    email: Optional[str] = Field(None, description="Email from OAuth provider")
    name: Optional[str] = Field(None, description="Display name")
    provider: str = Field(..., description="OAuth provider (google or github)")


# ── Endpoints (static routes FIRST to avoid {provider} capture) ───


@router.get("/me", response_model=UserInfo)
async def get_current_user(request: Request):
    """Return the authenticated user from the JWT session cookie."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_jwt_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return UserInfo(
        id=int(payload["sub"]),
        email=payload.get("email"),
        name=payload.get("name"),
        provider=payload["provider"],
    )


@router.post("/logout")
async def logout():
    """Clear the session cookie and log out."""
    response = JSONResponse(content={"status": "logged_out"})
    _clear_session_cookie(response)
    return response


@router.get("/{provider}")
async def oauth_redirect(provider: str, request: Request):
    """Redirect user to OAuth provider consent screen."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    oauth = get_oauth()
    client = getattr(oauth, provider, None)
    if client is None:
        raise HTTPException(
            status_code=400, detail=f"Provider {provider} not configured"
        )

    settings = get_settings()
    redirect_uri = f"{settings.backend_url}/api/auth/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request):
    """Handle OAuth callback: exchange code, upsert user, set JWT cookie."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    oauth = get_oauth()
    client = getattr(oauth, provider, None)
    if client is None:
        raise HTTPException(
            status_code=400, detail=f"Provider {provider} not configured"
        )

    # Exchange authorization code for access token
    token_data = await client.authorize_access_token(request)

    # Extract user profile from provider-specific response
    if provider == "google":
        userinfo = token_data.get("userinfo", {})
        oauth_id = userinfo.get("sub", "")
        email = userinfo.get("email")
        name = userinfo.get("name")
    else:  # github
        resp = await client.get("user", token=token_data)
        userinfo = resp.json()
        oauth_id = str(userinfo.get("id", ""))
        email = userinfo.get("email")
        name = userinfo.get("name") or userinfo.get("login")

    if not oauth_id:
        raise HTTPException(
            status_code=400,
            detail="Could not retrieve user ID from provider",
        )

    # Upsert user in database
    settings = get_settings()
    db_conn = get_db_connection(settings.database_url)

    try:
        row = db_conn.execute(
            "SELECT id, email, name FROM users "
            "WHERE oauth_provider = ? AND oauth_id = ? LIMIT 1",
            (provider, oauth_id),
        ).fetchone()

        user_id: int
        if row:
            user_id = int(row[0])
            # Update profile if changed
            if email != row[1] or name != row[2]:
                db_conn.execute(
                    "UPDATE users SET email = ?, name = ? WHERE id = ?",
                    (email, name, user_id),
                )
                db_conn.commit()
        else:
            cursor = db_conn.execute(
                "INSERT INTO users (oauth_provider, oauth_id, email, name) "
                "VALUES (?, ?, ?, ?)",
                (provider, oauth_id, email, name),
            )
            db_conn.commit()
            if cursor.lastrowid is None:
                raise HTTPException(status_code=500, detail="Failed to create user")
            user_id = cursor.lastrowid

        # Merge anonymous reading list into the authenticated user
        anonymous_id = request.cookies.get("anonymous_id")
        if anonymous_id:
            _merge_anonymous_reading_list(db_conn, anonymous_id, user_id)

        # Build JWT and redirect to frontend with session cookie
        jwt_token = create_jwt_token(user_id, email, name, provider)

        response = RedirectResponse(url=settings.frontend_url, status_code=302)
        _set_session_cookie(response, jwt_token)

        # Clear anonymous cookie after successful merge
        if anonymous_id:
            response.delete_cookie(key="anonymous_id", path="/")

        return response
    finally:
        db_conn.close()
