Chose a split RPC flow: clients submit damage only to the server, the server validates `0 < amount < 500`, applies it locally, then broadcasts a separate apply RPC so the same event does not bounce back into submission.

### 3.3 Manifest Implementation

Created `DamageTrackerMod/assets/mod_manifest.json` with STS2 loader fields:
- **pck_name**: "DamageTracker" (matches PCK export name per loader conventions)
- **name**: "Damage Tracker" (user-facing name)
- **author**: "Anonymous" (placeholder for later update)
- **description**: "Real-time damage tracking overlay..." (matches mod purpose)
- **version**: "1.0.0" (initial release version)
- **min_game_version**: "0.1.0" (STS2 early access baseline)

Structure matches discovered STS2 modloader expectations. Valid JSON format. `dotnet build` still passes (0 errors).

### 3.2 Run History Integration

Implemented run lifecycle integration in `ModEntry.cs`:
- **Run Start Hook**: `ModEntry.StartNewRun()` generates timestamp-based run ID (format: `yyyyMMdd-HHmmss`), records start time as Unix epoch seconds, calls `DamageTrackerManager.Instance.ResetAll()` to clear all trackers
- **Run End Hook**: `ModEntry.EndCurrentRun()` records end time and calls `DamagePersistence.SaveRun(runId, startTime, endTime)`
- **Run ID Generation**: Timestamp-based (`DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")`) for simplicity and collision avoidance
- **Lifecycle Points Chosen**: STS2 combat start/end event hooks are not explicitly exposed in Phase 0 research, so integrated at `Initialize()/EndCurrentRun()` points in ModEntry as the clearest available lifecycle hooks. These can be refined to actual game events once STS2 event API is fully documented.

Created supporting data model classes:
- `DamageEvent` struct: immutable damage event record (source, target, amount, isDealt, timestamp)
- `PlayerDamageTracker` class: accumulates events and totals per player
- `DamageTrackerManager` singleton: manages per-player trackers with RegisterPlayer/UnregisterPlayer/ResetAll
- `DamagePersistence.SaveRun()`: serializes all trackers to atomic JSON file at `user://mods/DamageTracker/runs/{runId}.json` with `.tmp` → rename pattern

Build verified: `dotnet build` passes with 0 errors, 0 warnings.
