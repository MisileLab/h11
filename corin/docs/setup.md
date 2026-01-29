# Corin Setup

## Requirements
- Docker + Docker Compose
- Node.js 20+ (for local web dev)
- Python 3.12 (for local API/worker dev)
- ffmpeg (worker runtime)

## Local quickstart (Docker)
1. Copy env template:
   - `cp .env.example .env`
2. Update `.env` with your Google OAuth keys and OpenAI API key.
3. Start services:
   - `docker compose up --build`
4. Open the web app:
   - `http://localhost:3000`

## Local dev (without Docker)
1. Start Postgres, Redis, and MinIO (use `docker compose up postgres redis minio`).
2. API:
   - `cd corin/apps/api`
   - `python -m venv .venv && source .venv/bin/activate`
   - `uv pip install -r requirements.txt`
   - `uvicorn main:app --reload --host 0.0.0.0 --port 8080`
3. Worker:
   - `cd corin/apps/worker`
   - `python -m venv .venv && source .venv/bin/activate`
   - `uv pip install -r requirements.txt`
   - `python worker.py`
4. Web:
   - `cd corin/apps/web`
   - `yarn install`
   - `yarn dev`

## MinIO bucket
The API auto-creates the bucket specified by `S3_BUCKET` if it does not exist.

## VAD audit tool
Sample VAD segments for manual spot checks:

```bash
python corin/apps/worker/tools/vad_audit.py <meeting-id> --limit 20
```
