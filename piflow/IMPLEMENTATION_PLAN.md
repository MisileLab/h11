# Objective
Build a reusable pi.dev extension (`pi-flow-enforcer`) that enforces:
plan -> ambiguity questions (blocking) -> approval (/approve) -> execution -> checkpoint proof -> commit generation and splitting when too large.

## Checkpoints

### C1 — Scaffold extension + registration
- Files: `piflow/package.json`, `piflow/src/index.ts`, `piflow/src/types.ts`, `piflow/src/config.ts`, `.pi/settings.json`
- Scope:
  1. Create extension package scaffold.
  2. Register extension for project auto-start.
  3. Add initial approval gate command + mutating tool block.
- Verification:
  - Confirm files exist.
  - Confirm project settings reference `../piflow`.

### C2 — Auto context manager
- Files: `piflow/src/context-manager.ts`, `piflow/src/index.ts`, `piflow/src/types.ts`
- Scope:
  1. Load context at session start with hard limits (6 files / 24k chars).
  2. Prioritize file patterns exactly by requested order.
  3. Ask one blocking question if no context files exist.
- Verification:
  - Context summary generated and cached.
  - Hard limits enforced.

### C3 — Plan + blocking question loop
- Files: `piflow/src/planner.ts`, `piflow/src/questions.ts`, `piflow/src/index.ts`, `piflow/src/types.ts`
- Scope:
  1. Enforce required Markdown plan schema.
  2. Ambiguity detection based on specified triggers.
  3. Implement `askBlockingQuestions` helper with max 5 and structured answers.
  4. Keep execution blocked until `/approve`.
- Verification:
  - Schema output check.
  - Questions capped to 5.

### C4 — Execution safety stop + option chooser
- Files: `piflow/src/execution-guard.ts`, `piflow/src/index.ts`, `piflow/src/types.ts`
- Scope:
  1. Monitor assumptions and unexpected outputs.
  2. Stop immediately on failure.
  3. Propose 2-3 options and block for user choice.
- Verification:
  - Failing tool result triggers immediate stop state.

### C5 — Checkpoint proof gating + commit generator + big-commit split
- Files: `piflow/src/checkpoints.ts`, `piflow/src/commit.ts`, `piflow/src/index.ts`, `piflow/README.md`, `.pi-flow-enforcer.json`
- Scope:
  1. Parse/checkpoint lifecycle.
  2. Require proof before completion.
  3. Generate Conventional Commit message from plan/checkpoint/diff.
  4. Auto-commit each completed checkpoint.
  5. Stop and ask split options when threshold exceeded.
- Verification:
  - Missing proof blocks checkpoint completion.
  - Threshold overflow triggers split prompt.
  - Commit message generation follows Conventional Commit.
