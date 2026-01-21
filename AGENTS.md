# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-21 15:45:03Z
**Commit:** 04c1a79
**Branch:** main

## OVERVIEW
Monorepo with a single project: Schale (Astro SSR website). Main code lives under `schale/frontend`.

## STRUCTURE
```
h11/
├── schale/                 # Project root
│   ├── frontend/           # Astro app (SSR, Tailwind)
│   └── scripts/            # Python utilities
└── .github/                # CI/CD workflow
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Astro app config | `schale/frontend/astro.config.mjs` | Site, adapter, sitemap filter |
| App entry pages | `schale/frontend/src/pages` | File-based routing |
| Shared components | `schale/frontend/src/components` | Layouts, request helpers |
| Global styles | `schale/frontend/src/styles/global.css` | Tailwind import |
| CI/CD | `.github/workflows/schale-docker-publish.yml` | GHCR publish |
| Scripts | `schale/scripts` | Small Python helpers |

## CONVENTIONS
- Only subproject is `schale`; no root package manager config.
- Frontend uses Yarn 4 with node-modules linker.
- Font assets are large; avoid moving them unless required.

## COMMANDS
```bash
cd schale/frontend
yarn dev
yarn build
yarn lint
yarn format
```

## NOTES
- Most content is static Astro pages (including news data pages).
- AGENTS.md files exist inside `schale/frontend` and below; use the closest one.
