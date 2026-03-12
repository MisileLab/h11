"""Anonymous user tracking middleware.

Tracks anonymous users via cookie UUID with automatic creation.
On each request:
1. Check for 'anonymous_id' cookie
2. If missing, generate new UUID and set cookie (1-year expiry)
3. Store/update session in anonymous_sessions table
4. Attach anonymous_id to request state for use in endpoints
"""

import time
import uuid
from datetime import datetime, timedelta, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import get_settings
from app.db import get_db_connection

__all__ = ["AnonymousTrackingMiddleware"]


class _AnonymousTrackingImpl(BaseHTTPMiddleware):
    """Middleware to track anonymous users via cookie UUID.

    Behavior:
    - Check for `anonymous_id` cookie on each request
    - If missing, generate new UUID, set cookie (1-year expiry)
    - Insert new session or update last_seen_at in anonymous_sessions table
    - Attach anonymous_id to request.state for endpoint use
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request: create/track anonymous ID, update session."""
        # Extract cookie or generate new UUID
        anonymous_id = request.cookies.get("anonymous_id")
        is_new_session = False

        if not anonymous_id:
            anonymous_id = str(uuid.uuid4())
            is_new_session = True

        # Store in request state for use by endpoints
        request.state.anonymous_id = anonymous_id

        # Update session in database
        try:
            settings = get_settings()
            db_conn = get_db_connection(settings.database_url)

            now_unix = int(time.time())

            if is_new_session:
                # Insert new session
                db_conn.execute(
                    """
                    INSERT INTO anonymous_sessions (cookie_uuid, created_at, last_seen_at)
                    VALUES (?, ?, ?)
                    """,
                    (anonymous_id, now_unix, now_unix),
                )
            else:
                # Update last_seen_at for existing session
                db_conn.execute(
                    """
                    UPDATE anonymous_sessions
                    SET last_seen_at = ?
                    WHERE cookie_uuid = ?
                    """,
                    (now_unix, anonymous_id),
                )

            db_conn.commit()
            db_conn.close()
        except Exception:
            # Silently fail: don't break request if session update fails
            pass

        # Call next middleware/endpoint
        response = await call_next(request)

        # If new session, set cookie (1-year expiry)
        if is_new_session:
            expires = datetime.now(timezone.utc) + timedelta(days=365)
            response.set_cookie(
                key="anonymous_id",
                value=anonymous_id,
                expires=expires.timestamp(),
                path="/",
                httponly=True,
                secure=False,  # Set to True in production HTTPS
                samesite="lax",
            )

        return response


def AnonymousTrackingMiddleware(
    app: ASGIApp, *args, **kwargs
) -> _AnonymousTrackingImpl:
    """Factory function to create the anonymous tracking middleware.

    Returns a middleware instance ready for use with FastAPI.add_middleware().
    """
    return _AnonymousTrackingImpl(app)
