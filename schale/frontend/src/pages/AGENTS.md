<!-- Parent: ../AGENTS.md -->
# PAGES

## OVERVIEW
Astro file-based routes. Blog/news content is static `.astro` files (no content collections).

## STRUCTURE
```
pages/
├── index.astro       # Landing: WebGL hero animation
├── projects.astro    # Project showcase (client-side JS, mobile-detect)
├── contact.astro     # Contact methods (nanostores, copy-to-clipboard)
├── en/blog/          # English posts (index + 5 entries)
├── ko/blog/          # Korean posts (index + 4 entries)
└── data/news/        # News summaries (54 files, excluded from sitemap)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Landing page | `index.astro` | WebGL letter-grid hero, nav links |
| Blog index | `en/blog/index.astro`, `ko/blog/index.astro` | Lists posts via `Post` component |
| Blog entries | `{lang}/blog/{n}.astro` | Numeric IDs, wrapped in `Content` |
| News entries | `data/news/{n}.astro` | `isnews: true`, excluded from sitemap |

## CONVENTIONS
- Blog/news pages wrap content with the `Content` component.
- Production drafts blocked when `date` is `0` (Content throws in PROD).
- Posts use numeric IDs (`1.astro`, `2.astro`), not slugs.
- Date is a Unix timestamp (seconds); rendered via `dayjs.unix()`.
- Blog indices cross-link between `/en/blog` ↔ `/ko/blog` for i18n.
- News entries show "Summarized with gpt4o-mini" badge via `isnews` flag.
