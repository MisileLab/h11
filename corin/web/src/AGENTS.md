<!-- Parent: ../AGENTS.md -->
# SRC

## OVERVIEW
Frontend source tree: App Router pages, components, and shared libs.

## STRUCTURE
```
src/
├── app/        # Next.js App Router
├── components/ # UI + feature components
├── lib/        # API/auth/utils
├── providers/  # Session/Query providers
└── types/      # API types
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Pages | `app` | Routes + API handlers |
| Shared UI | `components/ui` | Button/Input/Modal/Card |
| API client | `lib/api.ts` | axios + refresh |
| Auth helpers | `lib/auth.ts` | useAuth hooks |
| Utilities | `lib/utils.ts` | cn + formatters |

## CONVENTIONS
- Use alias imports (`@/lib/...`, `@/components/...`).
- Client hooks require `"use client"` in components/pages.
