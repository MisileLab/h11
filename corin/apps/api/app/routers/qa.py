import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_session
from app.llm import answer_question, embed_texts
from app.models import Meeting, SegmentEmbedding, TranscriptSegment
from app.schemas import QaRequest, QaResponse

router = APIRouter(tags=["qa"])


@router.post("/meetings/{meeting_id}/qa", response_model=QaResponse)
def ask_question(
    meeting_id: uuid.UUID,
    payload: QaRequest,
    session: Session = Depends(get_session),
    _user: str | None = Depends(get_current_user),
) -> QaResponse:
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    query_embedding = embed_texts([payload.question])[0]
    stmt = (
        select(TranscriptSegment, SegmentEmbedding)
        .join(SegmentEmbedding, SegmentEmbedding.segment_id == TranscriptSegment.id)
        .where(TranscriptSegment.meeting_id == meeting_id)
        .order_by(SegmentEmbedding.embedding.cosine_distance(query_embedding))
        .limit(8)
    )
    rows = session.execute(stmt).all()
    if not rows:
        return QaResponse(answer="No relevant context found.", citations=[])

    context_lines = []
    for segment, _embedding in rows:
        context_lines.append(
            f"[{segment.id}] {segment.start_ms}-{segment.end_ms}: {segment.text}"
        )
    answer_payload = answer_question(payload.question, "\n".join(context_lines))
    return QaResponse(**answer_payload)
