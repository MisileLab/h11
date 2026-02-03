import os
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.config import GITHUB_SSH_DIR, GITHUB_CONFIG_DIR
from app.core.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/github", tags=["github"])


class StatusResponse(BaseModel):
    is_authed: bool
    has_public_key: bool
    key_path: Optional[str]


class PublicKeyResponse(BaseModel):
    key: str


class GenerateKeyRequest(BaseModel):
    email: str
    overwrite: bool = False


class GenerateKeyResponse(BaseModel):
    public_key: str


@router.get("/status", response_model=StatusResponse)
async def get_github_status(user: User = Depends(get_current_user)):
    gh_config_exists = (GITHUB_CONFIG_DIR / "hosts.yml").exists()
    public_key_path = GITHUB_SSH_DIR / "id_ed25519.pub"
    has_public_key = public_key_path.exists()

    return StatusResponse(
        is_authed=gh_config_exists,
        has_public_key=has_public_key,
        key_path=str(public_key_path) if has_public_key else None,
    )


@router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key(user: User = Depends(get_current_user)):
    public_key_path = GITHUB_SSH_DIR / "id_ed25519.pub"

    if not public_key_path.exists():
        raise HTTPException(status_code=404, detail="Public key not found")

    with open(public_key_path, "r") as f:
        key_content = f.read()

    return PublicKeyResponse(key=key_content)


@router.post("/generate-key", response_model=GenerateKeyResponse)
async def generate_key(
    request: GenerateKeyRequest, user: User = Depends(get_current_user)
):
    private_key_path = GITHUB_SSH_DIR / "id_ed25519"
    public_key_path = GITHUB_SSH_DIR / "id_ed25519.pub"

    if private_key_path.exists() and not request.overwrite:
        raise HTTPException(status_code=409, detail="Key already exists")

    GITHUB_SSH_DIR.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "ssh-keygen",
            "-t",
            "ed25519",
            "-C",
            request.email,
            "-f",
            str(private_key_path),
            "-N",
            "",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SSH key: {result.stderr}",
        )

    with open(public_key_path, "r") as f:
        public_key = f.read()

    return GenerateKeyResponse(public_key=public_key)
