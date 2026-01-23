<!-- Parent: ../AGENTS.md -->
# SRC

## OVERVIEW
Astro source tree with pages, components, and global styles.

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
| Base layout | `components/base.astro` | Meta tags, fonts |
| Content layout | `components/content.astro` | Blog/news wrapper |
| API requests | `components/request.ts` | Fetch helpers |

## CONVENTIONS
- Prefer Astro components for routes; keep logic minimal in pages.
- Components export a `Props` interface when they accept inputs.
