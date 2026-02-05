from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os

from app.core.database import get_session
from app.core.auth import get_current_user
from app.models.user import User
from app.models.workspace import Workspace, TestConfig
from app.services.docker_manager import exec_in_container

router = APIRouter()


class TestConfigModel(BaseModel):
    command: str


class TestConfigResponse(BaseModel):
    command: str
    updated_at: datetime


class TestRunResponse(BaseModel):
    exit_code: int
    output: str
    artifacts_path: str


@router.get("/{workspace_id}/tests/config", response_model=TestConfigResponse)
async def get_test_config(
    workspace_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get test configuration for workspace"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    statement = select(TestConfig).where(TestConfig.workspace_id == workspace_id)
    config = session.exec(statement).first()

    if not config:
        # Return default
        return TestConfigResponse(
            command="echo 'No test command configured'",
            updated_at=datetime.utcnow(),
        )

    return TestConfigResponse(
        command=config.command,
        updated_at=config.updated_at,
    )


@router.put("/{workspace_id}/tests/config")
async def update_test_config(
    workspace_id: int,
    request: TestConfigModel,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update test configuration for workspace"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    statement = select(TestConfig).where(TestConfig.workspace_id == workspace_id)
    config = session.exec(statement).first()

    if config:
        config.command = request.command
        config.updated_at = datetime.utcnow()
    else:
        config = TestConfig(
            workspace_id=workspace_id,
            command=request.command,
        )
        session.add(config)

    session.commit()
    session.refresh(config)

    return {"message": "Test configuration updated", "command": config.command}


@router.post("/{workspace_id}/tests/run", response_model=TestRunResponse)
async def run_tests(
    workspace_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Run tests in workspace"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get test command
    statement = select(TestConfig).where(TestConfig.workspace_id == workspace_id)
    config = session.exec(statement).first()
    command = config.command if config else "echo 'No test command configured'"

    # Ensure artifacts directory exists
    exec_in_container(
        workspace.container_id,
        ["mkdir", "-p", "/workspace/artifacts"],
    )

    # Run tests
    exit_code, output = exec_in_container(
        workspace.container_id,
        ["sh", "-lc", command],
    )

    # Save log to artifacts
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    log_file = f"/workspace/artifacts/test_run_{timestamp}.log"
    exec_in_container(
        workspace.container_id,
        ["sh", "-c", f"cat > {log_file}"],
    )

    return TestRunResponse(
        exit_code=exit_code,
        output=output,
        artifacts_path="/workspace/artifacts",
    )


@router.get("/{workspace_id}/tests/logs")
async def get_test_logs(
    workspace_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get test logs from artifacts directory"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # List log files
    exit_code, output = exec_in_container(
        workspace.container_id,
        ["sh", "-c", "ls -1t /workspace/artifacts/*.log 2>/dev/null || echo ''"],
    )

    log_files = [f.strip() for f in output.split("\n") if f.strip()]

    return {"logs": log_files}


@router.get("/{workspace_id}/artifacts")
async def list_artifacts(
    workspace_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all artifacts"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # List artifacts directory
    exit_code, output = exec_in_container(
        workspace.container_id,
        ["sh", "-c", "ls -lh /workspace/artifacts 2>/dev/null || echo ''"],
    )

    return {"artifacts": output}
