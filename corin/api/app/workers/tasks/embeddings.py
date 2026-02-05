"""
Embeddings generation worker task.

Generates OpenAI embeddings for transcript segments and stores in Embedding table.
"""

import logging
from typing import List

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Meeting, TranscriptSegment, Embedding, STTUsageLog
from app.workers.jobs import update_job_progress

logger = logging.getLogger(__name__)

# Chunking strategy
CHUNK_SIZE = 512  # tokens (approximate by chars/4)
CHUNK_OVERLAP = 64  # tokens overlap


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Chunk text into overlapping segments.

    Args:
        text: Text to chunk
        chunk_size: Target chunk size in characters (rough token approximation)
        overlap: Overlap size in characters

    Returns:
        List of text chunks
    """
    # Approximate: 1 token ≈ 4 chars
    char_chunk_size = chunk_size * 4
    char_overlap = overlap * 4

    if len(text) <= char_chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = start + char_chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - char_overlap

    return chunks


def generate_embeddings(meeting_id: int, job_id: str | None = None) -> None:
    """
    Generate embeddings for all transcript segments in a meeting.

    Args:
        meeting_id: Meeting ID
        job_id: Optional job ID for progress tracking
    """
    settings = get_settings()
    db: Session = next(get_db())

    try:
        # Update progress
        if job_id:
            update_job_progress(job_id, "embeddings", 0, "Starting embedding generation")

        logger.info(f"Starting embedding generation for meeting {meeting_id}")

        # Get meeting
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError(f"Meeting {meeting_id} not found")

        # Get all transcript segments
        segments = (
            db.query(TranscriptSegment)
            .filter(TranscriptSegment.meeting_id == meeting_id)
            .order_by(TranscriptSegment.start_sec)
            .all()
        )

        if not segments:
            logger.warning(f"No transcript segments found for meeting {meeting_id}")
            if job_id:
                update_job_progress(job_id, "embeddings", 100, "No segments to embed")
            return

        logger.info(f"Found {len(segments)} segments to process")

        # Initialize OpenAI client
        client = OpenAI(api_key=settings.openai_api_key)

        # Process segments in chunks
        all_chunks = []
        segment_mapping = []  # Track which chunk belongs to which segment

        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue

            # Chunk the segment text
            chunks = chunk_text(text)
            for chunk in chunks:
                all_chunks.append(chunk)
                segment_mapping.append(segment.id)

        logger.info(f"Created {len(all_chunks)} chunks from {len(segments)} segments")

        if not all_chunks:
            logger.warning(f"No text chunks created for meeting {meeting_id}")
            if job_id:
                update_job_progress(job_id, "embeddings", 100, "No text to embed")
            return

        # Generate embeddings in batches (OpenAI limit: 2048 inputs per request)
        batch_size = 100
        total_cost = 0.0
        total_tokens = 0

        for i in range(0, len(all_chunks), batch_size):
            batch_chunks = all_chunks[i : i + batch_size]
            batch_segment_ids = segment_mapping[i : i + batch_size]

            logger.info(
                f"Processing batch {i // batch_size + 1}/{(len(all_chunks) + batch_size - 1) // batch_size}"
            )

            # Call OpenAI API
            response = client.embeddings.create(
                model="text-embedding-3-large", input=batch_chunks, encoding_format="float"
            )

            # Track usage
            usage_tokens = response.usage.total_tokens
            total_tokens += usage_tokens

            # Cost: $0.13 per 1M tokens (text-embedding-3-large)
            batch_cost = (usage_tokens / 1_000_000) * 0.13
            total_cost += batch_cost

            # Store embeddings
            for j, embedding_data in enumerate(response.data):
                chunk_idx = i + j
                embedding_vector = embedding_data.embedding

                embedding_record = Embedding(
                    meeting_id=meeting_id,
                    segment_id=batch_segment_ids[j],
                    chunk_text=batch_chunks[j],
                    embedding=embedding_vector,
                )
                db.add(embedding_record)

            # Update progress
            progress = int((i + len(batch_chunks)) / len(all_chunks) * 100)
            if job_id:
                update_job_progress(
                    job_id,
                    "embeddings",
                    progress,
                    f"Processed {i + len(batch_chunks)}/{len(all_chunks)} chunks",
                )

        # Log usage
        usage_log = STTUsageLog(
            meeting_id=meeting_id,
            job_type="embeddings",
            provider="openai",
            model="text-embedding-3-large",
            input_tokens=total_tokens,
            cost_usd=total_cost,
            raw_response_json=None,
        )
        db.add(usage_log)

        db.commit()

        logger.info(
            f"Embedding generation complete for meeting {meeting_id}: "
            f"{len(all_chunks)} chunks, {total_tokens} tokens, ${total_cost:.4f}"
        )

        if job_id:
            update_job_progress(
                job_id,
                "embeddings",
                100,
                f"Complete: {len(all_chunks)} chunks embedded",
                metadata={"total_cost": total_cost, "total_tokens": total_tokens},
            )

    except Exception as e:
        logger.error(
            f"Embedding generation failed for meeting {meeting_id}: {str(e)}", exc_info=True
        )
        if job_id:
            update_job_progress(job_id, "embeddings", 0, f"Error: {str(e)}")
        db.rollback()
        raise

    finally:
        db.close()
