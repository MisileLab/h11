<!-- Parent: ../AGENTS.md -->
# COMPONENTS

## OVERVIEW
Shared Astro components and small TypeScript utilities.

## KEY FILES
| File | Purpose |
| --- | --- |
| `base.astro` | Root layout, meta tags, fonts |
| `content.astro` | Blog/news content wrapper |
| `post.astro` | Post list item |
| `modal.astro` | Dialog wrapper |
| `neural-network.astro` | SVG animation component |
| `request.ts` | API client helpers |
| `lib.ts` | Shared enums and helpers |

## CONVENTIONS
- Export `Props` interface for component inputs.
- Keep utilities as named exports (no default exports in TS files).
- Throw explicit errors for fetch failures (see `request.ts`).
