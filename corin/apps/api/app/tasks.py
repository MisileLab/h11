from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from sqlalchemy import select

from app.audio import (
    extract_clip,
    extract_normalized_wav,
    generate_playable_m4a,
    probe_duration_ms,
)
from app.db import SessionLocal
from app.llm import embed_texts, summarize_map, summarize_reduce, transcribe_audio
from app.models import (
    MediaAsset,
    Meeting,
    SegmentEmbedding,
    Summary,
    TranscriptRevision,
    TranscriptSegment,
    VadSegment,
)
from app.queue import get_queue
from app.storage import download_file, upload_fileobj
from app.vad import detect_segments


def _update_progress(
    meeting: Meeting, stage: str, percent: int, meta: dict | None = None
) -> None:
    payload = {"stage": stage, "percent": percent}
    if meta:
        payload.update(meta)
    meeting.progress_json = payload


def ingest_upload(meeting_id: str, original_object_key: str) -> None:
    meeting_uuid = uuid.UUID(meeting_id)
    with SessionLocal() as session:
        meeting = session.get(Meeting, meeting_uuid)
        if not meeting:
            return
        meeting.status = "preprocessing"
        _update_progress(meeting, "preprocessing", 5)
        session.commit()

        asset = (
            session.execute(
                select(MediaAsset).where(MediaAsset.meeting_id == meeting_uuid)
            )
            .scalars()
            .first()
        )
        if not asset:
            asset = MediaAsset(
                meeting_id=meeting_uuid,
                original_object_key=original_object_key,
            )
            session.add(asset)
            session.commit()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            original_path = tmp_path / "original"
            normalized_path = tmp_path / "normalized.wav"
            playable_path = tmp_path / "playable.m4a"

            download_file(original_object_key, str(original_path))
            extract_normalized_wav(str(original_path), str(normalized_path))
            generate_playable_m4a(str(original_path), str(playable_path))

            normalized_key = f"normalized/{meeting_id}/audio.wav"
            playable_key = f"playable/{meeting_id}/audio.m4a"

            with open(normalized_path, "rb") as nf:
                upload_fileobj(normalized_key, nf, "audio/wav")
            with open(playable_path, "rb") as pf:
                upload_fileobj(playable_key, pf, "audio/mp4")

            asset.normalized_object_key = normalized_key
            asset.playable_object_key = playable_key
            asset.duration_ms = probe_duration_ms(str(playable_path))
            meeting.status = "vad"
            _update_progress(meeting, "vad", 15)
            session.commit()

    queue = get_queue()
    queue.enqueue(run_vad, meeting_id)


def run_vad(meeting_id: str) -> None:
    meeting_uuid = uuid.UUID(meeting_id)
    with SessionLocal() as session:
        meeting = session.get(Meeting, meeting_uuid)
        if not meeting:
            return
        asset = (
            session.execute(
                select(MediaAsset).where(MediaAsset.meeting_id == meeting_uuid)
            )
            .scalars()
            .first()
        )
        if not asset or not asset.normalized_object_key:
            meeting.status = "failed"
            _update_progress(meeting, "vad", 0, {"error": "missing normalized audio"})
            session.commit()
            return

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            normalized_path = tmp_path / "normalized.wav"
            download_file(asset.normalized_object_key, str(normalized_path))

            segments = detect_segments(str(normalized_path))
            if not segments:
                meeting.status = "failed"
                _update_progress(meeting, "vad", 0, {"error": "no speech detected"})
                session.commit()
                return

            vad_rows: list[VadSegment] = []
            for segment in segments:
                vad_row = VadSegment(
                    meeting_id=meeting_uuid,
                    start_ms=segment.start_ms,
                    end_ms=segment.end_ms,
                    padded_start_ms=segment.padded_start_ms,
                    padded_end_ms=segment.padded_end_ms,
                    energy_score=segment.energy_score,
                )
                session.add(vad_row)
                vad_rows.append(vad_row)
            session.commit()

            jobs = []
            queue = get_queue()
            for vad_row in vad_rows:
                clip_path = tmp_path / f"segment-{vad_row.id}.wav"
                extract_clip(
                    str(normalized_path),
                    str(clip_path),
                    vad_row.padded_start_ms,
                    vad_row.padded_end_ms,
                )
                clip_key = f"clips/{meeting_id}/{vad_row.id}.wav"
                with open(clip_path, "rb") as cf:
                    upload_fileobj(clip_key, cf, "audio/wav")
                vad_row.clip_object_key = clip_key
                session.commit()
                job = queue.enqueue(transcribe_vad_segment, meeting_id, str(vad_row.id))
                jobs.append(job)

            meeting.status = "transcribing"
            _update_progress(
                meeting,
                "transcribing",
                30,
                {"segments": len(vad_rows)},
            )
            session.commit()

            queue.enqueue(consolidate_transcript, meeting_id, depends_on=jobs)


