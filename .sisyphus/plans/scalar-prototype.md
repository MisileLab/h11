# SCALAR Prototype Implementation Plan

## TL;DR
> **Summary**: Build a full prototype of SCALAR - a Godot 4 deck-building roguelike with novel Q/K/V combat mechanics across 3 zones with 15 enemies, 30 story fragments, and complete deck-building systems.
> **Deliverables**: Playable prototype with all core systems (combat, deck-building, map, story, relics)
> **Effort**: XL (13+ weeks, 50+ tasks)
> **Parallel**: YES - 5-8 waves with parallelizable tasks
> **Critical Path**: Core Engine → Card System → Battle UI → Enemy AI → Map System → Story Layer

---

## Context

### Original Request
Implement SCALAR game from GDD v0.2 with:
- Godot 4 engine
- Q×AP≥K matching combat system
- 3-party simultaneous deck management
- 3 zones, 15 enemies, 3 bosses
- Full deck-building and roguelike progression
- 30 sequential story fragments

### Interview Summary
**Confirmed Decisions**:
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Engine | Godot 4 | Stable, better GDScript 2.0, matches GDD |
| Scope | Full prototype | All systems, production-ready foundation |
| Death system | Between-battle revive only | Strategic stakes without run-ending frustration |
| Card draw | 2 per deck (6 total) | More combo potential than 1-per-deck |
| Enemy count | 5 per zone (15 total) | Variety without bloat |
| Story unlocking | Sequential | Narrative builds progressively |
| AP cost model | Fixed per card | Predictable, Slay the Spire proven |
| Combo trigger | Explicit player action | Maximum player agency |
| Hand overflow | Discard excess (player choice) | Standard deck-builder pattern |

### Metis Review (gaps addressed)
- ✅ AP cost model clarified → Fixed per card
- ✅ Combo timing clarified → Explicit player action
- ✅ Hand overflow clarified → Discard excess with player choice
- ⚠️ Guardrail: Combo UI must show AP cost before confirmation
- ⚠️ Guardrail: Story fragments need persistent save system

---

## Work Objectives

### Core Objective
Build a fully playable SCALAR prototype that validates the Q/K/V combat system and demonstrates the complete game loop from Zone 1 to final boss.

### Deliverables
1. **Core Combat Engine** — Q×AP≥K matching, AP management, unit stats
2. **Card System** — 3 decks, draw/play/discard, combo selection
3. **Battle UI** — AP bar, hand visualization, matching indicators, enemy intents
4. **Enemy AI** — 15 enemies with Intent system, 3 bosses with phases
5. **Map System** — Roguelike branching, node types, zone progression
6. **Deck-building** — Card rewards, shop, upgrades, deck management
7. **Story System** — 30 fragments, sequential unlock, event triggers
8. **Relic System** — 10+ relics with passive effects
9. **Save/Load** — Run progress, unlocked fragments, meta progression

### Definition of Done
- [ ] Player can complete a full run from Zone 1 to Zone 3 boss
- [ ] All 15 enemies and 3 bosses functional with distinct behaviors
- [ ] Q×AP≥K matching works for both ally combos and enemy targeting
- [ ] Deck-building loop complete (rewards → shop → upgrades)
- [ ] Story fragments unlock sequentially across runs
- [ ] Save system persists progress between sessions
- [ ] No game-breaking bugs in core loop
- [ ] Verified via agent-executed QA scenarios

### Must Have
- Q×AP≥K matching engine with visual feedback
- 3-party simultaneous deck management
- AP as shared resource with fixed card costs
- Explicit combo selection (player chooses which cards to combo)
- Intent system for all enemies
- Zone 1-3 progression with bosses
- Card acquisition and deck modification
- Signal Lost death system with between-battle revival

### Must NOT Have (guardrails)
- No mid-combat revival (breaks strategic stakes)
- No random combo triggers (player agency is core)
- No hand size above 10 (prevents decision paralysis)
- No permadeath within run (Signal Lost is recoverable)
- No story fragments appearing out of order (breaks narrative)
- No Godot 5 migration (staying on 4 for stability)
- No AI-generated assets in prototype (placeholder art only)

---

## Verification Strategy

> ZERO HUMAN INTERVENTION — all verification is agent-executed.

### Test Decision
**Framework**: GDUnit4 (Godot 4 unit testing) + Playwright (E2E via Godot web export)
**Strategy**: TDD for core engine, tests-after for UI/systems

### QA Policy
Every task has agent-executed scenarios covering:
- Happy path (expected flow)
- Edge cases (boundary conditions)
- Failure modes (error handling)

### Evidence Location
`.sisyphus/evidence/task-{N}-{slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

**Wave 1: Foundation (Core Engine)**
- Task 1-4: Project setup, matching engine, AP manager, unit system
- All parallelizable, no dependencies

**Wave 2: Card System**
- Task 5-8: Card data structure, deck management, draw system, discard
- Depends on: Unit system (Wave 1)

**Wave 3: Battle Core**
- Task 9-12: Battle state machine, combo engine, enemy AI base, intent system
- Depends on: Matching engine, Card system

**Wave 4: Battle UI**
- Task 13-16: Hand UI, AP bar, matching visualization, enemy intent display
- Depends on: Battle core

**Wave 5: Content Data**
- Task 17-20: Card JSON definitions, enemy JSON, relic JSON, story JSON
- All parallel, no code dependencies

**Wave 6: Map & Progression**
- Task 21-24: Map generator, zone manager, shop system, rest points
- Depends on: Battle system complete

**Wave 7: Story & Meta**
- Task 25-28: Story manager, fragment unlock, save system, meta progression
- Depends on: Map system

**Wave 8: Polish**
- Task 29-32: Balance pass, UI polish, audio placeholders, bug fixes

### Dependency Matrix (Key Paths)
```
Unit System → Card System → Battle Core → Battle UI → Map System → Story
     ↓              ↓            ↓
Matching Engine ────→ Combo Engine
     ↓
  AP Manager
