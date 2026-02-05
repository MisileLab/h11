from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_session
from app.core.auth import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.services.docker_manager import exec_in_container

router = APIRouter()


class PRReviewRequest(BaseModel):
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None


class PRCreateRequest(BaseModel):
    title: str
    body: Optional[str] = None
    base_branch: str = "main"
    head_branch: str


class LineComment(BaseModel):
    path: str
    line: int
    body: str
    success: bool
    error: Optional[str] = None


class PRReviewResponse(BaseModel):
    pr_number: int
    summary_posted: bool
    line_comments: List[LineComment]
    total_comments: int
    successful_comments: int
    failed_comments: int


@router.post("/{workspace_id}/pr/review", response_model=PRReviewResponse)
async def review_pr(
    workspace_id: int,
    request: PRReviewRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Review PR with opencode and post comments"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Extract PR number
    pr_number = request.pr_number
    if not pr_number and request.pr_url:
        # Parse PR number from URL
        parts = request.pr_url.rstrip("/").split("/")
        if "pull" in parts:
            try:
                pr_number = int(parts[parts.index("pull") + 1])
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid PR URL")

    if not pr_number:
        raise HTTPException(status_code=400, detail="PR number or URL required")

    # Get PR diff using gh CLI
    exit_code, diff_output = exec_in_container(
        workspace.container_id,
        ["gh", "pr", "diff", str(pr_number)],
    )

    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch PR diff: {diff_output}",
        )

    # Call opencode for review (simplified - in production, use proper opencode integration)
    # For now, we'll create a mock review
    exit_code, review_output = exec_in_container(
        workspace.container_id,
        [
            "sh",
            "-c",
            f"echo 'PR #{pr_number} review: Code looks good. Consider adding more tests.'",
        ],
    )

    # Post summary comment
    summary = review_output.strip() if exit_code == 0 else "Review failed"
    exit_code, comment_output = exec_in_container(
        workspace.container_id,
        ["gh", "pr", "comment", str(pr_number), "--body", summary],
    )

    summary_posted = exit_code == 0

    # Attempt to post line comments (mock implementation)
    line_comments = []
    # In production, parse opencode JSON output and post via:
    # gh pr review {pr_number} --comment --body "{comment}" --line {line} --path {path}

    return PRReviewResponse(
        pr_number=pr_number,
        summary_posted=summary_posted,
        line_comments=line_comments,
        total_comments=len(line_comments),
        successful_comments=sum(1 for c in line_comments if c.success),
        failed_comments=sum(1 for c in line_comments if not c.success),
    )


@router.post("/{workspace_id}/pr/create")
async def create_pr(
    workspace_id: int,
    request: PRCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create new PR from current branch"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Checkout/create branch
    exit_code, output = exec_in_container(
        workspace.container_id,
        ["git", "checkout", "-b", request.head_branch],
    )

    if exit_code != 0 and "already exists" not in output:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create branch: {output}",
        )

    # Create PR using gh CLI
    cmd = [
        "gh",
        "pr",
        "create",
        "--title",
        request.title,
        "--base",
        request.base_branch,
        "--head",
        request.head_branch,
    ]

    if request.body:
        cmd.extend(["--body", request.body])

    exit_code, output = exec_in_container(workspace.container_id, cmd)

    if exit_code != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create PR: {output}",
        )

    # Extract PR URL from output
    pr_url = output.strip().split("\n")[-1] if output else ""

    return {"message": "PR created successfully", "url": pr_url, "output": output}
