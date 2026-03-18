# Issues - SCALAR Prototype

## Task 1 (RESOLVED)

### Blocker: Missing atlas/scalar-prototype Branch
- **Status**: RESOLVED ✅
- **Details**: Initial attempt to create worktree failed because branch didn't exist
- **Solution**: Created branch from main (`git branch atlas/scalar-prototype main`), then created worktree
- **Outcome**: Worktree now at /Users/misile/repos/h11-scalar-prototype, atlas/scalar-prototype branch tracking main

### Cleanup: PascalCase Scripts & Cache (2026-03-14)
- **Status**: RESOLVED ✅
- **Issue**: Initial Task 1 implementation created:
  - PascalCase autoload scripts (GameManager.gd, MatchEngine.gd, APManager.gd, UnitManager.gd)
  - Gameplay scene (Main.tscn) — violates plan spec "Do not create any game scenes yet"
  - Editor cache (.godot/) directory
  - Extra file (unit.gd) from Task 2 bleed
- **Solution Applied**:
  - Renamed all 4 autoload scripts to snake_case (game_manager.gd, matching_engine.gd, ap_manager.gd, unit_manager.gd)
  - Updated project.godot autoload paths and removed main_scene entry
  - Removed Main.tscn, .godot/ cache, and unit.gd
- **Verification**: godot_get_project_info confirms 0 scenes, 4 scripts, loads without errors
- **Outcome**: Project now conforms to plan spec (lines 177-214); ready for Task 2

## Task 4 (RESOLVED)

### Blocker: unit.gd Accidentally Deleted During Task 1 Cleanup (2026-03-14)
- **Status**: RESOLVED ✅
- **Issue**: The Task 1 PascalCase-to-snake_case cleanup (documented above) removed `unit.gd` along with the other files flagged as "Task 2 bleed". However, `unit.gd` is required by Task 4 (Unit System) and `unit_manager.gd` depends on `class_name Unit` for typed arrays, params, `.unit_name`, and `.is_signal_lost()`.
- **Solution**: Restored `scalar/src/core/unit.gd` with `class_name Unit`, `enum UnitType`, Q/K/V/HP exports, `take_damage()`, `heal()`, `is_signal_lost()`. Verified full compatibility with existing `unit_manager.gd`.
- **Outcome**: Unit system functional; all evidence traces (damage clamping, heal cap, signal-lost, UnitManager add/remove) remain valid.

## Task 2+ (To Be Discovered)

