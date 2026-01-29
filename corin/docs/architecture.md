# Corin Architecture

## Overview
Corin is a three-service app:
- **Web** (Next.js) for UI and OAuth
- **API** (FastAPI) for metadata, search, share, and job orchestration
- **Worker** (RQ) for heavy processing (ffmpeg, VAD, STT, summarization)

## Data model
Core tables:
- `meetings`: status + progress JSON
- `media_assets`: original, normalized, and playable object keys
- `vad_segments`: VAD output on original timeline
- `transcript_segments`: transcript with timestamps
- `transcript_revisions`: full snapshots for versioning
- `summaries`: work + timeline JSON
- `share_links`: tokenized share access
- `segment_embeddings`: pgvector embeddings for RAG

## Processing pipeline
1. **ingest_upload**
   - download original, extract normalized WAV, generate playable M4A
   - upload normalized + playable to S3
   - enqueue `run_vad`
2. **run_vad**
   - detect speech segments, store `vad_segments`
   - extract padded clips for STT and enqueue `transcribe_vad_segment`
3. **transcribe_vad_segment**
   - STT per clip, remap timestamps to original timeline
   - store transcript segments
4. **consolidate_transcript**
   - snapshot transcript revision
   - create embeddings
   - enqueue `summarize_meeting`
5. **summarize_meeting**
   - map-reduce summary (work + timeline)
   - mark meeting done

## Storage
- Original media stored in S3/MinIO under `original/`
- Normalized WAV under `normalized/`
- Playable audio under `playable/`
- VAD clips under `clips/`

## Search & Q&A
- Keyword search uses Postgres `ILIKE` across transcript and summary JSON.
- Q&A uses pgvector embeddings and OpenAI chat with citations.
