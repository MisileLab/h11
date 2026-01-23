<!-- Parent: ../AGENTS.md -->
# PAGES

## OVERVIEW
Astro file-based routes. Blog/news content is static .astro files.

## STRUCTURE
```
pages/
├── index.astro
├── projects.astro
├── contact.astro
├── en/blog/      # English posts
├── ko/blog/      # Korean posts
└── data/news/    # News entries (excluded from sitemap)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Landing page | `index.astro` | WebGL hero |
| Blog index | `en/blog/index.astro`, `ko/blog/index.astro` | Lists posts |
| News entries | `data/news/*.astro` | Uses Content with `isnews` |

## CONVENTIONS
- Blog/news pages wrap content with the `Content` component.
- Production drafts are blocked when `date` is 0.