def transcribe_vad_segment(meeting_id: str, segment_id: str) -> None:
    meeting_uuid = uuid.UUID(meeting_id)
    segment_uuid = uuid.UUID(segment_id)
    with SessionLocal() as session:
        vad_row = session.get(VadSegment, segment_uuid)
        if not vad_row or not vad_row.clip_object_key:
            return
        with tempfile.TemporaryDirectory() as tmpdir:
            clip_path = Path(tmpdir) / "clip.wav"
            download_file(vad_row.clip_object_key, str(clip_path))
            segments = transcribe_audio(str(clip_path))

        for seg in segments:
            session.add(
                TranscriptSegment(
                    meeting_id=meeting_uuid,
                    start_ms=vad_row.padded_start_ms + seg.start_ms,
                    end_ms=vad_row.padded_start_ms + seg.end_ms,
                    speaker_key="spk_1",
                    text=seg.text.strip(),
                )
            )
        session.commit()


def _snapshot_transcript(session, meeting_uuid: uuid.UUID) -> None:
    segments = (
        session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting_uuid)
            .order_by(TranscriptSegment.start_ms.asc())
        )
        .scalars()
        .all()
    )
    snapshot = [
        {
            "id": str(seg.id),
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "speaker_key": seg.speaker_key,
            "text": seg.text,
        }
        for seg in segments
    ]
    latest_rev = (
        session.execute(
            select(TranscriptRevision)
            .where(TranscriptRevision.meeting_id == meeting_uuid)
            .order_by(TranscriptRevision.revision_no.desc())
        )
        .scalars()
        .first()
    )
    next_rev = 1 if not latest_rev else latest_rev.revision_no + 1
    session.add(
        TranscriptRevision(
            meeting_id=meeting_uuid,
            revision_no=next_rev,
            snapshot_json={"segments": snapshot},
        )
    )


def consolidate_transcript(meeting_id: str) -> None:
    meeting_uuid = uuid.UUID(meeting_id)
    with SessionLocal() as session:
        meeting = session.get(Meeting, meeting_uuid)
        if not meeting:
            return
        meeting.status = "summarizing"
        _update_progress(meeting, "summarizing", 65)

        _snapshot_transcript(session, meeting_uuid)

        segments = (
            session.execute(
                select(TranscriptSegment)
                .where(TranscriptSegment.meeting_id == meeting_uuid)
                .order_by(TranscriptSegment.start_ms.asc())
            )
            .scalars()
            .all()
        )
        if segments:
            embeddings = embed_texts([seg.text for seg in segments])
            for seg, emb in zip(segments, embeddings, strict=False):
                session.add(
                    SegmentEmbedding(
                        meeting_id=meeting_uuid,
                        segment_id=seg.id,
                        embedding=emb,
                    )
                )
        session.commit()

    queue = get_queue()
    queue.enqueue(summarize_meeting, meeting_id)


def summarize_meeting(meeting_id: str) -> None:
    meeting_uuid = uuid.UUID(meeting_id)
    with SessionLocal() as session:
        meeting = session.get(Meeting, meeting_uuid)
        if not meeting:
            return
        segments = (
            session.execute(
                select(TranscriptSegment)
                .where(TranscriptSegment.meeting_id == meeting_uuid)
                .order_by(TranscriptSegment.start_ms.asc())
            )
            .scalars()
            .all()
        )
        chunks: list[str] = []
        current = []
        current_len = 0
        for seg in segments:
            line = f"[{seg.start_ms}-{seg.end_ms}] {seg.text}".strip()
            if current_len + len(line) > 4000 and current:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
            current.append(line)
            current_len += len(line)
        if current:
            chunks.append("\n".join(current))

        partials = [summarize_map(chunk) for chunk in chunks] if chunks else []
        summary = (
            summarize_reduce(partials)
            if partials
            else {"work_summary": {}, "timeline": []}
        )

        session.query(Summary).filter(Summary.meeting_id == meeting_uuid).delete()
        work_summary = summary.get("work_summary", {})
        timeline = summary.get("timeline", [])
        session.add(
            Summary(meeting_id=meeting_uuid, kind="work", content_json=work_summary)
        )
        session.add(
            Summary(
                meeting_id=meeting_uuid,
                kind="timeline",
                content_json={"timeline": timeline},
            )
        )
        meeting.status = "done"
        _update_progress(meeting, "done", 100)
        session.commit()
