<!-- Parent: ../AGENTS.md -->
# APP

## OVERVIEW
Next.js App Router routes and API handlers.

## STRUCTURE
```
app/
├── page.tsx                 # Home
├── layout.tsx               # Root layout
├── dashboard/page.tsx
├── search/page.tsx
├── meetings/[id]/page.tsx
├── folders/[id]/page.tsx
└── api/auth/[...nextauth]/route.ts
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Root layout | `layout.tsx` | Providers + globals |
| Home | `page.tsx` | Sign-in flow |
| Dashboard | `dashboard/page.tsx` | Main landing |
| Search | `search/page.tsx` | Search UI |
| Meeting detail | `meetings/[id]/page.tsx` | Transcript + Q&A |
| Auth API | `api/auth/[...nextauth]/route.ts` | NextAuth handlers |

## CONVENTIONS
- Auth-gated pages call `useRequireAuth`.
- Pages using hooks must be client components.
