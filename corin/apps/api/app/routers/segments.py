import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_session
from app.models import TranscriptSegment
from app.schemas import SegmentUpdate, TranscriptSegmentOut
from app.tasks import _snapshot_transcript

router = APIRouter(prefix="/segments", tags=["segments"])


@router.patch("/{segment_id}", response_model=TranscriptSegmentOut)
def update_segment(
    segment_id: uuid.UUID,
    payload: SegmentUpdate,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> TranscriptSegmentOut:
    segment = session.get(TranscriptSegment, segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    segment.text = payload.text
    session.commit()
    _snapshot_transcript(session, segment.meeting_id)
    session.commit()
    session.refresh(segment)
    return TranscriptSegmentOut.model_validate(segment)
