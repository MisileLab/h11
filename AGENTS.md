# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-18T10:07:00Z
**Commit:** 515d9af
**Branch:** main

## OVERVIEW
Monorepo with five products: Schale (Astro SSR site), Pile (Tauri desktop app), CommandPreview (Minecraft Fabric mod), DamageTrackerMod (STS2 C# mod), and Lapis (Rust VCS).

## STRUCTURE
```
h11/
├── .github/           # CI workflows (Docker publish, OpenCode agents)
├── schale/            # Astro SSR website + Python scripts
│   ├── frontend/      # Astro app (pnpm 10, Tailwind v4, Node SSR)
│   └── scripts/       # Interactive Python utilities
├── pile/              # Tauri + React desktop app (pnpm, Rust backend)
├── commandpreview/    # Minecraft Fabric mod (Kotlin, Gradle)
├── DamageTrackerMod/  # STS2 damage tracker mod (C#, .NET 9, Godot 5)
│   └── src/           # ModEntry, UI, Hooks, Data, Network modules
├── lapis/             # Block-level VCS for large binaries (Rust, Cargo)
│   └── src/           # chunking, crypto, fuse, index, repo, server, store, transfer, vcs
├── docs/              # Research & documentation
│   └── research/      # Lapis VCS risk mitigation docs
└── .opencode/         # OpenCode tooling config
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale config | `schale/frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Schale routes | `schale/frontend/src/pages` | File-based, i18n via `/en` `/ko` prefixes |
| Schale components | `schale/frontend/src/components` | Layouts + utilities (no `src/layouts/` dir) |
| Schale middleware | `schale/frontend/src/middleware.ts` | Security headers (CSP, HSTS) |
| Schale scripts | `schale/scripts` | Interactive Python helpers (stdin required) |
| Pile frontend | `pile/src` | React + shadcn/ui + Tailwind v4 |
| Pile backend | `pile/src-tauri/src` | Rust: SQLite DB, search, embeddings |
| CommandPreview | `commandpreview/src` | Kotlin Fabric mod (client-side) |
| DamageTrackerMod | `DamageTrackerMod/src` | C# STS2 mod (Harmony hooks, Godot 5) |
| Lapis VCS | `lapis/src` | Rust: fastcdc, BLAKE3, SQLite, Axum server |
| Lapis docs | `docs/research/` | Production risk mitigation analysis |
| CI workflows | `.github/workflows` | Docker publish + OpenCode agent/review |

## CONVENTIONS
- Conventional commits with optional scopes: `feat(schale):`, `fix(pile):`, `feat(lapis):`.
- One commit per feature or fix; keep diffs minimal.
- Each product has its own package manager: Schale=pnpm 10, Pile=pnpm 10, CommandPreview=Gradle, DamageTrackerMod=dotnet, Lapis=Cargo.
- No shared root `package.json`; monorepo structure is organizational only.
- Font assets in `schale/frontend/public/fonts` are ~1.5 GB; avoid moving.

## ANTI-PATTERNS (THIS PROJECT)
- Do not commit `.venv`, `dist/`, `build/`, `target/`, `run/`, `node_modules/`.
- Do not assume Python scripts work non-interactively (they read from `input()`).
- Do not use Prettier — project uses `oxfmt` for formatting.
- Do not create `src/layouts/` in Schale — layouts live in `src/components/`.

## COMMANDS
```bash
# Schale (Astro)
cd schale/frontend
pnpm dev              # Dev server
pnpm build            # astro check + astro build
pnpm lint             # oxlint + eslint
pnpm format           # oxfmt
yarn build            # astro check + astro build
yarn lint             # oxlint + eslint
yarn format           # oxfmt

# Pile (Tauri)
cd pile
pnpm dev              # Vite dev server
pnpm tauri dev        # Tauri dev (frontend + Rust)
pnpm test             # vitest

# CommandPreview (Fabric)
cd commandpreview
./gradlew build       # Build mod JAR

# DamageTrackerMod (STS2)
cd DamageTrackerMod
dotnet build          # Build mod DLL

# Lapis (VCS)
cd lapis
cargo build           # Build library + CLI
cargo run -- --help   # CLI help
cargo test            # Run tests
```

## NOTES
- Schale production drafts blocked when `date` is `0` in content pages.
- News pages (`/data/news/*`) excluded from sitemap via filter in `astro.config.mjs`.
- Schale SSR serves on port 4321; Docker image uses non-root user (UID 1001).
- Schale supports Tor via `onion-location` header in `base.astro`.
- CI Docker publish gated by `env.ACT != 'true'` (blocks local Act testing).
- Agent workflows trigger on `/crystal` (PR/issue) and `/review` (PR) comment mentions.
