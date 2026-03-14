"""Ingestion management endpoints: manual trigger and status."""

import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])


# Module-level reference set by main.py during lifespan
_bg_service = None


def set_background_service(service) -> None:
    global _bg_service
    _bg_service = service


class IngestionStatusResponse(BaseModel):
    enabled: bool = Field(..., description="Whether background ingestion is enabled")
    running: bool = Field(
        ..., description="Whether an ingestion cycle is currently running"
    )
    last_run: datetime | None = Field(
        None, description="Timestamp of last completed run"
    )


class TriggerResponse(BaseModel):
    status: str = Field(..., description="Status of the trigger request")


@router.get("/status", response_model=IngestionStatusResponse)
async def get_ingestion_status() -> IngestionStatusResponse:
    if _bg_service is None:
        return IngestionStatusResponse(enabled=False, running=False, last_run=None)

    from app.config import get_settings

    settings = get_settings()
    return IngestionStatusResponse(
        enabled=settings.ingestion_enabled,
        running=_bg_service.running,
        last_run=_bg_service.last_run,
    )


@router.post("/trigger", response_model=TriggerResponse, status_code=202)
async def trigger_ingestion() -> TriggerResponse:
    if _bg_service is None:
        raise HTTPException(status_code=503, detail="Ingestion service not initialized")

    if _bg_service.running:
        return TriggerResponse(status="already_running")

    asyncio.create_task(_bg_service.run_ingestion_cycle())
    return TriggerResponse(status="triggered")
