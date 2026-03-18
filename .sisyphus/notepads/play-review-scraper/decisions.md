## Task 1 Decisions

### Minimal CSS Approach
- Decision: Excluded shadcn-specific theme variables (@theme inline, CSS custom properties) from initial scaffold
- Rationale: shadcn/ui components not installed yet (Task 2); keeping CSS minimal prevents build errors and keeps index.css maintainable
- Migration: Task 2 will add shadcn/ui and extend CSS appropriately

### Dependency Versions
- Decision: Pinned exact versions from pile to maintain consistency
  - React 19.2.4 (latest)
  - Vite 7.3.1
  - TypeScript 5.9.3 (tilde lock ~5.9.3 matches pile)
- Rationale: Monorepo stability; avoids version skew between pile and review-scraper

## Task 2 Decisions

### CLI Tool Selection
- Decision: Upgraded from `shadcn-ui` to `shadcn` CLI
- Rationale: shadcn-ui 0.9.5 is deprecated; newer shadcn (4.0.6) provides better compatibility with Tailwind v4 and React 19
- Impact: Minimal; both CLIs use same components.json schema

### Component Selection
- Decision: Added only button, input, card (no form, select, checkbox, or other compound components)
- Rationale: Minimal UI foundation for Task 7 (review scraper form) and Task 8 (results display); avoids bloat
- Future-proof: Additional components can be added later with same `shadcn add` command

### CSS Theme Approach
- Decision: Used oklch() color space for theme variables (matches pile exactly)
- Rationale: oklch is modern, perceptually uniform, and supports both light/dark modes elegantly
- Implementation: @theme inline defines semantic color tokens (primary, secondary, accent, etc.) via CSS variables
- Tailwind v4: CSS imports @shadcn/tailwind.css and @tailwindcss for plugin composition

### Dependency Installation Strategy
- Decision: Installed all shadcn-required dependencies explicitly after CLI run
- Rationale: shadcn CLI adds components but doesn't always finalize dependency installation in pnpm
- Result: Explicit install of clsx, class-variance-authority, tailwind-merge, @radix-ui/react-slot, lucide-react, tw-animate-css ensures build success

## Task 3 Decisions

### Server Framework: Hono + Node
- Decision: Used Hono (4.12.7) with @hono/node-server (1.19.11)
- Rationale: Lightweight, minimal dependencies, native ESM support, fits "minimal Node setup" requirement, standard Hono pattern for Node environments
- Alternative considered: Express/Fastify—rejected for added complexity and larger dependency footprint

### App Separation: app.ts + index.ts
- Decision: Split Hono instance (app.ts) from server entry point (index.ts)
- Rationale: Enables easier unit testing in later tasks; keeps application logic separate from server bootstrap
- Implementation: app.ts exports Hono instance, index.ts uses `serve()` with `app.fetch`

### Development Runner: concurrently
- Decision: Used `concurrently` (9.2.1) npm package for running frontend + backend together
- Rationale: Simple, lightweight, single-command dev start (`pnpm dev` runs both)
- Alternative considered: npm-run-all—rejected as overkill for 2-process scenario
- Cross-platform compatible (macOS, Linux, Windows)

