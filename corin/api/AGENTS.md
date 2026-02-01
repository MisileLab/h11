<!-- Parent: ../AGENTS.md -->
# API

## OVERVIEW
FastAPI service with SQLAlchemy models, Alembic migrations, and RQ workers.

## STRUCTURE
```
api/
├── app/            # FastAPI package
├── alembic/        # Migrations
├── worker.py       # RQ worker entrypoint
├── test_*.py       # Integration scripts
├── pyproject.toml
└── Dockerfile
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App entrypoint | `app/main.py` | FastAPI app + router includes |
| Settings | `app/config.py` | Pydantic Settings + .env |
| DB setup | `app/db.py` | SQLAlchemy engine/session |
| Routes | `app/routes` | API endpoints |
| Services | `app/services` | Business logic |
| Workers | `app/workers` | RQ queues + tasks |
| Migrations | `alembic/env.py` | Uses settings.database_url |

## CONVENTIONS
- Settings accessed via `get_settings()` (cached).
- Worker runs via `python worker.py` (queues defined in `app/workers/queue.py`).
- Alembic reads `.env` through app settings; ensure env is set before running migrations.

## ANTI-PATTERNS
- Do not bypass Alembic when changing schema.
- Do not change embedding vector dimensions without a migration.
