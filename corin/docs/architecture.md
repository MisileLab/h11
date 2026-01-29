# Corin Architecture

## Overview
Corin is a three-service app:
- **Web** (Next.js) for UI and OAuth
- **API** (FastAPI) for metadata, search, share, and job orchestration
- **Worker** (RQ) for heavy processing (ffmpeg, VAD, STT, summarization)

## Data model
Core tables:
- `meetings`: status + progress JSON, usage tokens (audio/text/output), total cost USD
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
   - STT per clip using selected provider (GPT-4o or Whisper), remap timestamps to original timeline
   - capture usage (audio/text/output tokens) and calculate cost per segment
   - idempotent: skip if segments already exist for this VAD segment
   - store transcript segments and accumulate usage/cost on meeting record
4. **consolidate_transcript**
   - snapshot transcript revision
   - create embeddings
   - enqueue `summarize_meeting`
5. **summarize_meeting**
   - map-reduce summary (work + timeline)
   - mark meeting done

## STT Provider Selection
- Configured via `STT_PROVIDER` env var (default: `openai_4o`)
- **openai_4o**: Uses `gpt-4o-transcribe` by default (25MB file limit)
- **openai_4o` + `STT_DIARIZE=true`**: Uses `gpt-4o-transcribe-diarize` with speaker labels
- **whisper**: Uses OpenAI Whisper API (fallback, no usage tracking)
- GPT-4o tracks audio tokens, text tokens, and output tokens per transcription
- Costs calculated using `OPENAI_TRANSCRIBE_INPUT_USD_PER_1M` and `OPENAI_TRANSCRIBE_OUTPUT_USD_PER_1M`
- Usage and cost accumulated per meeting in `meetings` table

## Storage
- Original media stored in S3/MinIO under `original/`
- Normalized WAV under `normalized/`
- Playable audio under `playable/`
- VAD clips under `clips/`

## Search & Q&A
- Keyword search uses Postgres `ILIKE` across transcript and summary JSON.
- Q&A uses pgvector embeddings and OpenAI chat with citations.
