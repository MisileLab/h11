# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-01T11:27:00Z
**Commit:** 78bb1cd
**Branch:** main

## OVERVIEW
Monorepo with two apps: Schale (Astro SSR site) and Corin (FastAPI + Next.js meeting archive).

## STRUCTURE
```
h11/
├── corin/          # FastAPI API + Next.js web app
├── schale/         # Astro SSR website + Python scripts
└── .github/        # CI/CD workflows
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Corin API | `corin/api/app/main.py` | FastAPI entrypoint + routers |
| Corin web | `corin/web/src/app` | Next.js App Router pages |
| Corin config | `corin/api/app/config.py` | Pydantic settings + .env |
| Schale config | `schale/frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Schale routes | `schale/frontend/src/pages` | Astro file-based routes |
| Schale components | `schale/frontend/src/components` | Base/content layouts, request helpers |
| Schale styles | `schale/frontend/src/styles/global.css` | Tailwind import |
| Schale scripts | `schale/scripts` | Interactive Python helpers |
| CI/CD | `.github/workflows` | Docker build/push workflows |

## CONVENTIONS
- Schale uses Yarn 4 with `nodeLinker: node-modules` (see `schale/frontend/.yarnrc.yml`).
- Corin web uses Yarn with `nodeLinker: pnpm` (see `corin/web/.yarnrc.yml`).
- Tailwind v4 via Vite (Schale) and Tailwind v4 via Next/PostCSS (Corin web).
- Schale has no test suite; build runs `astro check`.
- Corin API tooling uses `uv` in docs; Python 3.11+.
- Font assets in `schale/frontend/public/fonts` are large; avoid moving unless required.
- Git commit messages use conventional commits with optional scopes (e.g., `feat(schale): add news entry`).
- Scripts in `schale/scripts` expect interactive stdin.

## ANTI-PATTERNS (THIS PROJECT)
- Do not commit local Python environments like `.venv`.
- Do not commit build outputs like `.next`.
- Do not assume scripts work non-interactively.

## COMMANDS
```bash
# Schale (Astro)
cd schale/frontend
yarn dev              # Dev server
yarn build            # Production build
yarn lint             # oxlint + eslint
yarn format           # oxfmt

# Corin (API)
cd corin/api
uv sync
uv run alembic upgrade head
uv run python -m app.main

# Corin (Web)
cd corin/web
yarn install
yarn dev
```

## NOTES
- Manual i18n via `src/pages/en` and `src/pages/ko`.
- News pages under `src/pages/data/news` excluded from sitemap.
- Production drafts blocked when `date` is 0 in content pages.
- CI workflows use Docker metadata-action with custom templating (`enable={{is_default_branch}}`).
- Build gating via `env.ACT` variable in workflows.
