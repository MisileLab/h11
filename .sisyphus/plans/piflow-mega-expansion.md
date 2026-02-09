# piflow Mega-Expansion: oh-my-opencode Feature Parity

## TL;DR

> **Quick Summary**: Expand the piflow pi.dev extension from a simple plan-enforcer (~1,200 LOC) into a full-featured agentic development platform with 9 specialized agents, planning triad, todo enforcement, comment checker, context monitoring, Ralph Loop auto-continuation, and rich configuration — all built by **wrapping pi.dev's native APIs** (subagent system, tools, events, session persistence) rather than rebuilding from scratch.
>
> **Deliverables**:
> - 9 agent definition files (`.pi/agents/*.md`)
> - Multi-agent orchestration layer wrapping native subagent system
> - Planning triad (Prometheus → Metis → Momus) as subagent chain workflow
> - Todo/continuation enforcement ("Bouldering mode")
> - Comment checker (AI slop prevention)
> - Context window monitor with warnings
> - Ralph Loop auto-continuation
> - Extended hook system (22+ events)
> - Slash commands (`/refactor`, `/start-work`, `/plan`, etc.)
> - Keyword activation modes (ultrawork, deep)
> - Session recovery via `pi.appendEntry()` state persistence
> - Rich JSONC configuration
> - LSP/AST code intelligence tools
> - Tmux interactive terminal integration
>
> **Estimated Effort**: XL (14 major feature areas, ~40 tasks)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Validation Spike → Core Infra → Multi-Agent → Planning Triad → Everything Else

---

## Context

### Original Request
User requested full feature parity between piflow and oh-my-opencode, with the exception of MCP Integration (replaced with Agent Skills, which turned out to be natively supported by pi.dev). CLI tooling explicitly skipped.

### Interview Summary
**Key Discussions**:
- **Scope Strategy**: Core-first ordering — multi-agent + background tasks + todo enforcement first
- **Agent Count**: Exactly 9 agents: Prometheus, Oracle, Librarian, Explore, Metis, Momus, Multimodal-Looker, Sisyphus-Junior, Atlas
- **Skills Architecture**: Agent Skills (agentskills.io) — NATIVE to pi.dev, no implementation needed
- **CLI Tooling**: Skipped entirely
- **Test Strategy**: No unit tests. Agent-Executed QA Scenarios only.
- **Multi-Model Support**: Needs investigation — pi.dev has `pi.setModel()` and `pi.registerProvider()` natively

### Research Findings
- **pi.dev API is FAR richer than initially mapped**: 22+ events, `registerTool()`, `appendEntry()`, `setModel()`, `getContextUsage()`, full UI API, session manager, model registry
- **pi.dev has a NATIVE subagent system**: `pi --mode json -p --no-session` with single/parallel/chain modes, agent markdown files, streaming output — multi-agent architecture wraps this
- **pi.dev ALREADY implements agentskills.io natively**: Skills discovery from `~/.pi/agent/skills/`, `.pi/skills/`, SKILL.md format — removed from scope
- **oh-my-opencode comparison**: piflow has ~5% of OMO's feature surface; piflow's unique strengths (approval gate, plan schema enforcement, ambiguity detection, big-commit thresholds) must be preserved

### Metis Review
**Identified Gaps** (addressed):
- **API surface underestimation** → Full ExtensionAPI now documented (22+ events, registerTool, appendEntry, etc.)
- **Rebuilding native features** → Scope revised to wrap native subagent, skills, context usage, session management
- **Missing validation** → Validation spike added as Checkpoint 0 to test native APIs before building on them

**Guardrails Applied**:
- **G1: Native-First Principle** — Before implementing ANY feature, verify it doesn't exist natively
- **G2: Wrap, Don't Rebuild** — Extend native systems, don't build parallel ones
- **G3: API Surface Freeze** — Pin to current pi.dev version, document every API used
- **G4: Feature Scope Caps** — Each checkpoint has explicit "MUST NOT include" list
- **G5: No Speculative Architecture** — No agent registry unless 2+ agents prove the need
- **G6: Single Extension Constraint** — All code composes within single extension entry point

---

## Work Objectives

### Core Objective
Transform piflow from a plan-enforcement extension into a complete agentic development platform by wrapping pi.dev's native subagent system, event hooks, and tools API — achieving oh-my-opencode feature parity without rebuilding what pi.dev already provides.

### Concrete Deliverables
- 9 agent markdown files in `.pi/agents/` (project-level)
- Expanded `piflow/src/` with new modules for each feature area
- Slash commands registered via `pi.registerCommand()`
- LLM-callable tools registered via `pi.registerTool()`
- State persistence via `pi.appendEntry()`
- Rich configuration via `.pi-flow-enforcer.jsonc`
- Updated `package.json` with any new dependencies

### Definition of Done
- [ ] All 9 agents spawn and complete basic tasks via native subagent system
- [x] Planning triad (Prometheus → Metis → Momus) executes as subagent chain
- [ ] Todo enforcement blocks session end when incomplete tasks exist
- [ ] Comment checker intercepts and flags AI slop in tool results
- [ ] Context monitor warns at configurable thresholds
- [ ] Ralph Loop auto-continues until task completion
- [ ] All slash commands registered and functional
- [ ] State persists across session compaction via `appendEntry()`
- [x] `yarn build` succeeds (Astro check passes) — piflow is TypeScript, so `tsc` compilation must pass
- [ ] All QA scenarios pass

### Must Have
- Preserve existing piflow strengths: approval gate, plan schema enforcement, ambiguity detection, big-commit thresholds
- All 9 agents as markdown files following pi.dev's native format
- Wrap native subagent system (NOT build custom process management)
- Use `pi.registerTool()` for all LLM-callable tools (NOT custom parsing)
- Use `pi.appendEntry()` for state persistence (NOT filesystem)
- Use `ctx.getContextUsage()` for context monitoring (NOT token counting)

### Must NOT Have (Guardrails)
- ❌ Custom process spawning — use native subagent system
- ❌ Custom skills/MCP system — pi.dev has native skills support
- ❌ Custom token counting — use `ctx.getContextUsage()`
- ❌ CLI tooling — explicitly skipped
- ❌ Custom session persistence format — use `pi.appendEntry()`
- ❌ Abstract agent registry pattern — concrete agent files only (G5)
- ❌ Multi-extension architecture — single extension entry point (G6)
- ❌ Speculative middleware/plugin layers — build only what's needed now

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion MUST be verifiable by running a command or using a tool.

### Test Decision
- **Infrastructure exists**: NO (piflow has no test suite)
- **Automated tests**: NONE — QA scenarios only
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

QA scenarios are the PRIMARY verification method. Each task includes detailed scenarios.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Agent markdown files** | Bash (cat, stat) | File exists, frontmatter valid YAML, required fields present |
| **TypeScript modules** | Bash (tsc, yarn build) | Compiles without errors |
| **Registered tools** | Bash (pi.dev tool inspection) | Tool appears in `pi.getAllTools()` |
| **Slash commands** | Bash (pi.dev command inspection) | Command appears in `pi.getCommands()` |
| **Event handlers** | Bash (pi session test) | Trigger event, observe handler response |
| **State persistence** | Bash (pi session, appendEntry) | State survives session switch |
| **End-to-end flows** | interactive_bash (tmux + pi) | Run pi session, trigger workflow, verify output |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Foundation — Start Immediately):
├── Task 0: Validation Spike — test native APIs
├── Task 1: Core infrastructure — types, config, state manager
└── Task 2: Extended event system — subscribe to all 22+ events

Wave 1 (Multi-Agent — After Wave 0):
├── Task 3: Agent definition files (9 agents as .md)
├── Task 4: Multi-agent orchestration wrapper
├── Task 5: Background/parallel task tools
└── Task 6: Subagent chain workflow

Wave 2 (Workflows — After Wave 1):
├── Task 7: Planning triad (Prometheus → Metis → Momus)
├── Task 8: Todo/continuation enforcement (Bouldering)
├── Task 9: Comment checker (AI slop prevention)
├── Task 10: Context window monitor
└── Task 11: Ralph Loop auto-continuation

Wave 3 (Tools & Commands — After Wave 0, parallel with Wave 1-2):
├── Task 12: Slash commands registration
├── Task 13: LSP code intelligence tools
├── Task 14: AST-grep search/replace tools
├── Task 15: Tmux interactive terminal tool
└── Task 16: Keyword activation modes

Wave 4 (Polish — After All):
├── Task 17: Session recovery & crash resilience
├── Task 18: Rich JSONC configuration
├── Task 19: Integration of all modules into index.ts
└── Task 20: Full end-to-end QA
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3, 4, 5, 6, 12-16 | None (must run first) |
| 1 | 0 | 3-11, 17-20 | 2 |
| 2 | 0 | 7-11, 16, 19 | 1 |
| 3 | 1 | 4, 6, 7 | 5, 12-15 |
| 4 | 1, 3 | 6, 7 | 5, 12-15 |
| 5 | 1 | 7 | 3, 4, 12-15 |
| 6 | 4 | 7 | 12-15 |
| 7 | 4, 6 | 20 | 8, 9, 10, 11 |
| 8 | 1, 2 | 20 | 7, 9, 10, 11 |
| 9 | 1, 2 | 20 | 7, 8, 10, 11 |
| 10 | 1, 2 | 20 | 7, 8, 9, 11 |
| 11 | 1, 2 | 20 | 7, 8, 9, 10 |
| 12 | 0, 1 | 20 | 3-6, 13-16 |
| 13 | 0, 1 | 20 | 3-6, 12, 14-16 |
| 14 | 0, 1 | 20 | 3-6, 12, 13, 15, 16 |
| 15 | 0, 1 | 20 | 3-6, 12-14, 16 |
| 16 | 1, 2 | 20 | 3-6, 12-15 |
| 17 | 1, 2 | 20 | 18 |
| 18 | 1 | 19, 20 | 17 |
| 19 | ALL 1-18 | 20 | None |
| 20 | 19 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Dispatch |
|------|-------|---------------------|
| 0 | 0, 1, 2 | Sequential: 0 first, then 1+2 parallel |
| 1 | 3, 4, 5, 6 | 3 first (agents needed by 4), then 4+5 parallel, then 6 |
| 2 | 7, 8, 9, 10, 11 | All parallel (independent features) |
| 3 | 12, 13, 14, 15, 16 | All parallel (independent tools/commands) |
| 4 | 17, 18, 19, 20 | 17+18 parallel, then 19, then 20 |

