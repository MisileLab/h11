"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.auth import router as auth_router
from app.routes.folders import router as folders_router
from app.routes.meetings import router as meetings_router
from app.routes.upload import router as upload_router
from app.routes.transcript import router as transcript_router
from app.routes.summaries import router as summaries_router
from app.routes.search import router as search_router
from app.routes.qa import router as qa_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    print("🚀 Corin API starting...")
    yield
    # Shutdown
    print("👋 Corin API shutting down...")


app = FastAPI(
    title="Corin API",
    description="Meeting Archive & Transcription System",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix="/api")
app.include_router(folders_router, prefix="/api")
app.include_router(meetings_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(transcript_router, prefix="/api")
app.include_router(summaries_router, prefix="/api")
app.include_router(search_router)
app.include_router(qa_router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {"message": "Corin API", "version": "0.1.0"}


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.dev,
    )
