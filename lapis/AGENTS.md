<!-- Parent: ../AGENTS.md -->
# LAPIS

## OVERVIEW
Block-level VCS for large binaries: content-defined chunking (fastcdc), BLAKE3 hashing, SQLite storage, FUSE mount, Axum server.

## STRUCTURE
```
lapis/
├── src/
│   ├── main.rs           # CLI entry (clap commands)
│   ├── lib.rs            # Library exports
│   ├── cli/              # 21 CLI command handlers
│   ├── chunking/         # fastcdc content-defined chunking
│   ├── crypto/           # BLAKE3 hashing, signing (optional)
│   ├── store/            # SQLite blob storage
│   ├── index/            # File index tracking
│   ├── repo/             # Repository management
│   ├── vcs/              # Core VCS operations
│   ├── transfer/         # Push/pull/clone protocols
│   ├── server/           # Axum HTTP server
│   └── fuse/             # FUSE filesystem mount
├── Cargo.toml            # Edition 2021, LTO release profile
└── tests/                # Integration tests (inline)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| CLI commands | `src/cli/` | init, add, commit, push, pull, clone, etc. |
| Chunking logic | `src/chunking/` | fastcdc v3.2 implementation |
| Hashing | `src/crypto/` | BLAKE3 with rayon parallelism |
| Storage | `src/store/` | SQLite via sqlx async |
| HTTP API | `src/server/` | Axum routes for remote sync |
| FUSE mount | `src/fuse/` | Mount repo as filesystem |
| Build config | `Cargo.toml` | Features: signing (sigstore) |

## CONVENTIONS
- Edition 2021, async runtime: tokio multi-threaded.
- Release profile: LTO enabled for performance.
- Tests inline in source files (#[cfg(test)]).
- Optional `signing` feature for sigstore integration.

## COMMANDS
```bash
cargo build                # Debug build
cargo build --release      # Release (LTO enabled)
cargo run -- --help        # CLI help
cargo run -- init          # Initialize repo
cargo run -- add <file>    # Add file to index
cargo run -- commit        # Create commit
cargo test                 # Run tests
```
