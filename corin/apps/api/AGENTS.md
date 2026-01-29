<!-- Parent: ../../AGENTS.md -->
# API

## OVERVIEW
FastAPI service with modular routers and background task queueing.

## STRUCTURE
```
apps/api/
├── app/
│   ├── routers/   # Endpoint modules
│   ├── tasks.py   # Enqueued jobs
│   ├── queue.py   # RQ client
│   ├── storage.py # S3 helpers
│   └── config.py  # Settings
├── main.py        # FastAPI app
└── requirements.txt
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App entry | `main.py` | FastAPI app init |
| Routers | `app/routers` | API endpoints |
| Auth | `app/auth.py` | Auth helpers |
| Storage | `app/storage.py` | S3/MinIO utilities |
| Queue | `app/queue.py` | RQ client |
| Tasks | `app/tasks.py` | Background task functions |

## CONVENTIONS
- Routers register in `main.py` from `app/routers`.
- Background work goes through RQ (queue + tasks).
- Settings live in `app/config.py` and read from `.env`.
