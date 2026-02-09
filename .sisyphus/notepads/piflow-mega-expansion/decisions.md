# Decisions

- 2026-02-09: Use `--no-extensions` for Task 0 API spike commands to isolate native CLI behavior from existing piflow workflow enforcement.
- 2026-02-09: Keep Task 0 spike as throwaway extension file under `.sisyphus/spikes/` and do not modify production `piflow/src/index.ts`.
- 2026-02-09: Task 1 — Chose library-free JSONC comment stripping (simple char-by-char parser with string/escape tracking) over external dependency to keep piflow lightweight.
- 2026-02-09: Task 1 — Backward-compatible config loading: tries `.pi-flow-enforcer.jsonc` first, falls back to `.pi-flow-enforcer.json`, then uses defaults. No breaking changes.
- 2026-02-09: Task 1 — State manager uses functional/immutable style (returns new state objects) rather than mutation to avoid side effects and simplify reasoning about state changes.

## Task 2: Extended Event System Architecture

**Decision**: Extract all event handlers into dedicated `events.ts` module with single `registerAllEvents()` entry point.

**Rationale**:
- **Separation of concerns**: Event handling logic isolated from command registration and initialization
- **Maintainability**: All 19+ event handlers in one place for easier debugging and extension
- **Preserved behavior**: Existing 6 handlers extracted verbatim to maintain production stability
- **Future extensibility**: New event handlers (todo enforcement, Ralph Loop, context monitor) will integrate cleanly into centralized event registration

**Event Categories Implemented**:
1. **Existing (6)**: `session_start`, `input`, `before_agent_start`, `tool_call`, `tool_result`, `agent_end`
2. **Session lifecycle (4)**: `session_before_compact`, `session_compact`, `session_before_fork`, `session_shutdown`
3. **Turn lifecycle (2)**: `turn_start`, `turn_end`
4. **Specialized (7)**: `model_select`, `user_bash`, `context`, `session_switch`, `session_before_switch`, `session_before_tree`, `session_tree`

**Implementation Notes**:
- New handlers are minimal stubs with documented planned behavior
- State mutations still modify shared `SessionState` object passed by reference
- No event bus abstraction added (native `pi.on()` sufficient per guardrail G2)
- Helper functions moved to events module to avoid cross-module dependencies

## Task 3: Agent Definition Files
- **Model Selection**: Used exact model strings from plan (`claude-sonnet-4-20250514`, `claude-haiku-4-5`) to maintain specified parity, treating them as registry keys.
- **Tool Mapping**: Assigned tools strictly based on roles:
    - Planners/Reviewers (Prometheus, Metis, Momus, Explore): Read-only (`read, grep, find, ls`).
    - Researchers (Oracle, Librarian): Read + Bash/Web (`read, grep, find, ls, bash, web_search`).
    - Executors (Sisyphus-Junior, Atlas): Full (`read, grep, find, ls, bash, write, edit`).
- **Prompt Style**: Used ASCII-only, role-specific system prompts to minimize token bloat while ensuring clear behavioral boundaries.

## Task 4: Multi-Agent Orchestration Wrapper

**Date**: 2026-02-09

### Decision: Shared Array Identity for Executing Promises
**Context**: Parallel agent dispatch needs to track running promises with concurrency limiting.
**Decision**: Use shared array identity pattern from Task 2 events implementation: mutate `executing` array in-place via `length = 0` and `push(...stillRunning)`.
**Rationale**: Matches existing piflow pattern, avoids allocation churn in hot loop.
**Status**: Implemented in `spawnParallelAgents()`.

### Decision: No Custom Agent Registry
**Context**: Need to discover and dispatch agents.
**Decision**: Just use `discoverAgents()` function that scans filesystem, no registry class/middleware.
**Rationale**: Guardrail G5 (no speculative architecture). 9 agents in markdown files is concrete, no need for abstraction layer.
**Status**: Implemented as function, not class.

