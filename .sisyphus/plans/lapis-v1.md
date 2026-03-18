# Lapis v1 — Block-Level VCS Implementation Plan

## TL;DR
> **Summary**: Implement a block-level version control system for large binary files (10GB+ models, video, assets) with BLAKE3 content-addressed storage, cross-repo deduplication, and chunk-level delta compression.
> **Deliverables**: CLI tool (init/add/commit/push/pull/clone/gc/scrub), local + S3 CAS, read-only FUSE, signed commits, resumable transfers
> **Effort**: XL (4 implementation phases with gates)
> **Parallel**: YES — 6-8 tasks per wave within phases
> **Critical Path**: Phase 0 Core → Phase 1 Remote → Phase 2 Optimization → Phase 3 Advanced

## Context

### Original Request
Implement Lapis — a content-defined, block-level version control system for binary files with hot/cold tiering, global deduplication, and XET-style cross-repo sharing using BLAKE3 for all content addressing.

### Interview Summary
- **Language**: Rust (standalone crate at `lapis/`)
- **Delta**: qbsdiff (MIT) — **chunk-level only** (file-level needs 50GB RAM for 10GB)
- **Scope**: Hardened MVP + cross-repo CAS + delta chains; excludes writable FUSE, watch mode
- **FUSE**: Read-only (fuse3 for Linux, fuser as fallback for macOS)
- **Test Strategy**: TDD with proptest property-based testing
- **CAS Model**: Server-coordinated (HTTP API)
- **SQLite**: sqlx async with single-writer + read-pool pattern

### Metis Review (Critical Findings Addressed)

| Finding | Severity | Resolution |
|---------|----------|------------|
| qbsdiff OOM on 10GB files | CRITICAL | Delta operates at **chunk-level** (8KB-256KB), never file-level |
| fuse3 Linux-only | HIGH | Use `fuser` crate for cross-platform, or defer FUSE to Phase 3 |
| SQLite write contention | HIGH | Single-writer connection + app-level queue + `busy_timeout=5000` |
| Missing phasing | HIGH | 4 phases with gates: Core → Remote → Optimization → Advanced |
| No acceptance criteria | HIGH | Every task has executable shell command criteria |

---

## Work Objectives

### Core Objective
Build a production-ready block-level VCS that can handle 10GB+ binary files with:
- Content-addressed storage using BLAKE3 hashing
- FastCDC chunking with configurable sizes (min: 64KB, avg: 256KB, max: 1MB)
- Cross-repo deduplication via server-coordinated CAS
- Chunk-level delta compression with bounded chains (max depth: 5)
- Crash-consistent operations with resumable transfers

### Deliverables

| Phase | Commands | Storage | Features |
|-------|----------|---------|----------|
| 0: Core | `init`, `add`, `commit`, `status`, `log` | Local CAS only | Basic chunking, manifest, SQLite metadata |
| 1: Remote | `push`, `pull`, `clone` | Local + HTTP server | Resumable transfers, block negotiation |
| 2: Optimization | — | Hot/cold tiers, S3 backend | Delta compression, zstd cold, GC |
| 3: Advanced | `branch`, `tag`, `gc`, `scrub`, FUSE | Full stack | Signing, scrubbing, read-only mount |

### Definition of Done (verifiable conditions)
```bash
# Phase 0 Gate
lapis init test-repo && cd test-repo
dd if=/dev/urandom of=test.bin bs=1M count=100
time lapis add test.bin                    # < 5s for 100MB
lapis commit -m "initial"                  # < 1s
lapis status                               # clean
lapis log --oneline                        # shows commit
lapis checkout HEAD -- test.bin            # restores file
blake3sum test.bin test.bin.restored       # hashes match

# Phase 1 Gate
lapis clone http://localhost:8080/repo clone-test  # works
lapis push origin                                  # uploads blocks
lapis pull origin                                  # downloads missing

# Phase 2 Gate
lapis gc --dry-run                          # reports candidates
lapis tier cold --older-than 1d             # moves blocks

# Phase 3 Gate
lapis scrub                                 # verifies all blocks
lapis verify <commit>                       # checks signature
lapis mount /mnt/lapis                      # FUSE works
```

### Must Have
- Streaming chunking (never load full file into memory)
- Single SQLite writer with busy_timeout
- Chunk-level delta (max 256MB per delta operation)
- Crash recovery via atomic journal writes
- Property-based tests for all data transformations

### Must NOT Have (Guardrails)
- **NO** file-level delta compression (OOM risk)
- **NO** connection pool for SQLite writes (20-100x performance cliff)
- **NO** writable FUSE in v1 (race conditions)
- **NO** S3 backend before local CAS works end-to-end
- **NO** Sigstore blocking v1 (feature-flag it)
- **NO** LMDB (single SQLite authority only)

---

## Verification Strategy

> ZERO HUMAN INTERVENTION — all verification is agent-executed.

- **Test decision**: TDD (RED-GREEN-REFACTOR) + proptest property tests
- **Frameworks**: 
  - Unit: `#[test]` + `proptest`
  - Integration: `assert_cmd` for CLI
  - Benchmark: `criterion`
- **QA policy**: Every task has agent-executed scenarios with shell commands
- **Evidence**: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

---

## Execution Strategy

### Implementation Phases (Gates)

