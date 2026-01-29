import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_session
from app.models import MediaAsset, Meeting, SpeakerLabel, Summary, TranscriptSegment
from app.queue import get_queue
from app.schemas import (
    MeetingCreate,
    MeetingDetail,
    MeetingOut,
    SpeakerRename,
    UploadResponse,
)
from app.storage import presigned_get, upload_fileobj
from app.tasks import ingest_upload, summarize_meeting

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("", response_model=MeetingOut)
def create_meeting(
    payload: MeetingCreate,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> MeetingOut:
    meeting = Meeting(
        title=payload.title,
        meeting_date=payload.meeting_date,
        tags=payload.tags,
        folder=payload.folder,
        status="uploaded",
        progress_json={"stage": "created", "percent": 0},
    )
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return MeetingOut.model_validate(meeting)


@router.get("", response_model=list[MeetingOut])
def list_meetings(
    query: Annotated[str | None, Query(alias="q")] = None,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> list[MeetingOut]:
    stmt = (
        select(Meeting)
        .where(Meeting.deleted_at.is_(None))
        .order_by(Meeting.created_at.desc())
    )
    if query:
        transcript_subquery = (
            select(TranscriptSegment.meeting_id)
            .where(TranscriptSegment.text.ilike(f"%{query}%"))
            .distinct()
        )
        summary_subquery = (
            select(Summary.meeting_id)
            .where(cast(Summary.content_json, String).ilike(f"%{query}%"))
            .distinct()
        )
        stmt = stmt.where(
            or_(
                Meeting.title.ilike(f"%{query}%"),
                Meeting.id.in_(transcript_subquery),
                Meeting.id.in_(summary_subquery),
            )
        )
    meetings = session.execute(stmt).scalars().all()
    return [MeetingOut.model_validate(m) for m in meetings]


@router.get("/{meeting_id}", response_model=MeetingDetail)
def get_meeting(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> MeetingDetail:
    meeting = session.get(Meeting, meeting_id)
    if not meeting or meeting.deleted_at:
        raise HTTPException(status_code=404, detail="Meeting not found")
    playable_url = None
    if meeting.media_assets:
        asset = meeting.media_assets[0]
        if asset.playable_object_key:
            playable_url = presigned_get(asset.playable_object_key).url
    detail = MeetingDetail.model_validate(meeting)
    detail.playable_url = playable_url
    return detail


@router.post("/{meeting_id}/upload", response_model=UploadResponse)
def upload_meeting_media(
    meeting_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> UploadResponse:
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    object_key = f"original/{meeting_id}/{uuid.uuid4()}-{file.filename}"
    upload_fileobj(object_key, file.file, file.content_type)

    asset = MediaAsset(
        meeting_id=meeting_id,
        original_object_key=object_key,
        original_filename=file.filename,
        original_content_type=file.content_type,
    )
    session.add(asset)
    meeting.status = "uploaded"
    meeting.progress_json = {"stage": "uploaded", "percent": 1}
    session.commit()

    queue = get_queue()
    queue.enqueue(ingest_upload, str(meeting_id), object_key)

    return UploadResponse(meeting_id=meeting_id, object_key=object_key)


@router.post("/{meeting_id}/summaries/regenerate")
def regenerate_summary(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> dict:
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    queue = get_queue()
    queue.enqueue(summarize_meeting, str(meeting_id))
    meeting.status = "summarizing"
    meeting.progress_json = {"stage": "summarizing", "percent": 70}
    session.commit()
    return {"ok": True}


@router.patch("/{meeting_id}/speakers/{speaker_key}")
def rename_speaker(
    meeting_id: uuid.UUID,
    speaker_key: str,
    payload: SpeakerRename,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> dict:
    label = (
        session.execute(
            select(SpeakerLabel).where(
                SpeakerLabel.meeting_id == meeting_id,
                SpeakerLabel.speaker_key == speaker_key,
            )
        )
        .scalars()
        .first()
    )
    if not label:
        label = SpeakerLabel(
            meeting_id=meeting_id,
            speaker_key=speaker_key,
            display_name=payload.display_name,
        )
        session.add(label)
    else:
        label.display_name = payload.display_name
    session.commit()
    return {"ok": True}
