# Wave 1, Task 1: Backend Project Scaffolding - Decisions

## Decision: Modern Python Build System
**Choice**: `pdm-backend` in pyproject.toml (instead of setuptools)
**Rationale**: Declarative, standards-based, aligns with Python 3.11+ ecosystem; no setup.py needed
**Trade-off**: Requires understanding of PEP 517/518, but cleaner long-term

## Decision: Single Health Endpoint Only
**Choice**: Minimal `/health` route with {"status": "ok"}
**Rationale**: Scaffold needed to be testable; health check is non-business logic and won't interfere with Wave 1 commit
**Trade-off**: No service integration endpoints yet (added in Waves 2-4)

## Decision: Test Suite Structure
**Choice**: `tests/` as peer to `app/`, pytest.ini for centralized config
**Rationale**: Standard Python convention; isolated test discovery; pytest-asyncio auto mode simplifies async testing
**Trade-off**: No pytest plugins for now (keeps dependencies minimal)

## Decision: Environment Variable Documentation
**Choice**: `.env.example` documents ALL vars from plan (even if not used yet)
**Rationale**: Reduces friction in Wave 2-4; developer knows full scope of configuration upfront
**Trade-off**: Some vars unused initially, but intentional per plan requirement

## Decision: No ORM/Migration System
**Choice**: Raw SQL via aiosqlite, schema.sql for all schema
**Rationale**: Aligns with plan guardrails ("NO repository pattern"); simpler for vector DB integration (sqlite-vec)
**Trade-off**: More manual SQL, but explicit control over queries and performance

## Decision: Virtual Environment Included
**Choice**: Created `.venv/` locally, excluded in `.gitignore`
**Rationale**: Development convenience; prevents global Python pollution
**Trade-off**: Each developer runs `source .venv/bin/activate`; could use direnv or nix in future

## Decision: Switch from pdm-backend to hatchling for uv compatibility

**Choice**: Use hatchling as build backend instead of pdm-backend
**Rationale**: uv is the standard Python package manager for this project; hatchling is simpler and widely compatible
**Trade-off**: Lost pdm-specific metadata, but gained compatibility with uv and broader tooling

## Decision: Remove nonessential dev dependencies from Task 1

**Choice**: Keep only pytest in dev dependencies; remove pytest-asyncio, pytest-cov, python-dotenv
**Rationale**: 
- Task 1 scope is minimal scaffold; extra test/dev tools belong in later tasks when needed
- python-dotenv not used in Task 1 (config management is Task 3)
- pytest-asyncio not needed for sync tests in test_main.py
- pytest-cov is optional; coverage can be added later if desired
**Trade-off**: Developers must install these separately if needed, but scaffold stays minimal

## Decision: Remove unused pytest import from test_main.py

