<!-- Parent: ../AGENTS.md -->
# ARXGORITHM

## OVERVIEW
Fullstack web app: Next.js 16 frontend + FastAPI Python backend. Docker Compose for local dev.

## STRUCTURE
```
arxgorithm/
├── frontend/          # Next.js 16 (pnpm, Tailwind v4, app router)
│   ├── src/           # App routes, components
│   ├── e2e/           # Playwright e2e tests
│   └── vitest.config.ts
├── backend/           # FastAPI (Python 3.11+)
│   ├── app/           # API routes, services
│   │   ├── api/       # Route handlers
│   │   └── services/  # Business logic
│   ├── tests/         # pytest suite (18 files)
│   └── pyproject.toml # hatchling, uv package manager
├── docker-compose.yml # Local dev orchestration
├── Dockerfile.frontend
└── Dockerfile.backend
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Frontend routes | `frontend/src/app/` | Next.js app router |
| Frontend tests | `frontend/src/**/*.test.tsx` | vitest + testing-library |
| E2E tests | `frontend/e2e/` | Playwright (port 3099) |
| API routes | `backend/app/api/` | FastAPI routers |
| Services | `backend/app/services/` | Business logic layer |
| Backend tests | `backend/tests/` | pytest + pytest-asyncio |
| Test fixtures | `backend/tests/conftest.py` | DB, env setup |
| Dependencies | `backend/pyproject.toml` | FastAPI, pydantic, aiosqlite |

## CONVENTIONS
- Frontend: pnpm, Tailwind v4, vitest + Playwright.
- Backend: Python 3.11+, FastAPI, pydantic v2, pytest-asyncio.
- Docker: multi-stage builds, non-root users.
- Backend uses `uv` package manager (faster than pip).

## COMMANDS
```bash
# Full stack
docker-compose up           # Frontend:3000, Backend:8000

# Frontend
cd frontend
pnpm dev                    # Next.js dev
pnpm test                   # vitest
pnpm test:e2e               # Playwright

# Backend
cd backend
uv pip install              # Install deps
pytest                      # Run tests
uvicorn app.main:app        # Dev server
```
