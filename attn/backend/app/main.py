from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os

from app.core.database import init_db
from app.routers import (
    setup,
    auth,
    config,
    github,
    workspaces,
    files,
    terminal,
    preview,
    pr,
    tests,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    os.makedirs("/data/workspaces", exist_ok=True)
    os.makedirs("/data/configs", exist_ok=True)
    os.makedirs("/data/github/ssh", exist_ok=True)
    os.makedirs("/data/github/ghconfig", exist_ok=True)
    yield
    # Shutdown


app = FastAPI(title="OpenCode Workbench API", lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(setup.router, prefix="/api", tags=["setup"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(github.router, prefix="/api/github", tags=["github"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(files.router, prefix="/api/workspaces", tags=["files"])
app.include_router(terminal.router, prefix="/api/workspaces", tags=["terminal"])
app.include_router(preview.router, prefix="/api/workspaces", tags=["preview"])
app.include_router(pr.router, prefix="/api/workspaces", tags=["pr"])
app.include_router(tests.router, prefix="/api/workspaces", tags=["tests"])


@app.get("/")
async def root():
    return {"message": "OpenCode Workbench API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
