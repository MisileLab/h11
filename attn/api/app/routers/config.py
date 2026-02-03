import json
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.config import CONFIGS_DIR, MAX_FILE_SIZE
from app.models import User, ConfigFile

router = APIRouter(prefix="/api/config", tags=["config"])

ALLOWED_CONFIGS = {
    "opencode": "opencode.jsonc",
    "auth": "auth.json",
    "ohmy": "oh-my-opencode.json",
}


class ConfigStatusResponse(BaseModel):
    opencode: Optional[datetime] = None
    auth: Optional[datetime] = None
    ohmy: Optional[datetime] = None


@router.get("/status", response_model=ConfigStatusResponse)
async def get_config_status(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    configs = session.exec(select(ConfigFile)).all()
    status = {"opencode": None, "auth": None, "ohmy": None}

    for config in configs:
        if config.name in status:
            status[config.name] = config.uploaded_at

    return status


async def upload_config_file(
    config_type: str, file: UploadFile, session: Session, user: User
):
    if config_type not in ALLOWED_CONFIGS:
        raise HTTPException(status_code=400, detail="Invalid config type")

    filename = ALLOWED_CONFIGS[config_type]

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    if not filename.endswith(".jsonc") and not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    try:
        content_str = content.decode("utf-8")
        if filename.endswith(".json"):
            json.loads(content_str)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")

    CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = CONFIGS_DIR / filename

    with open(file_path, "wb") as f:
        f.write(content)

    existing = session.exec(
        select(ConfigFile).where(ConfigFile.name == config_type)
    ).first()

    if existing:
        existing.uploaded_at = datetime.utcnow()
        existing.file_size = len(content)
        session.add(existing)
    else:
        config_file = ConfigFile(
            name=config_type, uploaded_at=datetime.utcnow(), file_size=len(content)
        )
        session.add(config_file)

    session.commit()

    return {"message": "Config uploaded successfully", "filename": filename}


@router.post("/opencode")
async def upload_opencode(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await upload_config_file("opencode", file, session, user)


@router.post("/auth")
async def upload_auth(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await upload_config_file("auth", file, session, user)


@router.post("/ohmy")
async def upload_ohmy(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await upload_config_file("ohmy", file, session, user)
