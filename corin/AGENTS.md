<!-- Parent: ../AGENTS.md -->
# CORIN

## OVERVIEW
Meeting archive app with FastAPI backend and Next.js frontend.

## STRUCTURE
```
corin/
├── api/            # FastAPI service + RQ worker
├── web/            # Next.js App Router UI
├── docs/           # Setup/architecture docs
└── docker-compose*.yml
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| API entrypoint | `api/app/main.py` | FastAPI app + routers |
| API settings | `api/app/config.py` | Pydantic settings + .env |
| Worker entry | `api/worker.py` | RQ worker CLI |
| Web entry | `web/src/app/layout.tsx` | Root layout + providers |
| Web auth route | `web/src/app/api/auth/[...nextauth]/route.ts` | NextAuth handlers |
| Docs | `docs/setup.md` | Local setup and services |
| Env template | `.env.example` | Required variables |

## CONVENTIONS
- Backend uses `uv` commands in docs (`uv run ...`).
- Web uses Next.js App Router under `web/src/app`.
- Embeddings use `text-embedding-3-large` (3072d); apply migrations before reindexing.

## ANTI-PATTERNS
- Do not run the worker without Redis and required services running.
- Do not commit `.env` files.