---

## TODOs

### Wave 0: Foundation

- [x] 0. Validation Spike — Test Native pi.dev APIs

  **What to do**:
  - Create a minimal test script that exercises the critical native APIs piflow will depend on:
    1. `pi.registerTool()` with TypeBox schema — verify tool appears in `pi.getAllTools()`
    2. `pi.appendEntry()` — verify state persists after session compaction
    3. Native subagent spawning — run `pi --mode json -p --no-session "echo hello"` and verify JSON output
    4. `ctx.getContextUsage()` — verify returns token count object
    5. `pi.registerCommand()` — verify command appears in `pi.getCommands()`
    6. `pi.sendMessage()` with `triggerTurn: true` — verify it triggers LLM response
    7. `pi.sendUserMessage()` — verify message delivery
  - Document which APIs work as expected and any quirks found
  - Create spike results file at `.sisyphus/drafts/validation-spike-results.md`
  - This is a THROWAWAY task — code written here is exploratory, not production

  **Must NOT do**:
  - Build any production infrastructure
  - Create permanent modules
  - Over-engineer the test harness

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Needs autonomous exploration of APIs, trial-and-error, deep understanding before action
  - **Skills**: [`git-master`]
    - `git-master`: Commit spike results

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 — must complete before anything else
  - **Blocks**: Tasks 1-20
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `piflow/src/index.ts:1-50` — Current extension entry point pattern, shows how `pi.on()` and `pi.registerCommand()` are used
  - `piflow/src/index.ts:89-120` — Current `tool_call` event handler pattern

  **API/Type References** (contracts to test against):
  - Full ExtensionAPI surface documented in conversation context (see "Complete pi.dev ExtensionAPI Surface" section)
  - `pi.registerTool()` — TypeBox schema parameter definition
  - `pi.appendEntry(customType, data)` — State persistence API
  - `ctx.getContextUsage()` — Token usage object

  **External References**:
  - pi.dev extensions docs: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md`
  - Native subagent example: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent`
  - Subagent `index.ts` source (~700 lines) — shows `pi --mode json -p --no-session` spawning pattern, parallel/chain/single modes
  - Subagent `agents.ts` source (~100 lines) — shows agent discovery from `~/.pi/agent/agents/` and `.pi/agents/`

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify registerTool works
    Tool: interactive_bash (tmux)
    Preconditions: piflow installed as pi.dev extension, pi.dev available
    Steps:
      1. Create minimal extension that calls pi.registerTool({ name: "spike_test", ... })
      2. Start pi session with extension loaded
      3. Check pi.getAllTools() includes "spike_test"
    Expected Result: Tool registered and visible
    Evidence: Terminal output captured to .sisyphus/evidence/task-0-register-tool.txt

  Scenario: Verify appendEntry persists state
    Tool: interactive_bash (tmux)
    Preconditions: pi.dev session active
    Steps:
      1. Call pi.appendEntry("piflow_spike", { test: true, timestamp: Date.now() })
      2. Trigger session compaction via ctx.compact()
      3. Check ctx.sessionManager.getEntries() for piflow_spike entry
    Expected Result: Entry survives compaction
    Evidence: Terminal output captured to .sisyphus/evidence/task-0-append-entry.txt

  Scenario: Verify native subagent spawning
    Tool: Bash
    Preconditions: pi binary available on PATH
    Steps:
      1. Run: pi --mode json -p --no-session "Reply with exactly: SPIKE_OK"
      2. Parse JSON output
      3. Assert output contains "SPIKE_OK"
    Expected Result: Subagent completes and returns JSON with response
    Evidence: Response JSON saved to .sisyphus/evidence/task-0-subagent.json

  Scenario: Verify getContextUsage returns data
    Tool: interactive_bash (tmux)
    Preconditions: pi.dev session active with at least one turn completed
    Steps:
      1. Call ctx.getContextUsage() after a turn_end event
      2. Assert returned object has `tokens` property (number > 0)
    Expected Result: Token count available
    Evidence: Terminal output captured to .sisyphus/evidence/task-0-context-usage.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add validation spike results for native API testing`
  - Files: `.sisyphus/drafts/validation-spike-results.md`, any spike test files
  - Pre-commit: N/A (exploratory)

---

- [x] 1. Core Infrastructure — Types, Config, State Manager

  **What to do**:
  - Expand `piflow/src/types.ts` with new types for:
    - `AgentDefinition` — name, description, tools, model, systemPrompt
    - `PiflowState` — full extension state persisted via `appendEntry()`: current phase, active tasks, todo items, session metadata, agent results
    - `TaskStatus` — pending, in_progress, completed, failed, cancelled
    - `TodoItem` — id, content, status, priority, createdAt, completedAt
    - `PlanningTriadState` — prometheusResult, metisGaps, momusVerdict
    - `CommentCheckResult` — file, line, pattern, severity
    - `ContextUsageSnapshot` — tokens, percentage, threshold, timestamp
    - `KeywordMode` — ultrawork, deep, normal + activation patterns
    - Update existing `PiFlowConfig` to include all new config options
  - Create `piflow/src/state-manager.ts`:
    - `saveState(pi, state: PiflowState)` — wraps `pi.appendEntry("piflow_state", state)`
    - `loadState(ctx): PiflowState | null` — reads from `ctx.sessionManager.getEntries()`, finds latest `piflow_state`
    - `updateState(pi, ctx, updater: (state) => state)` — atomic read-modify-write
    - State includes: current phase, active todos, agent task results, planning triad progress, ralph loop iteration count
  - Expand `piflow/src/config.ts`:
    - Support JSONC format (comments in config files) — use `jsonc-parser` or strip comments manually
    - Add new config sections: agents, hooks, tools, commands, thresholds, modes
    - Add `loadConfig()` that merges defaults → project config → env overrides
    - Config file: `.pi-flow-enforcer.jsonc` (backward compat with `.pi-flow-enforcer.json`)

  **Must NOT do**:
  - Build abstract registry patterns (G5)
  - Create middleware or plugin layers
  - Import any heavy dependencies — keep it lightweight

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions and simple state wrapper — straightforward TypeScript, no complex logic
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit after types + state manager + config done

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 2, after Task 0)
  - **Blocks**: Tasks 3-20
  - **Blocked By**: Task 0 (validation spike must confirm APIs work)

  **References**:

  **Pattern References** (existing code to follow):
  - `piflow/src/types.ts:1-87` — Current type definitions (PiFlowConfig, PlanStep, CheckpointState, etc.). Follow same style: plain interfaces, no classes, exported individually
  - `piflow/src/config.ts:1-57` — Current config loading pattern (read file, parse JSON, merge defaults). Extend this, don't replace
  - `piflow/src/index.ts:12-30` — How state is currently managed inline (const variables at module scope). State manager replaces this pattern

  **API/Type References**:
  - `pi.appendEntry(customType: string, data?: any): void` — State persistence. customType = "piflow_state"
  - `ctx.sessionManager.getEntries(): Entry[]` — Read back persisted entries. Filter by customType
  - Entry type has `{ id, customType?, data?, ... }` — from pi.dev internals

  **External References**:
  - `jsonc-parser` npm package: if used, add to piflow/package.json devDependencies. Alternative: simple regex to strip `//` and `/* */` comments before JSON.parse

  **WHY Each Reference Matters**:
  - `types.ts` — Must follow existing naming conventions (PascalCase interfaces, no `I` prefix, optional fields with `?`)
  - `config.ts` — Must preserve backward compat with existing `.pi-flow-enforcer.json` format
  - `index.ts` state vars — Understanding what state manager replaces, ensuring no regressions

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript compiles with new types
    Tool: Bash
    Preconditions: piflow/package.json exists with TypeScript
    Steps:
      1. cd piflow && npx tsc --noEmit
      2. Assert: exit code 0
      3. Assert: no errors in stderr
    Expected Result: All new types compile cleanly
    Evidence: Terminal output to .sisyphus/evidence/task-1-tsc.txt

  Scenario: State manager round-trips data
    Tool: Bash
    Preconditions: state-manager.ts created
    Steps:
      1. Verify saveState() calls pi.appendEntry with customType "piflow_state"
      2. Verify loadState() filters entries by customType "piflow_state" and returns latest
      3. Verify updateState() reads current state, applies updater, saves result
      4. Static analysis: grep for appendEntry usage in state-manager.ts
    Expected Result: State manager correctly wraps pi.dev persistence API
    Evidence: grep output to .sisyphus/evidence/task-1-state-manager.txt

  Scenario: Config loads JSONC format
    Tool: Bash
    Preconditions: config.ts updated
    Steps:
      1. Create test .pi-flow-enforcer.jsonc with comments: // line comment, /* block */
      2. Verify loadConfig() parses it without error
      3. Verify plain .pi-flow-enforcer.json still works (backward compat)
    Expected Result: Both JSON and JSONC configs load correctly
    Evidence: Parse output to .sisyphus/evidence/task-1-config.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add expanded types, state manager, and JSONC config support`
  - Files: `piflow/src/types.ts`, `piflow/src/state-manager.ts`, `piflow/src/config.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 2. Extended Event System — Subscribe to All 22+ Events

  **What to do**:
  - Create `piflow/src/events.ts`:
    - Define `PiflowEventHandlers` — a typed map of all 22+ events piflow will listen to
    - Create `registerAllEvents(pi, ctx, state, config)` function that subscribes to every relevant event
    - Each handler should: log event (if debug mode), update state, trigger relevant feature module
    - Events to add beyond current 6:
      - `session_before_compact` — save critical state before compaction, optionally provide custom summary
      - `session_compact` — restore state after compaction
      - `session_before_fork` — validate fork is safe
      - `session_shutdown` — cleanup, save final state
      - `turn_start` — increment turn counter, check context usage
      - `turn_end` — analyze assistant output, check for completion signals
      - `model_select` — log model changes, enforce model constraints
      - `user_bash` — intercept `!` and `!!` commands for safety
      - `context` — inject piflow context/state into LLM messages (currently only using `before_agent_start`)
      - `session_start` — initialize fresh state
      - `session_switch` — save state for old session, load for new
      - `session_before_switch` — validate switch is safe (warn about unsaved work)
      - `session_before_tree` — handle tree navigation
      - `session_tree` — update state after tree navigation
    - Refactor existing event handlers from `index.ts` into this module (currently inline in index.ts)

  **Must NOT do**:
  - Create an event bus abstraction — use pi.on() directly
  - Add middleware pattern for events
  - Handle events that piflow has no use for (don't subscribe just to subscribe)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward event subscription, no complex logic — mostly boilerplate wiring
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 1, after Task 0)
  - **Blocks**: Tasks 7-11, 16, 19
  - **Blocked By**: Task 0 (validation spike)

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:32-88` — Current `input` event handler pattern. Shows how to intercept, modify, and pass through
  - `piflow/src/index.ts:89-180` — Current `tool_call` and `tool_result` handlers. Shows `{ block: true, reason }` return pattern
  - `piflow/src/index.ts:181-250` — Current `before_agent_start` handler. Shows `{ message, systemPrompt }` return pattern
  - `piflow/src/index.ts:251-350` — Current `agent_end` handler. Shows how to parse assistant text

  **API/Type References**:
  - `pi.on("session_before_compact", (event) => { cancel?: boolean, summary?: string })` — Can prevent or customize compaction
  - `pi.on("session_shutdown", () => void)` — Cleanup hook
  - `pi.on("turn_start", (event) => { turnIndex: number })` — Turn lifecycle
  - `pi.on("turn_end", (event) => { turnIndex, message, toolResults })` — Post-turn analysis
  - `pi.on("model_select", (event) => { model, previousModel, source })` — Model change tracking
  - `pi.on("user_bash", (event) => { command, mode: "!" | "!!" })` — Bash interception
  - `pi.on("context", (event) => { messages })` — Message injection before LLM call
  - `pi.on("session_before_switch", (event) => { cancel?: boolean })` — Can prevent session switch
  - `pi.on("session_before_fork", (event) => { cancel?: boolean })` — Can prevent fork

  **WHY Each Reference Matters**:
  - `index.ts` handlers — These MUST be extracted/refactored into events.ts while preserving exact behavior. The inline handlers are the source of truth for current functionality.

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All events registered without error
    Tool: Bash
    Preconditions: events.ts created, piflow compiles
    Steps:
      1. cd piflow && npx tsc --noEmit
      2. grep -c "pi.on(" src/events.ts → count should be >= 16 (new events)
      3. Verify no duplicate event subscriptions
    Expected Result: 16+ event handlers registered, compiles clean
    Evidence: grep output to .sisyphus/evidence/task-2-events.txt

  Scenario: Existing behavior preserved after refactor
    Tool: Bash
    Preconditions: Events extracted from index.ts to events.ts
    Steps:
      1. Diff the event handler logic: ensure input, tool_call, tool_result, before_agent_start, agent_end handlers have identical logic
      2. Verify index.ts now imports and calls registerAllEvents()
    Expected Result: Zero behavior change in existing handlers
    Evidence: diff output to .sisyphus/evidence/task-2-refactor-diff.txt

  Scenario: session_before_compact saves state
    Tool: interactive_bash (tmux)
    Preconditions: pi session active with piflow loaded
    Steps:
      1. Trigger some state changes (start a plan)
      2. Trigger compaction
      3. Verify session_before_compact handler called (check log or state)
      4. Verify state was saved before compaction
    Expected Result: State persisted before compaction
    Evidence: Terminal output to .sisyphus/evidence/task-2-compact.txt
  ```

  **Commit**: YES
  - Message: `refactor(piflow): extract events into dedicated module, add 16+ new event handlers`
  - Files: `piflow/src/events.ts`, `piflow/src/index.ts` (refactored)
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

