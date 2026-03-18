# arXgorithm - arXiv Paper Recommendation Site

## TL;DR
> **Summary**: Personalized arXiv paper recommendation site with YouTube-like algorithm, content-based + collaborative filtering, optional OAuth authentication, and LLM-powered summaries.
> **Deliverables**: FastAPI backend, Next.js frontend, SQLite + sqlite-vec vector search, OAuth auth, Gemini summaries
> **Effort**: Large (2+ weeks)
> **Parallel**: YES - 5 waves
> **Critical Path**: Backend Schema → arXiv Client → Embedding Service → Recommendation Engine → Frontend

## Context

### Original Request
Build a personalized arXiv paper recommendation site that works like YouTube's recommendation algorithm - users get paper suggestions based on their reading history and preferences.

### Interview Summary
- **Auth**: Optional (anonymous via cookie UUID, OAuth for sync)
- **Algorithm**: Hybrid (content-based via embeddings + collaborative filtering Phase 2)
- **Deployment**: New domain, VPS + Docker Compose
- **Scale**: <1000 concurrent users, SQLite viable

### Metis Review (gaps addressed)
- **Latency**: <100ms for pre-computed recommendations ONLY; async for generation
- **Cold start**: Content-based first, collaborative filtering deferred
- **Data ingestion**: On-demand with aggressive caching (1hr TTL)
- **Vector search**: sqlite-vec extension
- **API key security**: All keys server-side, proxied through FastAPI

## Work Objectives

### Core Objective
Deliver a functional arXiv paper recommendation site where:
1. Users can search arXiv papers by keyword/category
2. Papers are recommended based on reading history (content-based)
3. Anonymous users get cookie-tracked recommendations; OAuth users get sync
4. Paper summaries generated via Gemini flash-lite
5. Reading list for saving papers

### Deliverables
- [x] Backend: FastAPI with SQLite + sqlite-vec
- [x] Frontend: Next.js 14+ with App Router
- [x] arXiv API client with caching
- [x] Embedding service (Nebius Qwen3-Embedding-8b)
- [x] Content-based recommendation engine
- [x] OAuth authentication (Google/GitHub)
- [x] Anonymous user tracking (cookie UUID)
- [x] LLM summary service (Gemini)
- [x] Docker Compose deployment config

### Definition of Done
```bash
# Backend tests pass
cd backend && pytest --cov

# Frontend tests pass  
cd frontend && pnpm test

# E2E tests pass
pnpm e2e

# Docker compose up succeeds
docker compose up --build
curl http://localhost:8000/health  # {"status": "ok"}
curl http://localhost:3000         # HTML response
```

### Must Have
- arXiv search with keyword + category filter
- Content-based recommendations via embeddings
- Anonymous user tracking via cookie UUID
- OAuth login (Google or GitHub)
- Reading list (save/unsave papers)
- Paper summaries via Gemini
- SQLite + sqlite-vec for all data

### Must NOT Have (Guardrails)
- NO collaborative filtering in V1 (defer to Phase 2)
- NO admin UI, analytics dashboard
- NO notifications, email alerts
- NO advanced search (faceted, boolean)
- NO citation graphs, social features
- NO PDF full-text extraction
- NO repository pattern, CQRS, event sourcing
- NO API keys in frontend code or git
- NO synchronous external API calls in hot paths
- NO custom auth implementation (use next-auth / authlib)

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.

- **Test decision**: TDD (pytest + vitest + Playwright)
- **QA policy**: Every task has agent-executed scenarios
- **Evidence**: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave.

**Wave 1: Foundation** (Backend infrastructure)
- Backend project scaffolding
- Database schema + sqlite-vec setup
- Configuration + environment management
- API client base (httpx with retry)

**Wave 2: Core Services** (External integrations)
- arXiv API client with caching
- Embedding service (Nebius)
- Summary service (Gemini)
- Paper ingestion pipeline

**Wave 3: Recommendation Engine** (Business logic)
- Recommendation engine (content-based)
- Search endpoint
- Papers endpoint
- Reading list CRUD

**Wave 4: Authentication** (User management)
- OAuth setup (Google/GitHub)
- Anonymous user tracking
- Session merge logic
- Protected routes

**Wave 5: Frontend** (UI)
- Next.js project setup
- Search UI
- Recommendation feed
- Paper detail page
- Auth UI
- Reading list UI

### Dependency Matrix
```
W1.T1 (Scaffolding) → W1.T2, W1.T3, W1.T4
W1.T2 (Schema) → W2.T4, W3.T1, W3.T2, W3.T3, W3.T4
W1.T4 (HTTP Client) → W2.T1, W2.T2, W2.T3
W2.T1 (arXiv) → W2.T4, W3.T2
W2.T2 (Embedding) → W2.T4, W3.T1
W2.T3 (Summary) → W3.T3
W2.T4 (Ingestion) → W3.T1, W3.T2
W3.* (All endpoints) → W5.*
W4.T1 (OAuth) → W4.T3, W4.T4, W5.T4
W4.T2 (Anonymous) → W4.T3
```

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 4 | quick, unspecified-low |
| 2 | 4 | unspecified-low |
| 3 | 4 | unspecified-high |
| 4 | 4 | unspecified-high |
| 5 | 6 | visual-engineering |