### CORS Scope
- Decision: Enabled CORS for local development (http://localhost:5173) only
- Rationale: Minimal, dev-only setup as per task scope; production CORS hardening deferred to later tasks
- Implementation: Hono middleware from `hono/cors` with credentials: true

### TypeScript Compilation Scope
- Decision: Extended tsconfig.json to include both src/ and server/ directories
- Rationale: Single TypeScript project ensures consistent type checking across frontend and backend
- No separate tsconfig for server—unified compile target simplifies CI/CD later

### Server Port: 3000
- Decision: Fixed port 3000 for backend; Vite frontend on 5173 (default)
- Rationale: Standard convention (3000 for backend, 5173 for Vite), minimal configuration, sufficient for dev-only requirements
- Alternative: Configurable port via env var—rejected as unnecessary complexity for Task 3 scope

## Task 4 Decisions

### TDD Workflow: RED → GREEN → REFACTOR
- Decision: Followed strict TDD discipline: write meaningful tests first (RED), implement to pass (GREEN), refactor if needed
- Rationale: Per plan requirement "Follow true TDD flow"; test suite serves as executable specification
- Implementation: Vitest + TypeScript strict mode ensures type safety

### RFC 4180 CSV Escaping vs. Alternative Approaches
- Decision: Implemented RFC 4180 CSV escaping (quote wrapping + double-quote escaping) manually
- Rationale: 
  - Plan explicitly forbids Papa Parse and external libraries ("Keep the utility dependency-free")
  - RFC 4180 is well-defined and straightforward for this use case
  - Manual implementation: ~40 lines, no external dependencies
- Alternative considered: Papa Parse, csv-stringify—rejected per plan constraint

### Escaping Logic: Check Special Chars BEFORE Wrapping
- Decision: Test for comma, quote, or newline; only wrap and escape if present
- Rationale: 
  - Simpler CSV output (unquoted fields when safe)
  - Matches RFC 4180 recommendation: quote fields only when necessary
  - Tests validate all three special char cases
- Implementation: `if (field.includes(",") || field.includes('"') || field.includes("\n"))` before escaping

### Quote Escaping: Double Quotes Only
- Decision: Escape internal quotes as `""` (doubled quotes per RFC 4180), not backslash escape
- Rationale: RFC 4180 standard; backslash escaping (`\"`) is not part of CSV spec and breaks Excel compatibility
- Tests: "Bob \"The Builder\" Johnson" field → `"Bob ""The Builder"" Johnson"` (verified in test case 4)

### Type Definition Location: Local to Implementation
- Decision: Define `Review` interface in csv.ts; test file uses matching local interface
- Rationale: 
  - Keeps CSV utility self-contained (no external type dependency)
  - Allows Task 5 (scraper service) to define its own Review type if needed
  - Prevents circular dependencies between lib/ and test files
- Future: Task 5 may define Review type in service layer; csv.ts remains generic and decoupled

### Header: Always Included, Even for Empty Array
- Decision: Return `"userName,score,date,text\n"` when called with empty array
- Rationale: 
  - CSV convention: header row always present
  - Consumers (like `/api/scrape` response) expect header row even for zero reviews
  - Test case 1 validates this behavior explicitly
- Implementation: Return header + rows (with rows empty if array is empty)

### Row Delimiter: Trailing Newline on Final Row
- Decision: Each row ends with `\n`, including the last review row
- Rationale: 
  - RFC 4180 allows trailing CRLF; Unix systems use `\n`
  - Consistent line ending: every data row + final empty line
  - Matches typical CSV export format
- Tests: Multiple rows (case 7) and complex cases (case 8) validate correct newline placement

### Docstring Necessity: Public API Documentation Required
- Decision: Included JSDoc docstrings on `reviewsToCSV()` and `escapeCSVField()` functions
- Rationale: 
  - `reviewsToCSV` is public API consumed by Task 5 scraper service and Task 6 `/api/scrape`
  - RFC 4180 behavior is non-obvious; docstring explains escaping rules for future maintainers
  - "No external dependencies" is business constraint that must be remembered
  - Helper function escaping logic is algorithmic and non-trivial
- Per comment hook guidelines: Priority 3 (necessary docstrings for public API and non-obvious algorithms)

### Test Scope: 8 Cases Covering Edge Cases + Normal Cases
- Decision: 8 test cases (not minimal 3, not exhaustive 20+)
- Coverage:
  - Edge cases: empty array (0 items), single item, multiple items
  - Special characters: comma, quote, newline, unicode/emoji, combinations
  - Normal case: review with no special chars
- Rationale: Balances comprehensive coverage vs. test maintainability; all RFC 4180 requirements covered

## Task 5 Decisions

### ESM Module Handling: Static Top-Level Import
- Decision: Use static top-level import `import scraperLib, { sort } from 'google-play-scraper'` (not dynamic `await import()`)
- Rationale: 
  - Dynamic imports inside async functions break Vitest vi.mock() hoisting (mocks must be hoisted above all imports)
  - Static import allows vi.mock() to intercept module initialization at test setup time
  - ESM-only libraries like google-play-scraper require this pattern for proper mocking
- Implementation: Mock factory returns `{ default: { reviews: vi.fn() }, sort: { NEWEST: 'NEWEST' } }`

### Mock Reset Strategy: clearAllMocks() + mockReset()
- Decision: Call both `vi.clearAllMocks()` AND `mockReset()` in beforeEach() hook
- Rationale:
  - `vi.clearAllMocks()` only clears call history (call count, arguments)
  - `mockReset()` clears implementation state including `mockResolvedValueOnce()` and `mockRejectedValueOnce()` queues
  - Without mockReset(), OnceValue queues persist between tests (e.g., Test 6 consumed Test 3's mock response)
  - This is non-obvious Vitest behavior; critical for test isolation
- Impact: Fixed 7/7 test failures; all tests now pass consistently

### Pagination Token Type: string | null (Not undefined)
- Decision: Use `?? null` operator to ensure token is `string | null`, never `undefined`
- Rationale:
  - Library returns `{ data, nextPaginationToken }` where token can be missing (undefined)
  - For loop termination, null is semantically clearer than undefined
  - Prevents subtle bugs where loop checks `while (token)` (both null and undefined are falsy)
  - Explicit null makes intent clearer in code review
- Implementation: `const token = result.nextPaginationToken ?? null`

### Retry Counter: MAX_RETRIES = 3 (1 Initial + 2 Retries)
- Decision: Total attempts = 3 (1 initial + 2 retries); exit condition: `if (attempts >= MAX_RETRIES) throw error`
- Rationale:
  - Task requirement: "up to 3 retries total (1 initial + 2 retries)"
  - Counter logic: attempts=1 (1st retry after initial fail) → continue; attempts=2 (2nd retry) → continue; attempts=3 → throw
  - Reset counter to 0 on success (not increment on catch) for clarity
- Edge case: Non-503 errors throw immediately without retry (correct per requirement)

### Slice Logic: Post-Pagination Enforcement
- Decision: Apply `reviews.slice(0, target)` AFTER pagination loop completes
- Rationale:
  - Both count=0 (hard cap) and count>0 (exact amount) paths use identical slice target calculation
  - Prevents premature truncation during pagination that would create inconsistent state
  - Ensures all pages are fetched up to target, then final list is truncated exactly once
- Implementation: `const target = count > 0 ? count : MAX_REVIEWS; return reviews.slice(0, target)`

### Throttle and Sort Parameters: Hardcoded, Not Configurable
- Decision: All scrapeReviews() calls pass `throttle: 10` and `sort: sort.NEWEST` to library
- Rationale:
  - Task requirement specifies these fixed values for all API calls
  - No need for configurability in Task 5; can be added later if requirements change
  - Simplifies function signature (only appId and count needed)
- Implementation: Part of all `scraperLib.reviews()` calls in both initial and pagination requests

### Type Casting: Review[] Cast Accepted (Pragmatic Approach)
- Decision: Cast library response `result.data as Review[]` despite type mismatch with IReviewsItem
- Rationale:
  - Custom Review interface (id, userName, score, text) is intentional subset of library's full type
  - Service layer should not expose library's complete IReviewsItem surface to consumers
  - Type mismatch is acknowledged; no runtime impact (all required fields present in library response)
  - LSP diagnostics flag this; acceptable trade-off for clean service API
- Future: If type safety needed, create proper adapter function (out of scope for Task 5)

### Hard Cap: 10,000 Reviews Maximum
- Decision: Enforce absolute maximum of 10,000 reviews returned regardless of count parameter
- Rationale: Task requirement specifies "hard cap 10,000"; prevents memory exhaustion from runaway pagination
- Implementation: `const MAX_REVIEWS = 10000; const target = count > 0 ? Math.min(count, MAX_REVIEWS) : MAX_REVIEWS`
- Edge case: count=0 still respects cap; count=50000 capped to 10000

### Test Isolation: 7 Cases with Full Mock Independence
- Decision: 7 test cases covering pagination, retry logic, and parameter passing
- Coverage:
  - Test 1: count=0 pagination until token null (hard cap 10000)
  - Test 2: count=100 exact fetch with multiple pages
  - Test 3: Hard cap at 10000 enforced
  - Test 4: throttle=10 parameter verified
  - Test 5: sort.NEWEST parameter verified
  - Test 6: 503 error retry succeeds after 3 total attempts
  - Test 7: 503 error fails after 3 total attempts exhausted
- Rationale: Each test uses `mockResolvedValueOnce()` or `mockRejectedValueOnce()` sequentially; mockReset() ensures clean state

## Task 6 Decisions

### Route Registration Pattern: Function-Based Over Router Object
- Decision: Use function-based registration `export function registerScrapeRoutes(app: Hono)` instead of router object pattern
- Rationale:
  - Router object pattern creates separate router instance → must call `app.route("/", router)` after import
  - Function pattern receives app instance as parameter → routes registered directly on app before test import
  - Test isolation: Function pattern ensures routes are registered on the same app instance used in tests
  - Cleaner dependency injection: route handler logic doesn't depend on router object creation
- Implementation: `registerScrapeRoutes(app)` called in app.ts after middleware setup; tests import and instantiate app first
- Alternative considered: Router object with beforeEach app/router recreation—rejected as more complex

### Hono Request API: Web Standards Compliance
- Decision: Use `new Request(url, options)` constructor with full URL for test requests, not method-based shorthand
- Rationale:
  - Hono's `app.request()` method expects Web Standards Request API object, not string method + path
  - Full URL required: `http://localhost/api/scrape` (includes protocol)
  - Matches real HTTP behavior: requests are always full URLs, routed to localhost
  - Enables proper header and body serialization via Web Standards API
- Implementation: All test cases use `app.request(new Request("http://localhost/api/scrape", { method: "POST", headers: {...}, body: JSON.stringify(...) }))`
- Discovered via debugging: Initial pattern `app.request("POST", "/api/scrape", {...})` caused "Expected /api/scrape to be one of: Null, Undefined, Object" error

### Validation Rules: Explicit 400 Status for Each Error
- Decision: Return 400 status with specific error message for each validation failure case
- Error cases:
  1. Missing appId → 400 with "appId is required"
  2. Empty appId (empty string) → 400 with "appId cannot be empty"
  3. Negative count → 400 with "count must be non-negative"
  4. count > 10000 → 400 with "count must be at most 10000"
- Rationale:
  - Consistent HTTP semantics: 400 Bad Request for invalid input
  - Specific error messages aid debugging and client error handling
  - All validation occurs before calling scraper service (fail fast)
  - Test coverage: all 4 error paths tested explicitly

### Count Omission: Treat As Zero
- Decision: If count is not provided in request body, default to 0 (fetch all reviews up to hard cap)
- Rationale:
  - count=0 means "fetch all available reviews" in scraper service (up to 10000 hard cap)
  - Matches scraper service behavior: count parameter distinguishes "fetch all" (0) from "fetch exactly N" (>0)
  - Common REST pattern: optional pagination limit defaults to unlimited (within hard cap)
- Implementation: `const count = body.count ?? 0`

### Response Format: CSV with Proper Headers
- Decision: Return plain text CSV body (not JSON) with Content-Type and Content-Disposition headers
- Headers:
  - `Content-Type: text/csv` — indicates MIME type for browser/client handling
  - `Content-Disposition: attachment; filename="reviews.csv"` — triggers download in browser; sets filename
- Rationale:
  - CSV is text format, not JSON → requires separate response method
  - Hono pattern: `c.body(csv, { status, headers: {...} })` for non-JSON responses (vs. `c.json()`)
  - Content-Disposition attachment: enables client to save file directly
  - Filename hint: "reviews.csv" provides semantic name for downloaded file
- Implementation: Body is CSV string from `reviewsToCSV(reviews)` with headers object

### Hono Response Method: c.body() for CSV Over c.text()
- Decision: Use `c.body(csv, { status, headers: {...} })` for CSV response, not `c.text()`
- Rationale:
  - `c.body()` allows explicit header control (Content-Type, Content-Disposition)
  - `c.text()` auto-sets Content-Type: text/plain (cannot override to text/csv)
  - Full header control needed for proper CSV handling (filename, attachment disposition)
  - Explicit headers make intent clear in code review
- Implementation: Status code and headers passed as second argument object to `c.body()`

### Mock Data Type Alignment: Include id Property
- Decision: All mock Review objects in tests must include id property to match actual Review interface
- Interface requirement: `{ id: string, userName: string, score: number, date: string, text: string }`
- Rationale:
  - Mock objects must be structurally identical to actual Review type used in scraper service
  - TypeScript strict mode (project setting) enforces type compatibility in tests
  - Missing id property caused error 2345 (type not assignable)
  - Pragmatic: easier to include id in mocks than to create separate test-only interface
- Implementation: All mocks have `id: "1"`, `id: "2"`, etc. (dummy string values acceptable for testing)

### Input Parameter Structure: Request Body vs Query String
- Decision: Accept appId and count from JSON request body, not query parameters
- Rationale:
  - POST requests conventionally pass data in body, not query string
  - Semantic: request "scrapes app X" → action-oriented (POST) not retrieval (GET)
  - Body allows arbitrary data structures (future: could add filter/option parameters)
  - Query string better suited for GET endpoints (retrieve existing resources)
- Implementation: Parse JSON body with `c.req.json()`, extract appId and count properties

### Test Structure: 8 Cases (Validation + Happy Path + Integration)
- Decision: 8 test cases covering all validation errors + happy path + integration points
- Coverage breakdown:
  - 4 validation error cases (missing appId, empty appId, negative count, count > 10000)
  - 1 happy path (success with valid inputs)
  - 1 missing count behavior (defaults to 0)
  - 2 integration verification (scrapeReviews called correctly, reviewsToCSV called correctly)
- Rationale:
  - Exhaustive validation coverage: every error condition tested
  - Integration checks: verify service and utility called with correct arguments
  - Happy path verification: CSV response format and headers correct
  - Test count balances coverage vs. maintainability
- Acceptance: All 8 tests passing confirms endpoint meets specification

## Task 7 Decisions

### Form State Handling
- Decision: Managed form state (`appId`, `count`, `isLoading`) locally in `ScrapeForm` component.
- Rationale: No need for complex state managers (Zustand/Redux) or React Hook Form for a simple 2-field form. Kept dependencies and overhead minimal.

### Button Disable Logic
- Decision: Disable submit button when `appId` is entirely empty or only contains whitespace, or when a request is currently in-flight.
- Rationale: Prevents sending invalid requests to the backend (saving HTTP roundtrips) and prevents duplicate submission while scraping is happening.

### Count Input Type
- Decision: Handled `count` as an optional string in state, parsed to integer only when appending to payload.
- Rationale: Allows HTML `type="number"` to naturally return empty string `""` when cleared. Differentiates clearly between "omit" (fetch all) and "0" or valid numbers.

### Download Flow
- Decision: Trigger CSV download programmatically using a hidden `<a>` tag with `URL.createObjectURL(blob)`.
- Rationale: The API responds with the CSV directly. Appending `<a>` and clicking it simulates a user download without needing to navigate away or open new tabs, keeping the UX fluid.
- Kept UI state (loading/error/success) local to `ScrapeForm.tsx` instead of adding a toast system or global state library, matching the minimal requirement of the task.
- Added a `Retry` action that re-uses the captured `appId` and `count` state.
- Cleared the error/success flags when the user begins typing a new appId or count to prevent stale feedback.

## Task 10 Decisions

### Shared Validation Helper
- Decision: Added `src/lib/validation.ts` and used it from both `ScrapeForm.tsx` and `server/routes/scrape.ts`.
- Rationale: Frontend now blocks negative counts early, while backend remains authoritative with the same messages and bounds.

### Zero and Blank Count Semantics
- Decision: Treat blank `count` as omitted and explicit `0` as "fetch all reviews."
- Rationale: Preserves the existing `{ appId, count? }` payload shape while making the "all reviews" path explicit and testable.

### Empty Scrape Response Handling
- Decision: Convert empty scrape results into user-facing errors instead of generating an empty CSV.
- Rationale: Empty CSV downloads were ambiguous and looked like success; route now distinguishes "App not found" from "No reviews found" with a follow-up app lookup.

### Duplicate Submit Guard
- Decision: Guard submit attempts with a synchronous in-flight ref in addition to disabling the button.
- Rationale: UI disabling covers normal clicks, and the ref closes the race window for repeated submit events before React re-renders.

### Vitest File Scope
- Decision: Explicitly scoped Vitest to `src/**/*.{test,spec}.{ts,tsx}` and `server/**/*.{test,spec}.ts`, excluding `e2e/**` and `node_modules/**`.
- Rationale: Required for `pnpm test` to stay inside project-owned tests and avoid accidentally executing dependency test suites.