| Phase | Scope | Gate Criteria |
|-------|-------|---------------|
| **0: Core** | init, add, commit, status, log, local CAS | Round-trip add→commit→checkout verified |
| **1: Remote** | push, pull, clone, HTTP server, resumable | Cross-machine push/pull works |
| **2: Optimization** | Delta, hot/cold tiers, zstd, GC | Dedup ratio > 50%, GC safety tests pass |
| **3: Advanced** | branch, tag, scrub, FUSE, signing | Full acceptance suite passes |

### Parallel Execution Waves
> Target: 5-8 tasks per wave. Extract shared dependencies as Wave-1.

### Dependency Matrix (Key Dependencies)
```
Phase 0:
  CLI setup → Chunking → CAS → Manifest → Commit → Status/Log

Phase 1:
  Phase 0 → HTTP Protocol → Server → Push/Pull/Clone → Resumable

Phase 2:
  Phase 1 → Delta Detection → Delta Compression → Tiering → GC

Phase 3:
  Phase 2 → Branch/Tag → Scrubbing → FUSE → Signing
```

### Agent Dispatch Summary
- Phase 0: ~20 tasks across 4 waves
- Phase 1: ~12 tasks across 2 waves
- Phase 2: ~15 tasks across 3 waves
- Phase 3: ~12 tasks across 2 waves

---

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

### Phase 0: Core VCS (Local Only)

#### Wave 1: Project Foundation (6 tasks, parallel)

- [x] 1. Project Scaffolding and Cargo.toml

  **What to do**: Create `lapis/` directory with Cargo.toml, src/lib.rs, src/main.rs, and basic CLI structure with clap.
  **Must NOT do**: Add dependencies not needed for Phase 0; create workspace configuration.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Standard project setup
  - Skills: [] — No special skills needed
  - Omitted: [`git-master`] — Single initial commit, no complex git work

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [2-6] | Blocked By: []

  **References**:
  - Pattern: `pile/src-tauri/Cargo.toml` — Rust dependency structure
  - Pattern: `pile/src-tauri/src/lib.rs:1-10` — Module organization

  **Acceptance Criteria** (agent-executable only):
  - [ ] `cd lapis && cargo build` succeeds
  - [ ] `cd lapis && cargo test` runs (even if no tests)
  - [ ] `./target/debug/lapis --help` shows usage

  **QA Scenarios**:
  ```
  Scenario: Build succeeds
    Tool: Bash
    Steps: cd lapis && cargo build --release
    Expected: exit code 0, binary at target/release/lapis
    Evidence: .sisyphus/evidence/task-01-build.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): initial project scaffolding` | Files: `lapis/Cargo.toml, lapis/src/main.rs, lapis/src/lib.rs`

---

- [x] 2. Error Handling Types with thiserror/anyhow

  **What to do**: Define error types for the library using `thiserror`, CLI errors using `anyhow`. Create `src/error.rs`.
  **Must NOT do**: Use `Box<dyn Error>` (pile pattern) — this is a standalone crate.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Standard error type definitions
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3-20] | Blocked By: [1]

  **References**:
  - External: `https://docs.rs/thiserror/latest/thiserror/` — thiserror patterns
  - External: `https://docs.rs/anyhow/latest/anyhow/` — anyhow for CLI

  **Acceptance Criteria**:
  - [ ] `src/error.rs` defines `LapisError` enum with variants for: Io, Chunking, Hash, Cas, Metadata, Commit
  - [ ] `impl From<std::io::Error> for LapisError` exists
  - [ ] `cargo test error::` passes

  **QA Scenarios**:
  ```
  Scenario: Error conversion works
    Tool: Bash
    Steps: cargo test error::
    Expected: all tests pass, From implementations work
    Evidence: .sisyphus/evidence/task-02-errors.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add error types with thiserror` | Files: `lapis/src/error.rs`

---

- [x] 3. BLAKE3 Hashing Module

  **What to do**: Create `src/crypto/blake3.rs` with hashing functions. Support streaming via `Hasher`, parallel via `update_rayon`, and keyed mode for attestation.
  **Must NOT do**: Load entire files into memory; hash must stream.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Well-defined API, straightforward implementation
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 5, 7] | Blocked By: [1]

  **References**:
  - External: `https://docs.rs/blake3/latest/blake3/` — Official BLAKE3 docs
  - API: `blake3::Hasher::new()`, `update()`, `finalize()`, `update_rayon()`

  **Acceptance Criteria**:
  - [ ] `hash_bytes(data: &[u8]) -> [u8; 32]` function exists
  - [ ] `hash_stream(reader: impl Read) -> Result<[u8; 32]>` exists
  - [ ] `hash_file(path: &Path) -> Result<[u8; 32]>` exists
  - [ ] Property test: `hash_bytes(x) == hash_bytes(x)` for all x

  **QA Scenarios**:
  ```
  Scenario: Streaming hash matches bulk hash
    Tool: Bash
    Steps: cargo test blake3::test_streaming
    Expected: hash of 1MB via stream == hash of 1MB via bytes
    Evidence: .sisyphus/evidence/task-03-blake3.{log}

  Scenario: Parallel hash is faster for large input
    Tool: Bash
    Steps: cargo test blake3::bench_parallel -- --nocapture
    Expected: update_rayon faster than update for >128KB
    Evidence: .sisyphus/evidence/task-03-blake3-parallel.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add BLAKE3 hashing module` | Files: `lapis/src/crypto/mod.rs, lapis/src/crypto/blake3.rs`