---

## TODOs

- [x] 1. Backend Project Scaffolding

  **What to do**: Initialize FastAPI project with proper structure, dependencies, and configuration.
  
  **Must NOT do**: 
  - NO business logic in this task
  - NO database setup yet
  - NO external service clients

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Standard project setup, well-defined pattern
  - Skills: [] — Standard Python project, no special skills needed
  - Omitted: [`git-master`] — Single commit at end of wave

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 4 | Blocked By: none

  **References**:
  - Pattern: FastAPI standard structure
  - External: https://fastapi.tiangolo.com/tutorial/

  **Acceptance Criteria**:
  - [ ] `backend/` directory exists with `app/` package structure
  - [ ] `pyproject.toml` with FastAPI, uvicorn, pydantic, httpx, pytest
  - [ ] `.env.example` with all required env vars documented
  - [ ] `.gitignore` includes `.env`, `__pycache__/`, `.venv/`, `*.db`
  - [ ] `pytest` runs successfully (even with no tests)

  **QA Scenarios**:
  ```
  Scenario: Project structure validates
    Tool: Bash
    Steps: 
      - cd backend && ls -la app/
      - cat pyproject.toml | grep -E "fastapi|uvicorn|pydantic|httpx|pytest"
    Expected: All files exist, dependencies listed
    Evidence: .sisyphus/evidence/task-01-scaffold.txt

  Scenario: Environment example complete
    Tool: Bash
    Steps: cat backend/.env.example
    Expected: Contains ARXIV_RATE_LIMIT, NEBIUS_API_KEY, GEMINI_API_KEY, OAUTH_*, SESSION_SECRET, DATABASE_URL
    Evidence: .sisyphus/evidence/task-01-env.txt
  ```

  **Commit**: YES | Message: `chore(backend): project scaffolding with FastAPI structure` | Files: backend/*

---

- [x] 2. Database Schema + sqlite-vec Setup

  **What to do**: Create SQLite database schema with sqlite-vec extension for vector storage. Tables: papers, embeddings, users, reading_list, anonymous_sessions.

  **Must NOT do**:
  - NO ORM patterns (use raw SQL via aiosqlite)
  - NO migration system (schema.sql is sufficient for V1)
  - NO data seeding

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard schema design
  - Skills: [] — Standard SQL
  - Omitted: [`git-master`] — Commit with Wave 1

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2.T4, 3.* | Blocked By: 1

  **References**:
  - Pattern: `pile/src-tauri/src/db.rs:43-79` — SQLite schema pattern
  - External: https://github.com/asg017/sqlite-vec — sqlite-vec docs

  **Acceptance Criteria**:
  - [ ] `backend/app/db/schema.sql` creates all tables
  - [ ] `papers` table: id, arxiv_id, title, abstract, authors (JSON), categories (JSON), published_at, updated_at, created_at
  - [ ] `embeddings` table: paper_id, vector (BLOB via sqlite-vec), created_at
  - [ ] `users` table: id, oauth_provider, oauth_id, email, name, created_at
  - [ ] `reading_list` table: user_id (nullable), anonymous_id (nullable), paper_id, saved_at
  - [ ] `anonymous_sessions` table: id, cookie_uuid, created_at, last_seen_at
  - [ ] `db.py` module with async connection pool and init function
  - [ ] Test: schema.sql executes without errors on fresh :memory: database

  **QA Scenarios**:
  ```
  Scenario: Schema creates all tables
    Tool: Bash
    Steps: 
      - cd backend && python -c "from app.db import init_db; import asyncio; asyncio.run(init_db(':memory:'))"
    Expected: No errors, all tables created
    Evidence: .sisyphus/evidence/task-02-schema.txt

  Scenario: sqlite-vec extension loads
    Tool: Bash
    Steps:
      - cd backend && python -c "import sqlite3; conn = sqlite3.connect(':memory:'); conn.enable_load_extension(True); import sqlite_vec; sqlite_vec.load(conn); print('OK')"
    Expected: "OK" printed
    Evidence: .sisyphus/evidence/task-02-vec.txt
  ```

  **Commit**: NO (part of Wave 1 commit)

---

- [x] 3. Configuration + Environment Management

  **What to do**: Implement typed configuration using pydantic-settings with validation for all environment variables.

  **Must NOT do**:
  - NO hardcoded values
  - NO default values for secrets (must fail fast if missing)
  - NO config file parsing (env vars only)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard pydantic-settings pattern
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2.T1-4 | Blocked By: 1

  **References**:
  - External: https://docs.pydantic.dev/latest/concepts/pydantic_settings/

  **Acceptance Criteria**:
  - [ ] `backend/app/config.py` with Settings class
  - [ ] Validates: ARXIV_RATE_LIMIT (float), NEBIUS_API_KEY, NEBIUS_API_URL, GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET, DATABASE_URL, FRONTEND_URL
  - [ ] OAuth secrets optional (app works without OAuth for anonymous mode)
  - [ ] Test: missing required env var raises ValidationError

  **QA Scenarios**:
  ```
  Scenario: Config loads with valid env
    Tool: Bash
    Steps:
      - cd backend && ARXIV_RATE_LIMIT=3.0 DATABASE_URL=sqlite:///test.db NEBIUS_API_KEY=test GEMINI_API_KEY=test SESSION_SECRET=secret python -c "from app.config import settings; print(settings.arxiv_rate_limit)"
    Expected: "3.0"
    Evidence: .sisyphus/evidence/task-03-config.txt

  Scenario: Config fails without required vars
    Tool: Bash
    Steps:
      - cd backend && python -c "from app.config import settings" 2>&1
    Expected: ValidationError raised
    Evidence: .sisyphus/evidence/task-03-config-fail.txt
  ```

  **Commit**: NO (part of Wave 1 commit)

---

- [x] 4. HTTP Client Base with Retry

  **What to do**: Create reusable async HTTP client with exponential backoff retry, rate limiting, and proper error handling.

  **Must NOT do**:
  - NO service-specific logic (generic client only)
  - NO caching (handled per-service)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard httpx pattern
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2.T1-3 | Blocked By: 1

  **References**:
  - Pattern: `schale/frontend/src/components/request.ts` — HTTP wrapper pattern
  - External: https://www.python-httpx.org/advanced/#usage-patterns

  **Acceptance Criteria**:
  - [ ] `backend/app/http_client.py` with AsyncClient wrapper
  - [ ] Exponential backoff: 1s → 2s → 4s max
  - [ ] Rate limiting via semaphore (configurable concurrency)
  - [ ] Custom exception: ExternalServiceError
  - [ ] User-Agent header set to "arXgorithm/1.0"
  - [ ] Test: mock server returns 429, client retries correctly

  **QA Scenarios**:
  ```
  Scenario: Retry on 429
    Tool: pytest
    Steps: pytest backend/tests/test_http_client.py::test_retry_on_429 -v
    Expected: PASS - client retries 3 times
    Evidence: .sisyphus/evidence/task-04-retry.txt

  Scenario: Rate limiting enforced
    Tool: pytest
    Steps: pytest backend/tests/test_http_client.py::test_rate_limit -v
    Expected: PASS - requests queued, max concurrent respected
    Evidence: .sisyphus/evidence/task-04-ratelimit.txt
  ```

  **Commit**: YES | Message: `feat(backend): project foundation with db, config, http client` | Files: backend/app/{db,config,http_client}.py, backend/tests/test_*.py

---

- [x] 5. arXiv API Client with Caching

  **What to do**: Implement arXiv API client using `arxiv` Python library with aggressive caching (1hr TTL) and rate limit compliance.

  **Must NOT do**:
  - NO PDF downloading
  - NO bulk harvesting (respect rate limits)
  - NO synchronous calls

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Well-documented library
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8, 10 | Blocked By: 4

  **References**:
  - External: https://github.com/lukasschwab/arxiv.py — arxiv library
  - Research: Rate limit 3-4s between requests

  **Acceptance Criteria**:
  - [ ] `backend/app/services/arxiv.py` with ArxivClient class
  - [ ] Methods: search(query, categories, max_results), get_paper(arxiv_id)
  - [ ] Cache via SQLite table `arxiv_cache` (query_hash, response_json, expires_at)
  - [ ] Rate limiting: 3.0s delay between requests (configurable)
  - [ ] Returns Paper dataclass with all metadata
  - [ ] Test: mock arxiv library, verify caching works

  **QA Scenarios**:
  ```
  Scenario: Search returns papers
    Tool: pytest
    Steps: pytest backend/tests/test_arxiv.py::test_search -v
    Expected: PASS - returns list of Paper objects
    Evidence: .sisyphus/evidence/task-05-search.txt

  Scenario: Cache hit avoids API call
    Tool: pytest
    Steps: pytest backend/tests/test_arxiv.py::test_cache_hit -v
    Expected: PASS - second call uses cache, no API request
    Evidence: .sisyphus/evidence/task-05-cache.txt

  Scenario: Rate limiting enforced
    Tool: pytest
    Steps: pytest backend/tests/test_arxiv.py::test_rate_limit -v
    Expected: PASS - 3+ second delay between calls
    Evidence: .sisyphus/evidence/task-05-ratelimit.txt
  ```

  **Commit**: NO (part of Wave 2 commit)

---

- [x] 6. Embedding Service (Nebius)

  **What to do**: Implement embedding client for Qwen3-Embedding-8b via Nebius API with caching.

  **Must NOT do**:
  - NO synchronous calls
  - NO embedding in request path (async/background only)
  - NO key exposure

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard API client
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8, 9 | Blocked By: 4

  **References**:
  - External: https://nebius.com/docs — Nebius API docs
  - Pattern: `pile/src-tauri/src/embedding.rs` — embedding pipeline pattern

  **Acceptance Criteria**:
  - [ ] `backend/app/services/embedding.py` with EmbeddingService class
  - [ ] Method: embed(text) -> list[float] (1024-dim vector)
  - [ ] Cache embeddings in SQLite (text_hash, vector_blob)
  - [ ] Handle API errors gracefully (raise ExternalServiceError)
  - [ ] Test: mock Nebius API, verify embedding format

  **QA Scenarios**:
  ```
  Scenario: Embedding returns 1024-dim vector
    Tool: pytest
    Steps: pytest backend/tests/test_embedding.py::test_embed_dimension -v
    Expected: PASS - vector length == 1024
    Evidence: .sisyphus/evidence/task-06-embed.txt

  Scenario: Cache prevents duplicate API calls
    Tool: pytest
    Steps: pytest backend/tests/test_embedding.py::test_cache -v
    Expected: PASS - second call uses cache
    Evidence: .sisyphus/evidence/task-06-cache.txt
  ```

  **Commit**: NO (part of Wave 2 commit)

---

- [x] 7. Summary Service (Gemini)

  **What to do**: Implement LLM summary client for Gemini flash-lite with caching.

  **Must NOT do**:
  - NO interactive Q&A (single summary only)
  - NO streaming responses
  - NO key exposure

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard API client
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 11 | Blocked By: 4

  **References**:
  - External: https://ai.google.dev/docs — Gemini API docs

  **Acceptance Criteria**:
  - [ ] `backend/app/services/summary.py` with SummaryService class
  - [ ] Method: summarize(title, abstract) -> str (2-3 sentence summary)
  - [ ] Cache summaries in SQLite (paper_id, summary, created_at)
  - [ ] Prompt optimized for academic paper summaries
  - [ ] Handle API errors gracefully
  - [ ] Test: mock Gemini API, verify summary format

  **QA Scenarios**:
  ```
  Scenario: Summary generated
    Tool: pytest
    Steps: pytest backend/tests/test_summary.py::test_summarize -v
    Expected: PASS - returns non-empty string
    Evidence: .sisyphus/evidence/task-07-summary.txt

  Scenario: Cache prevents duplicate API calls
    Tool: pytest
    Steps: pytest backend/tests/test_summary.py::test_cache -v
    Expected: PASS - second call uses cache
    Evidence: .sisyphus/evidence/task-07-cache.txt
  ```

  **Commit**: NO (part of Wave 2 commit)

---

- [x] 8. Paper Ingestion Pipeline

  **What to do**: Orchestrate paper ingestion: arXiv fetch → embedding generation → storage. Async background task.

  **Must NOT do**:
  - NO blocking the request thread
  - NO re-ingesting existing papers
  - NO batch processing >10 papers at once

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multi-service orchestration
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 9, 10 | Blocked By: 2, 5, 6

  **References**:
  - Pattern: `pile/src-tauri/src/lib.rs` — async pipeline pattern

  **Acceptance Criteria**:
  - [ ] `backend/app/services/ingestion.py` with ingest_papers function
  - [ ] Flow: arXiv search → filter new papers → embed → store in DB
  - [ ] Store in papers table + embeddings table
  - [ ] Background task via asyncio.create_task
  - [ ] Test: mock arxiv + embedding, verify DB insert

  **QA Scenarios**:
  ```
  Scenario: Papers ingested with embeddings
    Tool: pytest
    Steps: pytest backend/tests/test_ingestion.py::test_ingest -v
    Expected: PASS - papers and embeddings in DB
    Evidence: .sisyphus/evidence/task-08-ingest.txt

  Scenario: Duplicate papers skipped
    Tool: pytest
    Steps: pytest backend/tests/test_ingestion.py::test_dedupe -v
    Expected: PASS - existing papers not re-ingested
    Evidence: .sisyphus/evidence/task-08-dedupe.txt
  ```

  **Commit**: YES | Message: `feat(backend): core services - arxiv, embedding, summary, ingestion` | Files: backend/app/services/*.py, backend/tests/test_*.py

---

- [x] 9. Recommendation Engine (Content-Based)

  **What to do**: Implement content-based recommendation using cosine similarity on pre-computed embeddings.

  **Must NOT do**:
  - NO collaborative filtering (Phase 2)
  - NO LLM reranking
  - NO complex ranking (pure cosine similarity)

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core algorithm
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 12 | Blocked By: 2, 8

  **References**:
  - Pattern: `pile/src-tauri/src/search.rs:129-198` — hybrid search ranking
  - External: https://en.wikipedia.org/wiki/Cosine_similarity

  **Acceptance Criteria**:
  - [ ] `backend/app/services/recommendation.py` with RecommendationEngine class
  - [ ] Method: recommend(user_id=None, anonymous_id=None, categories=None, limit=10) -> list[Paper]
  - [ ] Build user profile: average embedding of read/saved papers
  - [ ] Query sqlite-vec for top-k similar papers
  - [ ] Filter by categories if specified
  - [ ] Exclude already-read papers
  - [ ] Fallback: recent popular papers if no history
  - [ ] Test: verify recommendations are semantically similar

  **QA Scenarios**:
  ```
  Scenario: Recommendations based on history
    Tool: pytest
    Steps: pytest backend/tests/test_recommendation.py::test_recommend_from_history -v
    Expected: PASS - returns papers similar to user's reading history
    Evidence: .sisyphus/evidence/task-09-rec.txt

  Scenario: Fallback for new users
    Tool: pytest
    Steps: pytest backend/tests/test_recommendation.py::test_fallback -v
    Expected: PASS - returns recent papers when no history
    Evidence: .sisyphus/evidence/task-09-fallback.txt
  ```

  **Commit**: NO (part of Wave 3 commit)

---

- [x] 10. Search Endpoint

  **What to do**: FastAPI endpoint for searching arXiv papers with caching.

  **Must NOT do**:
  - NO advanced search syntax
  - NO pagination beyond simple offset/limit
  - NO real-time arXiv calls (use cache, trigger background refresh)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard FastAPI endpoint
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 15 | Blocked By: 2, 5

  **References**:
  - External: https://fastapi.tiangolo.com/tutorial/response-model/

  **Acceptance Criteria**:
  - [ ] `GET /api/search?q={query}&categories={cat1,cat2}&limit=20`
  - [ ] Returns list of Paper with summary if cached
  - [ ] Trigger background ingestion for new results
  - [ ] OpenAPI schema documented
  - [ ] Test: verify response shape

  **QA Scenarios**:
  ```
  Scenario: Search returns papers
    Tool: pytest
    Steps: pytest backend/tests/test_api_search.py::test_search -v
    Expected: PASS - returns Paper list
    Evidence: .sisyphus/evidence/task-10-search.txt

  Scenario: Category filter works
    Tool: pytest
    Steps: pytest backend/tests/test_api_search.py::test_category_filter -v
    Expected: PASS - only papers in specified categories
    Evidence: .sisyphus/evidence/task-10-filter.txt
  ```

  **Commit**: NO (part of Wave 3 commit)

---

- [x] 11. Papers Endpoint

  **What to do**: FastAPI endpoints for paper detail and summary generation.

  **Must NOT do**:
  - NO PDF serving
  - NO synchronous summary generation (return cached or trigger async)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard CRUD
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 17 | Blocked By: 2, 7

  **References**:
  - External: https://fastapi.tiangolo.com/tutorial/path-params/

  **Acceptance Criteria**:
  - [ ] `GET /api/papers/{arxiv_id}` - paper detail with summary
  - [ ] `POST /api/papers/{arxiv_id}/summarize` - trigger async summary
  - [ ] Summary returned if cached, null otherwise
  - [ ] Test: verify response shape

  **QA Scenarios**:
  ```
  Scenario: Paper detail returns
    Tool: pytest
    Steps: pytest backend/tests/test_api_papers.py::test_detail -v
    Expected: PASS - returns Paper with all fields
    Evidence: .sisyphus/evidence/task-11-detail.txt

  Scenario: Summary triggered
    Tool: pytest
    Steps: pytest backend/tests/test_api_papers.py::test_summarize -v
    Expected: PASS - returns 202 Accepted, summary queued
    Evidence: .sisyphus/evidence/task-11-summarize.txt
  ```

  **Commit**: NO (part of Wave 3 commit)

---

- [x] 12. Reading List CRUD

  **What to do**: FastAPI endpoints for reading list management (save/unsave papers).

  **Must NOT do**:
  - NO folders/collections
  - NO sharing
  - NO notes

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard CRUD
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 19 | Blocked By: 2, 9

  **References**:
  - External: https://fastapi.tiangolo.com/tutorial/dependencies/

  **Acceptance Criteria**:
  - [ ] `GET /api/reading-list` - list saved papers
  - [ ] `POST /api/reading-list/{arxiv_id}` - save paper
  - [ ] `DELETE /api/reading-list/{arxiv_id}` - unsave paper
  - [ ] Works for both authenticated and anonymous users
  - [ ] Test: verify CRUD operations

  **QA Scenarios**:
  ```
  Scenario: Save and list papers
    Tool: pytest
    Steps: pytest backend/tests/test_api_reading_list.py::test_save_list -v
    Expected: PASS - paper saved, appears in list
    Evidence: .sisyphus/evidence/task-12-savelist.txt

  Scenario: Anonymous user reading list
    Tool: pytest
    Steps: pytest backend/tests/test_api_reading_list.py::test_anonymous -v
    Expected: PASS - works without auth via cookie
    Evidence: .sisyphus/evidence/task-12-anon.txt
  ```

  **Commit**: YES | Message: `feat(backend): recommendation engine and API endpoints` | Files: backend/app/services/recommendation.py, backend/app/api/*.py, backend/tests/test_*.py

---

- [x] 13. OAuth Setup (Google/GitHub)

  **What to do**: Implement OAuth authentication using authlib with Google and GitHub providers.

  **Must NOT do**:
  - NO custom auth implementation
  - NO password-based auth
  - NO email verification

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Security-critical
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 15, 16, 19 | Blocked By: 2

  **References**:
  - External: https://authlib.org/
  - External: https://docs.authlib.org/en/latest/client/fastapi.html

  **Acceptance Criteria**:
  - [ ] `GET /api/auth/{provider}` - redirect to OAuth provider
  - [ ] `GET /api/auth/{provider}/callback` - handle OAuth callback
  - [ ] `POST /api/auth/logout` - clear session
  - [ ] `GET /api/auth/me` - current user info
  - [ ] Session via JWT in httpOnly cookie
  - [ ] Test: mock OAuth provider, verify flow

  **QA Scenarios**:
  ```
  Scenario: OAuth redirect
    Tool: pytest
    Steps: pytest backend/tests/test_auth.py::test_oauth_redirect -v
    Expected: PASS - redirects to provider
    Evidence: .sisyphus/evidence/task-13-oauth.txt

  Scenario: Callback creates session
    Tool: pytest
    Steps: pytest backend/tests/test_auth.py::test_callback -v
    Expected: PASS - JWT cookie set, user created
    Evidence: .sisyphus/evidence/task-13-callback.txt
  ```

  **Commit**: NO (part of Wave 4 commit)

---

- [x] 14. Anonymous User Tracking

  **What to do**: Implement anonymous user identification via cookie UUID with automatic creation.

  **Must NOT do**:
  - NO fingerprinting
  - NO IP storage
  - NO cross-device tracking

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard cookie handling
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 15 | Blocked By: 2

  **References**:
  - External: https://fastapi.tiangolo.com/advanced/cookies/

  **Acceptance Criteria**:
  - [x] Middleware checks for `anonymous_id` cookie
  - [x] Creates new UUID if missing, sets cookie (1 year expiry)
  - [x] Stores session in anonymous_sessions table
  - [x] Updates last_seen_at on each request
  - [x] Test: verify cookie creation and tracking

  **QA Scenarios**:
  ```
  Scenario: Cookie created on first visit
    Tool: pytest
    Steps: pytest backend/tests/test_anonymous.py::test_cookie_creation -v
    Expected: PASS - Set-Cookie header present
    Evidence: .sisyphus/evidence/task-14-cookie.txt

  Scenario: Session tracked
    Tool: pytest
    Steps: pytest backend/tests/test_anonymous.py::test_tracking -v
    Expected: PASS - anonymous_sessions row created/updated
    Evidence: .sisyphus/evidence/task-14-track.txt
  ```

  **Commit**: NO (part of Wave 4 commit)

---

- [x] 15. Session Merge Logic

  **What to do**: Merge anonymous user's reading list when they log in.

  **Must NOT do**:
  - NO duplicate papers
  - NO data loss
  - NO prompting user (automatic merge)

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Data integrity critical
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: none | Blocked By: 13, 14

  **References**:
  - None (custom logic)

  **Acceptance Criteria**:
  - [ ] On OAuth callback, check for anonymous_id cookie
  - [ ] If exists, transfer reading_list entries to authenticated user
  - [ ] Clear anonymous_id cookie
  - [ ] Handle conflicts: keep both (union)
  - [ ] Test: verify merge preserves all data

  **QA Scenarios**:
  ```
  Scenario: Anonymous data merged on login
    Tool: pytest
    Steps: pytest backend/tests/test_merge.py::test_merge -v
    Expected: PASS - anonymous reading list now under user
    Evidence: .sisyphus/evidence/task-15-merge.txt

  Scenario: No duplicates after merge
    Tool: pytest
    Steps: pytest backend/tests/test_merge.py::test_no_dupes -v
    Expected: PASS - each paper appears once
    Evidence: .sisyphus/evidence/task-15-dupes.txt
  ```

  **Commit**: NO (part of Wave 4 commit)

---

- [x] 16. Protected Routes Middleware

  **What to do**: Middleware to protect routes requiring authentication.

  **Must NOT do**:
  - NO role-based access (V1 has no roles)
  - NO rate limiting (handled elsewhere)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard middleware
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: none | Blocked By: 13

  **References**:
  - External: https://fastapi.tiangolo.com/tutorial/middleware/

  **Acceptance Criteria**:
  - [ ] Dependency `get_current_user` returns User or raises 401
  - [ ] Dependency `get_optional_user` returns User or None
  - [ ] Dependency `get_anonymous_id` returns UUID from cookie
  - [ ] Test: verify 401 on protected route without auth

  **QA Scenarios**:
  ```
  Scenario: Protected route requires auth
    Tool: pytest
    Steps: pytest backend/tests/test_auth_middleware.py::test_protected -v
    Expected: PASS - 401 without token
    Evidence: .sisyphus/evidence/task-16-protected.txt

  Scenario: Optional user works
    Tool: pytest
    Steps: pytest backend/tests/test_auth_middleware.py::test_optional -v
    Expected: PASS - returns None or User
    Evidence: .sisyphus/evidence/task-16-optional.txt
  ```

  **Commit**: YES | Message: `feat(backend): OAuth authentication, anonymous tracking, session merge` | Files: backend/app/auth/*.py, backend/app/middleware/*.py, backend/tests/test_*.py

---

- [x] 17. Next.js Project Setup

  **What to do**: Initialize Next.js 14+ project with App Router, Tailwind, and base configuration.

  **Must NOT do**:
  - NO pages directory (App Router only)
  - NO Redux (use React Query + Zustand if needed)
  - NO custom server

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Frontend setup
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: 18-22 | Blocked By: 3 (needs FRONTEND_URL config)

  **References**:
  - External: https://nextjs.org/docs/getting-started/installation

  **Acceptance Criteria**:
  - [ ] `frontend/` directory with Next.js 14+ App Router
  - [ ] Tailwind CSS configured
  - [ ] `package.json` with next, react, react-dom, tailwind, @tanstack/react-query
  - [ ] `.env.local.example` with NEXT_PUBLIC_API_URL
  - [ ] API client module with fetch wrapper
  - [ ] `pnpm dev` runs successfully
  - [ ] Test: vitest configured

  **QA Scenarios**:
  ```
  Scenario: Dev server starts
    Tool: Bash
    Steps: cd frontend && timeout 10 pnpm dev || true
    Expected: Server starts on port 3000
    Evidence: .sisyphus/evidence/task-17-dev.txt

  Scenario: Tests run
    Tool: Bash
    Steps: cd frontend && pnpm test
    Expected: vitest runs (even with no tests)
    Evidence: .sisyphus/evidence/task-17-test.txt
  ```

  **Commit**: YES | Message: `chore(frontend): Next.js project setup with Tailwind` | Files: frontend/*

---

- [x] 18. Search UI

  **What to do**: Search page with keyword input, category filter, and results display.

  **Must NOT do**:
  - NO advanced search UI
  - NO infinite scroll (simple pagination)
  - NO search history

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI component
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 17

  **References**:
  - External: https://ui.shadcn.com/ — component patterns

  **Acceptance Criteria**:
  - [ ] `/search` route with search form
  - [ ] Keyword input with debounce (300ms)
  - [ ] Category multi-select (arXiv categories)
  - [ ] Results grid with paper cards (title, authors, abstract preview, categories)
  - [ ] Click navigates to paper detail
  - [ ] Loading and error states
  - [ ] Test: component renders, search works

  **QA Scenarios**:
  ```
  Scenario: Search page renders
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/search
      - expect input[placeholder*="Search"]
    Expected: Page loads with search form
    Evidence: .sisyphus/evidence/task-18-search-page.png

  Scenario: Search returns results
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/search
      - fill input with "machine learning"
      - wait for results
    Expected: Paper cards appear
    Evidence: .sisyphus/evidence/task-18-search-results.png
  ```

  **Commit**: NO (part of Wave 5 commit)

---

- [x] 19. Recommendation Feed UI

  **What to do**: Home page with personalized paper recommendations.

  **Must NOT do**:
  - NO "for you" vs "following" tabs (single feed)
  - NO refresh button (auto-refresh on mount)
  - NO "not interested" feedback (Phase 2)

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI component
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 17, 9

  **References**:
  - External: https://ui.shadcn.com/ — card patterns

  **Acceptance Criteria**:
  - [ ] `/` route shows recommendation feed
  - [ ] Paper cards with save button
  - [ ] "Based on your reading history" header if history exists
  - [ ] "Popular papers" header if no history
  - [ ] Loading skeleton while fetching
  - [ ] Test: component renders, recommendations load

  **QA Scenarios**:
  ```
  Scenario: Feed loads
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/
      - wait for feed to load
    Expected: Paper cards visible
    Evidence: .sisyphus/evidence/task-19-feed.png

  Scenario: Save paper
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/
      - click save button on first paper
    Expected: Button shows "Saved"
    Evidence: .sisyphus/evidence/task-19-save.png
  ```

  **Commit**: NO (part of Wave 5 commit)

---

- [x] 20. Paper Detail Page

  **What to do**: Paper detail page with full metadata, summary, and save action.

  **Must NOT do**:
  - NO PDF viewer (link to arXiv only)
  - NO related papers (Phase 2)
  - NO comments

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI component
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 17, 11

  **References**:
  - External: https://ui.shadcn.com/ — layout patterns

  **Acceptance Criteria**:
  - [ ] `/paper/[arxiv_id]` route
  - [ ] Full metadata: title, authors, abstract, categories, dates
  - [ ] Summary section (loading state if generating)
  - [ ] "Generate Summary" button if no summary
  - [ ] Save/unsave button
  - [ ] Link to arXiv PDF
  - [ ] Test: page renders with all sections

  **QA Scenarios**:
  ```
  Scenario: Paper detail loads
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/paper/2301.00001
    Expected: Title, abstract, authors visible
    Evidence: .sisyphus/evidence/task-20-detail.png

  Scenario: Summary generation
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/paper/2301.00001
      - click "Generate Summary"
    Expected: Loading state, then summary appears
    Evidence: .sisyphus/evidence/task-20-summary.png
  ```

  **Commit**: NO (part of Wave 5 commit)

---

- [x] 21. Auth UI

  **What to do**: Login buttons, profile dropdown, and logout functionality.

  **Must NOT do**:
  - NO email/password form
  - NO profile editing
  - NO account settings

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI component
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 17, 13

  **References**:
  - External: https://next-auth.js.org/ — auth UI patterns

  **Acceptance Criteria**:
  - [ ] "Sign in" button in header (anonymous)
  - [ ] OAuth provider buttons (Google, GitHub)
  - [ ] User avatar + dropdown when authenticated
  - [ ] Logout in dropdown
  - [ ] Redirect to auth flow on protected actions
  - [ ] Test: login flow works

  **QA Scenarios**:
  ```
  Scenario: Login button visible
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/
      - expect "Sign in" button
    Expected: Button present
    Evidence: .sisyphus/evidence/task-21-login-btn.png

  Scenario: OAuth redirect
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/
      - click "Sign in"
      - click "Google"
    Expected: Redirects to Google OAuth
    Evidence: .sisyphus/evidence/task-21-oauth.png
  ```

  **Commit**: NO (part of Wave 5 commit)

---

- [x] 22. Reading List UI

  **What to do**: Reading list page showing saved papers.

  **Must NOT do**:
  - NO folders
  - NO sorting (chronological only)
  - NO bulk actions

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI component
  - Skills: [`frontend-ui-ux`]
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 17, 12

  **References**:
  - External: https://ui.shadcn.com/ — list patterns

  **Acceptance Criteria**:
  - [ ] `/reading-list` route
  - [ ] List of saved paper cards
  - [ ] Unsave button on each card
  - [ ] Empty state with CTA to browse
  - [ ] Works for anonymous users (persisted in cookie)
  - [ ] Test: list renders, unsave works

  **QA Scenarios**:
  ```
  Scenario: Reading list shows saved papers
    Tool: Playwright
    Steps:
      - goto http://localhost:3000/
      - save a paper
      - goto http://localhost:3000/reading-list
    Expected: Saved paper visible
    Evidence: .sisyphus/evidence/task-22-list.png

  Scenario: Empty state
    Tool: Playwright
    Steps:
      - clear cookies
      - goto http://localhost:3000/reading-list
    Expected: "No saved papers" message
    Evidence: .sisyphus/evidence/task-22-empty.png
  ```

  **Commit**: YES | Message: `feat(frontend): search, feed, paper detail, auth, and reading list UI` | Files: frontend/src/**/*, frontend/tests/**/*

