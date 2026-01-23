<!-- Parent: ../AGENTS.md -->
# COMPONENTS

## OVERVIEW
Shared Astro components and small TypeScript utilities.

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Base layout | `base.astro` | Meta tags, fonts |
| Content wrapper | `content.astro` | Blog/news container |
| Post item | `post.astro` | Blog list item |
| Modal | `modal.astro` | Dialog wrapper |
| Visual | `neural-network.astro` | SVG animation |
| API client | `request.ts` | Fetch helpers |
| Utilities | `lib.ts` | `DataType`, `getTextContent` |

## CONVENTIONS
- Export a `Props` interface for component inputs.
- Keep utilities as named exports (no default exports in TS files).
- Throw explicit errors for fetch failures (see `request.ts`).
