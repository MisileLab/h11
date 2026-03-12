# Task 1 Scope-Creep Correction

## Issue: First attempt included generated artifacts

**What was removed:**
- `.venv/` directory (large virtual environment, should be local-only, not committed)
- `.pytest_cache/` directory (test runtime cache, not part of scaffold)
- `.coverage` file (code coverage artifact, not part of scaffold)
- `pytest.ini` (unnecessary; pytest discovers tests/test_*.py by default)
- Redundant `[tool.pdm.dev-dependencies]` in pyproject.toml (duplicated [project.optional-dependencies])

**Why:**
Task 1 scope is "minimal FastAPI app imports successfully and exposes health route + tests pass". Generated artifacts and build files should not be committed to version control. Virtual environments are developer-local, not part of the project scaffold.

**Resolution:**
- Kept only: pyproject.toml (minimal, no duplication), .env.example, .gitignore, app/, tests/
- All core functionality preserved: app structure, dependencies, health endpoint, 3 passing tests
- Tests can still pass without pytest.ini (pytest autodetects via testpaths convention or default patterns)

# Task 2-3 Scope Fidelity Cleanup

**Issue:** Unrelated IDE configuration file `commandpreview/.idea/runConfigurations/Minecraft_Server.xml` was modified (classpath reordering) during parallel delegation.

**Resolution:** Restored to pre-task state via `git checkout HEAD`. No project scope impact; only scope-creep drift reverted.

# Task 9: sqlite-vec `rowid` vs `id` Column Bug

**Issue**: Recommendation engine query used `SELECT rowid, distance FROM embeddings` causing `sqlite3.OperationalError: no such column: rowid`

**Root Cause**: The Pile Rust reference code (`pile/src-tauri/src/search.rs`) used `rowid` for sqlite-vec queries. However, Python sqlite-vec `vec0` virtual tables expose the primary key as `id`, not `rowid`.

**Impact**: All 7 history-based recommendation tests failed; fallback tests passed (they don't query embeddings table)

**Resolution**: Changed to `SELECT id, distance FROM embeddings WHERE embedding MATCH ? ORDER BY distance LIMIT ?`

**Prevention**: sqlite-vec column names differ between Rust and Python bindings. Always verify column names against the actual schema declaration (`vec0(id INTEGER PRIMARY KEY, embedding float[1024])`).

# Task 9: `_row_to_paper` type annotation mismatch (LSP diagnostic)

**Issue**: `_row_to_paper(row: tuple)` caused two LSP errors at lines 330 and 365 — `Expected tuple[Unknown, ...], found Row`.

**Root Cause**: `aiosqlite.Cursor.fetchall()` is typed as returning `Iterable[sqlite3.Row]`, not `list[tuple]`. The `tuple` annotation was semantically wrong.

**Impact**: Zero runtime impact (sqlite3.Row supports index access like tuples), but blocked Phase 2 zero-diagnostics requirement.

**Resolution**: Changed parameter type from `tuple` to `sqlite3.Row`, added `import sqlite3`. No behavior change.


---

# Task 24: E2E Test Route Glob Bug

## Issue: `page.route('papers/*')` didn't match `/papers/{id}/summarize`

**Root cause:** Playwright's glob matching treats `*` as single-segment (no `/`). The `/api/papers/{id}/summarize` path has two segments after `papers/`, so `papers/*` never intercepted the POST to `/summarize`.

**Fix:** Changed all `page.route(\`${API}/api/papers/*\`)` to `page.route(\`${API}/api/papers/**\`)` across `helpers.ts`, `summary.spec.ts`, and `recommendations.spec.ts`.

**Also fixed:**
- Port conflict: changed webServer from port 3000 → 3099
- Added `/test-results/` and `/playwright-report/` to `.gitignore`
- Cleaned up stale test-results artifacts
