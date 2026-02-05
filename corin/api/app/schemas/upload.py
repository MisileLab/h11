"""Upload-related Pydantic schemas."""

from pydantic import BaseModel


class UploadRequestResponse(BaseModel):
    """Response for upload request."""

    upload_url: str
    s3_key: str
    expires_in: int


class UploadCompleteRequest(BaseModel):
    """Request to confirm upload completion."""

    s3_key: str