---

- [x] 4. FastCDC Chunking Module

  **What to do**: Create `src/chunking/fastcdc.rs` using `fastcdc` crate v3.2.1. Configure: min=64KB, avg=256KB, max=1MB. Stream files, never buffer entire file.
  **Must NOT do**: Load entire file into memory; use v2016 API (use v2020).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Library integration, well-defined API
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7] | Blocked By: [1, 3]

  **References**:
  - External: `https://docs.rs/fastcdc/latest/fastcdc/v2020/` — FastCDC v2020 API
  - Pattern: Iterator-based streaming, zero allocation

  **Acceptance Criteria**:
  - [ ] `chunk_file(path: &Path) -> Result<Vec<Chunk>>` exists
  - [ ] `Chunk` struct has: offset, length, hash (BLAKE3)
  - [ ] 100MB file produces ~400 chunks (256KB avg)
  - [ ] Property test: `reconstruct(chunks) == original`

  **QA Scenarios**:
  ```
  Scenario: Chunk size distribution is correct
    Tool: Bash
    Steps: cargo test chunking::test_size_distribution
    Expected: avg chunk size within 200KB-300KB for varied input
    Evidence: .sisyphus/evidence/task-04-chunking-sizes.{log}

  Scenario: Deterministic chunking
    Tool: Bash
    Steps: cargo test chunking::test_deterministic
    Expected: same file chunked twice produces identical chunk boundaries
    Evidence: .sisyphus/evidence/task-04-chunking-deterministic.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add FastCDC chunking module` | Files: `lapis/src/chunking/mod.rs, lapis/src/chunking/fastcdc.rs`

---

- [x] 5. SQLite Metadata Schema and Connection

  **What to do**: Create `src/index/sqlite.rs` with schema initialization. Tables: blocks, manifests, commits, reflog. Use sqlx async with single-writer pattern. Set `busy_timeout=5000`.
  **Must NOT do**: Use connection pool for writes; omit busy_timeout.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard SQLite setup with known patterns
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7, 8, 9, 10] | Blocked By: [1, 2]

  **References**:
  - Pattern: `pile/src-tauri/src/db.rs:36-83` — SQLite init pattern (adapt to sqlx)
  - Critical: Single writer via `tokio::sync::Mutex<SqliteConnection>`
  - Critical: `PRAGMA busy_timeout=5000` on all connections

  **Acceptance Criteria**:
  - [ ] Schema has: blocks(hash, size, zone, refcount, created_at), manifests(hash, file_path, chunk_list), commits(hash, parent, manifest_hash, timestamp, message), reflog(id, commit_hash, action, timestamp)
  - [ ] `init_db(path: &Path) -> Result<MetadataStore>` exists
  - [ ] WAL mode enabled: `PRAGMA journal_mode=WAL`
  - [ ] busy_timeout set: `PRAGMA busy_timeout=5000`

  **QA Scenarios**:
  ```
  Scenario: Schema initializes correctly
    Tool: Bash
    Steps: cargo test sqlite::test_init_schema
    Expected: all tables created, WAL mode active
    Evidence: .sisyphus/evidence/task-05-sqlite-schema.{log}

  Scenario: Busy timeout prevents lock errors
    Tool: Bash
    Steps: cargo test sqlite::test_concurrent_access
    Expected: 10 concurrent writers don't fail with SQLITE_BUSY
    Evidence: .sisyphus/evidence/task-05-sqlite-concurrent.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add SQLite metadata store` | Files: `lapis/src/index/mod.rs, lapis/src/index/sqlite.rs`

---

- [x] 6. CLI Framework with clap

  **What to do**: Create `src/cli/mod.rs` with clap derive macros. Commands: init, add, commit, status, log. Subcommand pattern.
  **Must NOT do**: Add commands for Phase 1+ (push, pull, clone, etc.)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Standard clap setup
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [11-15] | Blocked By: [1]

  **References**:
  - External: `https://docs.rs/clap/latest/clap/_derive/` — clap derive tutorial

  **Acceptance Criteria**:
  - [ ] `lapis init <path>` command defined
  - [ ] `lapis add <path>` command defined
  - [ ] `lapis commit -m <message>` command defined
  - [ ] `lapis status` command defined
  - [ ] `lapis log` command defined
  - [ ] `lapis --help` shows all commands

  **QA Scenarios**:
  ```
  Scenario: CLI help works
    Tool: Bash
    Steps: ./target/debug/lapis --help
    Expected: shows init, add, commit, status, log commands
    Evidence: .sisyphus/evidence/task-06-cli-help.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add CLI framework with clap` | Files: `lapis/src/cli/mod.rs`

---

#### Wave 2: CAS Storage Layer (5 tasks, parallel after Wave 1)