### Wave 1: Multi-Agent System

- [x] 3. Agent Definition Files — 9 Agents as Markdown

  **What to do**:
  - Create `.pi/agents/` directory at project root (h11/.pi/agents/)
  - Create 9 agent markdown files following pi.dev's native format:

    1. **`prometheus.md`** — Strategic planning consultant
       - model: claude-sonnet-4-20250514 (or configurable)
       - tools: read, grep, find, ls (read-only — planners don't write code)
       - System prompt: Plan-first, interview-driven, creates `.sisyphus/plans/*.md`

    2. **`oracle.md`** — Architecture deep-dive consultant
       - model: claude-sonnet-4-20250514
       - tools: read, grep, find, ls, bash
       - System prompt: Architecture analysis, system design, trade-off evaluation

    3. **`librarian.md`** — External knowledge researcher
       - model: claude-sonnet-4-20250514
       - tools: read, grep, find, ls, bash, web_search (if available)
       - System prompt: Documentation lookup, best practices research, library evaluation

    4. **`explore.md`** — Codebase explorer
       - model: claude-haiku-4-5 (fast recon, like the native scout agent)
       - tools: read, grep, find, ls
       - System prompt: Fast codebase analysis, find patterns, map dependencies

    5. **`metis.md`** — Gap analysis reviewer
       - model: claude-sonnet-4-20250514
       - tools: read, grep, find, ls
       - System prompt: Reviews plans for gaps, missing guardrails, scope creep risks

    6. **`momus.md`** — Quality gate critic
       - model: claude-sonnet-4-20250514
       - tools: read, grep, find, ls
       - System prompt: Rigorous verification, file reference checking, acceptance criteria validation. Only outputs "OKAY" or rejection with specific issues.

    7. **`multimodal-looker.md`** — Visual/media analyzer
       - model: claude-sonnet-4-20250514 (needs vision capability)
       - tools: read, bash
       - System prompt: Analyze images, screenshots, PDFs, diagrams. Describe visual content.

    8. **`sisyphus-junior.md`** — Task executor
       - model: claude-sonnet-4-20250514
       - tools: read, grep, find, ls, bash, write, edit (full toolset)
       - System prompt: Execute tasks from plans, follow acceptance criteria, commit changes. Supports category-based behavior (quick, deep, ultrabrain, etc.)

    9. **`atlas.md`** — Project knowledge base manager
       - model: claude-haiku-4-5 (lightweight)
       - tools: read, grep, find, ls, write
       - System prompt: Maintain AGENTS.md, project documentation, knowledge base updates

  - Each file must have valid YAML frontmatter with `name`, `description`, `tools`, `model`
  - System prompts should be comprehensive but not bloated — each agent has a clear, focused role

  **Must NOT do**:
  - Create agent registry code — agents are just markdown files discovered by pi.dev natively
  - Add agent-specific TypeScript modules yet (that's Task 4)
  - Over-engineer system prompts — start minimal, iterate

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Creating 9 markdown files with system prompts — primarily a writing/prompt-engineering task
  - **Skills**: [`git-master`]
    - `git-master`: Commit all 9 agent files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (starts after Wave 0)
  - **Blocks**: Tasks 4, 6, 7
  - **Blocked By**: Task 1 (needs types for agent definition)

  **References**:

  **Pattern References**:
  - Native subagent `agents/scout.md` — Example agent file format: `---\nname: scout\ndescription: ...\ntools: read, grep, find, ls, bash\nmodel: claude-haiku-4-5\n---\nSystem prompt here`
  - Native subagent `agents/planner.md` — Read-only agent (no write/edit tools)
  - Native subagent `agents/worker.md` — Full-capability agent (all tools)
  - Native subagent `agents/reviewer.md` — Code review agent

  **External References**:
  - oh-my-opencode agent definitions: `https://github.com/code-yeongyu/oh-my-opencode` — Reference for agent role descriptions and system prompts (Prometheus, Metis, Momus, etc.)
  - pi.dev agent format docs: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md` — Agent markdown format specification

  **WHY Each Reference Matters**:
  - Native agent examples show exact YAML frontmatter format and tool name strings
  - oh-my-opencode provides the role definitions and behavioral contracts for all 9 agents

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All 9 agent files exist with valid frontmatter
    Tool: Bash
    Preconditions: .pi/agents/ directory created
    Steps:
      1. ls .pi/agents/ → Assert exactly 9 .md files
      2. For each file: extract YAML frontmatter between --- markers
      3. Assert each has: name, description, tools, model fields
      4. Assert name matches filename (prometheus.md → name: prometheus)
    Expected Result: 9 valid agent definition files
    Evidence: File listing + frontmatter to .sisyphus/evidence/task-3-agents.txt

  Scenario: Agents discoverable by pi.dev native system
    Tool: interactive_bash (tmux)
    Preconditions: pi.dev session in h11 project
    Steps:
      1. Start pi session in h11/
      2. Check that agents are listed (pi.dev auto-discovers .pi/agents/)
      3. Attempt to reference an agent by name
    Expected Result: pi.dev finds and lists project agents
    Evidence: Terminal output to .sisyphus/evidence/task-3-discovery.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add 9 agent definition files for multi-agent system`
  - Files: `.pi/agents/prometheus.md`, `.pi/agents/oracle.md`, `.pi/agents/librarian.md`, `.pi/agents/explore.md`, `.pi/agents/metis.md`, `.pi/agents/momus.md`, `.pi/agents/multimodal-looker.md`, `.pi/agents/sisyphus-junior.md`, `.pi/agents/atlas.md`
  - Pre-commit: Validate YAML frontmatter

---

- [x] 4. Multi-Agent Orchestration Wrapper

  **What to do**:
  - Create `piflow/src/agents.ts`:
    - `discoverAgents(cwd: string): AgentDefinition[]` — Find agents in `.pi/agents/` and `~/.pi/agent/agents/`, parse frontmatter. Follows the exact same discovery logic as the native subagent example's `agents.ts`
    - `spawnAgent(pi, agentName: string, task: string, options?: { mode?: "single"|"parallel"|"chain" }): Promise<AgentResult>` — Wraps native `pi.exec("pi", ["--mode", "json", "-p", "--no-session", ...])` pattern
    - `spawnParallelAgents(pi, tasks: Array<{agent: string, task: string}>, maxConcurrent?: number): Promise<AgentResult[]>` — Wraps native parallel mode (max 8 tasks, 4 concurrent)
    - `chainAgents(pi, chain: Array<{agent: string, taskTemplate: string}>): Promise<AgentResult>` — Wraps native chain mode with `{previous}` placeholder
    - All functions stream output, track usage, support abort via signal
  - Register LLM-callable tools via `pi.registerTool()`:
    - `piflow_dispatch_agent` — Dispatch a single agent task. Parameters: `{ agent: string, task: string }`
    - `piflow_dispatch_parallel` — Dispatch multiple parallel agent tasks. Parameters: `{ tasks: Array<{agent, task}>, maxConcurrent? }`
    - `piflow_dispatch_chain` — Dispatch sequential agent chain. Parameters: `{ chain: Array<{agent, taskTemplate}> }`
  - Integrate with state manager — save active tasks, track results

  **Must NOT do**:
  - Build custom process management — use `pi.exec("pi", ...)` exactly like native subagent
  - Create abstract agent registry — just discover markdown files
  - Add queue management beyond what native parallel mode provides

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core infrastructure wrapping native subagent system — needs careful implementation matching native patterns exactly
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3)
  - **Parallel Group**: Wave 1 (with Task 5, after Task 3)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - Native subagent `index.ts:1-200` — Single mode implementation. Shows exact `pi.exec()` args: `["--mode", "json", "-p", "--no-session", "--model", agent.model, "--tools", agent.tools.join(","), "--append-system-prompt", agentFile, taskString]`
  - Native subagent `index.ts:200-450` — Parallel mode. Shows `Promise.allSettled()` with concurrency limiter (semaphore pattern), max 8 tasks / 4 concurrent
  - Native subagent `index.ts:450-650` — Chain mode. Shows sequential execution with `{previous}` template replacement in task string
  - Native subagent `agents.ts:1-100` — Agent discovery. Shows `fs.readdir()` + frontmatter parsing with `name`, `description`, `tools`, `model` extraction
  - `piflow/src/index.ts:89-120` — Existing `tool_call` handler pattern for blocking/allowing tools

  **API/Type References**:
  - `pi.exec(command, args, options?)` — Process execution with abort signal
  - `pi.registerTool({ name, label, description, parameters, execute, renderCall?, renderResult? })` — Tool registration with TypeBox schemas
  - TypeBox `Type.Object({ agent: Type.String(), task: Type.String() })` — Schema definition pattern

  **External References**:
  - Native subagent full source: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent`

  **WHY Each Reference Matters**:
  - Native subagent source is THE reference implementation. piflow's wrapper must use the exact same `pi.exec()` arguments, parsing, and error handling. Deviation from this pattern risks incompatibility.
  - TypeBox schemas are required by `pi.registerTool()` — must use `@sinclair/typebox` (already a peer dep in piflow)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Single agent dispatch completes
    Tool: interactive_bash (tmux)
    Preconditions: piflow loaded, .pi/agents/explore.md exists
    Steps:
      1. Invoke piflow_dispatch_agent tool with { agent: "explore", task: "List all TypeScript files in piflow/src" }
      2. Wait for completion (timeout: 60s)
      3. Assert: result contains file listing
      4. Assert: state manager has recorded task completion
    Expected Result: Explore agent returns file listing
    Evidence: Agent output to .sisyphus/evidence/task-4-single.txt

  Scenario: Parallel dispatch runs multiple agents
    Tool: interactive_bash (tmux)
    Preconditions: piflow loaded, explore.md and librarian.md exist
    Steps:
      1. Invoke piflow_dispatch_parallel with { tasks: [{agent: "explore", task: "Find index.ts"}, {agent: "explore", task: "Find config.ts"}] }
      2. Wait for completion (timeout: 120s)
      3. Assert: both results returned
      4. Assert: tasks ran concurrently (check timestamps)
    Expected Result: Both agents complete with results
    Evidence: Parallel output to .sisyphus/evidence/task-4-parallel.txt

  Scenario: Chain dispatch passes results between agents
    Tool: interactive_bash (tmux)
    Preconditions: piflow loaded, explore.md and sisyphus-junior.md exist
    Steps:
      1. Invoke piflow_dispatch_chain with { chain: [{agent: "explore", taskTemplate: "Find all TODO comments in piflow/src"}, {agent: "sisyphus-junior", taskTemplate: "Summarize these findings: {previous}"}] }
      2. Wait for completion (timeout: 120s)
      3. Assert: final result references findings from explore step
    Expected Result: Chain completes with accumulated context
    Evidence: Chain output to .sisyphus/evidence/task-4-chain.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add multi-agent orchestration wrapping native subagent system`
  - Files: `piflow/src/agents.ts`, `piflow/src/index.ts` (registerTool calls)
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 5. Background/Parallel Task Management Tools

  **What to do**:
  - Create `piflow/src/background-tasks.ts`:
    - `BackgroundTaskManager` — tracks running background tasks (wraps native parallel mode)
    - `startBackgroundTask(pi, agent, task): string` — Returns task ID, runs agent in background via `pi.exec()` with `signal` for abort
    - `getTaskStatus(taskId): TaskStatus` — Check if running/completed/failed
    - `getTaskResult(taskId): AgentResult | null` — Get result of completed task
    - `cancelTask(taskId): boolean` — Abort via AbortController signal
    - `listActiveTasks(): TaskInfo[]` — All running tasks
    - Max concurrent tasks: configurable (default 4, max 8 — matching native limits)
  - Register LLM-callable tools:
    - `piflow_background_task` — Start a background agent task. Returns task ID.
    - `piflow_task_status` — Check status of a background task by ID.
    - `piflow_task_result` — Get result of a completed background task.
    - `piflow_cancel_task` — Cancel a running background task.
    - `piflow_list_tasks` — List all active background tasks.
  - UI integration:
    - Show active task count in footer via `ctx.ui.setFooter()`
    - Notify on task completion via `ctx.ui.notify()`

  **Must NOT do**:
  - Build custom process pool — use AbortController + Promise tracking
  - Exceed native limits (max 8 tasks, 4 concurrent)
  - Persist background task state across sessions (tasks are ephemeral)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Async task management with concurrency control — needs careful implementation
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 4, after Task 3)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - Native subagent `index.ts:200-450` — Parallel mode with semaphore pattern. Shows concurrency limiting with `Promise.allSettled()` + queue
  - `piflow/src/execution-guard.ts:1-68` — Existing guard pattern. Background tasks follow similar check-and-block style

  **API/Type References**:
  - `pi.exec(cmd, args, { signal })` — AbortController signal for task cancellation
  - `ctx.ui.setFooter(lines: string[])` — Footer status display
  - `ctx.ui.notify(message, level)` — Notification on completion

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Background task starts and completes
    Tool: interactive_bash (tmux)
    Steps:
      1. Invoke piflow_background_task { agent: "explore", task: "Find all .ts files" }
      2. Assert: returns task ID (string)
      3. Poll piflow_task_status { taskId } until "completed"
      4. Invoke piflow_task_result { taskId }
      5. Assert: result contains file listing
    Expected Result: Background task lifecycle works end-to-end
    Evidence: Output to .sisyphus/evidence/task-5-background.txt

  Scenario: Task cancellation works
    Tool: interactive_bash (tmux)
    Steps:
      1. Start a long-running background task
      2. Invoke piflow_cancel_task { taskId }
      3. Assert: task status becomes "cancelled"
    Expected Result: Task aborted via AbortController signal
    Evidence: Output to .sisyphus/evidence/task-5-cancel.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add background task management with concurrency control`
  - Files: `piflow/src/background-tasks.ts`, `piflow/src/index.ts` (tool registration)
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 6. Subagent Chain Workflow Primitives

  **What to do**:
  - Create `piflow/src/workflows.ts`:
    - `WorkflowDefinition` — Named sequence of agent steps with `{previous}` placeholders
    - Built-in workflows:
      - `scout-and-plan`: explore → prometheus (fast recon then planning)
      - `implement-and-review`: sisyphus-junior → momus (implement then verify)
      - `plan-review-execute`: prometheus → metis → sisyphus-junior (full pipeline)
    - `executeWorkflow(pi, workflowName, initialTask): Promise<WorkflowResult>` — Runs chain with progress tracking
    - Custom workflow support: user can define workflows in config
  - Register tool: `piflow_run_workflow` — Execute a named workflow with an initial task

  **Must NOT do**:
  - Build complex DAG/graph execution engine — chains are linear sequences
  - Create workflow DSL or YAML format — use config JSON
  - Build recovery/retry for individual steps (keep it simple)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple wrapper around chain mode from Task 4 — mostly glue code
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 4
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - Native subagent `index.ts:450-650` — Chain mode with `{previous}` template replacement
  - Native subagent `prompts/implement.md` — Example workflow prompt: scout → planner → worker
  - `piflow/src/agents.ts` (Task 4 output) — `chainAgents()` function this task wraps

  **Acceptance Criteria**:

  ```
  Scenario: Built-in workflow executes
    Tool: interactive_bash (tmux)
    Steps:
      1. Invoke piflow_run_workflow { workflow: "scout-and-plan", task: "Analyze piflow architecture" }
      2. Wait for completion
      3. Assert: result includes both explore output and prometheus planning output
    Expected Result: Multi-step workflow completes
    Evidence: Output to .sisyphus/evidence/task-6-workflow.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add workflow primitives for agent chains`
  - Files: `piflow/src/workflows.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

