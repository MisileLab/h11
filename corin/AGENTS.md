<!-- Parent: ../AGENTS.md -->
# CORIN

## OVERVIEW
Full-stack app: Next.js web UI + FastAPI API + RQ worker.

## STRUCTURE
```
corin/
├── apps/
│   ├── web/      # Next.js app router
│   ├── api/      # FastAPI service
│   └── worker/   # RQ worker
├── docs/         # Setup/architecture/API notes
└── docker-compose.yml
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Web app | `apps/web/app` | Next.js app router routes |
| Web auth | `apps/web/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| API entry | `apps/api/main.py` | FastAPI app startup |
| API routers | `apps/api/app/routers` | Endpoint modules |
| Worker entry | `apps/worker/worker.py` | RQ worker loop |
| Environment | `.env.example` | Required env vars |
| Docs | `docs` | Setup and architecture |

## CONVENTIONS
- Web uses Yarn 4 (PnP) and Next.js app router.
- API and worker use Python 3.12 with requirements.txt.
- API enqueues background tasks consumed by the worker.
