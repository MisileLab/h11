<!-- Parent: ../AGENTS.md -->
# SRC

## OVERVIEW
Astro source tree: routes in `pages/`, shared components in `components/`.

## STRUCTURE
```
src/
├── components/   # Layouts, utilities, UI pieces
├── pages/        # File-based routes
├── styles/       # Global styles
└── env.d.ts      # Astro types
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| New page route | `pages/*.astro` | File-based routing |
| Shared layout | `components/base.astro` | Meta tags, fonts |
| Content layout | `components/content.astro` | Blog/news wrapper |
| API requests | `components/request.ts` | Fetch helpers |

## CONVENTIONS
- Prefer Astro components for pages; keep logic minimal in routes.
- Components export `Props` interface when they accept inputs.
