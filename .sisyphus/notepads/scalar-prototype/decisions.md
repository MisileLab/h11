# Decisions - SCALAR Prototype

## Project Structure

### Task 1: Godot Project Location (2026-03-14)

**Decision**: Use git worktree at `/Users/misile/repos/h11-scalar-prototype` on branch `atlas/scalar-prototype`

**Rationale**:
- Follows h11 monorepo pattern (other worktrees at h11-play-review-scraper, h11-STS2)
- Allows parallel development on isolated branch
- Clean separation from main h11 repo while maintaining shared history
- Enables future integration back into main when prototype is mature

**Godot Project Root**: `/Users/misile/repos/h11-scalar-prototype/scalar/`

**Autoload Singletons** (4 total):
1. GameManager - Global state & lifecycle (core orchestration)
2. MatchEngine - Turn-based match logic & phases
3. APManager - Action Point economy & spending
4. UnitManager - Unit registry & pooling

**Rationale for Singletons**:
- Autoloads eliminate need for finding/caching node references
- Persistent across scene changes (matches game lifecycle)
- Direct global access simplifies initial prototype iteration
- Can refactor to service locator pattern later if complexity demands

**GDScript 2.0 Strict Typing**: Enabled immediately
- Rationale: Catch type errors early, aid IDE refactoring, match modern Godot conventions

### Task 5: Card Data Structure (2026-03-14)

**Decision**: Model cards as `Resource` with `RefCounted` inner class `CardEffect`, serializing enums as integers.

**Key Choices**:
1. **CardEffect as inner RefCounted** (not a separate Resource file)
   - Effects are lightweight (3 int fields), always owned by a Card
   - No need for inspector editing or standalone `.tres` serialization
   - Keeps card.gd self-contained as a single file

2. **Three enums co-located in card.gd**: `CardType`, `TargetType`, `StatType`
   - Co-location simplifies imports — any file that preloads card.gd gets all enums
   - StatType shared between Card and potential future buff/debuff systems
   - If StatType usage grows beyond cards, extract to a separate `enums.gd`

3. **`load()` in static `from_dict()` instead of class_name self-reference**
   - `Card` class_name not resolved in `--headless --script` mode
   - `load("res://src/battle/card.gd").new()` works in both editor and headless
   - Trade-off: hardcoded path string (acceptable for prototype; can refactor if file moves)

4. **Serialization as `to_dict()` / `static from_dict()` pattern**
   - Matches Wave 1 convention (deterministic, inspectable output)
   - Enums stored as ints (ordinal position) — compact and JSON-native
   - Enables future JSON card database loading without custom parsers

## Earlier Notes

