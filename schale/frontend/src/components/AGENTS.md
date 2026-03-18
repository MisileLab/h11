<!-- Parent: ../AGENTS.md -->
# COMPONENTS

## OVERVIEW
Shared Astro components (including layouts) and TypeScript utilities.

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Base layout | `base.astro` | HTML shell, meta tags, fonts, onion-location header |
| Content wrapper | `content.astro` | Blog/news article; draft guard; scoped prose styles |
| Post item | `post.astro` | Blog/news list card; routes by `DataType` |
| Modal | `modal.astro` | HTML dialog wrapper |
| API client | `request.ts` | `fetchAPILow()`, `StatusError`, env-aware URLs (clearnet/onion) |
| Utilities | `lib.ts` | `DataType` enum (`blog`/`news`), `getTextContent()` |

## CONVENTIONS
- Export `Props` interface for component inputs.
- Named exports only (no default exports in TS files).
- Throw explicit `StatusError` for fetch failures (never swallow errors).
- `content.astro` throws in PROD if `date === 0` (draft guard).
- `base.astro` auto-detects lang from URL pathname (`/ko` → `"ko"`, else `"en"`).
