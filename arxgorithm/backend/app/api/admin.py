"""Admin API endpoints for ingestion control and TEI management."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api import ingestion
from app.api.dependencies import User, get_current_user
from app.config import get_settings
from app.services.saladcloud import SaladCloudService

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_background_service():
    """Get the background ingestion service set by main.py."""
    if ingestion._bg_service is None:
        raise HTTPException(
            status_code=503, detail="Background service not initialized"
        )
    return ingestion._bg_service


def require_admin(user: User = Depends(get_current_user)) -> User:
    settings = get_settings()
    if user.email != settings.admin_email:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/ingestion/status")
async def get_ingestion_status(
    _: User = Depends(require_admin),
    service=Depends(get_background_service),
) -> dict[str, Any]:
    return {
        "running": service.running,
        "last_run": service.last_run.isoformat() if service.last_run else None,
        "categories": service._get_categories(),
        "citation_threshold": service.settings.ingestion_citation_threshold,
        "max_per_category": service.settings.ingestion_max_papers_per_category,
        "interval_hours": service.settings.ingestion_interval_hours,
    }


@router.post("/ingestion/trigger")
async def trigger_ingestion(
    _: User = Depends(require_admin),
    service=Depends(get_background_service),
) -> dict[str, str]:
    await service.run_ingestion_cycle()
    return {"status": "triggered"}


@router.get("/tei/status")
async def get_tei_status(
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    settings = get_settings()
    salad = SaladCloudService(settings)
    container = await salad.get_container_status()
    if container is None:
        return {"status": "unknown", "url": None}
    return {
        "status": container.status.value,
        "url": container.url,
        "created_at": container.created_at.isoformat()
        if container.created_at
        else None,
    }


@router.post("/tei/start")
async def start_tei(
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    settings = get_settings()
    salad = SaladCloudService(settings)
    container = await salad.start_container()
    if container is None:
        raise HTTPException(status_code=500, detail="Failed to start TEI container")
    return {
        "status": container.status.value,
        "url": container.url,
        "message": "TEI container starting",
    }


@router.post("/tei/stop")
async def stop_tei(
    _: User = Depends(require_admin),
) -> dict[str, str]:
    settings = get_settings()
    salad = SaladCloudService(settings)
    success = await salad.stop_container()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to stop TEI container")
    return {"status": "stopped", "message": "TEI container stopping"}
