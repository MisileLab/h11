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
1. Start Postgres and Valkey (use `docker compose up postgres valkey`).
2. Configure AWS S3 credentials in `.env` (or export env vars).
3. API:
   - `cd corin/apps/api`
   - `python -m venv .venv && source .venv/bin/activate`
   - `uv pip install -r requirements.txt`
   - `uvicorn main:app --reload --host 0.0.0.0 --port 8080`
4. Worker:
   - `cd corin/apps/worker`
   - `python -m venv .venv && source .venv/bin/activate`
   - `uv pip install -r requirements.txt`
   - `python worker.py`
5. Web:
   - `cd corin/apps/web`
   - `yarn install`
   - `yarn dev`

## S3 bucket
The API auto-creates the bucket specified by `S3_BUCKET` if it does not exist.

## AWS S3 env vars
Minimum required:
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`

## VAD audit tool
Sample VAD segments for manual spot checks:

```bash
python corin/apps/worker/tools/vad_audit.py <meeting-id> --limit 20
```
