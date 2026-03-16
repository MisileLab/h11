extends Node

## Battle State Machine — orchestrates turn-based battle flow.
##
## Manages battle lifecycle through six deterministic states:
##   INIT → PLAYER_TURN ↔ ENEMY_TURN → RESOLUTION → VICTORY | DEFEAT
##
## At each state transition, emits state_changed so downstream systems (UI,
## enemy AI, battle log) can react without polling.
##
## Responsibilities:
##   - Track current battle state
##   - Coordinate turn start (AP reset, card draw) via manager references
##   - Transition between player and enemy turns
##   - Detect victory (all enemies signal-lost) and defeat (all party signal-lost)
##
## Does NOT implement:
##   - Enemy AI decisions (Task 11)
##   - Combo logic or damage calculation details
##   - Battle UI (Task 13)
##
## References:
##   GDD Section 14 — Battle flow and turn structure
##   GDD Section 15 — AP reset at turn start

# --- Preloads ---
# Headless-compatible type alias (same pattern as card_player.gd).
const UnitRes := preload("res://src/core/unit.gd")

# --- Enums ---

## The six battle states. Transition order is enforced by the state machine.
enum State {
	INIT,         ## Battle created but not yet started.
	PLAYER_TURN,  ## Player may play cards, spend AP, etc.
	ENEMY_TURN,   ## Enemies execute their actions (placeholder for Task 11).
	RESOLUTION,   ## Post-action check: evaluate victory/defeat conditions.
	VICTORY,      ## All enemies are signal-lost. Battle is over.
	DEFEAT,       ## All party members are signal-lost. Battle is over.
}

# --- Signals ---

## Emitted on every state transition. Carries the new State enum value.
signal state_changed(new_state: int)

## Emitted at the start of each turn (player or enemy).
signal turn_started()

## Emitted at the end of each turn (player or enemy), before resolution.
signal turn_ended()

## Emitted when battle concludes with a victory.
signal battle_won()

## Emitted when battle concludes with a defeat.
signal battle_lost()

# --- Dependencies ---

## Injected via setup(). All must be non-null before start_battle().
var _unit_manager: Node = null
var _ap_manager: Node = null
var _draw_manager: Node = null

# --- State ---

## Current battle state. Read via get_current_state().
var _current_state: State = State.INIT

## Turn counter. Incremented at each player turn start.
var _turn_number: int = 0

# --- Public API ---

## Initialize with manager references. Must be called before start_battle().
func setup(unit_manager: Node, ap_manager: Node, draw_manager: Node) -> void:
	_unit_manager = unit_manager
	_ap_manager = ap_manager
	_draw_manager = draw_manager


## Returns true if all three manager dependencies have been assigned.
func is_ready() -> bool:
	return _unit_manager != null and _ap_manager != null and _draw_manager != null


## Returns the current battle state enum value.
func get_current_state() -> State:
	return _current_state


## Returns the current turn number (0 before battle starts).
func get_turn_number() -> int:
	return _turn_number


## Returns a human-readable name for the given state.
static func state_name(state: State) -> String:
	match state:
		State.INIT: return "INIT"
		State.PLAYER_TURN: return "PLAYER_TURN"
		State.ENEMY_TURN: return "ENEMY_TURN"
		State.RESOLUTION: return "RESOLUTION"
		State.VICTORY: return "VICTORY"
		State.DEFEAT: return "DEFEAT"
	return "UNKNOWN"


## Start a battle with the given enemy roster.
## Registers enemies with UnitManager, transitions INIT → PLAYER_TURN.
## Returns a result Dictionary for downstream consumption.
func start_battle(enemies: Array) -> Dictionary:
	if not is_ready():
		return {"success": false, "reason": "not_ready"}

	if _current_state != State.INIT:
		return {"success": false, "reason": "invalid_state"}

	if enemies.is_empty():
		return {"success": false, "reason": "no_enemies"}

	# Register enemies with UnitManager.
	_unit_manager.clear_enemies()
	for enemy in enemies:
		_unit_manager.add_enemy(enemy)

	_turn_number = 0

	# Transition to first player turn.
	_begin_player_turn()

	return {
		"success": true,
		"enemy_count": enemies.size(),
		"turn_number": _turn_number,
	}


