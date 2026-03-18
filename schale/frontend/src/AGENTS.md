<!-- Parent: ../AGENTS.md -->
# SRC

## OVERVIEW
Astro source tree: pages, components (incl. layouts), middleware, and global styles.

## STRUCTURE
```
src/
├── components/   # Layouts, UI pieces, TS utilities
├── pages/        # File-based routes (i18n + news)
├── styles/       # global.css — single `@import "tailwindcss"` (Tailwind v4 CSS-first)
├── middleware.ts  # Security headers on all responses
└── env.d.ts      # Astro type references
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| New page route | `pages/*.astro` | File-based routing |
| Base layout | `components/base.astro` | HTML shell, meta tags, fonts, Tor header |
| Content layout | `components/content.astro` | Blog/news wrapper; draft guard (`date===0`) |
| API requests | `components/request.ts` | Env-aware fetch (clearnet/onion) |
| Shared types | `components/lib.ts` | `DataType` enum, `getTextContent()` |
| Tailwind entry | `styles/global.css` | Keep minimal; no tailwind.config needed |

## CONVENTIONS
- Prefer Astro components for routes; keep page logic minimal.
- Components export a `Props` interface when they accept inputs.
- Styles: Tailwind v4 CSS-first — customize via CSS custom properties, not config files.
