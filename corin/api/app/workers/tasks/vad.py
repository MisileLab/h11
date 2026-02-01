"""VAD (Voice Activity Detection) worker task."""

import logging
import os
import subprocess
import tempfile
from datetime import datetime

import torch
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.meeting import Meeting
from app.models.media import MediaAsset, VADSegment
from app.utils.s3 import download_from_s3, upload_to_s3
from app.workers.jobs import update_job_progress

logger = logging.getLogger(__name__)


def process_vad(meeting_id: int, job_id: str | None = None) -> dict:
    """Process VAD for a meeting."""
    db = next(get_db())

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
            original_path = tmp_file.name

        if job_id:
            update_job_progress(job_id, "extracting_audio", 30)

        # Extract audio to WAV
        audio_path = original_path + ".wav"
        extract_audio(original_path, audio_path)

        if job_id:
            update_job_progress(job_id, "detecting_speech", 50)

        # Run VAD
        segments = run_silero_vad(audio_path)

        if job_id:
            update_job_progress(job_id, "saving_segments", 80)

        # Save VAD segments
        for segment in segments:
            vad_segment = VADSegment(
                meeting_id=meeting_id,
                start_time=segment["start"],
                end_time=segment["end"],
                confidence=segment.get("confidence", 1.0),
                created_at=datetime.utcnow(),
            )
            db.add(vad_segment)

        # Calculate total duration
        if segments:
            original_asset.duration_sec = segments[-1]["end"]
            meeting.status = "processing"  # Ready for transcription

        db.commit()

        # Cleanup
        os.unlink(original_path)
        os.unlink(audio_path)

        if job_id:
            update_job_progress(job_id, "completed", 100)

        # Enqueue transcription job
        from app.workers.jobs import enqueue_job
        from app.workers.tasks.transcription import transcribe_meeting

        enqueue_job(transcribe_meeting, meeting_id=meeting_id, queue_name="transcription")

        return {"status": "success", "segments_found": len(segments)}

    except Exception as e:
        logger.error(f"VAD processing failed for meeting {meeting_id}: {e}")
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.status = "failed"
            db.commit()
        raise

    finally:
        db.close()


def extract_audio(input_path: str, output_path: str) -> None:
    """Extract audio from video/audio file to WAV format."""
    cmd = [
        "ffmpeg",
        "-i",
        input_path,
        "-vn",  # No video
        "-acodec",
        "pcm_s16le",  # 16-bit PCM
        "-ar",
        "16000",  # 16kHz sample rate
        "-ac",
        "1",  # Mono
        "-y",  # Overwrite output
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")


def run_silero_vad(audio_path: str, threshold: float = 0.5) -> list[dict]:
    """Run Silero VAD on audio file."""

    # Load Silero VAD model
    model, utils = torch.hub.load(
        repo_or_dir="snakers4/silero-vad", model="silero_vad", force_reload=False
    )
    (get_speech_timestamps, _, read_audio, *_) = utils

    # Read audio
    wav = read_audio(audio_path, sampling_rate=16000)

    # Get speech timestamps
    speech_timestamps = get_speech_timestamps(
        wav,
        model,
        threshold=threshold,
        sampling_rate=16000,
        min_speech_duration_ms=250,
        min_silence_duration_ms=100,
    )

    # Convert to seconds
    segments = []
    for ts in speech_timestamps:
        segments.append(
            {
                "start": ts["start"] / 16000.0,
                "end": ts["end"] / 16000.0,
                "confidence": 1.0,
            }
        )

    return segments