### Wave 2: Core Features (All Parallel)

- [x] 7. Planning Triad — Prometheus → Metis → Momus

  **What to do**:
  - Create `piflow/src/planning-triad.ts`:
    - `executePlanningTriad(pi, ctx, task: string): Promise<PlanningTriadResult>` — Full planning workflow:
      1. Dispatch prometheus agent with task description
      2. Prometheus produces plan in `.sisyphus/plans/*.md`
      3. Dispatch metis agent to review the plan for gaps
      4. If gaps found, prometheus revises
      5. Optionally dispatch momus for quality gate (if high-accuracy requested)
      6. Momus returns "OKAY" or rejection with issues
      7. Loop until momus approves or user cancels
    - State tracked in `PlanningTriadState` (saved via state manager)
    - `isHighAccuracyMode(): boolean` — Configurable flag
    - `getTriadStatus(): string` — Current triad stage for UI display
  - Register command: `/plan` — Starts planning triad for a task
  - Integrate with existing plan enforcement in `planner.ts` — triad replaces manual plan writing

  **Must NOT do**:
  - Replace the existing plan schema validation in `planner.ts` — that's for plans written by the LLM in normal mode
  - Build the triad outside of the subagent system — USE the workflow from Task 6
  - Hardcode model choices — use agent definitions from Task 3

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex multi-step workflow with conditional logic and state management
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-11)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 4, 6

  **References**:

  **Pattern References**:
  - `piflow/src/planner.ts:1-249` — Existing plan parsing and validation. Triad USES this for plan schema enforcement. Don't modify, integrate with.
  - `piflow/src/workflows.ts` (Task 6 output) — `executeWorkflow()` and chain primitives
  - `piflow/src/agents.ts` (Task 4 output) — `chainAgents()` for sequential execution

  **API/Type References**:
  - `PlanningTriadState` from types.ts (Task 1) — prometheusResult, metisGaps, momusVerdict
  - `pi.registerCommand()` — For `/plan` command registration

  **External References**:
  - oh-my-opencode Prometheus/Metis/Momus system prompts — Reference for role definitions and behavioral contracts

  **Acceptance Criteria**:

  ```
  Scenario: Full planning triad executes
    Tool: interactive_bash (tmux)
    Steps:
      1. Run /plan command with task description "Add user authentication"
      2. Verify prometheus agent produces plan file in .sisyphus/plans/
      3. Verify metis agent reviews the plan (output references gaps)
      4. If high-accuracy mode: verify momus agent reviews
      5. Assert: final plan file exists and is valid
    Expected Result: Planning triad produces reviewed plan
    Evidence: Plan file + agent outputs to .sisyphus/evidence/task-7-triad/

  Scenario: Metis rejection triggers revision
    Tool: interactive_bash (tmux)
    Steps:
      1. Start planning triad with deliberately vague task
      2. Verify metis identifies gaps
      3. Verify prometheus receives metis feedback and revises
    Expected Result: Iterative refinement loop works
    Evidence: Revision history to .sisyphus/evidence/task-7-revision.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add planning triad (Prometheus → Metis → Momus)`
  - Files: `piflow/src/planning-triad.ts`, `piflow/src/index.ts` (command registration)
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 8. Todo/Continuation Enforcement ("Bouldering Mode")

  **What to do**:
  - Create `piflow/src/todo-enforcement.ts`:
    - `TodoManager` — Manages todo items persisted via state manager
    - `addTodo(id, content, priority): TodoItem` — Add new todo
    - `updateTodo(id, status): TodoItem` — Update status (pending → in_progress → completed)
    - `getTodos(filter?: { status? }): TodoItem[]` — Query todos
    - `hasIncompleteTodos(): boolean` — Check if work remains
    - `enforceContinuation(pi, ctx)` — If incomplete todos exist:
      - On `session_before_switch`: warn about incomplete work, optionally block
      - On `session_shutdown`: save todo state for next session
      - On `agent_end`: if assistant message doesn't progress any todo, send reminder
      - Auto-inject remaining todos into context via `before_agent_start` event
    - "Bouldering mode" — inspired by Sisyphus pushing boulder:
      - Once activated (via `/start-work` or config), piflow tracks a "boulder" (current plan)
      - Every turn, piflow injects: "You are working on boulder: {plan-name}. Remaining tasks: {list}"
      - If LLM goes off-track, piflow steers back: "Focus on current boulder task #{N}"
  - Register tools:
    - `piflow_add_todo` — Add a todo item
    - `piflow_update_todo` — Update todo status
    - `piflow_list_todos` — List all todos (with status filter)
  - Register command: `/start-work` — Activates bouldering mode with a plan file
  - UI integration: Show todo progress in widget via `ctx.ui.setWidget()`

  **Must NOT do**:
  - Block session switching entirely — warn and offer choice via `ctx.ui.confirm()`
  - Persist todos in filesystem — use `pi.appendEntry()` only
  - Create complex dependency tracking between todos — keep it flat

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex state management + event integration + UI + continuation logic
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9-11)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:181-250` — Current `before_agent_start` injection pattern. Todo enforcement adds to this.
  - `piflow/src/state-manager.ts` (Task 1 output) — State persistence for todos
  - `piflow/src/events.ts` (Task 2 output) — Event handlers for session_before_switch, session_shutdown, agent_end

  **API/Type References**:
  - `TodoItem` from types.ts — id, content, status, priority, timestamps
  - `pi.sendMessage()` with `triggerTurn: false` — For injecting reminders without triggering LLM
  - `ctx.ui.setWidget(id, lines)` — Widget display for todo progress
  - `ctx.ui.confirm()` — Confirmation dialog for session switch with incomplete todos
  - `pi.on("session_before_switch")` — Can return `{ cancel: true }` to block

  **Acceptance Criteria**:

  ```
  Scenario: Todo CRUD operations work
    Tool: interactive_bash (tmux)
    Steps:
      1. Invoke piflow_add_todo { id: "test-1", content: "Test todo", priority: "high" }
      2. Invoke piflow_list_todos → Assert "test-1" appears with status "pending"
      3. Invoke piflow_update_todo { id: "test-1", status: "completed" }
      4. Invoke piflow_list_todos { status: "completed" } → Assert "test-1" appears
    Expected Result: Full CRUD lifecycle works
    Evidence: Tool outputs to .sisyphus/evidence/task-8-crud.txt

  Scenario: Bouldering mode injects context
    Tool: interactive_bash (tmux)
    Steps:
      1. Run /start-work with a plan file
      2. Verify next turn includes boulder context in system prompt
      3. Assert: injected message references plan name and remaining tasks
    Expected Result: LLM receives todo context every turn
    Evidence: Context injection to .sisyphus/evidence/task-8-boulder.txt

  Scenario: Session switch warns about incomplete todos
    Tool: interactive_bash (tmux)
    Steps:
      1. Add incomplete todos
      2. Attempt session switch
      3. Assert: confirmation dialog appears warning about incomplete work
    Expected Result: Warning shown before abandoning work
    Evidence: Dialog output to .sisyphus/evidence/task-8-switch-warn.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add todo enforcement and bouldering mode`
  - Files: `piflow/src/todo-enforcement.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 9. Comment Checker — AI Slop Prevention

  **What to do**:
  - Create `piflow/src/comment-checker.ts`:
    - `checkForAISlop(toolResult: string): CommentCheckResult[]` — Scan tool results (especially write/edit) for AI comment patterns:
      - `// ... rest of the code` / `// ... existing code ...` — lazy truncation
      - `// TODO: implement` without actual implementation
      - `<!-- Add your code here -->` — placeholder comments
      - `// This function does X` followed by obvious code — captain obvious
      - `// Added for Y` — unnecessary change explanation
      - Excessive `// ` comment density (>40% of lines are comments)
    - `getCheckPatterns(config): RegExp[]` — Configurable patterns from config
    - `formatWarning(results: CommentCheckResult[]): string` — Human-readable warning
  - Integration via `tool_result` event:
    - When write/edit tool results come back, scan the written content
    - If AI slop detected: inject warning message via `pi.sendMessage()` telling LLM to fix
    - Severity levels: `warn` (inform), `block` (force rewrite — use `tool_call` block on next attempt if pattern persists)
  - Configurable: enable/disable, pattern list, severity thresholds

  **Must NOT do**:
  - Block legitimate comments (doc comments, JSDoc, license headers)
  - Apply to non-code files (markdown, config, etc.)
  - Over-detect — false positives are worse than missed slop

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pattern matching + event handler — straightforward regex work
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 11)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/execution-guard.ts:1-68` — Existing tool result interception pattern. Comment checker follows same pattern.
  - `piflow/src/index.ts:130-180` — `tool_result` event handler. Comment checker adds to this handler.

  **API/Type References**:
  - `pi.on("tool_result", (event) => { result, toolName })` — Intercept write/edit results
  - `pi.sendMessage()` — Send warning about detected slop

  **Acceptance Criteria**:

  ```
  Scenario: Detects lazy truncation comments
    Tool: Bash
    Steps:
      1. Call checkForAISlop("function foo() {\n  // ... rest of the code\n}")
      2. Assert: returns CommentCheckResult with pattern "lazy_truncation"
    Expected Result: Lazy truncation detected
    Evidence: Output to .sisyphus/evidence/task-9-truncation.txt

  Scenario: Does not flag legitimate comments
    Tool: Bash
    Steps:
      1. Call checkForAISlop("/** @param x The input value */\nfunction foo(x: number) { return x * 2; }")
      2. Assert: returns empty array (no slop detected)
    Expected Result: JSDoc not flagged
    Evidence: Output to .sisyphus/evidence/task-9-legitimate.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add AI comment slop checker`
  - Files: `piflow/src/comment-checker.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 10. Context Window Monitor

  **What to do**:
  - Create `piflow/src/context-monitor.ts`:
    - `checkContextUsage(ctx): ContextUsageSnapshot` — Wraps `ctx.getContextUsage()`
    - `shouldWarn(snapshot, config): { warn: boolean, level: "info"|"warning"|"critical", message: string }` — Check against thresholds
    - Thresholds (configurable):
      - 50%: info notification
      - 75%: warning notification + suggest compaction
      - 90%: critical warning + auto-compact option
    - `autoCompact(ctx, options?)` — Wraps `ctx.compact()` with custom piflow summary
  - Integration via `turn_end` event:
    - After every turn, check context usage
    - If threshold exceeded, notify via `ctx.ui.notify()`
    - At critical level: offer auto-compaction via `ctx.ui.confirm()`
  - UI: Show context usage in footer via `ctx.ui.setFooter()` (percentage bar)
  - Integration with `session_before_compact` event:
    - Provide custom compaction summary that preserves piflow state (todo list, current plan, phase)

  **Must NOT do**:
  - Count tokens manually — use `ctx.getContextUsage()` exclusively
  - Force compaction without user consent (at critical level, confirm first)
  - Compact if state hasn't been saved yet (always save state before compact)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Thin wrapper on native API + threshold checks — simple logic
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-9, 11)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:350-400` — Existing status refresh pattern. Context monitor adds to status display.

  **API/Type References**:
  - `ctx.getContextUsage(): { tokens: number, ... } | undefined` — Token usage tracking
  - `ctx.compact(options?)` — Trigger compaction
  - `pi.on("session_before_compact")` — Save state before compact, provide custom summary
  - `ctx.ui.setFooter(lines)` — Footer display
  - `ctx.ui.notify(msg, level)` — Notification
  - `ctx.ui.confirm(title, message)` — Confirmation dialog

  **Acceptance Criteria**:

  ```
  Scenario: Context usage displayed in footer
    Tool: interactive_bash (tmux)
    Steps:
      1. Start pi session with piflow
      2. Complete at least one turn
      3. Assert: footer shows context usage percentage
    Expected Result: Footer displays "Context: XX%"
    Evidence: Screenshot or output to .sisyphus/evidence/task-10-footer.txt

  Scenario: Warning at 75% threshold
    Tool: interactive_bash (tmux)
    Steps:
      1. Fill context to ~75% (many turns or long conversation)
      2. Assert: warning notification appears
      3. Assert: notification suggests compaction
    Expected Result: Threshold warning triggered
    Evidence: Output to .sisyphus/evidence/task-10-warning.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add context window monitor with auto-compact`
  - Files: `piflow/src/context-monitor.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 11. Ralph Loop — Auto-Continuation

  **What to do**:
  - Create `piflow/src/ralph-loop.ts`:
    - `RalphLoop` — Auto-continuation engine that keeps the LLM working until task completion
    - `startLoop(pi, ctx, task: string, options?: { maxIterations?: number })` — Begin loop:
      1. Send initial task message via `pi.sendMessage()` with `triggerTurn: true`
      2. On `agent_end` event: analyze output for completion signals
      3. If not complete: send continuation message ("Continue working on: {task}. Remaining: {todos}")
      4. Track iteration count, prevent infinite loops (default max: 50 iterations)
      5. Stop when: all todos completed, LLM signals done, max iterations reached, or user aborts
    - `stopLoop()` — Stop auto-continuation
    - `isLooping(): boolean` — Check if loop is active
    - Completion detection heuristics:
      - All todos in "completed" state
      - LLM message contains "all tasks complete" / "done" / similar
      - No new tool calls in last N turns (stalled)
      - Configurable completion keywords
  - Register command: `/ralph-loop` — Start auto-continuation with current boulder
  - Register command: `/stop-loop` — Stop auto-continuation
  - Integration with bouldering mode (Task 8): Ralph Loop is the engine that drives boulder completion

  **Must NOT do**:
  - Send messages too fast — respect turn completion before sending next
  - Ignore abort signals — must check `ctx.isIdle()` and respect user interruption
  - Continue after errors — if LLM encounters errors repeatedly, stop and report
  - Run without active todos — loop must have a concrete goal

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex async control flow with multiple stop conditions and state tracking
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-10)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:251-350` — Current `agent_end` handler. Ralph loop adds continuation logic here.
  - `piflow/src/todo-enforcement.ts` (Task 8 output) — Todo tracking. Ralph loop checks todo completion state.

  **API/Type References**:
  - `pi.sendMessage(msg, { triggerTurn: true })` — Send message that triggers LLM response
  - `pi.on("agent_end", (event) => { messages })` — Detect turn completion
  - `ctx.isIdle()` — Check if LLM is idle (safe to send message)
  - `ctx.abort()` — Abort current turn if needed
  - `ctx.hasPendingMessages()` — Check for queued messages

  **Acceptance Criteria**:

  ```
  Scenario: Ralph loop auto-continues
    Tool: interactive_bash (tmux)
    Steps:
      1. Set up todos with 2 simple tasks
      2. Run /ralph-loop
      3. Observe LLM receives continuation messages after each turn
      4. Assert: loop stops when both todos completed
      5. Assert: iteration count tracked
    Expected Result: Auto-continuation until completion
    Evidence: Loop transcript to .sisyphus/evidence/task-11-loop.txt

  Scenario: Ralph loop respects max iterations
    Tool: interactive_bash (tmux)
    Steps:
      1. Set up todos that can't complete (impossible task)
      2. Start loop with maxIterations: 3
      3. Assert: loop stops after 3 iterations
      4. Assert: warning message about max iterations reached
    Expected Result: Loop terminates at max iterations
    Evidence: Output to .sisyphus/evidence/task-11-max-iter.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add Ralph Loop auto-continuation engine`
  - Files: `piflow/src/ralph-loop.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

