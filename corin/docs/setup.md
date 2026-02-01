# Setup Guide

## Prerequisites

### Required Software

- **Docker** 24.0+ and **Docker Compose** 2.20+
- **Node.js** 20.0+ and **npm** 10.0+
- **Python** 3.11+ and **Poetry** 1.8+
- **FFmpeg** (for local audio processing, or use Docker)

### Required Credentials

1. **OpenAI API Key**
   - Sign up at https://platform.openai.com
   - Create API key with GPT-4o access
   - Set in `.env`: `OPENAI_API_KEY=sk-proj-...`

2. **Google OAuth Credentials**
   - Go to https://console.cloud.google.com
   - Create new project → Enable Google+ API
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy Client ID and Secret to `.env`

## Local Development Setup

### 1. Clone and Configure

```bash
cd corin
cp .env.example .env
```

Edit `.env` and set:
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET` (generate with: `openssl rand -hex 32`)

### 2. Start Infrastructure Services

```bash
# Start Postgres, Redis, MinIO
docker-compose up -d

# Verify services are healthy
docker-compose ps
```

You should see:
- ✅ corin-postgres (healthy)
- ✅ corin-redis (healthy)
- ✅ corin-minio (healthy)

### 3. Setup Database

```bash
cd api

# Install dependencies
poetry install

# Run migrations
poetry run alembic upgrade head

# (Optional) Seed development data
poetry run python scripts/seed_dev_data.py
```

### 4. Start API Server

```bash
# In api/ directory
poetry run python -m app.main
```

API will be available at:
- http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

### 5. Start Frontend

```bash
# In web/ directory
npm install
npm run dev
```

Frontend will be available at:
- http://localhost:3000

### 6. Start Worker (for job processing)

```bash
# In api/ directory
poetry run rq worker --url redis://localhost:6379/0
```

## Verify Installation

### Test API Health

```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy"}
```

### Test MinIO Access

1. Open MinIO Console: http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Verify buckets exist:
   - corin-originals
   - corin-playback
   - corin-clips

### Test Database Connection

```bash
docker exec -it corin-postgres psql -U corin -d corin -c "SELECT version();"
```

### Test Frontend

1. Open http://localhost:3000
2. Should see "Corin" landing page

## Troubleshooting

### Port Conflicts

If ports are already in use, modify in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # Postgres
  - "6380:6379"  # Redis
  - "9002:9000"  # MinIO API
```

Update `.env` accordingly.

### Database Migration Issues

```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
cd api
poetry run alembic upgrade head
```

### MinIO Bucket Creation Failed

```bash
# Manually create buckets
docker exec -it corin-minio-init sh
mc alias set corin http://minio:9000 minioadmin minioadmin
mc mb corin/corin-originals
mc mb corin/corin-playback
mc mb corin/corin-clips
```

### Worker Not Processing Jobs

Check Redis connection:
```bash
docker exec -it corin-redis redis-cli ping
# Expected: PONG
```

Check worker logs:
```bash
poetry run rq info --url redis://localhost:6379/0
```

## Next Steps

- [Architecture Overview](./architecture.md)
- [API Documentation](./api.md)
- Configure Google OAuth for login
- Upload your first meeting

## Production Deployment

See [Production Deployment Guide](./deployment.md) (TODO) for:
- AWS S3 configuration
- PostgreSQL RDS setup
- Redis ElastiCache
- Environment-specific settings
- Secrets management
