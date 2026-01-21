<!-- Parent: ../AGENTS.md -->
# SCHALE

## OVERVIEW
Schale is the monolithic website project; frontend is the only codebase here.

## STRUCTURE
```
schale/
├── frontend/    # Astro app
└── scripts/     # Python utilities
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App config | `frontend/astro.config.mjs` | SSR, sitemap filter |
| Pages | `frontend/src/pages` | File-based routes |
| Components | `frontend/src/components` | Base/content/request helpers |
| Scripts | `scripts` | CLI helpers for news/tabs |

## NOTES
- No backend service in this repo; API is referenced by URL in `request.ts`.
