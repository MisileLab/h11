<!-- Parent: ../AGENTS.md -->
# FRONTEND

## OVERVIEW
Next.js 16 with app router, Tailwind v4, vitest unit tests + Playwright e2e.

## STRUCTURE
```
frontend/
├── src/
│   ├── app/              # Next.js app router pages
│   └── components/       # React components
├── e2e/                  # Playwright e2e tests (4 suites)
├── vitest.config.ts      # Unit test config
├── vitest.setup.ts       # testing-library setup
├── playwright.config.ts  # E2E config (port 3099)
└── package.json          # pnpm, Next.js 16
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Pages | `src/app/` | Next.js app router |
| Components | `src/components/` | React UI |
| Unit tests | `src/**/*.test.tsx` | vitest + testing-library |
| E2E tests | `e2e/*.spec.ts` | Playwright |
| Test setup | `vitest.setup.ts` | jest-dom matchers |

## CONVENTIONS
- Next.js app router (not pages router).
- Tailwind v4 CSS-first (no tailwind.config.js).
- jsdom environment for unit tests.
- Playwright runs on port 3099.

## COMMANDS
```bash
pnpm dev                    # Next.js dev
pnpm build                  # Production build
pnpm test                   # vitest run
pnpm test:e2e               # Playwright tests
```
