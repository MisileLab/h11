<!-- Parent: ../AGENTS.md -->
# SCHALE

## OVERVIEW
Astro SSR website with interactive Python scripts.

## STRUCTURE
```
schale/
├── frontend/    # Astro app (SSR, Yarn 4)
└── scripts/     # Python utilities (interactive stdin)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| App config | `frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Routes | `frontend/src/pages` | File-based; i18n via `/en` `/ko` dirs |
| Components | `frontend/src/components` | Layouts + utilities (no `src/layouts/`) |
| Styles | `frontend/src/styles/global.css` | Single-line Tailwind v4 import |
| News formatter | `scripts/generate-news.py` | Interactive markdown generator |
| URL opener | `scripts/open-tabs.py` | Reads URLs from stdin, opens browser |

## CONVENTIONS
- Scripts expect interactive stdin (`input()`); do not assume non-interactive usage.
- No test suite; validation via `astro check` in build.