```

### Agent Dispatch Summary
| Wave | Tasks | Categories | Parallel |
|------|-------|------------|----------|
| 1 | 4 | Core engine, setup | YES |
| 2 | 4 | Card system | YES |
| 3 | 4 | Battle logic | PARTIAL |
| 4 | 4 | UI components | YES |
| 5 | 4 | Data/JSON | YES |
| 6 | 4 | Map, progression | PARTIAL |
| 7 | 4 | Story, save | PARTIAL |
| 8 | 4 | Polish | YES |

---

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

<!-- Wave 1: Foundation -->

- [x] 1. Godot Project Setup

  **What to do**:
  1. Create new Godot 4 project at `scalar/` directory
  2. Configure project settings (window size 1920x1080, viewport)
  3. Set up folder structure per GDD architecture
  4. Create autoload singletons: GameManager, MatchEngine, APManager, UnitManager
  5. Set up GDScript 2.0 strict typing

  **Must NOT do**: Do not create any game scenes yet, only project structure

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Boilerplate setup, no complex logic
  - Skills: [] — Standard Godot setup
  - Omitted: [`frontend-ui-ux`] — No UI work yet

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: All | Blocked By: None

  **References**:
  - Pattern: GDD Section 13 — Directory structure and autoloads
  - External: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html

  **Acceptance Criteria**:
  - [ ] `scalar/project.godot` exists with correct settings
  - [ ] All folders exist: `src/core/`, `src/battle/`, `src/ui/`, `src/data/`
  - [ ] Autoload singletons registered in Project Settings
  - [ ] Command: `ls -la scalar/` shows complete structure

  **QA Scenarios**:
  ```
  Scenario: Project opens correctly
    Tool: Bash
    Steps: Open Godot editor with `godot4 scalar/project.godot`
    Expected: Project loads without errors, all autoloads visible
    Evidence: .sisyphus/evidence/task-01-project-setup.txt
  ```

  **Commit**: YES | Message: `feat(scalar): initialize Godot 4 project structure` | Files: `scalar/project.godot`, `scalar/src/`

---

- [x] 2. Matching Engine Core

  **What to do**:
  1. Create `src/core/matching_engine.gd` as Autoload
  2. Implement `can_match(q_value: int, ap_spent: int, target_k: int) -> bool`
  3. Implement `calculate_match_result(q: int, ap: int, k: int) -> Dictionary` with success/failure
  4. Define signals: `match_success`, `match_failure`, `ap_spent`
  5. Add debug logging for formula verification

  **Must NOT do**: Do not connect to UI, do not implement visual feedback

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core algorithm, needs careful implementation
  - Skills: [] — Pure logic, no external deps
  - Omitted: [`tdd-guide`] — Will test manually in Godot

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 9 (Battle) | Blocked By: None

  **References**:
  - Formula: GDD Section 4 — `Q × AP ≥ K → match success → V effect`
  - Signals: GDD Section 13 — Core signals definition

  **Acceptance Criteria**:
  - [ ] `can_match(2, 3, 5)` returns `true` (2×3=6 ≥ 5)
  - [ ] `can_match(2, 2, 5)` returns `false` (2×2=4 < 5)
  - [ ] Signals emit on match attempts
  - [ ] Command: Check autoload in Godot console

  **QA Scenarios**:
  ```
  Scenario: Correct match detection
    Tool: interactive_bash (Godot console)
    Steps: Call MatchEngine.can_match(3, 4, 10) and (3, 3, 10)
    Expected: First returns true (12≥10), second returns false (9<10)
    Evidence: .sisyphus/evidence/task-02-matching-engine.txt

  Scenario: Edge case: zero values
    Tool: interactive_bash
    Steps: Test can_match(0, 5, 3), can_match(3, 0, 1)
    Expected: Zero Q or AP always fails, zero K always succeeds
    Evidence: .sisyphus/evidence/task-02-matching-edge.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement Q×AP≥K matching engine` | Files: `scalar/src/core/matching_engine.gd`

---

- [x] 3. AP Manager

  **What to do**:
  1. Create `src/core/ap_manager.gd` as Autoload
  2. Implement `current_ap: int` and `max_ap: int` properties
  3. Implement `spend_ap(amount: int) -> bool` with validation
  4. Implement `reset_ap()` called at turn start
  5. Implement `add_ap(amount: int)` for combo refunds
  6. Signal: `ap_changed(current: int, max: int)`

  **Must NOT do**: Do not connect to UI, do not implement scaling per combat

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Simple resource management
  - Skills: [] — Standard GDScript patterns
  - Omitted: [`tdd-guide`] — Will test via Godot

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 2, 5, 9 | Blocked By: None

  **References**:
  - Resource: GDD Section 4 — AP is shared party resource, resets per turn
  - Base value: GDD Section 15 — Base 5 AP per turn

  **Acceptance Criteria**:
  - [ ] `spend_ap(3)` with current_ap=5 leaves 2 remaining
  - [ ] `spend_ap(6)` with current_ap=5 returns false, no change
  - [ ] `reset_ap()` restores to max_ap value
  - [ ] Signal emits on any AP change

  **QA Scenarios**:
  ```
  Scenario: AP spending and validation
    Tool: interactive_bash (Godot console)
    Steps: APManager.reset_ap(), APManager.spend_ap(3), check current_ap
    Expected: current_ap = 2, signal emitted
    Evidence: .sisyphus/evidence/task-03-ap-manager.txt

  Scenario: Overspend protection
    Tool: interactive_bash
    Steps: APManager.reset_ap(), APManager.spend_ap(10), check current_ap
    Expected: Returns false, current_ap unchanged at 5
    Evidence: .sisyphus/evidence/task-03-ap-overspend.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement AP resource manager` | Files: `scalar/src/core/ap_manager.gd`

---

- [x] 4. Unit System (Q/K/V Stats)

  **What to do**:
  1. Create `src/core/unit.gd` Resource class
  2. Define properties: `unit_name`, `q_value`, `k_value`, `v_value`, `max_hp`, `current_hp`
  3. Define `unit_type` enum: SCALA, LAMBDA, RIFF, ENEMY
  4. Implement `take_damage(amount: int)` and `heal(amount: int)`
  5. Implement `is_signal_lost() -> bool` (hp <= 0)
  6. Create `src/core/unit_manager.gd` to manage party and enemies

  **Must NOT do**: Do not implement card decks, do not create visual representation

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core data structure, foundational
  - Skills: [] — Standard Godot Resource patterns
  - Omitted: [`frontend-ui-ux`] — No visuals yet

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 5, 6, 9 | Blocked By: None

  **References**:
  - Stats: GDD Section 3 — Character Q/K/V/HP values
  - Scala: Q=2, K=3, V=4, HP=20
  - Lambda: Q=1, K=5, V=2, HP=25
  - Riff: Q=3, K=1, V=3, HP=15
  - Signal Lost: GDD Section 7 — HP <= 0 = incapacitated

  **Acceptance Criteria**:
  - [ ] Unit Resource can be instantiated with custom stats
  - [ ] `take_damage(15)` on Scala (HP=20) leaves current_hp=5
  - [ ] `take_damage(25)` on Scala sets HP=0, `is_signal_lost()` returns true
  - [ ] UnitManager can add/remove party members and enemies

  **QA Scenarios**:
  ```
  Scenario: Unit damage and Signal Lost
    Tool: interactive_bash (Godot console)
    Steps: Create Scala unit, call take_damage(20), check is_signal_lost()
    Expected: is_signal_lost() returns true, HP at 0 (not negative)
    Evidence: .sisyphus/evidence/task-04-unit-system.txt

  Scenario: Unit healing capped at max
    Tool: interactive_bash
    Steps: Create Scala (HP=20), take_damage(10), heal(15)
    Expected: HP = 20 (capped), not 25
    Evidence: .sisyphus/evidence/task-04-heal-cap.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement Unit and UnitManager classes` | Files: `scalar/src/core/unit.gd`, `scalar/src/core/unit_manager.gd`

---

<!-- Wave 2: Card System -->

- [x] 5. Card Data Structure

  **What to do**:
  1. Create `src/battle/card.gd` Resource class
  2. Define properties: `card_name`, `description`, `ap_cost: int`, `card_type: enum`
  3. Define `card_type` enum: Q_BUFF, K_BUFF, V_BUFF, ALLY_TRIGGER, ENEMY_TARGET, SPECIAL
  4. Define `target_type` enum: SELF, ALLY_SINGLE, ALLY_ALL, ENEMY_SINGLE, ENEMY_ALL
  5. Add `effects: Array[CardEffect]` for structured effect data
  6. Create `CardEffect` with `stat_type`, `value`, `duration` (TEMPORARY/PERMANENT)

  **Must NOT do**: Do not implement card UI, do not create JSON data files yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core data model
  - Skills: [] — Standard Godot patterns
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Tasks 6, 7, 8 | Blocked By: Task 4 (Unit)

  **References**:
  - Card types: GDD Section 5 — Q/K/V manipulation, ally triggers, enemy targeting
  - Example cards: GDD Section 5 — Scala's "증폭" (V+3), Lambda's "저주파 확산"

  **Acceptance Criteria**:
  - [ ] Card Resource can be created with all properties
  - [ ] CardEffect array supports multiple effects per card
  - [ ] AP cost is validated (must be >= 0)
  - [ ] Cards can be serialized/deserialized for JSON loading

  **QA Scenarios**:
  ```
  Scenario: Card creation with effects
    Tool: interactive_bash (Godot console)
    Steps: Create card "증폭" with ap_cost=2, V_BUFF effect +3 TEMPORARY
    Expected: Card resource exists with correct properties
    Evidence: .sisyphus/evidence/task-05-card-data.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement Card and CardEffect data structures` | Files: `scalar/src/battle/card.gd`

---

- [x] 6. Deck Management

  **What to do**:
  1. Create `src/battle/deck.gd` class
  2. Properties: `owner: Unit`, `draw_pile: Array[Card]`, `hand: Array[Card]`, `discard_pile: Array[Card]`
  3. Implement `shuffle_draw_pile()` with Fisher-Yates
  4. Implement `draw_cards(count: int) -> Array[Card]` with empty pile reshuffle
  5. Implement `discard_card(card: Card)` and `discard_hand()`
  6. Implement `add_to_deck(card: Card)` for deck-building

  **Must NOT do**: Do not connect to UI, do not implement 3-deck coordination yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core game logic
  - Skills: [] — Standard algorithms
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 7 | Blocked By: Task 4 (Unit), Task 5 (Card)

  **References**:
  - Deck structure: GDD Section 5 — Per-unit decks, 15-20 cards base
  - Draw mechanic: GDD Section 5 — Draw 2 per deck per turn

  **Acceptance Criteria**:
  - [ ] Drawing from empty draw_pile reshuffles discard into draw
  - [ ] Hand size tracked correctly
  - [ ] Shuffle uses proper randomization
  - [ ] Cards maintain reference integrity through draw/discard cycle

  **QA Scenarios**:
  ```
  Scenario: Draw with reshuffle
    Tool: interactive_bash (Godot console)
    Steps: Create deck with 3 cards, draw 3 (empty), draw 2 more
    Expected: Second draw reshuffles discard, cards returned
    Evidence: .sisyphus/evidence/task-06-deck-reshuffle.txt

  Scenario: Hand overflow discard
    Tool: interactive_bash
    Steps: Create deck, set hand to 8 cards, draw 6 more, handle overflow
    Expected: Player chooses which 4 to discard (API for selection)
    Evidence: .sisyphus/evidence/task-06-hand-overflow.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement Deck with draw/discard cycle` | Files: `scalar/src/battle/deck.gd`

---

- [x] 7. Draw System (3-Deck Coordination)

  **What to do**:
  1. Create `src/battle/draw_manager.gd` Autoload
  2. Manage 3 Decks (Scala, Lambda, Riff)
  3. Implement `draw_turn_start() -> Dictionary` returns {deck_name: [cards]}
  4. Implement `handle_overflow()` with player selection callback
  5. Signal: `cards_drawn(total_count: int)`, `overflow_needed(excess_cards: Array, callback: Callable)`
  6. Track hand per deck separately for UI display

  **Must NOT do**: Do not implement UI for overflow selection, only API

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multi-deck coordination logic
  - Skills: [] — Pure logic
  - Omitted: [`frontend-ui-ux`] — UI in Wave 4

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Task 13 (Hand UI) | Blocked By: Task 6 (Deck)

  **References**:
  - Draw rule: GDD Section 5 + Metis — 2 cards per deck per turn
  - Overflow: Metis decision — Discard excess with player choice

  **Acceptance Criteria**:
  - [ ] Turn start draws 2 from each deck (6 total)
  - [ ] Overflow triggers signal with excess cards for UI
  - [ ] Each deck's hand tracked independently
  - [ ] Total hand count available for max check

  **QA Scenarios**:
  ```
  Scenario: Normal turn start draw
    Tool: interactive_bash (Godot console)
    Steps: Initialize 3 decks with 10 cards each, call draw_turn_start()
    Expected: Returns 6 cards (2 per deck), no overflow
    Evidence: .sisyphus/evidence/task-07-draw-system.txt

  Scenario: Overflow triggers correctly
    Tool: interactive_bash
    Steps: Set hands to 8 cards each (24 total), draw 6 more, trigger overflow check
    Expected: overflow_needed signal emitted with 4 excess cards
    Evidence: .sisyphus/evidence/task-07-overflow.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement 3-deck draw coordination with overflow` | Files: `scalar/src/battle/draw_manager.gd`

---

- [x] 8. Card Play System

  **What to do**:
  1. Create `src/battle/card_player.gd`
  2. Implement `can_play_card(card: Card, current_ap: int) -> bool`
  3. Implement `play_card(card: Card) -> Dictionary` with AP deduction, effect application
  4. Connect to MatchEngine for enemy targeting validation
  5. Apply effects to units via UnitManager
  6. Signal: `card_played(card: Card, ap_remaining: int)`

  **Must NOT do**: Do not implement combo system yet (Task 10)

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core game loop
  - Skills: [] — Integrates multiple systems
  - Omitted: [`tdd-guide`] — Integration tested manually

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Task 10 (Combo), Task 9 (Battle) | Blocked By: Task 2 (MatchEngine), Task 3 (APManager), Task 5 (Card)

  **References**:
  - AP cost: Metis decision — Fixed per card (Slay the Spire style)
  - Effect application: GDD Section 5 — Card effects modify Q/K/V

  **Acceptance Criteria**:
  - [ ] Cards with AP cost > current_ap cannot be played
  - [ ] Playing card deducts AP and applies effects
  - [ ] Enemy targeting cards check match via MatchEngine
  - [ ] Cards moved to discard after play

  **QA Scenarios**:
  ```
  Scenario: Card play with AP deduction
    Tool: interactive_bash (Godot console)
    Steps: Set AP=5, play card with cost=3, check remaining AP
    Expected: AP=2, card in discard pile, effects applied
    Evidence: .sisyphus/evidence/task-08-card-play.txt

  Scenario: Insufficient AP blocks play
    Tool: interactive_bash
    Steps: Set AP=2, attempt to play card with cost=3
    Expected: can_play_card returns false, AP unchanged
    Evidence: .sisyphus/evidence/task-08-ap-block.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement card play with AP and effects` | Files: `scalar/src/battle/card_player.gd`

---

<!-- Wave 3: Battle Core -->

- [x] 9. Battle State Machine

  **What to do**:
  1. Create `src/battle/battle_system.gd` as Autoload
  2. Define states: `INIT → PLAYER_TURN → ENEMY_TURN → RESOLUTION → VICTORY/DEFEAT`
  3. Implement `start_battle(enemies: Array[Unit])`
  4. Implement `end_player_turn()` → transition to enemy turn
  5. Implement `check_battle_end()` for victory/defeat
  6. Signals: `state_changed(new_state)`, `turn_started()`, `turn_ended()`

  **Must NOT do**: Do not implement enemy AI actions yet, only state transitions

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Core game loop orchestration
  - Skills: [] — State machine pattern
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Task 13 (UI), Task 11 (Enemy) | Blocked By: Task 3 (AP), Task 4 (Unit), Task 7 (Draw)

  **References**:
  - Battle loop: GDD Section 14 — Turn structure
  - Core loop: GDD Section 15 — Draw → Plan → Execute → End turn

  **Acceptance Criteria**:
  - [ ] State transitions follow defined flow
  - [ ] Player turn enables card play, enemy turn blocks it
  - [ ] All units Signal Lost triggers DEFEAT
  - [ ] All enemies defeated triggers VICTORY

  **QA Scenarios**:
  ```
  Scenario: Full battle state cycle
    Tool: interactive_bash (Godot console)
    Steps: start_battle([enemy]), check state=PLAYER_TURN, end_player_turn(), state=ENEMY_TURN
    Expected: States transition correctly, signals emitted
    Evidence: .sisyphus/evidence/task-09-battle-states.txt

  Scenario: Defeat condition
    Tool: interactive_bash
    Steps: Start battle, set all party HP to 0, check_battle_end()
    Expected: State = DEFEAT
    Evidence: .sisyphus/evidence/task-09-defeat.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement battle state machine` | Files: `scalar/src/battle/battle_system.gd`

---

- [x] 10. Combo Engine (Ally Matching)

  **What to do**:
  1. Create `src/battle/combo_engine.gd`
  2. Implement `check_ally_combo(source: Unit, target: Unit, ap_allocated: int) -> bool`
  3. Implement `execute_combo(source: Unit, target: Unit, ap_allocated: int) -> Dictionary`
  4. Apply V amplification: `target.v_value * combo_multiplier`
  5. Implement `get_available_combos() -> Array[ComboData]` for UI display
  6. Signal: `combo_executed(source, target, amplified_v)`

  **Must NOT do**: Do not implement combo UI selection (Task 14)

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Novel mechanic requiring careful implementation
  - Skills: [] — Pure logic
  - Omitted: [`frontend-ui-ux`] — UI in Wave 4

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Task 14 (Combo UI) | Blocked By: Task 2 (MatchEngine), Task 8 (CardPlay)

  **References**:
  - Combo rule: GDD Section 4 + Metis — Explicit player action, select cards to combo
  - Blue line: GDD Section 12 — Visual indicator for ally combos
  - Formula: Ally Q × AP ≥ Ally K → amplify V

  **Acceptance Criteria**:
  - [ ] Lambda's Q(1) + AP(4) can match Scala's K(3) → 1×4=4≥3 ✓
  - [ ] Failed combo (Q×AP < K) returns false, no effect
  - [ ] Successful combo amplifies target's V
  - [ ] AP cost displayed before confirmation (guardrail from Metis)

  **QA Scenarios**:
  ```
  Scenario: Successful ally combo
    Tool: interactive_bash (Godot console)
    Steps: Lambda(Q=1) targets Scala(K=3) with AP=4, execute_combo()
    Expected: Match succeeds (4≥3), Scala V amplified
    Evidence: .sisyphus/evidence/task-10-combo-success.txt

  Scenario: Failed combo
    Tool: interactive_bash
    Steps: Lambda(Q=1) targets Scala(K=3) with AP=2, execute_combo()
    Expected: Match fails (2<3), no effect, AP not spent
    Evidence: .sisyphus/evidence/task-10-combo-fail.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement ally combo engine with explicit selection` | Files: `scalar/src/battle/combo_engine.gd`

---

- [x] 11. Enemy AI Base

  **What to do**:
  1. Create `src/battle/enemy_ai.gd` base class
  2. Define `decide_action(battle_state: Dictionary) -> EnemyAction`
  3. Define `EnemyAction` with `action_type: enum` (ATTACK, DEFEND, BUFF, DEBUFF, SPECIAL)
  4. Implement `execute_action(action: EnemyAction)` on enemy turn
  5. Create `src/battle/enemy_types/` folder for specific enemy AIs
  6. Implement `DrifterAI.gd` as first concrete enemy (Zone 1 basic)

  **Must NOT do**: Do not implement all 15 enemies, only base + Drifter

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: AI patterns need careful design
  - Skills: [] — Standard AI patterns
  - Omitted: [`tdd-guide`] — Behavior tested manually

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Task 12 (Intent), Task 17 (Enemy JSON) | Blocked By: Task 9 (Battle)

  **References**:
  - Enemy types: GDD Section 6 — Drifter (K=2, HP=8, basic, groups of 3)
  - Intent: GDD Section 6 — Actions visible before enemy turn

  **Acceptance Criteria**:
  - [ ] EnemyAI base class defines interface for all enemies
  - [ ] DrifterAI implements simple attack pattern
  - [ ] Actions logged for debugging
  - [ ] Enemy turn executes decided action

  **QA Scenarios**:
  ```
  Scenario: Drifter decides attack
    Tool: interactive_bash (Godot console)
    Steps: Create Drifter, call decide_action() with player party present
    Expected: Returns ATTACK action targeting random party member
    Evidence: .sisyphus/evidence/task-11-drifter-ai.txt

  Scenario: Enemy action execution
    Tool: interactive_bash
    Steps: Battle with Drifter, trigger enemy turn, check action result
    Expected: Drifter executes action, damage/effects applied
    Evidence: .sisyphus/evidence/task-11-enemy-action.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement enemy AI base and Drifter` | Files: `scalar/src/battle/enemy_ai.gd`, `scalar/src/battle/enemy_types/drifter_ai.gd`

---

- [x] 12. Intent System

  **What to do**:
  1. Add `intent: EnemyAction` property to EnemyAI
  2. Implement `calculate_intent()` called at turn start
  3. Implement `get_intent_display() -> Dictionary` with type, target, value
  4. Create intent icons mapping (ATTACK=⚔, DEFEND=🛡, BUFF=↑, etc.)
  5. Signal: `intent_changed(enemy: Unit, intent: Dictionary)`
  6. Ensure intent visible during player turn (Slay the Spire style)

  **Must NOT do**: Do not create visual UI components yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Strategic UI pattern
  - Skills: [] — Data preparation for UI
  - Omitted: [`frontend-ui-ux`] — Visual components in Wave 4

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Task 16 (Intent UI) | Blocked By: Task 11 (EnemyAI)

  **References**:
  - Intent: GDD Section 6 — K values and next turn action pre-revealed
  - Display: GDD Section 12 — Enemy Intent visible for player planning

  **Acceptance Criteria**:
  - [ ] Intent calculated at turn start, not changed mid-turn
  - [ ] Intent data includes all info needed for UI display
  - [ ] Multiple enemies each have independent intents
  - [ ] Signal fires when intent changes

  **QA Scenarios**:
  ```
  Scenario: Intent displayed correctly
    Tool: interactive_bash (Godot console)
    Steps: Start battle with 2 Drifters, check each intent
    Expected: Both have intents, types and values accessible
    Evidence: .sisyphus/evidence/task-12-intent.txt

  Scenario: Intent stable during turn
    Tool: interactive_bash
    Steps: Check intent, play cards, check intent again
    Expected: Intent unchanged until enemy turn executes
    Evidence: .sisyphus/evidence/task-12-intent-stable.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement enemy intent system` | Files: `scalar/src/battle/enemy_ai.gd`

---

<!-- Wave 4: Battle UI -->

- [x] 13. Hand UI Component

  **What to do**:
  1. Create `src/ui/hand_ui.tscn` scene with CardButton nodes
  2. Create `src/ui/hand_ui.gd` to manage card display
  3. Display cards from 3 decks with color coding (Scala=blue, Lambda=green, Riff=red)
  4. Implement card hover preview with AP cost and effect details
  5. Implement click-to-select, double-click to play
  6. Signal: `card_selected(card: Card)`, `card_play_requested(card: Card)`

  **Must NOT do**: Do not implement combo selection UI (Task 14)

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Interactive UI component
  - Skills: [`frontend-ui-ux`] — Card game UI patterns
  - Omitted: [`tdd-guide`] — UI tested visually

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: Task 14 | Blocked By: Task 5 (Card), Task 7 (DrawManager)

  **References**:
  - Hand display: GDD Section 12 — Deck color coding, focus mode
  - Max hand: 10 cards with overflow discard

  **Acceptance Criteria**:
  - [ ] Cards displayed in fan/row layout
  - [ ] Hover shows full card details (name, cost, effect, description)
  - [ ] Each deck's cards visually grouped or color-coded
  - [ ] Unplayable cards (insufficient AP) grayed out

  **QA Scenarios**:
  ```
  Scenario: Hand displays correctly
    Tool: playwright
    Steps: Start battle, draw cards, verify hand UI shows 6 cards (2 per deck)
    Expected: Cards visible with correct colors, hover shows details
    Evidence: .sisyphus/evidence/task-13-hand-ui.png

  Scenario: Card selection works
    Tool: playwright
    Steps: Click card in hand, verify selection state
    Expected: Card highlighted, card_selected signal emitted
    Evidence: .sisyphus/evidence/task-13-card-select.png
  ```

  **Commit**: YES | Message: `feat(scalar): implement hand UI with deck color coding` | Files: `scalar/src/ui/hand_ui.tscn`, `scalar/src/ui/hand_ui.gd`

---

- [x] 14. Combo Selection UI

  **What to do**:
  1. Create `src/ui/combo_selector.tscn` overlay panel
  2. Show available combos from ComboEngine with AP cost preview
  3. Implement unit selection (source → target)
  4. Display match probability: "Q(2) × AP(3) = 6 ≥ K(4) ✓"
  5. Confirm/Cancel buttons with AP deduction preview
  6. Connect to ComboEngine for execution

  **Must NOT do**: Do not auto-execute combos, explicit confirmation required

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Complex selection UI
  - Skills: [`frontend-ui-ux`] — Selection patterns
  - Omitted: [] — None

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: None | Blocked By: Task 10 (ComboEngine), Task 13 (HandUI)

  **References**:
  - Combo trigger: Metis decision — Explicit player action
  - Display: GDD Section 12 — Blue lines for ally combos, formula display

  **Acceptance Criteria**:
  - [ ] Available combos listed with AP costs
  - [ ] Selection shows match formula and success indicator
  - [ ] Confirm executes combo, cancel closes panel
  - [ ] AP cost shown before commitment (Metis guardrail)

  **QA Scenarios**:
  ```
  Scenario: Combo selection flow
    Tool: playwright
    Steps: Open combo selector, select Lambda→Scala combo, confirm
    Expected: Combo executes, AP deducted, V amplified
    Evidence: .sisyphus/evidence/task-14-combo-select.png

  Scenario: Failed combo blocked
    Tool: playwright
    Steps: Select combo with insufficient AP, attempt confirm
    Expected: Confirm disabled, error message shown
    Evidence: .sisyphus/evidence/task-14-combo-block.png
  ```

  **Commit**: YES | Message: `feat(scalar): implement combo selection UI` | Files: `scalar/src/ui/combo_selector.tscn`, `scalar/src/ui/combo_selector.gd`

---

- [x] 15. AP Bar UI

  **What to do**:
  1. Create `src/ui/ap_bar.tscn` with progress bar and numeric display
  2. Connect to APManager.ap_changed signal
  3. Show current/max AP (e.g., "5 / 5")
  4. Visual feedback on AP change (pulse animation)
  5. Color coding: green (plenty), yellow (low), red (critical)

  **Must NOT do**: Do not implement AP scaling display (that's for later phases)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Simple UI component
  - Skills: [`frontend-ui-ux`] — Progress bar patterns
  - Omitted: [] — None

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: None | Blocked By: Task 3 (APManager)

  **References**:
  - AP display: GDD Section 12 — AP preview system
  - Base AP: 5 per turn

  **Acceptance Criteria**:
  - [ ] AP bar updates in real-time
  - [ ] Numeric display accurate
  - [ ] Color changes based on remaining AP
  - [ ] Animation on AP change

  **QA Scenarios**:
  ```
  Scenario: AP bar updates
    Tool: playwright
    Steps: Start turn (AP=5), play card (cost=3), check AP bar
    Expected: Shows "2 / 5", yellow color
    Evidence: .sisyphus/evidence/task-15-ap-bar.png
  ```

  **Commit**: YES | Message: `feat(scalar): implement AP bar UI` | Files: `scalar/src/ui/ap_bar.tscn`, `scalar/src/ui/ap_bar.gd`

---

- [x] 16. Matching Visualization

  **What to do**:
  1. Create `src/ui/matching_indicator.gd` as CanvasLayer
  2. Draw blue lines between units for potential ally combos
  3. Draw red crosshairs on enemies for targeting opportunities
  4. Show formula tooltip on hover: "Q(3) × AP(2) = 6 ≥ K(4) ✓"
  5. Update in real-time as cards are selected
  6. Toggle visibility with "Show Match Info" button

  **Must NOT do**: Do not auto-highlight best plays, player discovers combos

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Complex visual feedback
  - Skills: [`frontend-ui-ux`] — Line drawing, tooltips
  - Omitted: [] — None

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: None | Blocked By: Task 2 (MatchEngine), Task 12 (Intent)

  **References**:
  - Visualization: GDD Section 12 — Blue lines (ally), red crosshairs (enemy)
  - Formula display: "Q(3) × AP(2) = 6 ≥ K(4) ✓"

  **Acceptance Criteria**:
  - [ ] Blue lines connect units where Q×AP ≥ K for ally combos
  - [ ] Red crosshairs appear on enemies player can target
  - [ ] Formula displayed on hover
  - [ ] Lines update when card selection changes AP allocation

  **QA Scenarios**:
  ```
  Scenario: Matching lines display
    Tool: playwright
    Steps: Start battle, select card with Q effect, verify lines appear
    Expected: Blue lines for valid combos, red for valid targets
    Evidence: .sisyphus/evidence/task-16-match-viz.png

  Scenario: Formula tooltip
    Tool: playwright
    Steps: Hover over matching indicator line
    Expected: Shows "Q(X) × AP(Y) = Z ≥ K(N) ✓" or "✗"
    Evidence: .sisyphus/evidence/task-16-formula.png
  ```

  **Commit**: YES | Message: `feat(scalar): implement matching visualization with formula display` | Files: `scalar/src/ui/matching_indicator.gd`

---

<!-- Wave 5: Content Data -->

- [x] 17. Card JSON Definitions

  **What to do**:
  1. Create `src/data/cards/` directory
  2. Create `scala_cards.json`, `lambda_cards.json`, `riff_cards.json`
  3. Define 10 cards per deck (30 total) matching GDD examples
  4. Include: id, name, description, ap_cost, type, target, effects[]
  5. Validate JSON schema on load
  6. Create `CardLoader.gd` to parse JSON into Card resources

  **Must NOT do**: Do not create all 30 unique cards yet, use variations of GDD examples

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Data entry, no complex logic
  - Skills: [] — JSON formatting
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: Task 25 (DeckBuilding) | Blocked By: Task 5 (Card)

  **References**:
  - Card examples: GDD Section 5 — Scala's 증폭, 감쇠, 공명 조율; Lambda's 저주파 확산; Riff's 고주파 집중

  **Acceptance Criteria**:
  - [ ] 30 cards defined (10 per deck)
  - [ ] JSON valid and parses without errors
  - [ ] CardLoader creates Card resources from JSON
  - [ ] All required fields present in each card

  **QA Scenarios**:
  ```
  Scenario: Cards load correctly
    Tool: Bash + Godot
    Steps: Run CardLoader, verify 30 cards loaded, check sample card properties
    Expected: All cards loaded, Scala's "증폭" has V_BUFF +3 TEMPORARY
    Evidence: .sisyphus/evidence/task-17-cards-json.txt
  ```

  **Commit**: YES | Message: `feat(scalar): add card JSON definitions (30 cards)` | Files: `scalar/src/data/cards/*.json`, `scalar/src/battle/card_loader.gd`

---

- [ ] 18. Enemy JSON Definitions

  **What to do**:
  1. Create `src/data/enemies/` directory
  2. Create `zone1_enemies.json`, `zone2_enemies.json`, `zone3_enemies.json`
  3. Define 5 enemies per zone (15 total) per GDD
  4. Include: id, name, k_value, hp, ai_type, special_abilities[]
  5. Create boss definitions in separate `bosses.json`
  6. Create `EnemyLoader.gd` to parse into Unit resources with AI

  **Must NOT do**: Do not implement AI behaviors, only data definitions

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Data entry
  - Skills: [] — JSON formatting
  - Omitted: [] — None

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: Task 11 (AI) | Blocked By: Task 4 (Unit)

  **References**:
  - Enemies: GDD Section 6 — Zone 1 (K=2-4), Zone 2 (K=5-8), Zone 3 (K=9-14)
  - Bosses: Tunnel Oracle (K=6), Broadcast Tower (K=10), Vector (K=18)

  **Acceptance Criteria**:
  - [ ] 15 enemies + 3 bosses defined
  - [ ] K values match GDD ranges per zone
  - [ ] EnemyLoader creates Unit + AI pairs
  - [ ] Boss entries include phase data

  **QA Scenarios**:
  ```
  Scenario: Enemies load with correct stats
    Tool: Bash + Godot
    Steps: Load Zone 1 enemies, verify Drifter has K=2, HP=8
    Expected: Stats match GDD, AI type assigned correctly
    Evidence: .sisyphus/evidence/task-18-enemies-json.txt
  ```

  **Commit**: YES | Message: `feat(scalar): add enemy JSON definitions (15 + 3 bosses)` | Files: `scalar/src/data/enemies/*.json`, `scalar/src/battle/enemy_loader.gd`

---

- [ ] 19. Relic JSON Definitions

  **What to do**:
  1. Create `src/data/relics.json`
  2. Define 10+ relics with passive effects
  3. Include: id, name, description, effect_type, value, rarity
  4. Effect types: STAT_MODIFY (K+1), MULTIPLIER (V×1.5), TRIGGER (AP refund)
  5. Create `RelicLoader.gd` and `RelicManager.gd` for runtime management

  **Must NOT do**: Do not implement relic UI yet

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Data entry
  - Skills: [] — JSON formatting
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: Task 27 (Relics) | Blocked By: None

  **References**:
  - Relics: GDD Section 9 — Noise Filter, Amplifier Node, Memory Fragment, etc.

  **Acceptance Criteria**:
  - [ ] 10+ relics defined
  - [ ] Effect types cover STAT_MODIFY, MULTIPLIER, TRIGGER
  - [ ] RelicLoader creates Relic resources
  - [ ] RelicManager tracks active relics (max 10)

  **QA Scenarios**:
  ```
  Scenario: Relics load and apply
    Tool: Bash + Godot
    Steps: Load relics, add "Noise Filter" to active, check K bonus applied
    Expected: All party K values +1
    Evidence: .sisyphus/evidence/task-19-relics-json.txt
  ```

  **Commit**: YES | Message: `feat(scalar): add relic JSON definitions (10+)` | Files: `scalar/src/data/relics.json`, `scalar/src/core/relic_manager.gd`

---

- [ ] 20. Story Fragment JSON

  **What to do**:
  1. Create `src/data/story/` directory
  2. Create `scala_fragments.json`, `lambda_fragments.json`, `riff_fragments.json`
  3. Define 10 fragments per character (30 total)
  4. Include: id, character, sequence_num, trigger_zone, trigger_condition, text
  5. Create `StoryLoader.gd` and `StoryManager.gd` for sequential unlocking

  **Must NOT do**: Do not implement story display UI yet

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Data entry
  - Skills: [] — JSON formatting
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: Task 25 (Story) | Blocked By: None

  **References**:
  - Fragments: GDD Section 11 — 30 total, sequential unlock, zone-gated

  **Acceptance Criteria**:
  - [ ] 30 fragments defined
  - [ ] Each has sequence number for unlock order
  - [ ] Trigger conditions defined (zone, run_count, special)
  - [ ] StoryLoader validates sequence integrity

  **QA Scenarios**:
  ```
  Scenario: Fragments load sequentially
    Tool: Bash + Godot
    Steps: Load fragments, check Scala fragment 2 requires fragment 1
    Expected: Dependencies correct, no orphan fragments
    Evidence: .sisyphus/evidence/task-20-story-json.txt
  ```

  **Commit**: YES | Message: `feat(scalar): add story fragment JSON (30 fragments)` | Files: `scalar/src/data/story/*.json`, `scalar/src/story/story_loader.gd`

---

<!-- Wave 6: Map & Progression -->

- [ ] 21. Map Generator

  **What to do**:
  1. Create `src/map/map_generator.gd`
  2. Define node types: COMBAT, ELITE, EVENT, SHOP, REST, BOSS
  3. Generate branching paths (2-3 branches per node)
  4. Zone structure: 4-6 combats, 1-2 events, 1 shop, 1 boss
  5. Implement `generate_zone(zone_num: int) -> MapNode`
  6. Visualize ahead: show next 2 encounters

  **Must NOT do**: Do not create map UI yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Roguelike generation algorithm
  - Skills: [] — Procedural generation
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: NO | Wave 6 | Blocks: Task 23 (MapUI) | Blocked By: Task 9 (Battle)

  **References**:
  - Map: GDD Section 10 — 4-6 combats, 1-2 events, 1 shop, 1 boss per zone
  - Branching: 2-3 paths, visible ahead 2 encounters

  **Acceptance Criteria**:
  - [ ] Map has branching paths
  - [ ] Node distribution matches spec
  - [ ] Boss always at zone end
  - [ ] Map reproducible with seed

  **QA Scenarios**:
  ```
  Scenario: Zone 1 map generates correctly
    Tool: Bash + Godot
    Steps: Generate Zone 1 with seed 12345, count node types
    Expected: 4-6 COMBAT, 1-2 EVENT, 1 SHOP, 1 BOSS
    Evidence: .sisyphus/evidence/task-21-map-gen.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement roguelike map generator` | Files: `scalar/src/map/map_generator.gd`, `scalar/src/map/map_node.gd`

---

- [ ] 22. Zone Manager

  **What to do**:
  1. Create `src/map/zone_manager.gd` as Autoload
  2. Track current zone (1-3), current node, completed nodes
  3. Implement `advance_to_node(node: MapNode)`
  4. Implement `complete_current_node()` → trigger rewards/events
  5. Implement `transition_to_next_zone()` on boss defeat
  6. Signal: `zone_changed(zone: int)`, `node_completed(node: MapNode)`

  **Must NOT do**: Do not implement zone-specific difficulty scaling yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Progression orchestration
  - Skills: [] — State management
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: NO | Wave 6 | Blocks: Task 23 (MapUI) | Blocked By: Task 21 (MapGen)

  **References**:
  - Zones: GDD Section 2 — 3 zones with increasing K values
  - Progression: Zone 1 → Zone 2 → Zone 3 → Final Boss

  **Acceptance Criteria**:
  - [ ] Zone 1 → 2 → 3 progression works
  - [ ] Boss defeat triggers zone transition
  - [ ] Node completion triggers appropriate reward/event
  - [ ] Current position tracked accurately

  **QA Scenarios**:
  ```
  Scenario: Zone progression
    Tool: Bash + Godot
    Steps: Complete Zone 1 boss, check current zone
    Expected: Zone = 2, new map generated
    Evidence: .sisyphus/evidence/task-22-zone-progress.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement zone manager` | Files: `scalar/src/map/zone_manager.gd`

---

- [ ] 23. Map UI

  **What to do**:
  1. Create `src/ui/map_ui.tscn` with node visualization
  2. Display current zone map with branching paths
  3. Node icons: ⚔ (combat), 👑 (elite), 📜 (event), 🏪 (shop), ⛺ (rest), 💀 (boss)
  4. Highlight available nodes (connected to current position)
  5. Click node → confirm → advance
  6. Show completed nodes as dimmed

  **Must NOT do**: Do not animate map transitions yet

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Interactive map UI
  - Skills: [`frontend-ui-ux`] — Graph visualization
  - Omitted: [] — None

  **Parallelization**: Can Parallel: NO | Wave 6 | Blocks: None | Blocked By: Task 21 (MapGen), Task 22 (ZoneMgr)

  **References**:
  - Map display: GDD Section 10 — 2-3 paths, visible 2 ahead
  - Node icons: GDD Section 10 — Emoji mapping

  **Acceptance Criteria**:
  - [ ] Map displays with correct node icons
  - [ ] Available nodes clickable, unavailable grayed
  - [ ] Clicking advances to that node
  - [ ] Zone transitions show new map

  **QA Scenarios**:
  ```
  Scenario: Map navigation
    Tool: playwright
    Steps: View Zone 1 map, click available combat node
    Expected: Battle starts, node marked as current
    Evidence: .sisyphus/evidence/task-23-map-ui.png
  ```

  **Commit**: YES | Message: `feat(scalar): implement map UI with node selection` | Files: `scalar/src/ui/map_ui.tscn`, `scalar/src/ui/map_ui.gd`

---

- [ ] 24. Shop System

  **What to do**:
  1. Create `src/map/shop.gd`
  2. Generate shop inventory: 3-5 cards, 1-2 relics, 1-2 consumables
  3. Implement currency: Resonance (earned from combat)
  4. Implement buy/sell/remove card functions
  5. Prices: Cards 50-150, Relics 150-300, Remove 75
  6. Signal: `item_purchased(item, cost)`, `shop_closed()`

  **Must NOT do**: Do not implement shop UI yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Economy balance
  - Skills: [] — Transaction logic
  - Omitted: [`frontend-ui-ux`] — UI separate

  **Parallelization**: Can Parallel: YES | Wave 6 | Blocks: Task 26 (ShopUI) | Blocked By: Task 17 (Cards), Task 19 (Relics)

  **References**:
  - Shop: GDD Section 8 — Resonance currency, upgrade costs
  - Prices: GDD Section 15 — Card +1 = 50, +2 = 100, Remove = 75

  **Acceptance Criteria**:
  - [ ] Shop generates valid inventory
  - [ ] Purchases deduct Resonance, add to player
  - [ ] Card removal works with cost
  - [ ] Insufficient funds blocks purchase

  **QA Scenarios**:
  ```
  Scenario: Shop purchase
    Tool: Bash + Godot
    Steps: Open shop with 200 Resonance, buy card costing 100
    Expected: Resonance = 100, card added to deck
    Evidence: .sisyphus/evidence/task-24-shop.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement shop system with currency` | Files: `scalar/src/map/shop.gd`

---

- [ ] 25. Rest Point System

  **What to do**:
  1. Create `src/map/rest_point.gd`
  2. Options: Heal 30% HP, Revive Signal Lost ally, Upgrade card, Remove card
  3. Limit: Only 1 action per rest point
  4. Implement revival: Signal Lost → 50% HP
  5. Connect to UnitManager and Deck for HP/card modifications
  6. Signal: `rest_action_taken(action: String)`

  **Must NOT do**: Do not create rest UI yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multi-option system
  - Skills: [] — Option handling
  - Omitted: [`frontend-ui-ux`] — UI separate

  **Parallelization**: Can Parallel: YES | Wave 6 | Blocks: None | Blocked By: Task 4 (Unit), Task 6 (Deck)

  **References**:
  - Rest: GDD Section 7 — Full party heal + revive
  - Revival: Lambda's "저주파 펄스" also provides between-battle revival

  **Acceptance Criteria**:
  - [ ] Heal option restores 30% HP to all party
  - [ ] Revive option brings back one Signal Lost ally
  - [ ] Only one action allowed per rest
  - [ ] No Signal Lost allies → Revive option disabled

  **QA Scenarios**:
  ```
  Scenario: Rest heal
    Tool: Bash + Godot
    Steps: Party HP at 50%, choose Heal at rest point
    Expected: All units +30% HP (capped at max)
    Evidence: .sisyphus/evidence/task-25-rest.txt

  Scenario: Rest revive
    Tool: Bash + Godot
    Steps: Lambda Signal Lost, choose Revive at rest point
    Expected: Lambda HP = 50% of max, active again
    Evidence: .sisyphus/evidence/task-25-revive.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement rest point system` | Files: `scalar/src/map/rest_point.gd`

---

<!-- Wave 7: Story & Meta -->

- [ ] 26. Story Manager

  **What to do**:
  1. Create `src/story/story_manager.gd` as Autoload
  2. Load all 30 fragments from StoryLoader
  3. Track unlocked fragments per character (0-10 each)
  4. Implement `check_fragment_unlock(character: String, context: Dictionary) -> Fragment`
  5. Context includes: current_zone, run_count, special_conditions
  6. Signal: `fragment_unlocked(fragment: Fragment)`

  **Must NOT do**: Do not create story display UI yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Sequential unlock logic
  - Skills: [] — State management
  - Omitted: [`frontend-ui-ux`] — UI separate

  **Parallelization**: Can Parallel: NO | Wave 7 | Blocks: Task 28 (StoryUI) | Blocked By: Task 20 (StoryJSON)

  **References**:
  - Unlock: GDD Section 11 — Sequential, zone-gated, conditional
  - Rules: Fragment N+1 requires Fragment N witnessed

  **Acceptance Criteria**:
  - [ ] Fragments unlock only in sequence
  - [ ] Zone restrictions enforced (Zone 2 fragments don't appear in Zone 1)
  - [ ] Special conditions checked (e.g., boss with Lambda alive)
  - [ ] Unlocked fragments persist across runs

  **QA Scenarios**:
  ```
  Scenario: Sequential unlock
    Tool: Bash + Godot
    Steps: Witness Scala fragment 1, check fragment 2 availability
    Expected: Fragment 2 now available in appropriate zone
    Evidence: .sisyphus/evidence/task-26-story-unlock.txt

  Scenario: Zone restriction
    Tool: Bash + Godot
    Steps: Start in Zone 1, check for Zone 2 fragments
    Expected: Zone 2 fragments not available
    Evidence: .sisyphus/evidence/task-26-zone-restrict.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement story manager with sequential unlocking` | Files: `scalar/src/story/story_manager.gd`

---

- [ ] 27. Save System

  **What to do**:
  1. Create `src/core/save_manager.gd` as Autoload
  2. Define save data structure: run_progress, unlocked_fragments, unlocked_cards, relics_owned, meta_currency
  3. Implement `save_game()` to JSON file in user://
  4. Implement `load_game()` with validation
  5. Auto-save after: combat, shop, rest, fragment unlock
  6. Implement `reset_run()` for new run (keeps meta progress)

  **Must NOT do**: Do not implement cloud saves, only local

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Critical persistence
  - Skills: [] — JSON serialization
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: NO | Wave 7 | Blocks: None | Blocked By: Task 26 (StoryMgr)

  **References**:
  - Save: Metis guardrail — Story fragments need persistent save system
  - Persistence: GDD Section 7 — Progress saved: cards, fragments, relics

  **Acceptance Criteria**:
  - [ ] Save creates valid JSON file
  - [ ] Load restores all state correctly
  - [ ] Corrupt save handled gracefully (reset with warning)
  - [ ] Auto-save triggers at correct points

  **QA Scenarios**:
  ```
  Scenario: Save and load cycle
    Tool: Bash + Godot
    Steps: Progress to Zone 2, save, restart, load
    Expected: All state restored, position in Zone 2
    Evidence: .sisyphus/evidence/task-27-save-load.txt

  Scenario: Fragment persistence
    Tool: Bash + Godot
    Steps: Unlock Scala fragment 3, save, new run, load
    Expected: Fragment 3 still unlocked, fragment 4 available
    Evidence: .sisyphus/evidence/task-27-fragment-persist.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement save system with auto-save` | Files: `scalar/src/core/save_manager.gd`

---

- [ ] 28. Meta Progression

  **What to do**:
  1. Create `src/core/meta_progression.gd`
  2. Track: total_runs, total_victories, fragments_seen, characters_unlocked
  3. Unlock starting cards based on run count (after 5 runs: +1 starter card option)
  4. Track ending reached (Vector freed)
  5. Implement `get_meta_rewards() -> Array` for new run bonuses
  6. Display stats: win rate, favorite character, total playtime

  **Must NOT do**: Do not implement meta UI yet

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Long-term progression
  - Skills: [] — Stats tracking
  - Omitted: [`frontend-ui-ux`] — UI separate

  **Parallelization**: Can Parallel: YES | Wave 7 | Blocks: None | Blocked By: Task 27 (SaveMgr)

  **References**:
  - Meta: GDD Section 11 — Fragments unlock across runs
  - Victory: GDD Section 16 — Single bittersweet ending

  **Acceptance Criteria**:
  - [ ] Run count increments each new run
  - [ ] Victory unlocks ending achievement
  - [ ] Meta rewards apply to new runs
  - [ ] Stats accurate and queryable

  **QA Scenarios**:
  ```
  Scenario: Meta progression tracks runs
    Tool: Bash + Godot
    Steps: Complete 3 runs, check total_runs
    Expected: total_runs = 3, stats updated
    Evidence: .sisyphus/evidence/task-28-meta.txt
  ```

  **Commit**: YES | Message: `feat(scalar): implement meta progression system` | Files: `scalar/src/core/meta_progression.gd`

---

<!-- Wave 8: Polish -->

- [ ] 29. Balance Pass

  **What to do**:
  1. Review all enemy K values vs player Q ranges
  2. Verify AP scaling feels right (not too easy/hard)
  3. Check card costs vs effects (any overpowered cards?)
  4. Test combo multipliers (V amplification balanced?)
  5. Adjust boss HP/damage based on playtest feel
  6. Document any changes in `balance_changelog.md`

  **Must NOT do**: Do not redesign mechanics, only tune numbers

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Requires playtesting and judgment
  - Skills: [] — Balance analysis
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 8 | Blocks: None | Blocked By: All previous tasks

  **References**:
  - Balance: GDD Section 15 — Zone K ranges, AP scaling
  - Curves: Zone 1 (K=2-4), Zone 2 (K=5-8), Zone 3 (K=9-14)

  **Acceptance Criteria**:
  - [ ] Zone 1 completable with base deck
  - [ ] Zone 3 requires deck upgrades to beat
  - [ ] No card is strictly better than another
  - [ ] Boss fights feel challenging but fair

  **QA Scenarios**:
  ```
  Scenario: Full run balance test
    Tool: playwright + manual
    Steps: Complete full run from Zone 1 to Zone 3 boss
    Expected: Challenging but winnable with good decisions
    Evidence: .sisyphus/evidence/task-29-balance.txt
  ```

  **Commit**: YES | Message: `fix(scalar): balance pass adjustments` | Files: `scalar/src/data/**/*.json`, `scalar/docs/balance_changelog.md`

---

- [ ] 30. UI Polish

  **What to do**:
  1. Add hover animations to cards (scale, glow)
  2. Add AP change animation (pulse, number fly)
  3. Add damage/heal number popups
  4. Add combo execution visual effect (blue flash)
  5. Add enemy intent animation (subtle pulse)
  6. Add screen shake on big hits
  7. Add card draw/discard animations

  **Must NOT do**: Do not redesign UI, only enhance

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: Polish and feel
  - Skills: [`frontend-ui-ux`] — Animation, feedback
  - Omitted: [] — None

  **Parallelization**: Can Parallel: YES | Wave 8 | Blocks: None | Blocked By: Task 13-16 (UI)

  **References**:
  - Feedback: GDD Section 12 — Visual matching indicators

  **Acceptance Criteria**:
  - [ ] All animations < 300ms (snappy feel)
  - [ ] Visual feedback for every player action
  - [ ] Animations don't block gameplay
  - [ ] Reduced motion option available

  **QA Scenarios**:
  ```
  Scenario: UI animations work
    Tool: playwright
    Steps: Play card, observe animations
    Expected: Card animates, AP pulses, damage number appears
    Evidence: .sisyphus/evidence/task-30-ui-polish.png
  ```

  **Commit**: YES | Message: `feat(scalar): add UI polish and animations` | Files: `scalar/src/ui/**/*.gd`

---

- [ ] 31. Audio Placeholders

  **What to do**:
  1. Add placeholder SFX: card draw, card play, match success, match fail, damage, heal
  2. Add placeholder music: menu, battle, boss, victory, defeat
  3. Use free assets from freesound.org or similar
  4. Create `AudioManager.gd` for centralized audio control
  5. Add volume controls to settings
  6. All audio optional (can mute)

  **Must NOT do**: Do not create final audio, only placeholders

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Asset integration
  - Skills: [] — Audio setup
  - Omitted: [`frontend-ui-ux`] — No visuals

  **Parallelization**: Can Parallel: YES | Wave 8 | Blocks: None | Blocked By: None

  **References**:
  - Audio: GDD Section 1 — AI-generated assets (placeholder for prototype)

  **Acceptance Criteria**:
  - [ ] All key actions have audio feedback
  - [ ] Music loops seamlessly
  - [ ] Volume controls work
  - [ ] No audio bugs (overlap, cut-off)

  **QA Scenarios**:
  ```
  Scenario: Audio plays correctly
    Tool: playwright + manual listen
    Steps: Play card, listen for sound effect
    Expected: Appropriate SFX plays, not too loud
    Evidence: .sisyphus/evidence/task-31-audio.txt
  ```

  **Commit**: YES | Message: `feat(scalar): add placeholder audio` | Files: `scalar/assets/audio/`, `scalar/src/core/audio_manager.gd`

---

- [ ] 32. Bug Fix Sprint

  **What to do**:
  1. Run full playtest of complete game loop
  2. Document all bugs found in `bugs_found.md`
  3. Fix critical bugs (crashes, soft-locks, broken mechanics)
  4. Fix major bugs (incorrect damage, wrong state transitions)
  5. Log minor bugs for future (typos, visual glitches)
  6. Verify all QA scenarios pass

  **Must NOT do**: Do not add new features, only fix bugs

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Requires thorough testing
  - Skills: [] — Debugging
  - Omitted: [] — None

  **Parallelization**: Can Parallel: NO | Wave 8 | Blocks: None | Blocked By: All tasks

  **References**:
  - All GDD sections for expected behavior

  **Acceptance Criteria**:
  - [ ] Zero critical bugs
  - [ ] Zero major bugs
  - [ ] All QA scenarios pass
  - [ ] Full run completable without issues

  **QA Scenarios**:
  ```
  Scenario: Full regression test
    Tool: playwright + manual
    Steps: Complete full run, test all systems
    Expected: No crashes, no soft-locks, correct behavior
    Evidence: .sisyphus/evidence/task-32-bugfix.txt
  ```

  **Commit**: YES | Message: `fix(scalar): bug fixes from playtest` | Files: Various

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

---

## Commit Strategy
- Atomic commits per task
- Format: `feat(scalar): {description}` or `fix(scalar): {description}`
- No commits to main without passing tests

## Success Criteria
1. Complete run possible: Zone 1 → Zone 2 → Zone 3 → Victory/Defeat
2. All Q/K/V mechanics functional and visually clear
3. Deck-building meaningful: player choices affect outcomes
4. Story fragments unlock across multiple runs
5. No blocking bugs in core loop
6. Save/load preserves all progress
