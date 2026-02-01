"""Upload service for file management."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.meeting import Meeting
from app.models.media import MediaAsset
from app.schemas.upload import UploadRequestResponse
from app.utils.s3 import generate_presigned_upload_url


def create_presigned_upload_url(
    db: Session,
    meeting: Meeting,
    filename: str,
    content_type: str,
    file_size: int,
) -> UploadRequestResponse:
    """Create presigned URL for file upload."""
    settings = get_settings()

    # Generate S3 key
    extension = filename.split(".")[-1] if "." in filename else "bin"
    s3_key = f"uploads/{meeting.user_id}/{meeting.id}/{uuid.uuid4()}.{extension}"

    # Generate presigned URL (15 minutes expiry)
    upload_url = generate_presigned_upload_url(
        bucket=settings.s3_bucket_name,
        key=s3_key,
        expiry=900,
        content_type=content_type,
    )

    # Create media asset record
    asset = MediaAsset(
        meeting_id=meeting.id,
        asset_type="original",
        s3_key=s3_key,
        size_bytes=file_size,
        mime_type=content_type,
        created_at=datetime.utcnow(),
    )
    db.add(asset)
    db.commit()

    return UploadRequestResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in=900,
    )


def handle_upload_complete(db: Session, meeting: Meeting, s3_key: str) -> None:
    """Handle upload completion."""

    # Update meeting status
    meeting.status = "processing"
    meeting.updated_at = datetime.utcnow()
    db.commit()
