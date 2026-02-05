"""Transcription worker task."""

import logging
import os
import tempfile
from datetime import datetime
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.meeting import Meeting
from app.models.media import MediaAsset
from app.models.transcript import Speaker, TranscriptSegment
from app.models.usage import STTUsageLog
from app.utils.s3 import download_from_s3
from app.workers.jobs import update_job_progress

logger = logging.getLogger(__name__)
settings = get_settings()


def transcribe_meeting(meeting_id: int, job_id: str | None = None) -> dict:
    """Transcribe a meeting using OpenAI Whisper."""
    db = next(get_db())
    client = OpenAI(api_key=settings.openai_api_key)

    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError(f"Meeting {meeting_id} not found")

        if job_id:
            update_job_progress(job_id, "downloading", 10)

        # Get original media asset
        original_asset = (
            db.query(MediaAsset)
            .filter(MediaAsset.meeting_id == meeting_id, MediaAsset.asset_type == "original")
            .first()
        )

        if not original_asset:
            raise ValueError(f"No original asset found for meeting {meeting_id}")

        # Download file
        with tempfile.NamedTemporaryFile(suffix=".tmp", delete=False) as tmp_file:
            download_from_s3(original_asset.s3_key, tmp_file.name)
            file_path = tmp_file.name

        if job_id:
            update_job_progress(job_id, "transcribing", 30)

        # Check file size (OpenAI limit: 25MB)
        file_size = os.path.getsize(file_path)
        if file_size > 24 * 1024 * 1024:
            # TODO: Implement chunking for large files
            logger.warning(f"File size {file_size} exceeds 24MB, may need chunking")

        # Transcribe with Whisper
        with open(file_path, "rb") as audio_file:
            transcript_response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        if job_id:
            update_job_progress(job_id, "processing_segments", 60)

        # Track cost (Whisper pricing: $0.006 per minute)
        duration_minutes = original_asset.duration_sec / 60 if original_asset.duration_sec else 0
        cost = duration_minutes * 0.006

        usage_log = STTUsageLog(
            meeting_id=meeting.id,
            job_type="transcription",
            provider="openai",
            model="whisper-1",
            clip_duration_sec=original_asset.duration_sec or 0,
            cost_usd=cost,
            created_at=datetime.utcnow(),
        )
        db.add(usage_log)

        # Create default speaker
        default_speaker = Speaker(
            meeting_id=meeting_id,
            label="Speaker 1",
            display_name=None,
            created_at=datetime.utcnow(),
        )
        db.add(default_speaker)
        db.flush()

        # Save transcript segments
        segments = transcript_response.segments or []
        for segment in segments:
            transcript_segment = TranscriptSegment(
                meeting_id=meeting_id,
                speaker_id=default_speaker.id,
                text=segment.get("text", ""),
                start_sec=segment.get("start", 0.0),
                end_sec=segment.get("end", 0.0),
                confidence=segment.get("no_speech_prob", 0.0),
                created_at=datetime.utcnow(),
            )
            db.add(transcript_segment)

        meeting.status = "ready"
        meeting.updated_at = datetime.utcnow()

        db.commit()

        # Cleanup
        os.unlink(file_path)

        if job_id:
            update_job_progress(job_id, "completed", 100)

        # Enqueue summarization job
        from app.workers.tasks.summarization import generate_summary

        enqueue_job(
            generate_summary, meeting_id=meeting_id, summary_type="work", queue_name="summarization"
        )
        enqueue_job(
            generate_summary,
            meeting_id=meeting_id,
            summary_type="timeline",
            queue_name="summarization",
        )

        # Enqueue embeddings job
        from app.workers.tasks.embeddings import generate_embeddings

        enqueue_job(generate_embeddings, meeting_id=meeting_id, queue_name="embeddings")

        return {
            "status": "success",
            "segments_count": len(segments),
            "cost_usd": cost,
        }

    except Exception as e:
        logger.error(f"Transcription failed for meeting {meeting_id}: {e}")
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.status = "failed"
            db.commit()
        raise

    finally:
        db.close()
