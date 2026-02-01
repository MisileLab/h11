# Corin - Meeting Archive & Transcription System

Personal meeting transcription and archive web application with AI-powered features.

## Features

- 🎤 Audio/Video Upload with automatic transcription
- 🗣️ Speaker diarization and identification
- 📝 Editable transcripts with version history
- 📊 AI-powered summarization (work-focused & timeline formats)
- 🔍 Full-text search across meetings
- 💬 Q&A with RAG-based answers and timestamp citations
- 🔗 Shareable public links
- 💰 Usage tracking and cost monitoring
- 🔐 Google OAuth authentication

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Backend**: FastAPI + Python 3.11 + uv
- **Database**: PostgreSQL 16 + pgvector
- **Queue**: Redis + RQ
- **Storage**: S3 (production) / MinIO (development)
- **AI**: 
  - Transcription: OpenAI Whisper
  - Summarization & Q&A: OpenAI GPT-5-mini
  - Embeddings: text-embedding-3-large (3072 dimensions)

## Quick Start

See [docs/setup.md](./docs/setup.md) for detailed setup instructions.

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.11+
- OpenAI API key
- Google OAuth credentials

### Development

1. Clone and setup:
```bash
cd corin
cp .env.example .env
# Edit .env with your credentials
```

2. Start services:
```bash
docker-compose up -d
```

3. Run API:
```bash
cd api
uv sync
uv run alembic upgrade head
uv run python -m app.main
```

4. Run Web:
```bash
cd web
yarn install
yarn dev
```

5. Access:
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- MinIO Console: http://localhost:9001

## Documentation

- [Setup Guide](./docs/setup.md)
- [Architecture](./docs/architecture.md)
- [API Reference](./docs/api.md)

## License

MIT
