<!-- Parent: ../AGENTS.md -->
# BACKEND

## OVERVIEW
FastAPI backend with service layer, SQLite storage, pytest test suite.

## STRUCTURE
```
backend/
├── app/
│   ├── main.py           # FastAPI app entry
│   ├── api/              # Route handlers (7 files)
│   └── services/         # Business logic
├── tests/                # pytest suite (18 test files)
│   └── conftest.py       # Fixtures: DB, env vars
├── pyproject.toml        # hatchling, FastAPI, pydantic
└── .venv/                # Python 3.11+ venv
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App entry | `app/main.py` | FastAPI initialization |
| API routes | `app/api/` | REST endpoints |
| Services | `app/services/` | Business logic |
| Test fixtures | `tests/conftest.py` | SQLite test DB, mocked env |
| Dependencies | `pyproject.toml` | FastAPI, pydantic, aiosqlite |

## CONVENTIONS
- Python 3.11+ required.
- async/await throughout (aiosqlite, httpx).
- Tests use isolated SQLite DB per test.
- Environment vars for secrets (DATABASE_URL, API keys).

## COMMANDS
```bash
uv pip install              # Install deps (uses uv)
pytest                      # Run all tests
pytest -v                   # Verbose output
uvicorn app.main:app        # Dev server (port 8000)
```
