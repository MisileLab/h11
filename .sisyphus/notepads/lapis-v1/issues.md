# 2026-03-08
- Initial worktree setup subagent caused scope creep outside the requested files; verify every delegation with `git diff --stat` before proceeding.
- `fuse3` appears Linux-focused in current docs; later FUSE work should verify `fuser` behavior on macOS in this environment.

## Task 10: Config Path Correction — Completed 2026-03-08

- **Issue Found**: Initial Task 10 implementation created `.lapis/config/config.toml` (nested directory), but plan spec requires `.lapis/config.toml` (flat file at lapis root).
- **Root Cause**: Line 12 defined `CONFIG_SUBDIR` and line 77 created subdirectory, line 81 joined subdirectory path.
- **Fix Applied**:
  - Removed `CONFIG_SUBDIR` constant (line 12)
  - Changed line 12 to `const CONFIG_FILE: &str = "config.toml";`
  - Removed `fs::create_dir_all(&lapis_dir.join(CONFIG_SUBDIR))?;` (line 77)
  - Changed config path from `lapis_dir.join(CONFIG_SUBDIR).join("config.toml")` to `lapis_dir.join(CONFIG_FILE)` (line 81)
  - Updated `test_init_creates_directory_structure`: removed assertion for `config` subdirectory (line 189)
  - Updated `test_init_creates_config_toml`: changed path from `.join("config").join("config.toml")` to `.join("config.toml")` (line 202)
  - Updated docstring to reflect `.lapis/config.toml` instead of `.lapis/config/` (line 31)
- **Verification Results**:
  - `cargo build`: Succeeds (0.54s), 0 errors/warnings
  - `cargo test --lib`: **70 tests passed** (all existing + 5 repo tests); no regressions
  - `cargo test init::`: **2 tests passed** (CLI init tests)
  - Real command execution: `lapis init /tmp/test-lapis-flat` creates:
    - `.lapis/config.toml` (flat file, correct spec-compliant location) ✓
    - `.lapis/store/hot/` (empty, ready for CAS) ✓
    - `.lapis/meta/index.db` + WAL files (SQLite initialized) ✓
  - `lsp_diagnostics` on repo.rs: clean (no errors/warnings)
  - Grep for debug markers: clean (no TODO/FIXME/HACK/unimplemented!/todo!)
- **Files Changed**:
  - Modified: `lapis/src/repo.rs` (removed CONFIG_SUBDIR, updated config path logic, updated tests and docstring)
  - No changes to: `lapis/src/cli/init.rs`, `lapis/src/lib.rs`, `lapis/src/main.rs`, `Cargo.toml`
- **Atomic Scope**: Strictly limited to config file path correction; no other init behavior changed.
- **Plan Compliance**: `.lapis/config.toml` now matches exact spec from lapis-v1.md task 10 acceptance criteria.