**Choice**: Delete `import pytest` line (tests don't use pytest fixtures or marks)
**Rationale**: Unused imports violate linting; all 3 tests use plain assertions
**Trade-off**: None; tests remain fully functional

## Final Correction After QA

**Choice**: Use `uv`-compatible project metadata with `hatchling`, and do not create a project-local virtualenv during Task 1
**Rationale**: The user explicitly requested `uv` instead of `pdm`, and Task 1 must avoid generated artifacts and unnecessary tooling
**Trade-off**: Early verification uses `uv run` commands instead of a checked-in or project-local environment

# Wave 1, Task 3: Configuration + Environment Management - Decisions

## Decision: Deferred Settings Instantiation

**Choice**: Use factory function `get_settings()` instead of global `settings = Settings()` at module level
**Rationale**: 
- Avoids import-time validation errors that would break test isolation
- Allows tests to set environment variables freely without affecting subsequent test runs
- Follows FastAPI dependency injection pattern: `Depends(get_settings)`
**Trade-off**: Slightly more verbose in app startup, but dramatically cleaner test code

## Decision: Required vs Optional Fields for OAuth

**Choice**: Make all OAuth provider credentials optional (`str | None = None`)
**Rationale**: 
- App must support anonymous mode (per plan: "app works without OAuth")
- Optional fields gracefully default to None, enabling conditional auth initialization in later tasks
- One Settings class covers all deployment scenarios (dev, anon-only, full OAuth)
**Trade-off**: Downstream code must always check `if settings.google_client_id:` before use

## Decision: Single Settings Class (No Env Prefix)

**Choice**: One `Settings` class with `SettingsConfigDict(extra="ignore")`
**Rationale**: 
- Simple 1:1 field-to-env mapping (snake_case ↔ UPPER_CASE)
- No env prefix needed (all configs are app-global anyway)
- Cleaner than multiple classes or prefix-based field grouping
**Trade-off**: Less explicit namespacing if project later grows to multiple subsystems

## Decision: Field Documentation via Docstrings

**Choice**: Use Python docstrings for field descriptions in Settings class
**Rationale**: 
- Docstrings integrate with IDE/editor tooltips and `help()` introspection
- Pydantic automatically includes them in generated OpenAPI schema
- More readable than inline `Field(description="...")` for simple fields
**Trade-off**: Docstrings are in code comments, not in field metadata; less queryable programmatically

## Decision: Validation Focus on Type + Presence

**Choice**: Rely on Pydantic's automatic type coercion and presence validation; no custom validators
**Rationale**: 
- Type validators (e.g., `float` from string) are built-in and well-tested in Pydantic
- Required fields fail immediately with clear error messages
- Avoids custom validation logic that could diverge from other fields
**Trade-off**: Custom URL validation or format checking deferred to usage sites (e.g., Database connection in Task 2)

## Decision: Comprehensive Test Coverage for Config Module

**Choice**: 7 test functions covering all validation scenarios:
1. `test_valid_config_loads` — Load with all required vars set
2. `test_missing_required_var_raises_error` — ValidationError when required var missing
3. `test_optional_oauth_fields_can_be_absent` — OAuth fields default to None
4. `test_optional_oauth_fields_can_be_present` — OAuth fields work when provided
5. `test_arxiv_rate_limit_must_be_float` — Type validation for float field
6. `test_config_field_names_map_to_env_vars` — Runtime field metadata verification
7. `test_field_annotation_for_arxiv_rate_limit` — Field annotation is exactly `float`

**Rationale**: 
- Tests cover required/optional distinction, type coercion, and validation error paths
- All tests use environment variable cleanup to prevent pollution
- Tests validate both positive (loads) and negative (fails) paths
**Trade-off**: 7 tests for a single config module is slightly over-engineered, but guarantees downstream auth/db tasks can rely on config stability

## Implementation Complete

**Files Created**:
- `app/config.py` (63 lines): Settings class with required and optional fields
- `tests/test_config.py` (207 lines): 7 comprehensive test scenarios

**All Acceptance Criteria Met**:
- ✓ Settings class validates required app secrets
- ✓ OAuth provider secrets optional for anonymous mode
- ✓ Field names map cleanly to env vars (.env.example)
- ✓ Deferred instantiation via `get_settings()` factory
- ✓ All tests pass (config + existing main tests)
- ✓ Verification commands from plan all succeed

**Next Steps**: Task 3 ready for Wave 1 commit with Tasks 2 and 4 (DB schema + HTTP client)

# Wave 1, Task 2: Database Schema + sqlite-vec Setup - Decisions

## Decision: sqlite-vec as Virtual Table for Embeddings
**Choice**: Use sqlite-vec's `vec0(embedding float[1024])` virtual table for vector storage
**Rationale**: 
- Avoids separate vector DB (DuckDB, Weaviate, etc.); one SQLite database for all data
- sqlite-vec optimized for similarity search with fast indexing
- 1024 dimensions align with Qwen3-Embedding-8b model (planned for later tasks)
**Trade-off**: Virtual table behavior differs from regular tables (no direct BLOB access), but performance is good for <1000 concurrent users

## Decision: sync sqlite3 for Init, aiosqlite for Runtime
**Choice**: Use blocking `sqlite3.Connection` in `init_db()`, defer to `aiosqlite` for query paths
**Rationale**: 
- Init is one-time operation; blocking is acceptable
- Avoids complexity of async DB pool during startup
- Later tasks (Wave 2+) will implement async query layer
**Trade-off**: Init code is synchronous but explicit; query path will be async

## Decision: Integer Unix Timestamps (Not ISO Strings)
**Choice**: Store `published_at`, `updated_at`, `created_at`, `saved_at` as INTEGER (unixepoch())
**Rationale**: 
- Efficient storage and JSON serialization (single int vs. string)
- Direct sortability in SQL without conversion
- Aligns with Pile (Tauri) and Lapis patterns in this monorepo
**Trade-off**: Requires conversion to ISO string for API responses (trivial in FastAPI)

## Decision: Reading List Dual Foreign Keys (user_id OR anonymous_id)
**Choice**: Both `user_id` and `anonymous_id` nullable with unique constraints on both
**Rationale**: 
- Supports anonymous users (cookie-based) and OAuth users
- Session merge logic (Task 15): transfer anonymous entries to user_id when OAuth happens
- Prevents orphaned reading_list entries
**Trade-off**: Database constraint allows either, not both, but logic enforces business rule in application

## Decision: Schema as SQL File, Not Migration System
**Choice**: Single `schema.sql` executed during init, no Alembic/Flyway
**Rationale**: 
- Plan explicitly forbids migrations ("NO migration system")
- V1 has stable schema; breaking changes would be rare
- Simpler for testing (fresh `:memory:` DB per test)
**Trade-off**: Breaking schema changes require manual data migration scripts (acceptable for V1)

## Decision: Extension Loading Security
**Choice**: Enable extensions only during load, then immediately disable
**Rationale**: 
- sqlite3 default is to disallow extension loading (security)
- Only one load per process needed
- Disable prevents accidental or malicious extension loading later
**Trade-off**: Must call `conn.enable_load_extension(False)` to clean up (minor)

## Decision: pyproject.toml Dependency on sqlite-vec
**Choice**: Add `sqlite-vec>=0.1.0` to project dependencies (not just dev)
**Rationale**: 
- Runtime requirement for app to function; not dev-only
- Later tasks (Wave 2 ingestion) will call embedding queries
**Trade-off**: Adds one native dependency; must ensure platform compatibility (pre-built wheels for macOS/Linux)

## Decision: pytest-asyncio for Test Suite
**Choice**: Add `pytest-asyncio>=0.21.0` to dev dependencies
**Rationale**: 
- All DB tests are async (`async def test_*` with `@pytest.mark.asyncio`)
- Manages event loop lifecycle per test
**Trade-off**: None; standard pattern for Python async testing


# Wave 1, Task 4: HTTP Client Base with Retry - Decisions

## Decision: Custom Error Class over Standard httpx Exceptions
**Choice**: Create `ExternalServiceError` exception instead of propagating `httpx` errors directly
**Rationale**: 
- Callers need to distinguish which external service failed (arXiv vs Nebius vs Gemini)
- Status code should be directly accessible as exception property, not buried in response object
- Single, consistent error type reduces branching in error handlers
**Trade-off**: Slight wrapping overhead, but cleaner API for future service clients

## Decision: Explicit Backoff Array over Decorator Library
**Choice**: Hardcode backoff delays `[1.0, 2.0, 4.0]` in retry loop instead of using `tenacity` or `backoff` library
**Rationale**: 
- Requirements explicitly state "explicit backoff... capped at 1s -> 2s -> 4s"
- No third-party retry dependency keeps API footprint minimal
- Clear visibility of retry strategy in code (no magic decorators)
- Future service clients can reuse this pattern (generic wrapper)
**Trade-off**: No advanced features (jitter, exponential backoff variants), but they're not needed for V1

## Decision: Retryable vs Non-Retryable Status Codes
**Choice**: Retry 429, 5xx; fail immediately on 4xx (except 429)
**Rationale**: 
- 429: Rate limit is transient; retry gives service time to recover
- 5xx: Server errors are transient; retry is appropriate
- 4xx: Client errors (400, 401, 403, 404) indicate request problem; retry won't help
**Trade-off**: Assumes service won't issue false 5xx codes; trust external service's HTTP semantics

## Decision: Connection/Timeout Errors Treated as Retryable
**Choice**: Catch `httpx.NetworkError` and `httpx.TimeoutException` and retry
**Rationale**: 
- Network hiccups and timeouts are transient (DNS timeout, connection refused, proxy issue)
- Retry gives network time to stabilize without degrading user experience
- Backoff delays increase likelihood of recovery
**Trade-off**: Rare case where timeout is due to client bug will retry unnecessarily (acceptable cost)

## Decision: Concurrency Limiting via asyncio.Semaphore
**Choice**: Use `asyncio.Semaphore` for concurrency control instead of connection pooling
**Rationale**: 
- Simple per-request semaphore acquisition; no complex pool state
- Config parameter `max_concurrent` clear and testable
- Aligns with typical async HTTP client patterns (prevents thundering herd)
**Trade-off**: Per-semaphore, not per-connection (doesn't limit httpx internal pool), but sufficient for V1

## Decision: Default User-Agent Header
**Choice**: Set `User-Agent: arXgorithm/1.0` by default on all requests
**Rationale**: 
- External services often reject requests without User-Agent (RFC compliance)
- Allows service to identify requests as coming from arXgorithm
- Can be overridden per-request if needed
**Trade-off**: Hardcoded version; would need refactor if version changes frequently

## Decision: Generic API (No Service-Specific Code)
**Choice**: Single `HTTPClient` class with generic `get()` and `post()` methods; no arXiv/Nebius/Gemini-specific logic
**Rationale**: 
- Reusable wrapper for future service clients (arXiv, Nebius, Gemini)
- Service name passed as parameter for error context, not hardcoded
- Clean separation: this module is transport; service logic belongs in service clients
**Trade-off**: Requires wrapper layer in each service client (minimal overhead)

## Decision: Test Coverage Strategy
**Choice**: 13 tests covering retry behavior, error wrapping, concurrency setup, headers, and timeout/network recovery
**Rationale**: 
- Retry on 429, 5xx: 2 dedicated tests
- No retry on 4xx: 1 dedicated test
- Custom error wrapping: 1 dedicated test
- Concurrency limiting: 1 dedicated test
- Header handling: 1 dedicated test
- POST requests: 1 dedicated test
- Timeout/network recovery: 2 dedicated tests
- Properties/fixtures: remaining tests
**Trade-off**: 13 tests may seem thorough, but each is focused on one behavior; easier to diagnose failures

## Decision: Mock Strategy for Async Tests
**Choice**: Use `unittest.mock.patch()` with `AsyncMock` and `MagicMock(spec=httpx.Response)`
**Rationale**: 
- Standard Python mocking library (no extra dependencies)
- `spec=` prevents typos (e.g., `.status` instead of `.status_code`)
- `AsyncMock` properly awaits async methods
**Trade-off**: Manual context manager setup in each test, but clear and explicit

## Implementation Complete

**Files Created**:
- `app/http_client.py` (198 lines): Generic async HTTP wrapper with retry logic
- `tests/test_http_client.py` (351 lines): 13 comprehensive test scenarios

**All Acceptance Criteria Met**:
- ✓ Generic async wrapper for external service calls
- ✓ Custom `ExternalServiceError` exception wrapping
- ✓ Default `User-Agent: arXgorithm/1.0` header
- ✓ Explicit retry on 429, 5xx, connection/timeout errors
- ✓ Non-retryable 4xx errors fail immediately
- ✓ Configurable concurrency limiting with `asyncio.Semaphore`
- ✓ Tests pass: retry-on-429, custom error wrapping, concurrency limiting, header assertion
- ✓ All 13 tests pass with `uv run` verification command

**Wave 1 Tasks 1-4 Complete**: Scaffold, Config, Database, HTTP Client all ready for commit.

# Wave 2, Task 6: Embedding Service (Nebius) - Decisions

## Decision: _ensure_cache_table() Creates Table On-Demand

**Choice**: Implement helper method that creates embedding_cache table if missing, called before each cache operation

**Rationale**:
- Avoids schema.sql duplication (table already defined there)
- On-demand creation provides safety: if table doesn't exist, it gets created
- Idempotent: `CREATE TABLE IF NOT EXISTS` is safe to call multiple times

**Trade-off**: Slight overhead per cache operation (CREATE TABLE always checked), but negligible for V1 scale

## Decision: 1024-Dimension Vector Standardization

**Choice**: Enforce 1024-dimensional embeddings across service, schema, and tests (matching Qwen3-Embedding-8B official spec)

**Rationale**:
- Plan explicitly declares 1024 as source of truth
- Schema.sql already uses `float[1024]` in sqlite-vec virtual table
- Validation on API response dimension prevents silent truncation/padding bugs

**Trade-off**: Breaks compatibility if Nebius returns different dimension in future (would require schema migration)

## Decision: Async-Only Cache Layer

**Choice**: All cache operations are async (aiosqlite), no sync fallback

**Rationale**:
- embed() is async; syncing with sync DB layer would block event loop
- aiosqlite provides proper async/await semantics
- Task 5 (arXiv) uses sync library; Task 6 explicitly requires async

**Trade-off**: Cannot reuse sync sqlite3 patterns from db.py init_db(); each service implements its own cache pattern

## Decision: Broad Exception Handling in Cache Operations

**Choice**: Catch `(sqlite3.Error, Exception)` to prevent cache failures from breaking embed()

**Rationale**:
- Cache is non-critical; embedding API result is what matters
- Database locks, filesystem errors, etc. should not block embedding generation
- Fail-open: if cache write fails, next embed() call will regenerate from API

**Trade-off**: Silent failures make debugging harder (could add logging in future)

## Decision: Floating-Point Tolerance in Tests

**Choice**: Use 1e-6 tolerance for float comparisons in cache round-trip tests

**Rationale**:
- struct.pack/unpack loses precision inherently (4-byte float encoding)
- Tests focus on functional correctness (cache hit/miss behavior), not exact precision
- 1e-6 tolerance acceptable for embedding vectors (downstream cosine similarity calculations won't notice)

**Trade-off**: Tests don't verify exact round-trip fidelity; precision loss could accumulate over many encode/decode cycles (unlikely in practice)

## Implementation Complete

**Files Modified**:
- `app/services/embedding.py` (236 lines): Fixed _ensure_cache_table(), updated to 1024 dimensions
- `tests/test_embedding.py` (259 lines): Updated all tests to 1024 dimensions, fixed floating-point comparisons
- `pyproject.toml`: Added `aiosqlite>=0.19.0` dependency

**All Acceptance Criteria Met**:
- ✓ EmbeddingService.embed(text) → list[float] works asynchronously
- ✓ SQLite cache with text_hash key, binary BLOB vector storage
- ✓ Cache prevents duplicate API calls (verified by call_count assertions)
- ✓ Errors wrapped in ExternalServiceError with Nebius context
- ✓ Implementation matches schema.sql 1024-dim vector spec
- ✓ All 11 embedding tests pass; full backend test suite: 93/93 pass
- ✓ aiosqlite dependency added for async DB support

**Defects Resolved**:
1. Missing _ensure_cache_table() → Implemented complete method
2. Dimension mismatch (768 vs 1024) → Standardized to 1024
3. Missing aiosqlite dependency → Added to pyproject.toml

**Ready for Wave 2 Commit**: Embedding service is fully functional, tested, and consistent with schema and plan.

# Wave 3, Task 9: Content-Based Recommendation Engine - Decisions

## Decision: L2-Normalized Average Profile for User Embeddings
**Choice**: Average all read-paper embeddings, then L2-normalize the result
**Rationale**:
- Averaging captures user's combined interests across multiple read papers
- L2 normalization ensures sqlite-vec L2 distance ordering equals cosine distance ordering
- Simple, deterministic, no tuning parameters needed
**Trade-off**: Equal weight to all read papers regardless of recency or interaction depth; acceptable for V1

## Decision: Post-Retrieval Filtering (Not SQL-Level)
**Choice**: Over-fetch from sqlite-vec, then filter by exclusion set and categories in Python
**Rationale**:
- sqlite-vec MATCH queries cannot combine with WHERE clauses on joined tables
- Over-fetch with multiplier (3x + exclusion count) ensures enough candidates survive filtering
- Category filtering requires JSON parsing (json_each), easier to handle in application code
**Trade-off**: Wastes some sqlite-vec query budget; acceptable at V1 scale

## Decision: Fallback to Recent Papers (No Random/Popular)
**Choice**: Fall back to `ORDER BY published_at DESC` when no reading history exists
**Rationale**:
- Deterministic and simple; no need for popularity tracking (no analytics tables)
- Recency is a reasonable cold-start heuristic for academic papers
- Aligns with constraint: "Do NOT invent new tables or analytics data"
**Trade-off**: No diversity or popularity signal; all cold-start users see the same recent papers

## Decision: Separate `_open_db()` Context Manager (Not Shared)
**Choice**: RecommendationEngine has its own `_open_db()` identical to ingestion.py's
**Rationale**:
- Each module manages its own DB connections independently
- No shared connection pool or singleton pattern (consistent with existing codebase)
- sqlite-vec extension must be loaded per-connection
**Trade-off**: Code duplication of ~10 lines across modules; could extract to shared utility later

## Decision: Module-Level `recommend()` Convenience Function
**Choice**: Expose `recommend(db_path, ...)` that internally instantiates `RecommendationEngine`
**Rationale**:
- Follows same pattern as `ingest_papers()` in ingestion.py
- Callers don't need to manage engine lifecycle for one-shot recommendations
- Class still available for cases needing repeated calls with same config
**Trade-off**: Creates new engine per call; negligible overhead (no state to preserve)

## Implementation Complete

**Files Created**:
- `app/services/recommendation.py` (~420 lines): Full recommendation engine
- `tests/test_recommendation.py` (~500 lines): 17 comprehensive tests

**Files Modified**:
- `app/services/__init__.py`: Added RecommendationEngine and recommend exports

**All Acceptance Criteria Met**:
- ✓ RecommendationEngine.recommend(user_id, anonymous_id, categories, limit) → list[Paper]
- ✓ User profile built from average embedding of reading_list papers
- ✓ sqlite-vec nearest-neighbor query with L2-normalized vectors
- ✓ Already-read papers excluded from results
- ✓ Category filtering via post-retrieval JSON category matching
- ✓ Fallback to recent papers when no history exists
- ✓ Anonymous user support via anonymous_id parameter
- ✓ All 17 tests pass; full suite 130/130 pass, zero regressions