---

- [x] 23. Docker Compose Deployment

  **What to do**: Create Docker Compose configuration for production deployment.

  **Must NOT do**:
  - NO Kubernetes
  - NO complex orchestration
  - NO development Dockerfiles (production only)

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard Docker setup
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: none | Blocked By: 22

  **References**:
  - External: https://docs.docker.com/compose/

  **Acceptance Criteria**:
  - [ ] `docker-compose.yml` with backend, frontend, services
  - [ ] `Dockerfile.backend` for FastAPI
  - [ ] `Dockerfile.frontend` for Next.js standalone
  - [ ] Volume for SQLite database persistence
  - [ ] Environment variable injection
  - [ ] Health checks for both services
  - [ ] Test: `docker compose up --build` succeeds

  **QA Scenarios**:
  ```
  Scenario: Docker compose builds
    Tool: Bash
    Steps: docker compose build
    Expected: All images build successfully
    Evidence: .sisyphus/evidence/task-23-build.txt

  Scenario: Docker compose runs
    Tool: Bash
    Steps: 
      - docker compose up -d
      - sleep 10
      - curl http://localhost:8000/health
      - curl http://localhost:3000
    Expected: Both services respond
    Evidence: .sisyphus/evidence/task-23-run.txt
  ```

  **Commit**: YES | Message: `chore: Docker Compose deployment configuration` | Files: docker-compose.yml, Dockerfile.*, .dockerignore

