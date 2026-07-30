<!-- Parent: ../AGENTS.md -->

# FRONTEND

## OVERVIEW

Astro SSR app: Tailwind v4 via Vite, Node standalone adapter, pnpm 10.

## STRUCTURE

```
frontend/
├── src/              # Astro source
├── public/fonts/     # ~1.5 GB font assets (Iosevka, SarasaMono)
├── Dockerfile        # Multi-stage Alpine build; non-root user (UID 1001)
├── astro.config.mjs  # SSR, sitemap filter, Tailwind v4 plugin
├── eslint.config.js  # Flat config: oxlint + astro + TS parser
├── pnpm-lock.yaml   # Lockfile
```

## WHERE TO LOOK

| Task         | Location                    | Notes                                             |
| ------------ | --------------------------- | ------------------------------------------------- |
| Astro config | `astro.config.mjs`          | SSR, sitemap filter, site URL                     |
| Routes       | `src/pages`                 | File-based; i18n via dir prefixes                 |
| Layouts      | `src/components`            | `base.astro`, `content.astro` (no `src/layouts/`) |
| API helpers  | `src/components/request.ts` | Fetch wrappers, StatusError, env-aware URLs       |
| Middleware   | `src/middleware.ts`         | Security headers (HSTS, CSP, X-Frame)             |
| Styles       | `src/styles/global.css`     | Single-line `@import "tailwindcss"`               |
| Fonts        | `public/fonts`              | Large assets (~1.5 GB); avoid moving              |

## CONVENTIONS

- TypeScript strict via `astro/tsconfigs/strict`.
- Named exports only in TS files (no default exports).
- Linting: `oxlint` + `eslint`; formatting: `oxfmt` (not Prettier).
- pnpm 10 with corepack (see package.json `packageManager`).
- Layout components live in `src/components/` — never create `src/layouts/`.
- Docker: multi-stage Node 25 Alpine, port 4321, `pnpm install --frozen-lockfile`.