## End the player's turn. Transitions PLAYER_TURN → RESOLUTION → ENEMY_TURN.
## Returns a result Dictionary.
func end_player_turn() -> Dictionary:
	if _current_state != State.PLAYER_TURN:
		return {"success": false, "reason": "not_player_turn"}

	turn_ended.emit()

	# Check for battle end before moving to enemy turn.
	_set_state(State.RESOLUTION)
	var end_result: Dictionary = check_battle_end()
	if end_result["battle_over"]:
		return {"success": true, "battle_over": true, "result": end_result["result"]}

	# No battle end — proceed to enemy turn.
	_begin_enemy_turn()

	return {"success": true, "battle_over": false}


## End the enemy's turn. Transitions ENEMY_TURN → RESOLUTION → PLAYER_TURN.
## Called by enemy AI (Task 11) when all enemy actions are complete.
## Returns a result Dictionary.
func end_enemy_turn() -> Dictionary:
	if _current_state != State.ENEMY_TURN:
		return {"success": false, "reason": "not_enemy_turn"}

	turn_ended.emit()

	# Check for battle end before returning to player.
	_set_state(State.RESOLUTION)
	var end_result: Dictionary = check_battle_end()
	if end_result["battle_over"]:
		return {"success": true, "battle_over": true, "result": end_result["result"]}

	# No battle end — proceed to next player turn.
	_begin_player_turn()

	return {"success": true, "battle_over": false}


## Evaluate victory/defeat conditions based on UnitManager state.
## Returns a deterministic Dictionary:
##   { battle_over: bool, result: "victory" | "defeat" | "ongoing",
##     active_party: int, active_enemies: int }
func check_battle_end() -> Dictionary:
	var active_party: int = _unit_manager.get_active_party().size()
	var active_enemies: int = _unit_manager.get_active_enemies().size()

	# Defeat: all party members signal-lost.
	if active_party == 0:
		_set_state(State.DEFEAT)
		battle_lost.emit()
		return {
			"battle_over": true,
			"result": "defeat",
			"active_party": active_party,
			"active_enemies": active_enemies,
		}

	# Victory: all enemies signal-lost.
	if active_enemies == 0:
		_set_state(State.VICTORY)
		battle_won.emit()
		return {
			"battle_over": true,
			"result": "victory",
			"active_party": active_party,
			"active_enemies": active_enemies,
		}

	# Battle continues.
	return {
		"battle_over": false,
		"result": "ongoing",
		"active_party": active_party,
		"active_enemies": active_enemies,
	}


## Returns true if battle is in a terminal state (VICTORY or DEFEAT).
func is_battle_over() -> bool:
	return _current_state == State.VICTORY or _current_state == State.DEFEAT


# --- Private: State Transitions ---

## Set state and emit state_changed signal.
func _set_state(new_state: State) -> void:
	_current_state = new_state
	state_changed.emit(new_state)


## Begin a player turn: increment turn counter, reset AP, draw cards, emit turn_started.
func _begin_player_turn() -> void:
	_turn_number += 1
	_set_state(State.PLAYER_TURN)

	# Reset AP to max at turn start (GDD Section 15).
	_ap_manager.reset_ap()

	# Draw cards if draw manager is set up.
	if _draw_manager.is_ready():
		_draw_manager.draw_turn_start()

	turn_started.emit()


## Begin an enemy turn: set state, emit turn_started.
## Enemy AI (Task 11) will listen and execute actions, then call end_enemy_turn().
func _begin_enemy_turn() -> void:
	_set_state(State.ENEMY_TURN)
	turn_started.emit()


# --- Lifecycle ---

func _ready() -> void:
	print("BattleSystem initialized — state machine ready")