---

- [x] 24. E2E Tests (Playwright)

  **What to do**: End-to-end tests for critical user flows.

  **Must NOT do**:
  - NO 100% coverage (critical paths only)
  - NO visual regression tests
  - NO performance tests

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Integration testing
  - Skills: []
  - Omitted: [`git-master`]

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: none | Blocked By: 22, 23

  **References**:
  - External: https://playwright.dev/docs/intro

  **Acceptance Criteria**:
  - [ ] Playwright configured in frontend
  - [ ] Test: Anonymous user searches and saves paper
  - [ ] Test: User logs in, sees merged reading list
  - [ ] Test: User gets recommendations based on history
  - [ ] Test: Summary generation works
  - [ ] All tests pass: `pnpm e2e`

  **QA Scenarios**:
  ```
  Scenario: Full user flow
    Tool: Playwright
    Steps: pnpm e2e
    Expected: All 5 E2E tests pass
    Evidence: .sisyphus/evidence/task-24-e2e.txt
  ```

  **Commit**: YES | Message: `test: E2E tests for critical user flows` | Files: frontend/e2e/**/*, frontend/playwright.config.ts

---

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Wave commits: Group related tasks per wave
- Each commit: Passes all existing tests
- Conventional commits: `feat(backend):`, `feat(frontend):`, `chore:`, `test:`, `fix:`

## Success Criteria
1. All backend tests pass: `cd backend && pytest --cov`
2. All frontend tests pass: `cd frontend && pnpm test`
3. E2E tests pass: `cd frontend && pnpm e2e`
4. Docker Compose builds and runs: `docker compose up --build`
5. Search returns arXiv papers (with caching)
6. Recommendations appear based on reading history
7. OAuth login works (Google or GitHub)
8. Anonymous users get cookie-tracked reading list
9. Paper summaries generate via Gemini
10. Reading list persists across sessions
