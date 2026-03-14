<!-- Parent: ../AGENTS.md -->
# REVIEW-SCRAPER

## OVERVIEW
Web scraper with Vite + React frontend, Hono backend server, Playwright e2e tests.

## STRUCTURE
```
review-scraper/
├── src/                # React frontend
├── server/             # Hono backend
├── e2e/                # Playwright e2e tests
├── dist/               # Build output
├── vitest.config.ts    # Unit test config
├── playwright.config.ts # E2E config (port 4173)
└── package.json        # pnpm, Vite, Hono
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Frontend | `src/` | React components |
| Backend | `server/` | Hono API server |
| E2E tests | `e2e/scrape.spec.ts` | Playwright |
| Build config | `vite.config.ts` | Vite + React |
| Test config | `vitest.config.ts` | Node environment |

## CONVENTIONS
- Vite for build, Hono for server.
- Unit tests: vitest (node environment).
- E2E tests: Playwright on port 4173 (vite preview).

## COMMANDS
```bash
pnpm dev                    # Vite dev server
pnpm build                  # Production build
pnpm test                   # vitest
pnpm test:e2e               # Playwright
```
