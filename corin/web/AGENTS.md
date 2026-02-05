<!-- Parent: ../AGENTS.md -->
# WEB

## OVERVIEW
Next.js 16 App Router UI with NextAuth and an axios API client.

## STRUCTURE
```
web/
├── src/
│   ├── app/        # App Router pages + API routes
│   ├── components/ # UI + feature components
│   ├── lib/        # API/auth/utils
│   └── providers/  # Session + Query providers
├── package.json
├── next.config.js
└── .env.local.example
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Root layout | `src/app/layout.tsx` | Providers + global CSS |
| Home | `src/app/page.tsx` | Sign-in + redirect |
| Auth route | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handlers |
| Auth config | `src/lib/auth.config.ts` | Provider + callbacks |
| API client | `src/lib/api.ts` | axios + refresh flow |
| Auth hooks | `src/lib/auth.ts` | useAuth/useRequireAuth |

## CONVENTIONS
- Yarn uses `nodeLinker: pnpm` (see `.yarnrc.yml`).
- App Router pages live under `src/app`.
- OAuth is handled by NextAuth, but API auth uses backend tokens stored in localStorage.

## ANTI-PATTERNS
- Do not call backend APIs without `api.ts` (token refresh logic lives there).
- Do not rely on localStorage tokens in server components.
