from datetime import datetime
from pathlib import Path
import subprocess
from fastapi import APIRouter, HTTPException, Depends, FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select
import docker

from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.config import WORKSPACES_DIR
from app.models import User, Workspace

router = APIRouter(prefix="/api/workspaces", tags=["tests"])


class TestConfigResponse(BaseModel):
    command: str | None


class TestConfigRequest(BaseModel):
    command: str


class TestLogEntry(BaseModel):
    filename: str
    timestamp: str
    size: int


class TestLogsListResponse(BaseModel):
    logs: list[TestLogEntry]


class TestRunResponse(BaseModel):
    log_file: str
    status: str
    exit_code: int


class ArtifactEntry(BaseModel):
    filename: str
    size: int


class ArtifactsListResponse(BaseModel):
    artifacts: list[ArtifactEntry]


def _check_workspace_ownership(
    workspace_id: str,
    user: User,
    session: Session,
) -> Workspace:
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return workspace


@router.get("/{workspace_id}/tests/config", response_model=TestConfigResponse)
async def get_test_config(
    workspace_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)
    return TestConfigResponse(command=workspace.test_command)


@router.put("/{workspace_id}/tests/config", response_model=TestConfigResponse)
async def set_test_config(
    workspace_id: str,
    request: TestConfigRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    workspace.test_command = request.command
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    return TestConfigResponse(command=workspace.test_command)


@router.post("/{workspace_id}/tests/run", response_model=TestRunResponse)
async def run_tests(
    workspace_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    if not workspace.test_command:
        raise HTTPException(status_code=400, detail="Test command not configured")

    if not workspace.container_id:
        raise HTTPException(status_code=400, detail="Workspace container not available")

    workspace_root = WORKSPACES_DIR / workspace_id
    logs_dir = workspace_root / "test_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    artifacts_dir = workspace_root / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().isoformat()
    log_filename = f"{timestamp.replace(':', '-').replace('.', '-')}.log"
    log_path = logs_dir / log_filename

    try:
        client = docker.from_env()
        container = client.containers.get(workspace.container_id)

        result = container.exec_run(
            cmd=["sh", "-lc", workspace.test_command],
            stdout=True,
            stderr=True,
        )

        exit_code = result.exit_code or 0
        output = (
            result.output.decode("utf-8", errors="replace") if result.output else ""
        )

        with open(log_path, "w") as f:
            f.write(output)

        status = "success" if exit_code == 0 else "failed"

        return TestRunResponse(
            log_file=log_filename,
            status=status,
            exit_code=exit_code,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{workspace_id}/tests/logs", response_model=TestLogsListResponse)
async def list_test_logs(
    workspace_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    workspace_root = WORKSPACES_DIR / workspace_id
    logs_dir = workspace_root / "test_logs"

    logs = []
    if logs_dir.exists():
        for log_file in sorted(logs_dir.glob("*.log")):
            stat = log_file.stat()
            logs.append(
                TestLogEntry(
                    filename=log_file.name,
                    timestamp=log_file.name.replace("-", ":").rsplit(":", 1)[0],
                    size=stat.st_size,
                )
            )

    return TestLogsListResponse(logs=logs)


@router.get("/{workspace_id}/tests/logs/{filename}")
async def download_test_log(
    workspace_id: str,
    filename: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    workspace_root = WORKSPACES_DIR / workspace_id
    log_path = workspace_root / "test_logs" / filename

    if not log_path.exists() or not log_path.is_file():
        raise HTTPException(status_code=404, detail="Log file not found")

    if not str(log_path).startswith(str(workspace_root / "test_logs")):
        raise HTTPException(status_code=403, detail="Forbidden")

    return FileResponse(log_path, media_type="text/plain")


@router.get("/{workspace_id}/artifacts", response_model=ArtifactsListResponse)
async def list_artifacts(
    workspace_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    workspace_root = WORKSPACES_DIR / workspace_id
    artifacts_dir = workspace_root / "artifacts"

    artifacts = []
    if artifacts_dir.exists():
        for artifact_file in sorted(artifacts_dir.glob("*")):
            if artifact_file.is_file():
                stat = artifact_file.stat()
                artifacts.append(
                    ArtifactEntry(
                        filename=artifact_file.name,
                        size=stat.st_size,
                    )
                )

    return ArtifactsListResponse(artifacts=artifacts)


@router.get("/{workspace_id}/artifacts/{filename}")
async def download_artifact(
    workspace_id: str,
    filename: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    workspace = _check_workspace_ownership(workspace_id, user, session)

    workspace_root = WORKSPACES_DIR / workspace_id
    artifact_path = workspace_root / "artifacts" / filename

    if not artifact_path.exists() or not artifact_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    if not str(artifact_path).startswith(str(workspace_root / "artifacts")):
        raise HTTPException(status_code=403, detail="Forbidden")

    return FileResponse(artifact_path)
