"""Upload routes for file management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies.auth import get_current_user
from app.models.meeting import Meeting
from app.models.media import MediaAsset
from app.models.user import User
from app.schemas.upload import UploadRequestResponse, UploadCompleteRequest
from app.services.upload import create_presigned_upload_url, handle_upload_complete
from app.workers.jobs import enqueue_job
from app.workers.tasks.vad import process_vad

router = APIRouter(prefix="/meetings", tags=["upload"])


@router.post("/{meeting_id}/upload/request", response_model=UploadRequestResponse)
def request_upload(
    meeting_id: int,
    filename: str,
    content_type: str,
    file_size: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadRequestResponse:
    """Request presigned URL for file upload."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Validate file size (max 2GB)
    if file_size > 2 * 1024 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large")

    # Validate content type
    allowed_types = [
        "audio/mpeg",
        "audio/wav",
        "audio/m4a",
        "audio/mp4",
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
    ]
    if content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")

    return create_presigned_upload_url(db, meeting, filename, content_type, file_size)


@router.post("/{meeting_id}/upload/complete")
def complete_upload(
    meeting_id: int,
    payload: UploadCompleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Confirm upload completion and start processing."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Handle upload completion
    handle_upload_complete(db, meeting, payload.s3_key)

    # Enqueue VAD job
    enqueue_job(process_vad, meeting_id=meeting.id, queue_name="default")

    return {"status": "processing", "message": "Upload complete, processing started"}
