<!-- Parent: ../AGENTS.md -->
# FRONTEND

## OVERVIEW
Astro SSR app using Tailwind v4 via Vite and Node standalone adapter.

## STRUCTURE
```
frontend/
├── src/            # Astro source
├── public/         # Static assets
├── Dockerfile      # SSR container build
├── astro.config.mjs
└── eslint.config.js
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Astro config | `astro.config.mjs` | SSR, sitemap filter, site URL |
| Routes | `src/pages` | File-based routing |
| Layouts | `src/components` | `base.astro`, `content.astro` |
| API helpers | `src/components/request.ts` | Fetch wrappers |
| Styles | `src/styles/global.css` | Tailwind import |
| Fonts | `public/fonts` | Large font assets |

## CONVENTIONS
- TypeScript strict via `astro/tsconfigs/strict`.
- Utilities use named exports (no default exports in TS).
- Linting uses `oxlint` + `eslint`; formatting uses `oxfmt`.
- Layout components live in `src/components` (no `src/layouts`).
