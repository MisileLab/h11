# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-31T10:24:46Z
**Commit:** 691d619
**Branch:** main

## OVERVIEW
Monorepo containing Schale (Astro SSR website). Small codebase focused on content delivery with manual i18n.

## STRUCTURE
```
h11/
├── schale/         # Astro SSR website + Python scripts
└── .github/        # CI/CD workflows
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale config | `schale/frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Schale routes | `schale/frontend/src/pages` | Astro file-based routes |
| Schale components | `schale/frontend/src/components` | Base/content layouts, request helpers |
| Schale styles | `schale/frontend/src/styles/global.css` | Tailwind import |
| Schale scripts | `schale/scripts` | Interactive Python helpers |
| CI/CD | `.github/workflows` | Docker build/push workflows |

## CONVENTIONS
- Schale uses Yarn 4 (Berry) with PnP mode.
- Tailwind v4 via Vite (no tailwind.config file).
- No test suite; build runs `astro check`.
- Font assets in `schale/frontend/public/fonts` are large; avoid moving unless required.
- Git commit messages use conventional commits with optional scopes (e.g., `feat(schale): add news entry`).
- Scripts in `schale/scripts` expect interactive stdin.

## ANTI-PATTERNS (THIS PROJECT)
- Do not commit local Python environments like `.venv`.
- Do not assume scripts work non-interactively.

## COMMANDS
```bash
# Schale (Astro)
cd schale/frontend
yarn dev              # Dev server
yarn build            # Production build
yarn lint             # oxlint + eslint
yarn format           # oxfmt
```

## NOTES
- Manual i18n via `src/pages/en` and `src/pages/ko`.
- News pages under `src/pages/data/news` excluded from sitemap.
- Production drafts blocked when `date` is 0 in content pages.
- CI workflows use Docker metadata-action with custom templating (`enable={{is_default_branch}}`).
- Build gating via `env.ACT` variable in workflows.
