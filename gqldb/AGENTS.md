<!-- Parent: ../AGENTS.md -->
# GQLDB

## OVERVIEW
Rust GraphQL database workspace with server crate and Python/TypeScript SDKs.

## STRUCTURE
```
gqldb/
├── crates/      # Rust workspace crates
├── sdk/         # Python + TypeScript SDKs
├── docs/        # Architecture and SDK docs
└── examples/    # Usage examples
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Workspace config | `Cargo.toml` | Members + shared deps |
| Server entry | `crates/server/src/main.rs` | Axum + async-graphql server |
| Core types | `crates/core/src/lib.rs` | Central DB APIs |
| Storage | `crates/storage/src/lib.rs` | Storage engine |
| Planner | `crates/planner/src/lib.rs` | Query planning |
| Executor | `crates/executor/src/lib.rs` | Query execution |
| Schema | `crates/schema/src/lib.rs` | GraphQL schema helpers |
| SDK (Python) | `sdk/python` | Python client package |
| SDK (TypeScript) | `sdk/typescript` | TypeScript client package |

## CONVENTIONS
- Workspace dependencies are defined in `Cargo.toml`; crates should use `workspace = true`.
- Server is run via `cargo run -p gqldb-server` from `gqldb/`.
- Tests live under `crates/*/tests` and SDK `tests/` folders.

## ANTI-PATTERNS
- Do not edit crate dependency versions in individual `crates/*/Cargo.toml` files; update workspace deps.
- Do not commit Rust build outputs like `target/`.