### Decision: Native Invocation Pattern Only
**Context**: How to spawn subagents.
**Decision**: Use `pi.exec("pi", [...])` exactly as native subagent example does.
**Rationale**: Guardrail G2 (wrap, don't rebuild). Native pattern is proven and maintained by pi.dev team.
**Status**: Implemented in `spawnAgent()`.

## Task 5: Background Task Management Architecture

**Decision**: Implement task-based concurrency control over process pooling
- **Rationale**: Task-based model aligns with native pi.exec() async API; no need for separate worker processes
- **Implementation**: `BackgroundTaskManager` with slot-based semaphore pattern
- **Concurrency**: Max 8 total tasks, 4 concurrent (configurable via `config.agents.maxConcurrent`)

**Decision**: Use AbortController for cancellation (not process.kill)
- **Rationale**: Graceful cancellation via signal parameter to pi.exec()
- **Implementation**: One AbortController per task, stored in Map, cleaned up on completion

**Decision**: Ephemeral task state (no cross-session persistence)
- **Rationale**: Background tasks are session-scoped; state doesn't need to survive restart
- **Implementation**: In-memory Map storage; cleanup via TTL (cleanupOldTasks with 60s default)

**Decision**: UI integration via footer + notifications
- **Rationale**: Non-intrusive status display; notifications on completion avoid polling
- **Implementation**: 
  - Footer shows active task count + first 3 tasks
  - Notify on complete/fail via onTaskComplete callback
  - `lastCtx` pattern captures context from turn_start event

**Decision**: Five minimal tools (not seven)
- **Rationale**: Removed redundant getTaskInfo (status+result cover all use cases)
- **Tools**: background_task, task_status, task_result, cancel_task, list_tasks

**Decision**: Basic agent spawning (defer full orchestration to Task 4)
- **Rationale**: Task 5 provides task *management*; Task 4 handles agent *discovery/config*
- **Implementation**: executeAgent() uses simple pi.exec() with JSON mode
- **Integration**: Task 4's spawnAgent() can be called from BackgroundTaskManager later

## Task 6: Workflow Primitives

**Date**: 2026-02-09

### Decision: Thin Wrapper Around Task 4 Chain Primitives
**Context**: Need to expose workflows (ordered agent sequences) as LLM-callable operations.
**Decision**: Create new `workflows.ts` module that wraps Task 4's `chainAgents()` function rather than reimplementing chaining logic.
**Rationale**: 
- Guardrail G2 (wrap, don't rebuild) — reuse existing proven chain implementation
- Single responsibility — workflows.ts only handles workflow *naming* and *registration*, not execution mechanics
- Maintainability — chain logic lives in one place (agents.ts)
**Status**: Implemented. `executeWorkflow()` calls `chainAgents()` directly.

### Decision: Built-in Workflows vs Custom Configuration
**Context**: Need default workflows + flexibility for user-defined ones.
**Decision**: Hardcode three built-in workflows (scout-and-plan, implement-and-review, plan-review-execute); support custom workflows loaded from config.
**Rationale**:
- Built-ins serve as templates + common patterns (planning triad, implement+review)
- Custom workflows deferred to config layer (future: from ExtendedFlowEnforcerConfig)
- No need for workflow registry class — simple object merge in `executeWorkflow()`
**Status**: Implemented. BUILTIN_WORKFLOWS constant + loadCustomWorkflows() function.

### Decision: No DSL, No Graph Executor
**Context**: Task 6 spec explicitly forbids DAG/graph executor and YAML workflow format.
**Decision**: Workflows remain simple JSON-compatible types (no special syntax).
**Rationale**: 
- Guardrail G5 (no speculative architecture) — JSON serialization sufficient for config use cases
- Linear workflow (sequential chaining) covers current agent patterns; DAG adds unnecessary complexity
- YAML parser would increase piflow surface area for minimal benefit
**Status**: Implemented. WorkflowDefinition is plain TS interface, no serialization/parsing beyond JSON.

### Decision: {previous} Placeholder Semantics Inherited from Task 4
**Context**: How to pass agent outputs between workflow steps.
**Decision**: Reuse Task 4's `{previous}` placeholder pattern exactly — no new interpolation syntax.
**Rationale**:
- Consistency with existing chain tools (piflow_dispatch_chain)
- Already proven in Task 4 implementation and LLM-callable
- Simple string replacement, no parsing/evaluation required
**Status**: Implemented. `executeWorkflow()` handles initial task injection; subsequent steps follow Task 4 semantics.

### Decision: Built-in Workflows Map to Agent Pair/Triad Patterns
**Context**: Need concrete workflow templates that reflect piflow's agent roles.
**Decision**: Three built-ins reflecting common orchestration patterns:
1. `scout-and-plan`: exploration → planning (explore + prometheus)
2. `implement-and-review`: coding → QA (hephaestus + momus)
3. `plan-review-execute`: planning triad (prometheus + momus + metis)
**Rationale**: Cover primary use cases without over-engineering; each workflow is 1-3 steps (avoids chain explosion).
**Status**: Implemented in BUILTIN_WORKFLOWS constant.

## Task 7: Planning Triad Architecture

**Date**: 2026-02-09

### Decision: Sequential Chain Execution for Triad Phases
**Context**: Need to orchestrate Prometheus → Metis → Momus workflow.
**Decision**: Use `chainAgents()` from Task 4 for each phase (single-step chains).
**Rationale**: 
- Triad phases are conditional, not linear — can't use a single multi-step chain
- Each phase needs error handling + conditional branching (metis loop, momus opt-in)
- Sequential single-step chains with control flow in `executePlanningTriad()` provides maximum flexibility
**Status**: Implemented. Each phase spawns one chain, control flow manages iteration.

### Decision: Metis Iteration Cap (Max 3)
**Context**: Metis review can trigger prometheus revisions indefinitely if plan keeps failing.
**Decision**: Hard cap at 3 iterations; expose as configurable option parameter.
**Rationale**:
- Prevents infinite loops in adversarial/edge cases
- 3 iterations = initial plan + 2 revisions (sufficient for most scenarios)
- Configurable via `options.maxIterations` for future flexibility
**Status**: Implemented. Default 3, configurable.

### Decision: Momus Gate is Opt-In (High-Accuracy Mode)
**Context**: Momus adds verification overhead; not needed for all planning scenarios.
**Decision**: Default to metis-only mode (no momus); enable momus via `options.highAccuracy` or config.
**Rationale**:
- Metis covers gap analysis (primary concern)
- Momus provides extra verification (file refs, acceptance criteria) — useful for complex/critical plans
- Opt-in reduces latency for simple tasks
**Status**: Implemented. `isHighAccuracyMode()` checks config (TODO) or defaults false.

### Decision: Plan Path Extraction with Fallback Strategies
**Context**: Prometheus output format may vary; need robust plan file discovery.
**Decision**: Three-tier extraction strategy:
1. Pattern matching in output (regex for common formats)
2. Filesystem scan of `.sisyphus/plans/` for most recent `.md` file
3. Fallback to `existingPath` param if provided
**Rationale**:
- Agents may use different output formats ("Created plan: ...", "Wrote to ...", etc.)
- Filesystem scan ensures we find plan even if output parsing fails
- Most recent file heuristic works for single-user scenarios
**Status**: Implemented in `extractPlanPath()`.

### Decision: Preserve Existing Approval Flow
**Context**: Triad generates plan; need to integrate with existing `/approve` command.
**Decision**: `/plan` creates plan + sets `awaiting-approval` phase; user still must `/approve`.
**Rationale**:
- Existing approval gate is a core piflow feature (guardrail against accidental execution)
- Triad-generated plans should go through same review process as manual plans
- No breaking changes to existing workflow
**Status**: Implemented. `/plan` handler sets `state.phase = "awaiting-approval"` and notifies user to `/approve`.

## Task 8: Todo/Continuation Enforcement

### Architecture Decisions

1. **TodoManager as Class vs Module Pattern**
   - **Decision**: Used class-based TodoManager
   - **Rationale**: Encapsulates pi/ctx dependencies cleanly, matches BackgroundTaskManager pattern

2. **Bouldering State: Module-Level vs State Manager**
   - **Decision**: Module-level `boulderingState` variable
   - **Rationale**: Bouldering is UI/session-level behavior, not persisted cross-session state

3. **Todo Injection Point: `before_agent_start` Event**
   - **Decision**: Inject boulder context via `before_agent_start` event
   - **Rationale**: Ensures LLM sees todos at start of every turn, minimal disruption

4. **Session Switch Warning: Non-Blocking by Default**
   - **Decision**: Warn user via `ctx.ui.confirm()`, allow proceeding
   - **Rationale**: User retains control, avoids hard-blocking workflow interruptions

5. **Progress Reminder: Probabilistic (30%)**
   - **Decision**: 30% chance to send passive reminder on `agent_end`
   - **Rationale**: Balances guidance with avoiding spam; not critical path

### Integration Points

- **State Manager**: TodoManager wraps `loadState`, `updateState`, `saveState` for persistence
- **Events**: Registered via `registerTodoEnforcement()` for `before_agent_start`, `session_before_switch`, `session_shutdown`, `agent_end`
- **Tools**: `piflow_add_todo`, `piflow_update_todo`, `piflow_list_todos` registered in index.ts
- **Commands**: `/start-work` activates bouldering mode

### API Surface

**Exports from `todo-enforcement.ts`:**
- `TodoManager` class
- `activateBouldering(planName, planPath?)`
- `deactivateBouldering()`
- `isBoulderingActive()`
- `getBoulderContext(todoManager)`
- `registerTodoEnforcement(pi, ctx, todoManager)`
- `formatTodoList(todos)`

## Task 9: Comment Checker — AI Slop Prevention

**Date**: 2026-02-09

### Decision: Regex-Based Pattern Detection Over AST Analysis
**Context**: Need to detect AI-generated code quality issues without over-engineering.
**Decision**: Six regex patterns covering high-value slop indicators (lazy truncation, empty TODOs, placeholders, obvious comments, etc.).
**Rationale**:
- Guardrail G5 (no speculative architecture) — regex patterns sufficient for 80% of AI slop detection
- AST parsing would add complexity and dependency weight; not justified by marginal improvement
- Pattern-based approach allows easy customization via config
**Status**: Implemented. All patterns tested and verified.

### Decision: Non-Blocking Warnings (No Execution Halt)
**Context**: Should slop detection block execution like big-commit thresholds do?
**Decision**: Warnings only; does not block continuation. LLM receives warning and can choose to fix.
**Rationale**:
- Big commits are structural issue (forces rethinking); slop is quality issue (can be fixed incrementally)
- Non-blocking allows rapid iteration; blocking would increase friction
- User can review and rewrite if needed
**Status**: Implemented. `pi.sendMessage()` with `triggerTurn: true` informs LLM, execution continues.

### Decision: False Positive Filtering via Heuristics
**Context**: Legitimate comments (JSDoc, license, well-documented code) should not trigger warnings.
**Decision**: Three-tier filtering:
1. Skip warning if file contains JSDoc (`/** ... */`)
2. Skip warning if file contains license header keywords
3. Filter "captain obvious" for files >500 chars (assume longer code is intentionally documented)
**Rationale**:
- Heuristics are fast and effective for common cases
- Better to miss one slop pattern than produce false positives (user annoyance > missed detection)
- Can be overridden/tuned via config
**Status**: Implemented in `filterOutLegitimateComments()`.

### Decision: Pattern Scope: Code Files Only
**Context**: Should comment checking apply to markdown, YAML, config?
**Decision**: Optional per-pattern file type restrictions (`.fileTypes` array). Default patterns target source code only.
**Rationale**:
- Markdown and config files have different comment conventions
- Source code is primary target for AI slop
- Users can add custom patterns for other file types if needed
**Status**: Implemented. Each pattern has optional `fileTypes` array.

### Decision: Configurable via `config.thresholds.commentCheckEnabled`
**Context**: How to toggle comment checking on/off?
**Decision**: Single boolean flag at `config.thresholds.commentCheckEnabled` (default: true).
**Rationale**:
- Simple on/off switch for minimal feature flag overhead
- Aligns with existing config structure (thresholds object)
- Custom patterns loadable via `getCheckPatterns(config)` if needed
**Status**: Implemented. `isCommentCheckerEnabled()` checks this flag.

### Decision: Integration Point: `tool_result` Event After Big-Commit Check
**Context**: Where in tool_result handler should comment check run?
**Decision**: Immediately after `checkBigCommitThreshold()`, before handler returns.
**Rationale**:
- Grouped with other write/edit post-processing
- No blocking (big-commit check may have already blocked)
- Does not interfere with existing execution-guard flow
**Status**: Implemented in events.ts `tool_result` handler.

### Decision: Max 5 Matches Per Pattern (Avoid Spam)
**Context**: Large files might have many matches; avoid warning overload.
**Decision**: Cap detection at 5 matches per pattern across entire file.
**Rationale**:
- First 5 matches provide sufficient signal for LLM to understand issue
- Prevents "warn fatigue" if file has many minor issues
- Encourages broader fix (e.g., "refactor all TODOs") vs piecemeal fixes
**Status**: Implemented in `checkForAISlop()` loop.


## Task 11: Ralph Loop — Auto-Continuation

**Date**: 2026-02-09

### Decision: State Machine Architecture with agent_end Hook
**Context**: Need auto-continuation without infinite spam or blocking user.
**Decision**: Hook `agent_end` event, detect idle state via progress heuristics (mentions of "todo", "checkpoint", "complete"), trigger continuation only when no progress detected.
**Rationale**: 
- Integrates cleanly with existing event system (3rd handler for `agent_end`).
- Cooldown timer and max iterations prevent runaway loops.
- Heuristic approach (keyword detection) is simple but effective for detecting stalled work.
**Trade-offs**: False negatives (work progressing but keywords not mentioned) will trigger unnecessary continuations, but cooldown limits impact.

### Decision: No Progress Tracking Per Turn
**Context**: Could track todo updates per turn for precise progress detection.
**Decision**: Use simple keyword heuristic instead of explicit per-turn tracking.
**Rationale**: 
- Simpler implementation (no cross-module state tracking needed).
- Good enough for MVP - keyword detection catches most cases.
- Can add explicit tracking later if heuristics prove insufficient.

### Decision: Integrate with Boulder Context
**Context**: Need task context for continuation prompts.
**Decision**: Reuse existing `getBoulderContext()` from todo-enforcement for prompt generation.
**Rationale**: 
- Avoids duplication.
- Ensures consistency with boulder mode's existing todo display.
- Natural integration point since Ralph Loop is designed for boulder workflows.

## Task 10: Context Window Monitor

**Decision**: Create thin wrapper on native `ctx.getContextUsage()` API with threshold-based warning system and integration via `turn_end` event.

**Rationale**:
- **Native-first**: Use `ctx.getContextUsage()` exclusively—no manual token counting
- **Non-destructive compaction**: Only offer auto-compaction at critical level (90%+), and with user confirmation
- **Minimal logic**: Simple threshold checks (50% info, 75% warning, 90% critical) with sensible defaults
- **Composable**: Exported functions callable from event handlers and UI layer without tight coupling
- **Footer integration**: Context usage displayed alongside background task status in shared footer

**Implementation Details**:
- `checkContextUsage(ctx)` — Wraps `ctx.getContextUsage()`, returns `ContextUsageSnapshot` or undefined
- `shouldWarn(snapshot, config)` — Returns `{ warn, level, message }` tuple for threshold logic
- `autoCompact(ctx, options?)` — Wraps `ctx.compact()` with error handling; used only with user consent
- `formatContextFooter(snapshot)` — Creates text-based percentage bar for footer display ("Context: [████████    ] 40%")
- `checkAndNotifyContextUsage(ctx, config)` — Integration point called from `turn_end` event

**Integration Points**:
1. **turn_end event** (events.ts line 471): Import and call `checkAndNotifyContextUsage()` after every assistant response
2. **session_before_compact event** (events.ts line 440): Save critical piflow state via `pi.appendEntry()` before native compaction
3. **refreshFooter** (index.ts line 88): Import `checkContextUsage()` and `formatContextFooter()` to display context % alongside active tasks
4. **UI Notifications**: Leverage existing `ctx.ui.notify()` for threshold messages and `ctx.ui.confirm()` for critical-level compaction offers

**No Breaking Changes**:
- Preserves existing footer behavior for active tasks
- All config thresholds have sane defaults (no config required)
- Silent degradation if `ctx.getContextUsage()` unavailable (returns early from checks)
- State persistence happens independently in `session_before_compact` event (not in context monitor)

## Task 12: Slash Commands Centralization

**Decision**: Consolidated all slash command registration into a dedicated `piflow/src/commands.ts` module rather than scattering handlers across index.ts, ralph-loop.ts, and events.ts.

**Rationale**:
- Reduces index.ts from 357 to ~250 LOC (cleanup ~100 lines)
- Single source of truth for command API surface
- Easier to audit command naming and prevent collisions
- Maintainable: Each command handler is self-contained in one file

**Implementation**:
- Created `registerAllCommands(pi, state, config, helpers)` function
- Migrated `/approve`, `/plan`, `/start-work`, `/ralph-loop`, `/stop-loop` from index.ts
- Added stubs for not-yet-implemented commands with graceful degradation
- All existing handlers preserved exactly; no behavior changes

**Command Inventory** (12 commands):
1. `/approve` - Unlock execution
2. `/plan` - Planning triad (Prometheus→Metis→Momus)
3. `/start-work` - Activate bouldering with plan
4. `/ralph-loop` - Start auto-continuation
5. `/stop-loop` - Stop auto-continuation
6. `/status` - Show workflow status & task stats
7. `/agents` - List discovered agents
8. `/dispatch` - Agent dispatch wrapper
9. `/refactor` - STUB (not yet implemented)
10. `/deep` - STUB (not yet implemented)
11. `/ultrawork` - STUB (not yet implemented)
12. `/cancel-work` - STUB (not yet implemented)

**Stubs strategy**: Incomplete commands return informative messages suggesting workarounds (e.g., `/refactor` → "Use /plan for custom refactoring tasks").

