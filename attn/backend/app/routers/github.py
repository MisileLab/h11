from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import os
import subprocess

from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()

SSH_DIR = "/data/github/ssh"
GH_CONFIG_DIR = "/data/github/ghconfig"


class GitHubStatus(BaseModel):
    has_public_key: bool
    public_key_path: Optional[str] = None
    gh_config_exists: bool


@router.get("/status", response_model=GitHubStatus)
async def get_github_status(current_user: User = Depends(get_current_user)):
    """Get GitHub SSH and config status"""
    pub_key_path = os.path.join(SSH_DIR, "id_ed25519.pub")
    gh_config_path = os.path.join(GH_CONFIG_DIR, "hosts.yml")

    return GitHubStatus(
        has_public_key=os.path.exists(pub_key_path),
        public_key_path=pub_key_path if os.path.exists(pub_key_path) else None,
        gh_config_exists=os.path.exists(gh_config_path),
    )


@router.get("/public-key")
async def get_public_key(current_user: User = Depends(get_current_user)):
    """Get SSH public key content"""
    pub_key_path = os.path.join(SSH_DIR, "id_ed25519.pub")

    if not os.path.exists(pub_key_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public key not found. Generate one first or run 'gh auth login' in a workspace terminal.",
        )

    try:
        with open(pub_key_path, "r") as f:
            content = f.read().strip()
        return {"public_key": content, "path": pub_key_path}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read public key: {str(e)}",
        )


@router.post("/generate-key")
async def generate_ssh_key(current_user: User = Depends(get_current_user)):
    """Generate SSH key pair for GitHub"""
    private_key_path = os.path.join(SSH_DIR, "id_ed25519")
    pub_key_path = os.path.join(SSH_DIR, "id_ed25519.pub")

    # Check if key already exists
    if os.path.exists(private_key_path):
        return {
            "message": "SSH key already exists",
            "regenerated": False,
            "public_key_path": pub_key_path,
        }

    try:
        # Generate ed25519 key (GitHub recommended)
        subprocess.run(
            [
                "ssh-keygen",
                "-t",
                "ed25519",
                "-f",
                private_key_path,
                "-N",
                "",  # No passphrase
                "-C",
                "opencode-workbench",
            ],
            check=True,
            capture_output=True,
        )

        # Set proper permissions
        os.chmod(private_key_path, 0o600)
        os.chmod(pub_key_path, 0o644)

        # Read public key
        with open(pub_key_path, "r") as f:
            public_key = f.read().strip()

        return {
            "message": "SSH key generated successfully",
            "regenerated": True,
            "public_key": public_key,
            "public_key_path": pub_key_path,
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate SSH key: {e.stderr.decode()}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate SSH key: {str(e)}",
        )
