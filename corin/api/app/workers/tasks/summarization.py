"""Summarization worker task."""

import logging
from datetime import datetime

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.meeting import Meeting
from app.models.ai import Summary
from app.models.transcript import TranscriptSegment
from app.workers.jobs import update_job_progress

logger = logging.getLogger(__name__)
settings = get_settings()


def generate_summary(meeting_id: int, summary_type: str, job_id: str | None = None) -> dict:
    """Generate summary for a meeting using GPT-5-mini."""
    db = next(get_db())
    client = OpenAI(api_key=settings.openai_api_key)

    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError(f"Meeting {meeting_id} not found")

        if job_id:
            update_job_progress(job_id, "fetching_transcript", 20)

        # Get transcript segments
        segments = (
            db.query(TranscriptSegment)
            .filter(TranscriptSegment.meeting_id == meeting_id)
            .order_by(TranscriptSegment.start_sec)
            .all()
        )

        if not segments:
            raise ValueError(f"No transcript found for meeting {meeting_id}")

        # Combine transcript
        full_transcript = "\n".join([seg.text for seg in segments])

        if job_id:
            update_job_progress(job_id, "generating_summary", 50)

        # Create prompt based on summary type
        if summary_type == "work":
            system_prompt = """You are a professional meeting summarizer. Create a work-focused summary that:
- Highlights key decisions made
- Lists action items and assignments
- Notes important discussions
- Identifies blockers or concerns
Format as bullet points under clear headings."""
        else:  # timeline
            system_prompt = """You are a professional meeting summarizer. Create a timeline summary that:
- Organizes content chronologically
- Notes when topics were discussed
- Shows the flow of conversation
- Highlights key moments
Format as a timeline with timestamps."""

        # Generate summary
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Meeting Title: {meeting.title}\n\nTranscript:\n{full_transcript}",
                },
            ],
            temperature=0.7,
            max_tokens=1000,
        )

        summary_text = response.choices[0].message.content

        # TODO: Track cost (need to add LLMUsageLog model)
        # total_tokens = response.usage.total_tokens
        # cost = (total_tokens / 1000) * 0.01

        # Save summary
        summary = Summary(
            meeting_id=meeting_id,
            format=summary_type,  # Summary model uses 'format' not 'summary_type'
            content={"text": summary_text or ""},  # Summary.content is JSON dict, not text
            model="gpt-4o",
            created_at=datetime.utcnow(),
        )
        db.add(summary)
        db.commit()

        if job_id:
            update_job_progress(job_id, "completed", 100)

        return {
            "status": "success",
            "summary_type": summary_type,
        }

    except Exception as e:
        logger.error(f"Summarization failed for meeting {meeting_id}: {e}")
        raise

    finally:
        db.close()
