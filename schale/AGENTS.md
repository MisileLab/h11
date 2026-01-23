<!-- Parent: ../AGENTS.md -->
# SCHALE

## OVERVIEW
Astro SSR website plus a small set of interactive scripts.

## STRUCTURE
```
schale/
├── frontend/    # Astro app (SSR)
└── scripts/     # Python utilities
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App config | `frontend/astro.config.mjs` | SSR, sitemap filter |
| Routes | `frontend/src/pages` | File-based routing |
| Components | `frontend/src/components` | Base/content/request helpers |
| Styles | `frontend/src/styles` | Global CSS entry |
| Scripts | `scripts` | Interactive helpers for news/tabs |

## CONVENTIONS
- The frontend references the API by URL in `frontend/src/components/request.ts`.
- Scripts expect interactive stdin; do not assume non-interactive usage.
