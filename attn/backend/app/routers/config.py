from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import json
import aiofiles

from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()

CONFIG_DIR = "/data/configs"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


class ConfigFileStatus(BaseModel):
    exists: bool
    last_uploaded: Optional[datetime] = None
    size: Optional[int] = None


class ConfigStatus(BaseModel):
    opencode: ConfigFileStatus
    auth: ConfigFileStatus
    ohmy: ConfigFileStatus


def get_file_status(filename: str) -> ConfigFileStatus:
    """Get status of a config file"""
    filepath = os.path.join(CONFIG_DIR, filename)
    if os.path.exists(filepath):
        stat = os.stat(filepath)
        return ConfigFileStatus(
            exists=True,
            last_uploaded=datetime.fromtimestamp(stat.st_mtime),
            size=stat.st_size,
        )
    return ConfigFileStatus(exists=False)


def validate_json_file(content: bytes, filename: str) -> None:
    """Validate JSON/JSONC file"""
    try:
        # Try to parse as JSON (JSONC requires preprocessing for comments)
        text = content.decode("utf-8")
        # Simple JSONC handling: remove // comments
        lines = []
        for line in text.split("\n"):
            # Remove single-line comments
            if "//" in line:
                line = line[: line.index("//")]
            lines.append(line)
        cleaned = "\n".join(lines)
        json.loads(cleaned)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON file: {str(e)}",
        )


async def save_config_file(file: UploadFile, expected_name: str) -> None:
    """Save and validate config file"""
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large (max {MAX_FILE_SIZE} bytes)",
        )

    # Validate JSON
    validate_json_file(content, expected_name)

    # Save file
    filepath = os.path.join(CONFIG_DIR, expected_name)
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)


@router.get("/status", response_model=ConfigStatus)
async def get_config_status(current_user: User = Depends(get_current_user)):
    """Get status of all config files"""
    return ConfigStatus(
        opencode=get_file_status("opencode.jsonc"),
        auth=get_file_status("auth.json"),
        ohmy=get_file_status("oh-my-opencode.json"),
    )


@router.post("/opencode")
async def upload_opencode_config(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload or replace opencode.jsonc"""
    if not file.filename.endswith((".json", ".jsonc")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .json or .jsonc",
        )

    await save_config_file(file, "opencode.jsonc")
    return {
        "message": "opencode.jsonc uploaded successfully",
        "status": get_file_status("opencode.jsonc"),
    }


@router.post("/auth")
async def upload_auth_config(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload or replace auth.json"""
    if not file.filename.endswith(".json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .json",
        )

    await save_config_file(file, "auth.json")
    return {
        "message": "auth.json uploaded successfully",
        "status": get_file_status("auth.json"),
    }


@router.post("/ohmy")
async def upload_ohmy_config(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload or replace oh-my-opencode.json"""
    if not file.filename.endswith(".json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .json",
        )

    await save_config_file(file, "oh-my-opencode.json")
    return {
        "message": "oh-my-opencode.json uploaded successfully",
        "status": get_file_status("oh-my-opencode.json"),
    }
