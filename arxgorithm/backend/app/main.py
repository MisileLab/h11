"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.ingestion import router as ingestion_router, set_background_service
from app.api.papers import router as papers_router
from app.api.reading_list import router as reading_list_router
from app.api.recommendations import router as recommendations_router
from app.api.search import router as search_router
from app.config import get_settings
from app.db import database_url_to_path, get_db_connection, init_db
from app.http_client import HTTPClient
from app.middleware import AnonymousTrackingMiddleware
from app.services.arxiv import ArxivClient
from app.services.background_ingestion import BackgroundIngestionService
from app.services.embedding import EmbeddingService
from app.services.semantic_scholar import SemanticScholarClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    db_path = database_url_to_path(settings.database_url)
    db_conn = await init_db(db_path)
    db_conn.close()

    arxiv_db_conn = get_db_connection(settings.database_url)
    arxiv_client = ArxivClient(arxiv_db_conn)
    http_client = HTTPClient()
    embedding_service = EmbeddingService(settings, db_path)
    semantic_scholar = SemanticScholarClient(
        http_client, api_key=settings.semantic_scholar_api_key
    )
    bg_service = BackgroundIngestionService(
        settings=settings,
        arxiv_client=arxiv_client,
        embedding_service=embedding_service,
        semantic_scholar=semantic_scholar,
        db_path=db_path,
    )
    set_background_service(bg_service)

    if settings.ingestion_enabled:
        bg_service.start_scheduler()
        logger.info("Background ingestion scheduler started")

    yield

    bg_service.stop_scheduler()
    arxiv_db_conn.close()


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
