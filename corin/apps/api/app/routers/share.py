import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_session
from app.models import Meeting, ShareLink
from app.schemas import MeetingDetail, ShareLinkOut
from app.storage import presigned_get

router = APIRouter(tags=["share"])


@router.post("/meetings/{meeting_id}/share-links", response_model=ShareLinkOut)
def create_share_link(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> ShareLinkOut:
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    token = secrets.token_urlsafe(32)
    share = ShareLink(meeting_id=meeting_id, token=token)
    session.add(share)
    session.commit()
    session.refresh(share)
    return ShareLinkOut.model_validate(share)


@router.get("/share/{token}", response_model=MeetingDetail)
def get_share(token: str, session: Session = Depends(get_session)) -> MeetingDetail:
    share = (
        session.query(ShareLink)
        .filter(ShareLink.token == token, ShareLink.revoked_at.is_(None))
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    meeting = session.get(Meeting, share.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    playable_url = None
    if meeting.media_assets:
        asset = meeting.media_assets[0]
        if asset.playable_object_key:
            playable_url = presigned_get(asset.playable_object_key).url
    detail = MeetingDetail.model_validate(meeting)
    detail.playable_url = playable_url
    return detail
