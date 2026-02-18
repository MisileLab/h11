<!-- Parent: ../AGENTS.md -->
# PILE

## OVERVIEW
Tauri 2 desktop app: React 19 frontend (pnpm, Vite, shadcn/ui) + Rust backend (SQLite, embeddings, search).

## STRUCTURE
```
pile/
├── src/              # React frontend
│   ├── pages/        # PileWindow, CaptureBar
│   ├── components/   # shadcn/ui components
│   ├── lib/          # Shared utilities
│   ├── __tests__/    # vitest + testing-library
│   └── styles/       # CSS
├── src-tauri/
│   └── src/          # Rust backend
│       ├── lib.rs    # Tauri commands + app setup
│       ├── db.rs     # SQLite database layer
│       ├── search.rs # Search functionality
│       └── embedding.rs # Embedding generation
├── vite.config.ts
├── vitest.config.ts
└── components.json   # shadcn/ui config
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Frontend entry | `src/main.tsx` | React root |
| Main window | `src/pages/PileWindow.tsx` | Primary UI (240 lines) |
| Capture bar | `src/pages/CaptureBar.tsx` | Secondary UI |
| Rust commands | `src-tauri/src/lib.rs` | Tauri command handlers |
| Database | `src-tauri/src/db.rs` | SQLite operations (488 lines) |
| Search | `src-tauri/src/search.rs` | Search logic (391 lines) |
| Tests | `src/__tests__/` | vitest + @testing-library/react |

## CONVENTIONS
- pnpm 10 as package manager.
- Tailwind v4 + shadcn/ui for component library.
- Path alias: `@/*` → `./src/*` (tsconfig).
- Tauri plugins: global-shortcut, positioner, clipboard-manager.
- `src-tauri/src/main.rs` line 1: `DO NOT REMOVE` comment (Windows subsystem directive).

## COMMANDS
```bash
pnpm dev          # Vite dev server
pnpm tauri dev    # Full Tauri dev (frontend + Rust)
pnpm test         # vitest run
pnpm build        # tsc + vite build
```
