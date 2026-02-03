from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import init_db
from app.routers import (
    setup,
    auth,
    config,
    workspaces,
    files,
    terminal,
    preview,
    github,
    tests,
    pr,
)

app = FastAPI(title="OpenCode Workbench API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(config.router)
app.include_router(workspaces.router)
app.include_router(files.router)
app.include_router(terminal.router)
app.include_router(preview.router)
app.include_router(github.router)
app.include_router(tests.router)
app.include_router(pr.router)


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/")
async def root():
    return {"message": "OpenCode Workbench API"}