- [x] 7. Content-Addressable Storage (CAS) Core

  **What to do**: Create `src/store/cas.rs` with block storage. Layout: `store/hot/{prefix}/{hash}`. Operations: put, get, exists, delete. Verify hash on read.
  **Must NOT do**: Store blocks without verifying hash matches content.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard file I/O with hash verification
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8, 9, 11] | Blocked By: [3, 4, 5]

  **References**:
  - Pattern: `store/hot/ca/fe/cafebabe1234...` — Two-char prefix directories
  - Critical: Re-hash after write to verify integrity

  **Acceptance Criteria**:
  - [ ] `CasStore::new(path: &Path) -> Result<Self>` exists
  - [ ] `put(data: &[u8]) -> Result<[u8; 32]>` stores and returns hash
  - [ ] `get(hash: &[u8; 32]) -> Result<Vec<u8>>` retrieves and verifies
  - [ ] `exists(hash: &[u8; 32]) -> bool` checks presence
  - [ ] Property test: `get(put(x)) == x` for all x

  **QA Scenarios**:
  ```
  Scenario: CAS round-trip works
    Tool: Bash
    Steps: cargo test cas::test_round_trip
    Expected: store 1MB, retrieve, hashes match
    Evidence: .sisyphus/evidence/task-07-cas-roundtrip.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add CAS storage layer` | Files: `lapis/src/store/mod.rs, lapis/src/store/cas.rs`

---

- [x] 8. Manifest Builder

  **What to do**: Create `src/vcs/manifest.rs` to map file paths to ordered chunk hashes. Manifest stored as JSON in CAS. Include: file_path, chunk_hashes, total_size, chunking_params.
  **Must NOT do**: Store chunk data in manifest (only hashes).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: JSON serialization with known structure
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9, 10] | Blocked By: [5, 7]

  **References**:
  - Spec: Manifest format from design doc (file → [block hash list] mapping)

  **Acceptance Criteria**:
  - [ ] `Manifest` struct with: file_path, chunk_hashes, total_size, chunking_params
  - [ ] `build(file_path: &Path, chunks: Vec<Chunk>) -> Manifest` exists
  - [ ] `serialize(manifest: &Manifest) -> Vec<u8>` produces canonical JSON
  - [ ] `deserialize(data: &[u8]) -> Result<Manifest>` parses JSON
  - [ ] Manifest hash is BLAKE3 of serialized JSON

  **QA Scenarios**:
  ```
  Scenario: Manifest round-trip works
    Tool: Bash
    Steps: cargo test manifest::test_round_trip
    Expected: serialize → deserialize produces identical manifest
    Evidence: .sisyphus/evidence/task-08-manifest-roundtrip.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add manifest builder` | Files: `lapis/src/vcs/mod.rs, lapis/src/vcs/manifest.rs`

---

- [x] 9. Commit Object

  **What to do**: Create `src/vcs/commit.rs`. Commit struct: hash, parent, manifest_hash, timestamp, message, signature (optional). Store in CAS.
  **Must NOT do**: Require signing in Phase 0 (feature-flag it).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: JSON serialization with timestamp
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [10, 15] | Blocked By: [5, 8]

  **References**:
  - Spec: Commit format from design doc

  **Acceptance Criteria**:
  - [ ] `Commit` struct with: hash, parent (Option), manifest_hash, timestamp, message, signature (Option)
  - [ ] `create(parent: Option<[u8; 32]>, manifest_hash: [u8; 32], message: &str) -> Commit` exists
  - [ ] Commit hash is BLAKE3 of canonical JSON (sorted keys)

  **QA Scenarios**:
  ```
  Scenario: Commit hash is deterministic
    Tool: Bash
    Steps: cargo test commit::test_deterministic_hash
    Expected: same inputs produce same commit hash
    Evidence: .sisyphus/evidence/task-09-commit-hash.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add commit object` | Files: `lapis/src/vcs/commit.rs`

---

- [x] 10. Repository Initialization (`lapis init`)

  **What to do**: Implement `init` command. Creates `.lapis/` directory with: config.toml, store/, meta/index.db. Register initial empty commit.
  **Must NOT do**: Create repo in non-empty directory without --force.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Directory creation with known structure
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [11-15] | Blocked By: [5, 6]

  **References**:
  - Spec: Storage layout from design doc (store/, meta/, commits/, manifests/)

  **Acceptance Criteria**:
  - [ ] `lapis init <path>` creates `.lapis/` structure
  - [ ] `.lapis/config.toml` exists with default settings
  - [ ] `.lapis/store/hot/` directory exists
  - [ ] `.lapis/meta/index.db` is initialized SQLite
  - [ ] Initial commit (hash: all-zeros sentinel) is registered

  **QA Scenarios**:
  ```
  Scenario: Init creates valid repo
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      test -d .lapis/store/hot && test -f .lapis/meta/index.db
    Expected: exit code 0
    Evidence: .sisyphus/evidence/task-10-init.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement init command` | Files: `lapis/src/cli/init.rs, lapis/src/repo.rs`

---

- [x] 11. ZSTD Compression Module

  **What to do**: Create `src/store/compression.rs` with zstd streaming. Functions: compress_block, decompress_block. Level 22 for cold tier.
  **Must NOT do**: Compress blocks in hot tier (Phase 0 is hot-only).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: zstd API is straightforward
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [Phase 2 tiering] | Blocked By: [7]

  **References**:
  - External: `https://docs.rs/zstd/latest/zstd/stream/` — zstd streaming API

  **Acceptance Criteria**:
  - [ ] `compress(data: &[u8], level: i32) -> Result<Vec<u8>>` exists
  - [ ] `decompress(data: &[u8]) -> Result<Vec<u8>>` exists
  - [ ] Property test: `decompress(compress(x, level)) == x` for all x, level

  **QA Scenarios**:
  ```
  Scenario: Compression round-trip works
    Tool: Bash
    Steps: cargo test compression::test_round_trip
    Expected: compress/decompress returns original data
    Evidence: .sisyphus/evidence/task-11-compression.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add zstd compression module` | Files: `lapis/src/store/compression.rs`