### Wave 3: Tools & Commands (Parallel with Wave 1-2 after Wave 0)

- [x] 12. Slash Commands Registration

  **What to do**:
  - Create `piflow/src/commands.ts`:
    - Register all piflow commands via `pi.registerCommand()`:
      - `/plan` — Start planning triad (delegates to Task 7)
      - `/start-work` — Activate bouldering mode with plan (delegates to Task 8)
      - `/ralph-loop` — Start auto-continuation (delegates to Task 11)
      - `/stop-loop` — Stop auto-continuation
      - `/refactor` — Start refactoring workflow (explore → plan → implement → review)
      - `/status` — Show current piflow status (phase, todos, context usage)
      - `/agents` — List available agents
      - `/dispatch` — Quick-dispatch an agent with a task
      - `/deep` — Enter deep mode (keyword activation, Task 16)
      - `/ultrawork` — Enter ultrawork mode
      - `/cancel-work` — Cancel current boulder
    - Each command has: name, description, handler function
    - Commands that depend on features from other tasks should gracefully degrade if feature not yet loaded

  **Must NOT do**:
  - Implement command logic inline — each command delegates to its feature module
  - Register commands that conflict with pi.dev built-in commands
  - Create commands without descriptions (pi.dev shows them in command palette)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Boilerplate command registration — delegates to other modules
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-16)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 0, 1

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:1-30` — Current command registration pattern (pi.registerCommand)

  **API/Type References**:
  - `pi.registerCommand(name, { description, handler, getArgumentCompletions? })` — Command registration
  - `handler` receives `ExtensionCommandContext` with: `waitForIdle()`, `newSession()`, `fork()`, `navigateTree()`, `reload()`

  **Acceptance Criteria**:

  ```
  Scenario: All commands registered
    Tool: interactive_bash (tmux)
    Steps:
      1. Start pi session with piflow
      2. Check pi.getCommands() output
      3. Assert: all piflow commands listed (/plan, /start-work, /ralph-loop, etc.)
    Expected Result: All commands visible in command palette
    Evidence: Command list to .sisyphus/evidence/task-12-commands.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): register all slash commands`
  - Files: `piflow/src/commands.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 13. LSP Code Intelligence Tools

  **What to do**:
  - Create `piflow/src/tools/lsp-tools.ts`:
    - Register LLM-callable tools that shell out to LSP-like operations:
      - `piflow_goto_definition` — Find where a symbol is defined. Uses: `grep -rn "function symbolName\|class symbolName\|const symbolName"` or language-specific tools if available
      - `piflow_find_references` — Find all usages of a symbol. Uses: `grep -rn "symbolName"` with context
      - `piflow_get_symbols` — List symbols in a file. Uses: `grep -n "function\|class\|interface\|type\|const\|let\|var\|export"` with file parsing
      - `piflow_rename_symbol` — Rename a symbol across files. Uses: `sed` or targeted find-replace
    - Each tool registered via `pi.registerTool()` with TypeBox schemas
    - Tools are WRAPPERS that execute via `pi.exec()` — they don't embed LSP servers
    - Language-agnostic approach: use grep/ripgrep/ast-grep for analysis

  **Must NOT do**:
  - Embed an LSP server — too heavy for an extension
  - Only support TypeScript — tools should work for any language in the project
  - Implement full semantic analysis — best-effort grep-based is fine

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tool registration + shell-out to grep — straightforward
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 14-16)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 0, 1

  **References**:

  **Pattern References**:
  - Native subagent `index.ts:50-100` — Tool registration with TypeBox. Shows `Type.Object()` schema definition.

  **API/Type References**:
  - `pi.registerTool({ name, label, description, parameters, execute })` — Tool registration
  - `pi.exec("grep", ["-rn", pattern, dir])` — Shell out for searches
  - TypeBox: `Type.Object({ file: Type.String(), symbol: Type.String() })` — Parameter schemas

  **Acceptance Criteria**:

  ```
  Scenario: goto_definition finds function
    Tool: interactive_bash (tmux)
    Steps:
      1. Invoke piflow_goto_definition { symbol: "loadConfig", directory: "piflow/src" }
      2. Assert: returns file path and line number of loadConfig definition
    Expected Result: Definition located
    Evidence: Output to .sisyphus/evidence/task-13-goto-def.txt

  Scenario: find_references locates usages
    Tool: interactive_bash (tmux)
    Steps:
      1. Invoke piflow_find_references { symbol: "PiFlowConfig", directory: "piflow/src" }
      2. Assert: returns multiple file:line references
    Expected Result: All usages found
    Evidence: Output to .sisyphus/evidence/task-13-references.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add LSP-like code intelligence tools`
  - Files: `piflow/src/tools/lsp-tools.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 14. AST-grep Search/Replace Tools

  **What to do**:
  - Create `piflow/src/tools/ast-grep-tools.ts`:
    - Register LLM-callable tools:
      - `piflow_ast_search` — Search code patterns via ast-grep. Parameters: `{ pattern, language, paths?, globs? }`
      - `piflow_ast_replace` — Replace code patterns. Parameters: `{ pattern, rewrite, language, dryRun?, paths? }`
    - Both tools shell out to `ast-grep` CLI via `pi.exec("sg", [...])`
    - Support meta-variables: `$VAR` (single node), `$$$` (multiple nodes)
    - Support all 25 languages ast-grep supports
    - `dryRun` default: true for replace (safety first)

  **Must NOT do**:
  - Install ast-grep as a dependency — assume it's available on PATH (or gracefully degrade)
  - Execute replace without dry-run by default
  - Parse ast-grep output manually if structured output is available (--json flag)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Thin wrapper around ast-grep CLI — two tool registrations
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 0, 1

  **References**:

  **API/Type References**:
  - `pi.exec("sg", ["run", "--pattern", pattern, "--lang", language, ...])` — ast-grep CLI invocation
  - `pi.registerTool()` — Tool registration

  **External References**:
  - ast-grep CLI docs: `https://ast-grep.github.io/` — Pattern syntax, language support, --json output

  **Acceptance Criteria**:

  ```
  Scenario: AST search finds patterns
    Tool: Bash
    Steps:
      1. Invoke piflow_ast_search { pattern: "pi.on($EVENT, $HANDLER)", language: "typescript", paths: ["piflow/src"] }
      2. Assert: returns matches with file paths and matched code
    Expected Result: Pattern matches found
    Evidence: Output to .sisyphus/evidence/task-14-ast-search.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add AST-grep search/replace tools`
  - Files: `piflow/src/tools/ast-grep-tools.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 15. Tmux Interactive Terminal Tool

  **What to do**:
  - Create `piflow/src/tools/tmux-tool.ts`:
    - Register LLM-callable tools for interactive terminal:
      - `piflow_tmux_new_session` — Create a named tmux session. Parameters: `{ name, command? }`
      - `piflow_tmux_send_keys` — Send keystrokes to a session. Parameters: `{ session, keys }`
      - `piflow_tmux_capture` — Capture pane output. Parameters: `{ session, lines? }`
      - `piflow_tmux_kill_session` — Kill a session. Parameters: `{ session }`
      - `piflow_tmux_list_sessions` — List active sessions
    - All tools shell out to `tmux` CLI via `pi.exec()`
    - Use for: running dev servers, interactive CLIs, TUI testing, long-running processes

  **Must NOT do**:
  - Create tmux session management abstraction — thin shell-out wrappers
  - Auto-create sessions — only on explicit tool call
  - Keep sessions alive after pi.dev shutdown (cleanup on `session_shutdown` event)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Five thin tool wrappers around tmux CLI
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 0, 1

  **References**:

  **API/Type References**:
  - `pi.exec("tmux", ["new-session", "-d", "-s", name, command])` — Tmux session creation
  - `pi.exec("tmux", ["send-keys", "-t", session, keys, "Enter"])` — Keystroke sending
  - `pi.exec("tmux", ["capture-pane", "-t", session, "-p"])` — Output capture

  **Acceptance Criteria**:

  ```
  Scenario: Create and interact with tmux session
    Tool: Bash
    Steps:
      1. Invoke piflow_tmux_new_session { name: "test-session", command: "echo hello" }
      2. Wait 1 second
      3. Invoke piflow_tmux_capture { session: "test-session" }
      4. Assert: output contains "hello"
      5. Invoke piflow_tmux_kill_session { session: "test-session" }
    Expected Result: Full tmux lifecycle works
    Evidence: Output to .sisyphus/evidence/task-15-tmux.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add tmux interactive terminal tools`
  - Files: `piflow/src/tools/tmux-tool.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 16. Keyword Activation Modes

  **What to do**:
  - Create `piflow/src/keyword-modes.ts`:
    - `KeywordModeManager` — Detects and activates modes based on user input keywords
    - Modes:
      - **Normal** (default): Standard piflow behavior
      - **Deep**: Thorough research before action. Activates via keyword "deep" or `/deep` command
        - Injects: "Take your time. Research thoroughly before acting. Check all references."
        - Enables: Parallel explore agents before implementation
      - **Ultrawork**: Maximum productivity. Activates via keyword "ultrawork" or `/ultrawork`
        - Injects: "Work with extreme focus. Complete all tasks. No unnecessary questions."
        - Enables: Ralph Loop auto-continuation
        - Disables: Approval gates (auto-approve non-destructive actions)
    - Integration via `input` event:
      - Check user input for activation keywords
      - Set active mode in state
      - Inject mode-specific instructions into `before_agent_start` system prompt
    - Mode persistence: survives across turns within session (via state manager)
    - Deactivation: `/normal` command or explicit "switch to normal mode"

  **Must NOT do**:
  - Create more than 3 modes initially — start with normal/deep/ultrawork
  - Auto-activate modes without user intent — keyword must be explicit
  - Make mode switching disruptive — seamless transition

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Input keyword detection + system prompt injection — simple state machine
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12-15)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:32-88` — Current `input` event handler. Keyword detection adds to this.
  - `piflow/src/index.ts:181-250` — Current `before_agent_start` handler. Mode injection adds to system prompt.

  **API/Type References**:
  - `pi.on("input", (event) => { content, ... })` — Detect keywords in user input
  - `pi.on("before_agent_start")` — Inject mode instructions into system prompt
  - `KeywordMode` from types.ts — Mode definitions

  **Acceptance Criteria**:

  ```
  Scenario: Deep mode activates on keyword
    Tool: interactive_bash (tmux)
    Steps:
      1. Type message containing "deep" keyword
      2. Verify mode changes to "deep"
      3. Assert: next system prompt includes deep mode instructions
    Expected Result: Deep mode activated and reflected in LLM context
    Evidence: Output to .sisyphus/evidence/task-16-deep-mode.txt

  Scenario: Ultrawork mode enables Ralph Loop
    Tool: interactive_bash (tmux)
    Steps:
      1. Activate ultrawork mode
      2. Assert: Ralph Loop auto-starts (or is enabled for next task)
      3. Assert: approval gate relaxed for non-destructive actions
    Expected Result: Ultrawork mode integrates with Ralph Loop
    Evidence: Output to .sisyphus/evidence/task-16-ultrawork.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add keyword activation modes (normal/deep/ultrawork)`
  - Files: `piflow/src/keyword-modes.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

