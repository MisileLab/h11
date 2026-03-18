## Lifecycle Hook Ambiguity - Task 3.2

**Issue**: STS2's explicit combat start/end event hooks are not clearly exposed in Phase 0 research output. Game lifecycle events (e.g., `on_combat_start`, `on_combat_end`, or scene transition signals) need discovery.

**Resolution**: Integrated run lifecycle at `ModEntry.Initialize()` (start) and `ModEntry.EndCurrentRun()` (end) as the clearest available entry points. These are called synchronously and provide reliable reset/save boundaries.

**Future Refinement**: Once STS2 game event API is fully documented (Phase 1+ work), replace `Initialize/EndCurrentRun` calls with actual game lifecycle hooks if available (e.g., `CombatManager.OnCombatStart` event subscription).

**Impact**: Current implementation will reset trackers on mod load and save on explicit end call. Manual `EndCurrentRun()` must be wired to actual game end or player disconnect event to be production-ready.

**Status**: Acceptable for Phase 3.2 scope (lifecycle integration skeleton); requires refinement for Phase 3.4 (packaging/testing).
