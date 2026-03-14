"""FastAPI application entry point."""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.papers import router as papers_router
from app.api.reading_list import router as reading_list_router
from app.api.recommendations import router as recommendations_router
from app.api.search import router as search_router
from app.config import get_settings
from app.db import database_url_to_path, init_db
from app.middleware import AnonymousTrackingMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    db_conn = await init_db(database_url_to_path(settings.database_url))
    db_conn.close()
    yield


app = FastAPI(
    title="arXgorithm API",
    description="Paper recommendation engine with arXiv integration",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: Allow the configured frontend origin to call the API from the browser.
# credentials=True is required so the browser sends cookies (session, anonymous_id).
_settings = get_settings()

# SESSION_SECRET must be explicitly set; no fallback allowed.
_session_secret = os.environ.get("SESSION_SECRET")
if not _session_secret:
    raise RuntimeError(
        "SESSION_SECRET environment variable is required and must not be empty"
    )

app.add_middleware(
    CORSMiddleware,  # type: ignore[arg-type]
    allow_origins=_settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AnonymousTrackingMiddleware: Track anonymous users via cookie UUID (must be early in stack).
app.add_middleware(AnonymousTrackingMiddleware)

# SessionMiddleware required by Authlib for OAuth state (CSRF) during redirect flow.
# Uses a separate cookie name to avoid conflict with our JWT "session" cookie.
app.add_middleware(
    SessionMiddleware,  # type: ignore[arg-type]
    secret_key=_session_secret,
    session_cookie="_oauth_state",
)

# Register API routers
app.include_router(auth_router)
app.include_router(search_router)
app.include_router(papers_router)
app.include_router(reading_list_router)
app.include_router(recommendations_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
