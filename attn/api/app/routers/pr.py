import json
import re
from typing import Optional, Union
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
import docker

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import User, Workspace

router = APIRouter(prefix="/api/workspaces", tags=["pr"])


class PRReviewRequest(BaseModel):
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None


class PRReviewComment(BaseModel):
    file: str
    line: int
    body: str


class PRReviewResponse(BaseModel):
    status: str  # "success" | "partial"
    failed_comments: list[dict] = []
    summary_posted: bool = False


class PRCreateRequest(BaseModel):
    title: str
    body: str
    base: str = "main"
    head: str


class PRCreateResponse(BaseModel):
    pr_url: str
    pr_number: int


def _get_workspace_or_404(
    workspace_id: str,
    user: User,
    session: Session,
) -> Workspace:
    """Get workspace and verify ownership."""
    workspace = session.exec(
        select(Workspace).where(Workspace.id == workspace_id)
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return workspace


def _execute_in_container(
    container_id: str,
    command: list[str],
) -> tuple[int, str, str]:
    """Execute command in container and return exit code, stdout, stderr."""
    client = docker.from_env()
    try:
        container = client.containers.get(container_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=500, detail="Container not found")

    try:
        exit_code, output = container.exec_run(
            cmd=command,
            capture_output=True,
            text=True,
        )
        return exit_code, output, ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Container exec failed: {str(e)}")


def _extract_pr_info_from_url(pr_url: str) -> tuple[str, str, int]:
    """
    Extract owner, repo, and pr_number from GitHub PR URL.
    Supports: https://github.com/owner/repo/pull/123
    """
    match = re.match(
        r"https://github\.com/([^/]+)/([^/]+)/pull/(\d+)",
        pr_url,
    )
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid PR URL format. Expected: https://github.com/owner/repo/pull/NUMBER",
        )
    return match.group(1), match.group(2), int(match.group(3))


@router.post("/{workspace_id}/pr/review", response_model=PRReviewResponse)
async def review_pr(
    workspace_id: str,
    request: PRReviewRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """
    Review a GitHub PR using opencode and post inline comments + summary.

    Accepts either pr_number or pr_url.
    """
    # Validate input
    if not request.pr_number and not request.pr_url:
        raise HTTPException(
            status_code=400,
            detail="Either pr_number or pr_url is required",
        )

    # Get workspace
    workspace = _get_workspace_or_404(workspace_id, user, session)
    if not workspace.container_id:
        raise HTTPException(status_code=500, detail="Workspace container not found")

    pr_number = request.pr_number
    if request.pr_url:
        _, _, pr_number = _extract_pr_info_from_url(request.pr_url)

    # Step 1: Get PR diff
    exit_code, output, _ = _execute_in_container(
        workspace.container_id,
        ["gh", "pr", "diff", str(pr_number), "--patch"],
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch PR diff: {output}",
        )

    diff_content = output

    # Step 2: Write diff to temp file and run opencode review
    exit_code, output, _ = _execute_in_container(
        workspace.container_id,
        [
            "bash",
            "-c",
            f"echo {repr(diff_content)} > /tmp/pr.patch && "
            "opencode review /tmp/pr.patch --format json > /tmp/review.json",
        ],
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run opencode review: {output}",
        )

    # Step 3: Read review JSON from container
    exit_code, review_json_content, _ = _execute_in_container(
        workspace.container_id,
        ["cat", "/tmp/review.json"],
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail="Failed to read review output",
        )

    try:
        review_data = json.loads(review_json_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse review JSON",
        )

    # Step 4: Post inline comments
    failed_comments = []
    comments = review_data.get("comments", [])

    for comment in comments:
        file = comment.get("file")
        line = comment.get("line")
        body = comment.get("body")

        if not file or not line or not body:
            continue

        # Build gh pr review command with inline comment
        cmd = [
            "gh",
            "pr",
            "review",
            str(pr_number),
            "--comment",
            "--body",
            body,
            "--file",
            file,
            "--line",
            str(line),
        ]

        exit_code, _, stderr = _execute_in_container(workspace.container_id, cmd)
        if exit_code != 0:
            failed_comments.append(
                {
                    "file": file,
                    "line": line,
                    "error": stderr or "Unknown error",
                }
            )

    # Step 5: Post summary as PR comment
    summary = review_data.get("summary", "")
    summary_posted = False

    if summary:
        exit_code, _, _ = _execute_in_container(
            workspace.container_id,
            [
                "gh",
                "pr",
                "comment",
                str(pr_number),
                "--body",
                summary,
            ],
        )
        summary_posted = exit_code == 0

    # Determine overall status
    status = "partial" if failed_comments else "success"

    return PRReviewResponse(
        status=status,
        failed_comments=failed_comments,
        summary_posted=summary_posted,
    )


@router.post("/{workspace_id}/pr/create", response_model=PRCreateResponse)
async def create_pr(
    workspace_id: str,
    request: PRCreateRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """
    Create a GitHub PR using gh CLI.

    Requires: title, body, base (default: main), head (branch name).
    """
    # Get workspace
    workspace = _get_workspace_or_404(workspace_id, user, session)
    if not workspace.container_id:
        raise HTTPException(status_code=500, detail="Workspace container not found")

    # Execute gh pr create
    cmd = [
        "gh",
        "pr",
        "create",
        "--title",
        request.title,
        "--body",
        request.body,
        "--base",
        request.base,
        "--head",
        request.head,
    ]

    exit_code, output, stderr = _execute_in_container(workspace.container_id, cmd)
    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create PR: {stderr or output}",
        )

    # Parse PR URL and number from output
    # Expected output format: https://github.com/owner/repo/pull/123
    pr_url_match = re.search(
        r"(https://github\.com/[^/]+/[^/]+/pull/\d+)",
        output,
    )
    if not pr_url_match:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse PR URL from gh output",
        )

    pr_url = pr_url_match.group(1)
    pr_number_match = re.search(r"/pull/(\d+)", pr_url)
    if not pr_number_match:
        raise HTTPException(
            status_code=500,
            detail="Failed to extract PR number from URL",
        )

    pr_number = int(pr_number_match.group(1))

    return PRCreateResponse(
        pr_url=pr_url,
        pr_number=pr_number,
    )
