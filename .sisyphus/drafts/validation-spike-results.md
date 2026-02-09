# Task 0 Validation Spike - Native pi.dev APIs

## Scope
- Task executed: `0. Validation Spike - Test Native pi.dev APIs`
- Goal: runtime validation of critical native APIs before production refactors
- Spike helper: `.sisyphus/spikes/task0-validation-extension.mjs` (throwaway)

## Runtime Scenarios

| API | Command / Event used | Result | Evidence |
| --- | --- | --- | --- |
| `pi.registerTool()` with TypeBox schema | `pi --no-extensions -e /Users/misile/repos/h11/.sisyphus/spikes/task0-validation-extension.mjs --mode json -p --no-session "/spike-status"` | PASS - `hasSpikeTool:true` for `task0_spike_tool` | `.sisyphus/evidence/task-0-register-tool.txt` |
| `pi.registerCommand()` visibility | same `/spike-status` command | PASS - `hasSpikeCommand:true` and command count reported | `.sisyphus/evidence/task-0-register-command.txt` |
| `ctx.getContextUsage()` | same `/spike-status` command | PASS - usage object returned with `tokens`, `contextWindow`, `percent` | `.sisyphus/evidence/task-0-context-usage.txt` |
| `pi.appendEntry()` persistence behavior | `pi --no-extensions -e /Users/misile/repos/h11/.sisyphus/spikes/task0-validation-extension.mjs --mode json -p "/spike-append"` (`/spike-append` calls `appendEntry`, then `ctx.compact`) | PASS - `compactResult:"compact-called"`, `persistedCount:1`, `latestHasPayload:true` | `.sisyphus/evidence/task-0-append-entry.txt` |
| `pi --mode json -p --no-session` subagent invocation | `pi --no-extensions --mode json -p --no-session "Reply with exactly: SPIKE_OK"` | PASS - assistant output contains exact `SPIKE_OK` | `.sisyphus/evidence/task-0-subagent.json` |
| `pi.sendMessage({ triggerTurn: true })` | `pi --no-extensions -e /Users/misile/repos/h11/.sisyphus/spikes/task0-validation-extension.mjs --mode json -p --no-session "/spike-trigger"` | PASS with caveat - event stream shows `agent_start` + `turn_start` immediately after command message | `.sisyphus/evidence/task-0-send-message-trigger-turn.txt` |
| `pi.sendUserMessage()` | `pi --no-extensions -e /Users/misile/repos/h11/.sisyphus/spikes/task0-validation-extension.mjs --mode json -p --no-session "/spike-user"` | PASS - `sendUserMessageCalled:true` and injected user message `SPIKE_USER_MESSAGE_PAYLOAD` appears in stream | `.sisyphus/evidence/task-0-send-user-message.txt` |

## Observed Gotchas
- `-e` requires an absolute path in this environment; relative `.sisyphus/...` was interpreted as a git source.
- Existing project extension (`piflow`) injects planning behavior into default CLI runs; `--no-extensions` is required for isolated native API checks.
- `interactive_bash` (tmux-backed) could not be used because `tmux` is not installed on PATH (`Executable not found in $PATH: "tmux"`).
- `sendMessage` with `triggerTurn:true` confirms turn triggering in JSON mode, but in `-p --no-session` flow it does not guarantee a full assistant completion before exit.

## Outcome
- Task 0 native API validation is complete.
- All requested APIs were exercised with runtime evidence and no production piflow modules were changed.
