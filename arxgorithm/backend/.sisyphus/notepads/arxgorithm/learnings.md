# Task 10 Search Endpoint - Schema Fix Learnings

## Issue Fixed
**Root Cause**: The `_get_cached_papers()` function in `app/api/search.py` was selecting `p.pdf_url` from the papers table (lines 122, 143), but the real database schema does NOT have a `pdf_url` column.

**Original Schema Error**: 
- Papers table columns: `id, arxiv_id, title, abstract, authors (JSON), categories (JSON), published_at, updated_at, created_at`
- Query was attempting to select: `p.arxiv_id, p.title, p.abstract, p.authors, p.categories, p.published_at, p.updated_at, p.pdf_url, s.summary` (9 columns)
- Error silently caught by `except sqlite3.Error` handler, returning empty list `[]`

**Impact**: Search endpoint appeared to work but always returned empty results for valid cached papers.

## Solution Applied

### Code Changes (app/api/search.py)
1. **Removed `p.pdf_url` from both SQL SELECT statements** (lines 113-123 and 135-143)
   - Now selecting 8 columns instead of 9: `arxiv_id, title, abstract, authors, categories, published_at, updated_at, summary`
   
2. **Updated row unpacking** (lines 155-165)
   - Changed from 9-tuple to 8-tuple (removed pdf_url variable)
   - Row now: `(arxiv_id, title, abstract, authors_json, categories_json, published_at, updated_at, summary)`

3. **Added pdf_url derivation in Python** (line 178)
   - Pattern: `pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"`
   - Consistent with Task 11's implementation

### Test Fixture Updates (tests/test_api_search.py)
Updated 6 test fixtures to provide 8-element tuples instead of 9:
- Line 31-42: `mock_db_cursor` fixture
- Line 91-102: `test_search_returns_cached_papers_without_summary`
- Line 152-163: `test_search_category_filter`
- Line 187-200: `test_search_limit_parameter` (list comprehension)
- Line 256-267: `test_search_background_refresh_triggered`
- Line 291-302: `test_search_response_shape`

## Verification Results

✅ **All 12 tests passing** (uv run pytest tests/test_api_search.py -q)
```
test_search_cache_first_with_summary PASSED
test_search_returns_cached_papers_without_summary PASSED
test_search_empty_cache PASSED
test_search_category_filter PASSED
test_search_limit_parameter PASSED
test_search_query_required PASSED
test_search_query_min_length PASSED
test_search_limit_max_boundary PASSED
test_search_limit_min_boundary PASSED
test_search_background_refresh_triggered PASSED
test_search_response_shape PASSED
test_search_openapi_schema_documented PASSED

12 passed in 0.19s
```

✅ **No LSP errors** on modified code

✅ **Cache-only search semantics preserved**:
- Searches return papers from local SQLite cache
- Summaries included if cached, NULL otherwise
- Background refresh triggered non-blocking
- No real-time arXiv API calls in request path

## Key Learnings

1. **Schema mismatches must expose errors, not silent failures**: The original exception handler swallowed the sqlite3.Error, masking the bug as "no results found" instead of exposing the schema problem.

2. **pdf_url derivation is consistent pattern**: Task 11 already established that `pdf_url` should be computed from `arxiv_id` in Python using the standard arXiv URL format, not stored/selected from database.

3. **Test fixtures must match code contract**: When row unpacking changes from 9 to 8 elements, all mock fixtures must be updated atomically to maintain test validity.

4. **Cached summary handling works correctly**: The LEFT JOIN with `summary_cache` ensures papers without cached summaries return NULL for the summary field, which the response model handles properly.

## Files Modified
- `app/api/search.py`: Removed `p.pdf_url` from SELECT, added pdf_url derivation, updated row unpacking
- `tests/test_api_search.py`: Updated all 6 test fixtures from 9-tuple to 8-tuple

## Scope Notes
- **Task 10 scope maintained**: Only search.py cache query path fixed
- **No changes to Task 11 or 12**: Real-time search and summary generation remain untouched
- **No plan files modified**: Repair was narrowly scoped to schema fix only
