from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers.meetings import router as meetings_router
from app.routers.qa import router as qa_router
from app.routers.segments import router as segments_router
from app.routers.share import router as share_router
from app.storage import ensure_bucket

app = FastAPI(title="Corin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_bucket()


@app.get("/health")
def health() -> dict:
    return {"ok": True}


app.include_router(meetings_router)
app.include_router(segments_router)
app.include_router(qa_router)
app.include_router(share_router)
