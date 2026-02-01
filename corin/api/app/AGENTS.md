<!-- Parent: ../AGENTS.md -->
# APP

## OVERVIEW
FastAPI application package: routes, services, models, and workers.

## STRUCTURE
```
app/
├── routes/         # FastAPI routers
├── services/       # Business logic
├── models/         # SQLAlchemy models
├── schemas/        # Pydantic schemas
├── workers/        # RQ queues + tasks
├── utils/          # S3/MinIO helpers
├── dependencies/   # Auth dependencies
├── config.py       # Settings
└── db.py           # DB session helpers
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Route wiring | `main.py` | Includes routers + CORS |
| Auth | `routes/auth.py`, `services/auth.py` | Google OAuth + JWT |
| Upload flow | `routes/upload.py`, `services/upload.py` | S3 presigned URLs |
| Search/Q&A | `services/search.py`, `services/qa.py` | pgvector + LLM calls |
| Worker tasks | `workers/tasks` | transcription/summarization/embeddings |
| S3 helpers | `utils/s3.py` | MinIO/S3 client utilities |

## CONVENTIONS
- Routers are thin; logic lives in `services/`.
- Authenticated routes use `dependencies/auth.py`.
- Worker tasks enqueue via RQ queues from `workers/queue.py`.

## ANTI-PATTERNS
- Do not access S3 directly in routes; use `utils/s3.py`.
- Do not import settings at module import time in tests without setting env first.