### Wave 4: Polish & Integration

- [x] 17. Session Recovery & Crash Resilience

  **What to do**:
  - Create `piflow/src/session-recovery.ts`:
    - `saveRecoveryState(pi, state)` — Save critical state via `pi.appendEntry("piflow_recovery", state)` on every significant state change
    - `recoverState(ctx): PiflowState | null` — On `session_start`, check for recovery entries. If found:
      1. Notify user: "Recovered piflow state from previous session"
      2. Restore: active phase, todos, boulder, mode, agent task results
      3. Continue where left off
    - `isRecoveryNeeded(ctx): boolean` — Check if last session ended abnormally
    - Recovery triggers:
      - `session_start` — Check for recoverable state
      - `session_shutdown` — Save final state
      - `session_before_compact` — Save state before compaction (state may be lost in compaction)
    - Integrate with state manager (Task 1): recovery IS state management with a recovery-focused API

  **Must NOT do**:
  - Save state on every single event (too much noise) — save on meaningful transitions
  - Store large data in appendEntry (keep entries < 10KB)
  - Create filesystem-based recovery — use appendEntry exclusively

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Thin layer over state manager with recovery-specific logic
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 18)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `piflow/src/state-manager.ts` (Task 1 output) — State persistence. Recovery extends this.

  **API/Type References**:
  - `pi.appendEntry("piflow_recovery", state)` — Recovery state persistence
  - `ctx.sessionManager.getEntries()` — Find recovery entries on startup
  - `pi.on("session_start")` — Recovery check trigger
  - `ctx.ui.notify()` — Inform user about recovery

  **Acceptance Criteria**:

  ```
  Scenario: State recovers after session restart
    Tool: interactive_bash (tmux)
    Steps:
      1. Start pi session, activate bouldering mode, add todos
      2. End session (shutdown or crash simulation)
      3. Start new pi session
      4. Assert: piflow notifies about recovered state
      5. Assert: todos and boulder restored
    Expected Result: Seamless state recovery
    Evidence: Output to .sisyphus/evidence/task-17-recovery.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): add session recovery and crash resilience`
  - Files: `piflow/src/session-recovery.ts`, `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 18. Rich JSONC Configuration

  **What to do**:
  - Expand `piflow/src/config.ts` (already started in Task 1):
    - Full configuration schema:
      ```typescript
      interface PiFlowConfig {
        // Existing
        maxDiffLines: number;
        maxDiffFiles: number;
        requireApproval: boolean;
        
        // NEW: Agents
        agents: {
          directory: string; // default: ".pi/agents"
          defaults: { model: string; maxTokens?: number };
          overrides: Record<string, Partial<AgentDefinition>>;
        };
        
        // NEW: Hooks
        hooks: {
          enabledEvents: string[]; // which events to subscribe to
          commentChecker: { enabled: boolean; patterns: string[]; severity: "warn"|"block" };
          executionGuard: { enabled: boolean; maxDiffLines: number };
        };
        
        // NEW: Context
        context: {
          warnThreshold: number; // default: 0.5
          criticalThreshold: number; // default: 0.75
          autoCompact: boolean; // default: false
          compactThreshold: number; // default: 0.9
        };
        
        // NEW: Modes
        modes: {
          defaultMode: "normal"|"deep"|"ultrawork";
          ultrawork: { autoApprove: boolean; maxIterations: number };
          deep: { parallelExplore: boolean };
        };
        
        // NEW: Todo
        todo: {
          warnOnSwitch: boolean; // default: true
          blockOnSwitch: boolean; // default: false
        };
        
        // NEW: Ralph Loop
        ralphLoop: {
          maxIterations: number; // default: 50
          completionKeywords: string[];
          stallDetectionTurns: number; // default: 3
        };
      }
      ```
    - Create `.pi-flow-enforcer.jsonc.example` — Example config file with comments explaining every option
    - Ensure backward compatibility with existing `.pi-flow-enforcer.json` files

  **Must NOT do**:
  - Create config UI (out of scope)
  - Hot-reload config (reload on session start only)
  - Add config options for features that don't exist yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config schema expansion — straightforward type work
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 17)
  - **Blocks**: Tasks 19, 20
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `piflow/src/config.ts:1-57` — Current config loading. Extend this with new sections.
  - `piflow/src/types.ts` — PiFlowConfig type. Must match new config schema.

  **Acceptance Criteria**:

  ```
  Scenario: JSONC config with comments loads correctly
    Tool: Bash
    Steps:
      1. Create .pi-flow-enforcer.jsonc with // comments and /* block comments */
      2. Verify loadConfig() parses without error
      3. Assert: all config values accessible
    Expected Result: JSONC parsing works
    Evidence: Output to .sisyphus/evidence/task-18-jsonc.txt

  Scenario: Old JSON config still works
    Tool: Bash
    Steps:
      1. Use existing .pi-flow-enforcer.json (no comments)
      2. Verify loadConfig() finds and parses it
      3. Assert: new config sections have default values
    Expected Result: Backward compatible
    Evidence: Output to .sisyphus/evidence/task-18-compat.txt
  ```

  **Commit**: YES
  - Message: `feat(piflow): expand configuration with JSONC support and all feature options`
  - Files: `piflow/src/config.ts`, `piflow/src/types.ts`, `.pi-flow-enforcer.jsonc.example`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 19. Integration — Wire All Modules into index.ts

  **What to do**:
  - Refactor `piflow/src/index.ts` to be a clean orchestrator:
    - Import all feature modules
    - Initialize in order: config → state → events → agents → tools → commands → modes
    - Wire event handlers to feature modules (events.ts dispatches to comment-checker, context-monitor, etc.)
    - Wire commands to feature modules (commands.ts delegates to planning-triad, todo-enforcement, etc.)
    - Register all tools from tools/ directory
    - Set up recovery on session_start
    - Set up cleanup on session_shutdown
    - Keep index.ts under 200 lines — it should be pure wiring, no logic
  - Ensure no circular dependencies between modules
  - Verify all features compose within single extension entry point (G6)

  **Must NOT do**:
  - Add new features — this is integration ONLY
  - Change any module's internal logic — only wire them together
  - Create circular imports

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integrating 15+ modules with correct initialization order and dependency wiring — needs careful orchestration
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after ALL Tasks 1-18)
  - **Blocks**: Task 20
  - **Blocked By**: All Tasks 1-18

  **References**:

  **Pattern References**:
  - `piflow/src/index.ts:1-482` — Current entry point. This gets fully refactored.
  - All new modules from Tasks 1-18

  **Acceptance Criteria**:

  ```
  Scenario: Full build succeeds
    Tool: Bash
    Steps:
      1. cd piflow && npx tsc --noEmit
      2. Assert: exit code 0
      3. Assert: zero errors
    Expected Result: All modules compile and integrate
    Evidence: Build output to .sisyphus/evidence/task-19-build.txt

  Scenario: No circular dependencies
    Tool: Bash
    Steps:
      1. Analyze import graph: grep "from './" piflow/src/*.ts piflow/src/**/*.ts
      2. Assert: no module imports from index.ts
      3. Assert: no A→B→A import cycles
    Expected Result: Clean dependency graph
    Evidence: Import analysis to .sisyphus/evidence/task-19-deps.txt

  Scenario: index.ts is under 200 lines
    Tool: Bash
    Steps:
      1. wc -l piflow/src/index.ts
      2. Assert: < 200 lines
    Expected Result: Clean orchestrator, no inline logic
    Evidence: Line count to .sisyphus/evidence/task-19-linecount.txt
  ```

  **Commit**: YES
  - Message: `refactor(piflow): integrate all modules into clean orchestrator entry point`
  - Files: `piflow/src/index.ts`
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

- [x] 20. Full End-to-End QA

  **What to do**:
  - Comprehensive end-to-end verification of all features working together:
    1. Start fresh pi.dev session with piflow loaded
    2. Verify all 9 agents discoverable
    3. Verify all slash commands registered
    4. Verify all tools registered
    5. Test planning triad: `/plan "Add a feature"`
    6. Test bouldering mode: `/start-work` with plan
    7. Test Ralph Loop: `/ralph-loop` with active boulder
    8. Test keyword modes: type "deep" → verify mode change
    9. Test context monitor: verify footer shows usage
    10. Test comment checker: trigger a write with AI slop
    11. Test background tasks: dispatch parallel agents
    12. Test session recovery: restart session, verify state restored
    13. Verify existing features still work: approval gate, plan enforcement, big-commit detection
  - Document all findings in `.sisyphus/evidence/task-20-e2e-results.md`
  - Fix any integration bugs found (this task includes bug-fix scope)

  **Must NOT do**:
  - Add new features during QA
  - Skip any feature in verification
  - Mark as complete if any critical feature is broken

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Thorough, methodical verification requiring autonomous problem-solving for any issues found
  - **Skills**: [`git-master`]
    - `git-master`: Commit any bug fixes found during QA

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final task)
  - **Blocks**: None (final)
  - **Blocked By**: Task 19

  **References**:

  **Pattern References**:
  - All piflow/src/*.ts files — Complete source for verification
  - `.pi/agents/*.md` — All agent definitions
  - `.pi-flow-enforcer.jsonc` — Configuration

  **Acceptance Criteria**:

  ```
  Scenario: Full feature smoke test
    Tool: interactive_bash (tmux)
    Preconditions: piflow fully integrated (Task 19 complete)
    Steps:
      1. Start pi session: pi (in h11/ directory)
      2. Verify startup: piflow loads without errors (check for notifications)
      3. Run /agents → Assert: lists 9 agents
      4. Run /status → Assert: shows phase, context usage, mode
      5. Run /plan "Test feature" → Assert: planning triad starts
      6. Wait for plan generation → Assert: .sisyphus/plans/ has new file
      7. Run /start-work → Assert: bouldering mode activates
      8. Verify todo injection in next turn context
      9. Type "ultrawork" → Assert: mode changes
      10. Run /stop-loop → Assert: loop stops cleanly
      11. Verify footer shows context percentage
      12. Verify comment checker active (test with mock)
      13. End session, restart → Assert: state recovered
    Expected Result: All features operational
    Evidence: Full transcript to .sisyphus/evidence/task-20-e2e-results.md

  Scenario: Existing features regression check
    Tool: interactive_bash (tmux)
    Steps:
      1. Submit a plan → Assert: plan parsing works (planner.ts)
      2. Attempt unapproved code execution → Assert: blocked (execution-guard.ts)
      3. Make a large diff → Assert: big-commit warning (commit.ts)
      4. Submit ambiguous input → Assert: ambiguity detected (planner.ts)
    Expected Result: Zero regressions in existing features
    Evidence: Regression results to .sisyphus/evidence/task-20-regression.txt
  ```

  **Commit**: YES
  - Message: `test(piflow): complete end-to-end QA verification`
  - Files: `.sisyphus/evidence/task-20-e2e-results.md`, any bug fix files
  - Pre-commit: `npx tsc --noEmit` in piflow/

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 0 | `feat(piflow): add validation spike results` | spike files | N/A (exploratory) |
| 1 | `feat(piflow): add expanded types, state manager, JSONC config` | types.ts, state-manager.ts, config.ts | `npx tsc --noEmit` |
| 2 | `refactor(piflow): extract events, add 16+ handlers` | events.ts, index.ts | `npx tsc --noEmit` |
| 3 | `feat(piflow): add 9 agent definition files` | .pi/agents/*.md | YAML validation |
| 4 | `feat(piflow): add multi-agent orchestration` | agents.ts | `npx tsc --noEmit` |
| 5 | `feat(piflow): add background task management` | background-tasks.ts | `npx tsc --noEmit` |
| 6 | `feat(piflow): add workflow chain primitives` | workflows.ts | `npx tsc --noEmit` |
| 7 | `feat(piflow): add planning triad` | planning-triad.ts | `npx tsc --noEmit` |
| 8 | `feat(piflow): add todo enforcement and bouldering` | todo-enforcement.ts | `npx tsc --noEmit` |
| 9 | `feat(piflow): add AI comment slop checker` | comment-checker.ts | `npx tsc --noEmit` |
| 10 | `feat(piflow): add context window monitor` | context-monitor.ts | `npx tsc --noEmit` |
| 11 | `feat(piflow): add Ralph Loop auto-continuation` | ralph-loop.ts | `npx tsc --noEmit` |
| 12 | `feat(piflow): register all slash commands` | commands.ts | `npx tsc --noEmit` |
| 13 | `feat(piflow): add LSP code intelligence tools` | tools/lsp-tools.ts | `npx tsc --noEmit` |
| 14 | `feat(piflow): add AST-grep tools` | tools/ast-grep-tools.ts | `npx tsc --noEmit` |
| 15 | `feat(piflow): add tmux terminal tools` | tools/tmux-tool.ts | `npx tsc --noEmit` |
| 16 | `feat(piflow): add keyword activation modes` | keyword-modes.ts | `npx tsc --noEmit` |
| 17 | `feat(piflow): add session recovery` | session-recovery.ts | `npx tsc --noEmit` |
| 18 | `feat(piflow): expand config with JSONC` | config.ts, types.ts | `npx tsc --noEmit` |
| 19 | `refactor(piflow): integrate all modules` | index.ts | `npx tsc --noEmit` |
| 20 | `test(piflow): complete e2e QA` | evidence files | Full smoke test |

---

## Success Criteria

### Verification Commands
```bash
# Build verification
cd piflow && npx tsc --noEmit  # Expected: exit code 0, no errors

# Agent file verification
ls .pi/agents/*.md | wc -l  # Expected: 9

# Module count verification
ls piflow/src/*.ts piflow/src/tools/*.ts | wc -l  # Expected: ~18+ files (up from 9)
```

### Final Checklist
- [x] All 9 agents defined and discoverable
- [x] Planning triad (Prometheus → Metis → Momus) functional
- [ ] Todo enforcement blocks incomplete work abandonment
- [ ] Comment checker detects AI slop patterns
- [ ] Context monitor shows usage and warns at thresholds
- [ ] Ralph Loop auto-continues until task completion
- [ ] All slash commands registered and functional
- [ ] All LLM tools registered and callable
- [ ] State persists across compaction and session restart
- [x] Rich JSONC config with backward compatibility
- [ ] Keyword modes (normal/deep/ultrawork) activate correctly
- [ ] Tmux interactive terminal tools work
- [ ] LSP and AST-grep tools return results
- [ ] Background task management with concurrency control
- [x] Zero regressions in existing features (approval gate, plan enforcement, big-commit)
- [x] `npx tsc --noEmit` passes
- [x] All "Must NOT Have" guardrails respected
