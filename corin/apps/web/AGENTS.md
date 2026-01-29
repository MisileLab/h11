<!-- Parent: ../../AGENTS.md -->
# WEB

## OVERVIEW
Next.js app router frontend for Corin.

## STRUCTURE
```
apps/web/
├── app/          # Routes, layouts, server actions
├── lib/          # Client helpers
├── public/       # Static assets
├── next.config.mjs
└── tsconfig.json
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Route entry | `app/page.tsx` | Landing page |
| Layout | `app/layout.tsx` | Root layout |
| Providers | `app/providers.tsx` | App providers |
| API auth | `app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| API client | `lib/api.ts` | Fetch helpers |
| Auth config | `lib/auth.ts` | NextAuth options |

## CONVENTIONS
- App router only (no pages/ directory).
- Use `lib/api.ts` for API calls instead of ad-hoc fetch.
- Keep auth config in `lib/auth.ts` and route handler in app/api.
