# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-29 02:01:20Z
**Commit:** af70695
**Branch:** main

## OVERVIEW
Monorepo with Schale (Astro SSR site), Corin (Next.js + FastAPI + worker), and Scalar (Unity project). Each subproject uses its own toolchain.

## STRUCTURE
```
h11/
├── corin/          # Full-stack app + docs
├── scalar/         # Unity project (may be absent in some checkouts)
├── schale/         # Astro SSR website
└── .github/        # CI/CD workflow
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale config | `schale/frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Schale routes | `schale/frontend/src/pages` | Astro file-based routes |
| Schale components | `schale/frontend/src/components` | Base/content layouts, request helpers |
| Schale styles | `schale/frontend/src/styles/global.css` | Tailwind import |
| Schale scripts | `schale/scripts` | Interactive Python helpers |
| Corin web app | `corin/apps/web` | Next.js app router |
| Corin API | `corin/apps/api` | FastAPI service + routers |
| Corin worker | `corin/apps/worker` | RQ worker + tools |
| Corin docs | `corin/docs` | Setup/architecture/API notes |
| Scalar scenes | `scalar/Assets/Scenes` | Unity scenes |
| Scalar settings | `scalar/ProjectSettings` | Unity project settings |
| Scalar input | `scalar/Assets/InputSystem_Actions.inputactions` | Input System asset |
| Scalar packages | `scalar/Packages/manifest.json` | Unity dependencies |
| CI/CD | `.github/workflows/schale-docker-publish.yml` | Docker build/push |

## CONVENTIONS
- Each subproject is isolated: Schale uses Yarn 4, Scalar uses Unity Package Manager.
- Schale uses Tailwind v4 via Vite (no tailwind.config file).
- Schale has no test suite; build runs `astro check`.
- Scalar targets Unity 6000.3.5f1; dependencies live in `scalar/Packages/manifest.json`.
- Corin web uses Yarn 4 (PnP). Corin API/worker use Python 3.12 + requirements.txt.
- Font assets in `schale/frontend/public/fonts` are large; avoid moving unless required.
- When work is complete, agents should commit and push changes by default unless explicitly told otherwise.
- Git commit messages use conventional commits with optional scopes (e.g., `feat(schale): add news entry`).

## ANTI-PATTERNS (THIS PROJECT)
- Do not edit or commit generated Unity directories: `scalar/Library`, `scalar/Logs`, `scalar/UserSettings`.
- Do not commit local Python environments like `.venv`.

## COMMANDS
```bash
# Schale (Astro)
cd schale/frontend
yarn dev
yarn build
yarn lint
yarn format
```

## NOTES
- Schale uses manual i18n via `src/pages/en` and `src/pages/ko`.
- News pages under `src/pages/data/news` are excluded from the sitemap.
- Production drafts are blocked when `date` is 0 in content pages.
- Scalar includes a git-based Unity package: `com.coplaydev.unity-mcp`.
