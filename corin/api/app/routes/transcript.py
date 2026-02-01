"""Transcript routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies.auth import get_current_user
from app.models.meeting import Meeting
from app.models.transcript import Speaker, TranscriptSegment
from app.models.user import User
from app.schemas.transcript import (
    TranscriptResponse,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdate,
    SpeakerResponse,
    SpeakerUpdate,
)

router = APIRouter(prefix="/meetings", tags=["transcript"])


@router.get("/{meeting_id}/transcript", response_model=TranscriptResponse)
def get_transcript(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TranscriptResponse:
    """Get meeting transcript."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Get segments
    segments = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.meeting_id == meeting_id)
        .order_by(TranscriptSegment.start_sec)
        .all()
    )

    # Get speakers
    speakers = db.query(Speaker).filter(Speaker.meeting_id == meeting_id).all()

    return TranscriptResponse(
        meeting_id=meeting_id,
        segments=[
            TranscriptSegmentResponse(
                id=seg.id,
                speaker_id=seg.speaker_id,
                text=seg.text,
                start_time=seg.start_sec,
                end_time=seg.end_sec,
                confidence=seg.confidence,
            )
            for seg in segments
        ],
        speakers=[
            SpeakerResponse(
                id=spk.id,
                speaker_label=spk.label,
                assigned_name=spk.display_name,
                color="#3B82F6",  # Default color
            )
            for spk in speakers
        ],
    )


@router.put("/{meeting_id}/transcript/segments/{segment_id}")
def update_segment(
    meeting_id: int,
    segment_id: int,
    payload: TranscriptSegmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TranscriptSegmentResponse:
    """Update transcript segment."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Get segment
    segment = (
        db.query(TranscriptSegment)
        .filter(
            TranscriptSegment.id == segment_id,
            TranscriptSegment.meeting_id == meeting_id,
        )
        .first()
    )
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")

    # Update segment
    if payload.text is not None:
        segment.text = payload.text
    if payload.speaker_id is not None:
        segment.speaker_id = payload.speaker_id

    db.commit()
    db.refresh(segment)

    return TranscriptSegmentResponse(
        id=segment.id,
        speaker_id=segment.speaker_id,
        text=segment.text,
        start_time=segment.start_sec,
        end_time=segment.end_sec,
        confidence=segment.confidence,
    )


@router.put("/{meeting_id}/speakers/{speaker_id}")
def update_speaker(
    meeting_id: int,
    speaker_id: int,
    payload: SpeakerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SpeakerResponse:
    """Update speaker information."""

    # Validate meeting ownership
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Get speaker
    speaker = (
        db.query(Speaker)
        .filter(
            Speaker.id == speaker_id,
            Speaker.meeting_id == meeting_id,
        )
        .first()
    )
    if not speaker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found")

    # Update speaker
    if payload.assigned_name is not None:
        speaker.display_name = payload.assigned_name
    if payload.color is not None:
        pass  # Color field doesn't exist in Speaker model

    db.commit()
    db.refresh(speaker)

    return SpeakerResponse(
        id=speaker.id,
        speaker_label=speaker.label,
        assigned_name=speaker.display_name,
        color="#3B82F6",  # Default color
    )