---

#### Wave 3: VCS Commands (5 tasks, sequential dependency)

- [x] 12. `lapis add` Command

  **What to do**: Implement `add` command. Chunk file with FastCDC, hash chunks with BLAKE3, store in CAS, update staging area.
  **Must NOT do**: Commit (that's `commit` command); load entire file into memory.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Combines existing modules
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [13] | Blocked By: [4, 7, 8, 10]

  **References**:
  - Modules: chunking/fastcdc, crypto/blake3, store/cas, vcs/manifest

  **Acceptance Criteria**:
  - [ ] `lapis add <file>` chunks file, stores blocks, records in staging
  - [ ] Staging area in `.lapis/staging.json`
  - [ ] Memory usage < 256MB for 1GB file (streaming)
  - [ ] Progress output for files > 100MB

  **QA Scenarios**:
  ```
  Scenario: Add stores blocks correctly
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      dd if=/dev/urandom of=test.bin bs=1M count=100
      lapis add test.bin
      ls .lapis/store/hot/*/* | wc -l
    Expected: ~400 blocks
    Evidence: .sisyphus/evidence/task-12-add.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement add command` | Files: `lapis/src/cli/add.rs`

---

- [x] 13. `lapis commit` Command

  **What to do**: Implement `commit` command. Read staging, build commit from manifests, store commit, update HEAD reflog, clear staging.
  **Must NOT do**: Allow empty commits; commit unstaged files.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Combines existing modules
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [14, 15, 16] | Blocked By: [9, 12]

  **References**:
  - Modules: vcs/commit, vcs/manifest, index/sqlite

  **Acceptance Criteria**:
  - [ ] `lapis commit -m "message"` creates commit from staging
  - [ ] Commit hash printed to stdout
  - [ ] HEAD reflog updated, staging cleared
  - [ ] Error if staging empty

  **QA Scenarios**:
  ```
  Scenario: Commit creates valid commit
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      echo "hello" > test.txt && lapis add test.txt
      lapis commit -m "initial"
      lapis log --oneline
    Expected: shows commit with "initial"
    Evidence: .sisyphus/evidence/task-13-commit.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement commit command` | Files: `lapis/src/cli/commit.rs`

---

- [x] 14. `lapis status` Command

  **What to do**: Implement `status` command. Show: staged files, modified but unstaged, untracked. Compare working dir to HEAD.
  **Must NOT do**: Modify any state.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Read-only comparison
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [] | Blocked By: [12, 13]

  **Acceptance Criteria**:
  - [ ] Shows staged files, modified unstaged, untracked
  - [ ] Shows "clean" if nothing to report

  **QA Scenarios**:
  ```
  Scenario: Status shows correct state
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      echo "hello" > test.txt && lapis add test.txt
      lapis status
    Expected: shows test.txt as staged
    Evidence: .sisyphus/evidence/task-14-status.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement status command` | Files: `lapis/src/cli/status.rs`

---

- [x] 15. `lapis log` Command

  **What to do**: Implement `log` command. Walk commit history from HEAD. Support `--oneline`, `--limit N`.
  **Must NOT do**: Load full commit objects (just metadata).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Read-only traversal
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [] | Blocked By: [9, 13]

  **Acceptance Criteria**:
  - [ ] Shows all commits from HEAD to root
  - [ ] `--oneline` shows hash + message only
  - [ ] `--limit 5` shows at most 5 commits

  **QA Scenarios**:
  ```
  Scenario: Log shows commit history
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      echo "v1" > f && lapis add f && lapis commit -m "first"
      echo "v2" > f && lapis add f && lapis commit -m "second"
      lapis log --oneline
    Expected: 2 commits shown
    Evidence: .sisyphus/evidence/task-15-log.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement log command` | Files: `lapis/src/cli/log.rs`

---

- [x] 16. `lapis checkout` Command

  **What to do**: Implement `checkout` to restore files from commit. Read manifest, fetch chunks, reconstruct file.
  **Must NOT do**: Overwrite without warning; fail on missing chunks.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Combines manifest + CAS
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [] | Blocked By: [8, 13]

  **Acceptance Criteria**:
  - [ ] `lapis checkout HEAD -- file.txt` restores from HEAD
  - [ ] Restored file hash matches original
  - [ ] Error if file not in commit

  **QA Scenarios**:
  ```
  Scenario: Checkout restores correct content
    Tool: Bash
    Steps: |
      cd $(mktemp -d) && lapis init .
      echo "original" > f && lapis add f && lapis commit -m "v1"
      echo "modified" > f && lapis checkout HEAD -- f && cat f
    Expected: "original"
    Evidence: .sisyphus/evidence/task-16-checkout.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement checkout command` | Files: `lapis/src/cli/checkout.rs`

---

### Phase 1: Remote Operations (Server + Push/Pull/Clone)

#### Wave 4: HTTP Server and Protocol (4 tasks)

- [x] 17. HTTP Server Foundation

  **What to do**: Create `src/server/mod.rs` with axum/actix-web. Endpoints: `GET /blocks/{hash}`, `POST /blocks/check`, `POST /blocks`. Port configurable.
  **Must NOT do**: Implement auth in Phase 1 (bearer token only).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard HTTP server
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [18-20] | Blocked By: [7]

  **Acceptance Criteria**:
  - [ ] Server starts on configurable port
  - [ ] `GET /blocks/{hash}` returns block or 404
  - [ ] `POST /blocks/check` returns which hashes exist
  - [ ] `POST /blocks` uploads block

  **QA Scenarios**:
  ```
  Scenario: Server responds to block requests
    Tool: Bash
    Steps: lapis server --port 8765 &
           curl http://localhost:8765/blocks/nonexistent
    Expected: 404 response
    Evidence: .sisyphus/evidence/task-17-server.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add HTTP block server` | Files: `lapis/src/server/mod.rs`

---

- [x] 18. Block Check-Before-Upload Protocol

  **What to do**: Implement `POST /blocks/check` that takes array of hashes, returns subset that server needs. Client only uploads missing blocks.
  **Must NOT do**: Upload blocks that server already has.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: JSON request/response
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [19] | Blocked By: [17]

  **Acceptance Criteria**:
  - [ ] Request: `{"hashes": ["abc123", "def456"]}`
  - [ ] Response: `{"needed": ["abc123"]}` (only missing)
  - [ ] Handles 10,000 hashes in < 1s

  **QA Scenarios**:
  ```
  Scenario: Check returns only missing blocks
    Tool: Bash
    Steps: curl -X POST http://localhost:8765/blocks/check -d '{"hashes":["a","b"]}'
    Expected: only returns hashes not in CAS
    Evidence: .sisyphus/evidence/task-18-check.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add block check protocol` | Files: `lapis/src/server/protocol.rs`

---

- [x] 19. Resumable Transfer Journal

  **What to do**: Create `src/transfer/journal.rs`. Track upload progress in `.lapis/transfer/`. Survive crash; resume on retry.
  **Must NOT do**: Lose progress on crash (atomic writes).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: JSON journal with atomic rename
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [20] | Blocked By: [18]

  **Acceptance Criteria**:
  - [ ] Journal tracks: upload_id, total_blocks, uploaded_hashes, started_at
  - [ ] Write to temp file, fsync, rename (atomic)
  - [ ] Resume skips already-uploaded blocks

  **QA Scenarios**:
  ```
  Scenario: Resume after crash
    Tool: Bash
    Steps: |
      # Start push, kill mid-way, resume
      lapis push origin &
      sleep 2 && kill -9 $!
      lapis push origin
    Expected: resumes from journal, completes
    Evidence: .sisyphus/evidence/task-19-journal.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add resumable transfer journal` | Files: `lapis/src/transfer/journal.rs`

---

- [x] 20. `lapis push` and `lapis pull` Commands

  **What to do**: Implement push (upload blocks + commit) and pull (download blocks + checkout). Use check-before-upload, resumable journal.
  **Must NOT do**: Push without checking remote; pull without verifying hashes.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Client-side of server protocol
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [21] | Blocked By: [17, 18, 19]

  **Acceptance Criteria**:
  - [ ] `lapis push origin` uploads only missing blocks
  - [ ] `lapis pull origin` downloads missing blocks
  - [ ] Both show progress bar
  - [ ] Both resume after interruption

  **QA Scenarios**:
  ```
  Scenario: Push and pull round-trip
    Tool: Bash
    Steps: |
      # Repo A pushes, Repo B pulls, content matches
      cd $(mktemp -d) && lapis init . && echo "test" > f
      lapis add f && lapis commit -m "t" && lapis push origin
      cd $(mktemp -d) && lapis clone http://localhost:8765/repo .
      cat f
    Expected: "test"
    Evidence: .sisyphus/evidence/task-20-push-pull.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement push and pull commands` | Files: `lapis/src/cli/push.rs, lapis/src/cli/pull.rs`

---

- [x] 21. `lapis clone` Command

  **What to do**: Implement clone. Download manifests and commits, lazy-fetch blocks on checkout. Support `--depth N` shallow clone.
  **Must NOT do**: Download all blocks eagerly (lazy unless --full).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Combines pull + init
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [] | Blocked By: [20]

  **Acceptance Criteria**:
  - [ ] `lapis clone <url> <path>` creates local repo
  - [ ] `--depth 1` fetches only HEAD commit
  - [ ] Blocks fetched lazily on checkout

  **QA Scenarios**:
  ```
  Scenario: Shallow clone works
    Tool: Bash
    Steps: lapis clone http://localhost:8765/repo . --depth 1
    Expected: only HEAD commit in history
    Evidence: .sisyphus/evidence/task-21-clone.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement clone command` | Files: `lapis/src/cli/clone.rs`

---

### Phase 2: Optimization (Delta + Tiering + GC)

#### Wave 5: Delta Compression (3 tasks)

- [x] 22. Chunk Similarity Detection

  **What to do**: Create `src/index/similarity.rs` using MinHash. Detect similar chunks between versions for delta candidates.
  **Must NOT do**: Compare all chunks O(n²); use LSH for O(n).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Standard MinHash implementation
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: [23] | Blocked By: [4]

  **Acceptance Criteria**:
  - [ ] `find_similar(hash: [u8; 32], threshold: f64) -> Vec<[u8; 32]>` exists
  - [ ] Similarity threshold configurable (default 0.3)
  - [ ] Index updated on every chunk write

  **QA Scenarios**:
  ```
  Scenario: Similar chunks detected
    Tool: Bash
    Steps: cargo test similarity::test_detection
    Expected: chunks with 70%+ overlap are found
    Evidence: .sisyphus/evidence/task-22-similarity.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add chunk similarity detection` | Files: `lapis/src/index/similarity.rs`

---

- [x] 23. Chunk-Level Delta Compression

  **What to do**: Create `src/chunking/delta.rs` using qbsdiff. Delta between similar chunks (max 256MB per delta). Store delta in CAS with base reference.
  **Must NOT do**: Delta files > 256MB (OOM risk); create delta chains > 5 deep.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Library integration
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: [24] | Blocked By: [22]

  **References**:
  - Critical: Chunk-level only, never file-level (50GB RAM risk)

  **Acceptance Criteria**:
  - [ ] `compute_delta(base: &[u8], target: &[u8]) -> Result<Delta>` exists
  - [ ] `apply_delta(base: &[u8], delta: &Delta) -> Result<Vec<u8>>` exists
  - [ ] Rejects inputs > 256MB with error
  - [ ] Max chain depth = 5, rebases if exceeded

  **QA Scenarios**:
  ```
  Scenario: Delta round-trip is lossless
    Tool: Bash
    Steps: cargo test delta::test_round_trip
    Expected: apply_delta(base, compute_delta(base, target)) == target
    Evidence: .sisyphus/evidence/task-23-delta.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add chunk-level delta compression` | Files: `lapis/src/chunking/delta.rs`

---

- [x] 24. Hot/Cold Tiering Worker

  **What to do**: Create `src/store/tiering.rs`. Move blocks hot → cold based on age and access count. Compress with zstd:22 on move.
  **Must NOT do**: Move blocks still in working tree; lose blocks during migration.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Background worker with rules
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: [25] | Blocked By: [11]

  **Acceptance Criteria**:
  - [ ] `tier_cold(older_than: Duration, min_access: u32)` moves blocks
  - [ ] Cold blocks stored compressed at `store/cold/{prefix}/{hash}`
  - [ ] Metadata updated: zone='cold', compress_algo='zstd:22'
  - [ ] Decompress transparently on read

  **QA Scenarios**:
  ```
  Scenario: Tiering moves cold blocks
    Tool: Bash
    Steps: |
      lapis tier cold --older-than 1s
      ls .lapis/store/cold/*/* | wc -l
    Expected: blocks moved to cold
    Evidence: .sisyphus/evidence/task-24-tiering.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add hot/cold tiering` | Files: `lapis/src/store/tiering.rs`

---

#### Wave 6: Garbage Collection (2 tasks)

- [x] 25. Reflog and Mark Phase

  **What to do**: Create `src/vcs/reflog.rs`. Track HEAD movements. GC mark phase walks reachable commits, marks live chunks.
  **Must NOT do**: Delete blocks reachable from reflog within grace period.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Graph traversal
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 6 | Blocks: [26] | Blocked By: [9]

  **Acceptance Criteria**:
  - [ ] Reflog stores: timestamp, commit_hash, action
  - [ ] `mark_live(grace_period: Duration) -> HashSet<Hash>` returns live chunks
  - [ ] Walks all branches, tags, and reflog entries

  **QA Scenarios**:
  ```
  Scenario: Reflog protects recent commits
    Tool: Bash
    Steps: cargo test reflog::test_protection
    Expected: chunks from commits < grace period are marked live
    Evidence: .sisyphus/evidence/task-25-reflog.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add reflog and mark phase` | Files: `lapis/src/vcs/reflog.rs`

---

- [x] 26. `lapis gc` Command

  **What to do**: Implement `gc` command. Mark live chunks, sweep unreachable, delete from CAS and SQLite. Support `--dry-run`, `--grace-period`.
  **Must NOT do**: Run concurrently with push/pull without coordination.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Combines mark + sweep
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: NO | Wave 6 | Blocks: [] | Blocked By: [25]

  **Acceptance Criteria**:
  - [ ] `lapis gc --dry-run` reports candidates without deleting
  - [ ] `lapis gc` deletes unreachable blocks
  - [ ] Cross-repo refcount checked (if CAS server)
  - [ ] Delta chains rebased before deleting base

  **QA Scenarios**:
  ```
  Scenario: GC removes unreachable blocks
    Tool: Bash
    Steps: |
      lapis add f && lapis commit -m "v1"
      lapis add f && lapis commit -m "v2"
      lapis checkout HEAD~1 -- f && lapis gc
      ls .lapis/store/hot/*/* | wc -l
    Expected: only live blocks remain
    Evidence: .sisyphus/evidence/task-26-gc.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement gc command` | Files: `lapis/src/cli/gc.rs`

---

### Phase 3: Advanced Features

#### Wave 7: Branching, Scrubbing, FUSE (4 tasks)

- [x] 27. `lapis branch` and `lapis tag` Commands

  **What to do**: Implement branch (mutable ref) and tag (immutable ref). Store in SQLite. Support create, list, delete.
  **Must NOT do**: Allow deleting current branch; allow tag mutation.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Ref management
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 7 | Blocks: [] | Blocked By: [13]

  **Acceptance Criteria**:
  - [ ] `lapis branch <name>` creates branch at HEAD
  - [ ] `lapis tag <name>` creates tag at HEAD
  - [ ] `lapis branch -d <name>` deletes branch (fails if current)
  - [ ] Tags are immutable (error on recreate)

  **QA Scenarios**:
  ```
  Scenario: Branch creation works
    Tool: Bash
    Steps: |
      lapis branch feature && lapis branch
    Expected: lists feature branch
    Evidence: .sisyphus/evidence/task-27-branch.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement branch and tag commands` | Files: `lapis/src/cli/branch.rs, lapis/src/cli/tag.rs`

---

- [x] 28. `lapis scrub` Command (Bit-Rot Detection)

  **What to do**: Implement scrub. Re-hash all blocks, compare to expected. Report corrupted blocks. Support `--repair` (re-fetch from remote).
  **Must NOT do**: Modify blocks without verification.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Verification loop
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 7 | Blocks: [] | Blocked By: [7]

  **Acceptance Criteria**:
  - [ ] `lapis scrub` re-hashes all blocks, reports status
  - [ ] Corrupted blocks logged with hash and path
  - [ ] `--repair` attempts re-fetch from remote CAS
  - [ ] Progress output for large stores

  **QA Scenarios**:
  ```
  Scenario: Scrub detects corruption
    Tool: Bash
    Steps: |
      # Corrupt a block, run scrub
      echo "bad" > .lapis/store/hot/ab/cd/abcd1234...
      lapis scrub
    Expected: reports corrupted block
    Evidence: .sisyphus/evidence/task-28-scrub.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): implement scrub command` | Files: `lapis/src/cli/scrub.rs`

---

- [x] 29. Read-Only FUSE Mount

  **What to do**: Create `src/fuse/lapisfs.rs` using `fuser` crate. Mount repo as virtual FS. Lazy-fetch blocks on read. Linux + macOS support.
  **Must NOT do**: Implement write operations (Phase 3+).

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: FUSE API implementation
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 7 | Blocks: [] | Blocked By: [8, 13]

  **References**:
  - External: `https://docs.rs/fuser/latest/fuser/` — fuser crate docs
  - Note: fuse3 is Linux-only, fuser is cross-platform

  **Acceptance Criteria**:
  - [ ] `lapis mount <path>` mounts repo at path
  - [ ] Files appear at full size immediately
  - [ ] Reads trigger lazy block fetch
  - [ ] `fusermount -u <path>` unmounts cleanly

  **QA Scenarios**:
  ```
  Scenario: FUSE mount works
    Tool: Bash
    Steps: |
      lapis mount /mnt/lapis &
      sleep 1 && cat /mnt/lapis/test.txt
      fusermount -u /mnt/lapis
    Expected: file content matches repo
    Evidence: .sisyphus/evidence/task-29-fuse.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add read-only FUSE mount` | Files: `lapis/src/fuse/mod.rs, lapis/src/fuse/lapisfs.rs`

---

- [x] 30. Signed Commits with Sigstore (Feature-Flagged)

  **What to do**: Create `src/crypto/sigstore.rs`. Sign commit manifest with Sigstore (keyless OIDC). Verify on checkout. Behind `signing` feature.
  **Must NOT do**: Require signing for v1; block unsigned commits.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: Sigstore integration
  - Skills: [] — No special skills needed

  **Parallelization**: Can Parallel: YES | Wave 7 | Blocks: [] | Blocked By: [9]

  **References**:
  - External: `https://docs.rs/sigstore/latest/sigstore/` — sigstore crate

  **Acceptance Criteria**:
  - [ ] `lapis commit --sign` opens OIDC flow, signs commit
  - [ ] `lapis verify <hash>` checks signature
  - [ ] Unsigned commits still work (feature is additive)
  - [ ] Behind `#[cfg(feature = "signing")]`

  **QA Scenarios**:
  ```
  Scenario: Signed commit verifies
    Tool: Bash
    Steps: |
      lapis commit --sign -m "signed"
      lapis verify HEAD
    Expected: signature valid, signer shown
    Evidence: .sisyphus/evidence/task-30-signing.{log}
  ```

  **Commit**: YES | Message: `feat(lapis): add signed commits with Sigstore` | Files: `lapis/src/crypto/sigstore.rs`

---

## Phase Gate Tests

```bash
# Phase 0 Gate
cd lapis && cargo test --test phase0_gate
# Tests: init, add, commit, status, log, checkout round-trip

# Phase 1 Gate
cargo test --test phase1_gate
# Tests: push, pull, clone, resumable transfer

# Phase 2 Gate
cargo test --test phase2_gate
# Tests: delta compression, tiering, GC safety

# Phase 3 Gate
cargo test --test phase3_gate
# Tests: branch, tag, scrub, FUSE, signing
```
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

---

## Commit Strategy
- Conventional commits: `feat(lapis):`, `fix(cas):`, `refactor(chunking):`
- One commit per logical unit
- Run `cargo test` before every commit

## Success Criteria
1. All 4 phase gates pass with executable acceptance tests
2. No memory budget violations (< 256MB RSS for add operations)
3. Property-based tests pass for all data transformations
4. Crash recovery verified via kill -9 + resume tests
5. Cross-repo dedup verified (same file in two repos stores once)
