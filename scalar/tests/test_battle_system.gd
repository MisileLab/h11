extends SceneTree

## Verification test for battle_system.gd — Task 9.
## Runs headless:  godot --headless --script tests/test_battle_system.gd
##
## Tests:
##   1. Guard: not_ready before setup
##   2. Guard: no_enemies on empty array
##   3. Full cycle: start → player turn → enemy turn → back to player turn
##   4. Victory: all enemies signal-lost after player turn
##   5. Defeat: all party signal-lost after enemy turn
##   6. Signal emissions tracked via counters
##   7. Turn number increments correctly
##   8. AP reset called at player turn start
##   9. is_battle_over() returns correct values
##  10. state_name() static method

const BattleSystemScript := preload("res://src/battle/battle_system.gd")


## Lightweight mock that stands in for DrawManager in headless tests.
## BattleSystem only calls is_ready() and draw_turn_start() on draw_manager.
## We keep is_ready() → false so draw_turn_start() is never reached, matching
## the un-setup'd DrawManager behaviour the original test intended.
class MockDrawManager extends Node:
	func is_ready() -> bool:
		return false

	func draw_turn_start() -> Dictionary:
		return {}


var _pass_count: int = 0
var _fail_count: int = 0

# Signal counters
var _state_changed_count: int = 0
var _turn_started_count: int = 0
var _turn_ended_count: int = 0
var _battle_won_count: int = 0
var _battle_lost_count: int = 0
var _last_state: int = -1


func _init() -> void:
	# Run all tests and quit.
	print("\n=== BattleSystem Verification Tests ===\n")

	test_guard_not_ready()
	test_guard_no_enemies()
	test_guard_invalid_state()
	test_full_turn_cycle()
	test_victory_condition()
	test_defeat_condition()
	test_state_name()
	test_is_battle_over()
	test_turn_number_increments()
	test_ap_reset_on_player_turn()

	print("\n=== Results: %d passed, %d failed ===" % [_pass_count, _fail_count])

	if _fail_count > 0:
		print("FAIL")
		quit(1)
	else:
		print("ALL PASS")
		quit(0)


# --- Helpers ---

func assert_eq(actual: Variant, expected: Variant, label: String) -> void:
	if actual == expected:
		_pass_count += 1
		print("  PASS: %s" % label)
	else:
		_fail_count += 1
		print("  FAIL: %s — expected '%s', got '%s'" % [label, str(expected), str(actual)])


func assert_true(condition: bool, label: String) -> void:
	assert_eq(condition, true, label)


func assert_false(condition: bool, label: String) -> void:
	assert_eq(condition, false, label)


func _make_battle_system() -> Node:
	return BattleSystemScript.new()


func _make_unit(uname: String, hp: int, utype: int = Unit.UnitType.SCALA) -> Unit:
	var u := Unit.new()
	u.unit_name = uname
	u.unit_type = utype
	u.max_hp = hp
	u.current_hp = hp
	u.q_value = 5
	u.k_value = 5
	u.v_value = 5
	return u


func _make_unit_manager() -> Node:
	var um := preload("res://src/core/unit_manager.gd").new()
	return um


func _make_ap_manager() -> Node:
	var ap := preload("res://src/core/ap_manager.gd").new()
	return ap


func _make_draw_manager() -> Node:
	# Mock DrawManager: is_ready() → false, draw_turn_start() → {}.
	# Avoids preloading real DrawManager which depends on Deck/Card class_names
	# that fail to resolve in headless mode.
	return MockDrawManager.new()


func _setup_system(bs: Node, um: Node, ap: Node, dm: Node) -> void:
	bs.setup(um, ap, dm)


func _connect_signals(bs: Node) -> void:
	_state_changed_count = 0
	_turn_started_count = 0
	_turn_ended_count = 0
	_battle_won_count = 0
	_battle_lost_count = 0
	_last_state = -1

	bs.state_changed.connect(_on_state_changed)
	bs.turn_started.connect(_on_turn_started)
	bs.turn_ended.connect(_on_turn_ended)
	bs.battle_won.connect(_on_battle_won)
	bs.battle_lost.connect(_on_battle_lost)


func _on_state_changed(new_state: int) -> void:
	_state_changed_count += 1
	_last_state = new_state


func _on_turn_started() -> void:
	_turn_started_count += 1


func _on_turn_ended() -> void:
	_turn_ended_count += 1


func _on_battle_won() -> void:
	_battle_won_count += 1


func _on_battle_lost() -> void:
	_battle_lost_count += 1


# --- Tests ---

func test_guard_not_ready() -> void:
	print("Test: guard — not_ready before setup")
	var bs := _make_battle_system()
	var enemy := _make_unit("Goblin", 10, Unit.UnitType.ENEMY)
	var result: Dictionary = bs.start_battle([enemy])
	assert_eq(result["success"], false, "start_battle fails when not ready")
	assert_eq(result["reason"], "not_ready", "reason is not_ready")
	bs.free()


func test_guard_no_enemies() -> void:
	print("Test: guard — no_enemies")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)

	# Add a party member so unit manager is populated.
	um.add_party_member(_make_unit("Scala", 20))

	var result: Dictionary = bs.start_battle([])
	assert_eq(result["success"], false, "start_battle fails with empty enemies")
	assert_eq(result["reason"], "no_enemies", "reason is no_enemies")
	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_guard_invalid_state() -> void:
	print("Test: guard — invalid_state (double start)")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)
	um.add_party_member(_make_unit("Scala", 20))

	var enemy := _make_unit("Goblin", 10, Unit.UnitType.ENEMY)
	bs.start_battle([enemy])

	# Try starting again — should fail.
	var result: Dictionary = bs.start_battle([_make_unit("Orc", 15, Unit.UnitType.ENEMY)])
	assert_eq(result["success"], false, "double start_battle fails")
	assert_eq(result["reason"], "invalid_state", "reason is invalid_state")
	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_full_turn_cycle() -> void:
	print("Test: full turn cycle — INIT → PLAYER → ENEMY → PLAYER")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)
	_connect_signals(bs)

	um.add_party_member(_make_unit("Scala", 20))
	var enemy := _make_unit("Goblin", 10, Unit.UnitType.ENEMY)

	# Start battle → PLAYER_TURN
	var start_result: Dictionary = bs.start_battle([enemy])
	assert_true(start_result["success"], "start_battle succeeds")
	assert_eq(start_result["enemy_count"], 1, "enemy_count is 1")
	assert_eq(bs.get_current_state(), 1, "state is PLAYER_TURN (1)")
	assert_eq(bs.get_turn_number(), 1, "turn number is 1")

	# End player turn → RESOLUTION → ENEMY_TURN (battle not over)
	var end_p: Dictionary = bs.end_player_turn()
	assert_true(end_p["success"], "end_player_turn succeeds")
	assert_false(end_p["battle_over"], "battle not over after player turn")
	assert_eq(bs.get_current_state(), 2, "state is ENEMY_TURN (2)")

	# End enemy turn → RESOLUTION → PLAYER_TURN (battle not over)
	var end_e: Dictionary = bs.end_enemy_turn()
	assert_true(end_e["success"], "end_enemy_turn succeeds")
	assert_false(end_e["battle_over"], "battle not over after enemy turn")
	assert_eq(bs.get_current_state(), 1, "state is PLAYER_TURN (1) again")
	assert_eq(bs.get_turn_number(), 2, "turn number is 2")

	# Signal checks
	assert_true(_turn_started_count >= 3, "turn_started emitted ≥3 times (p1, e1, p2)")
	assert_true(_turn_ended_count >= 2, "turn_ended emitted ≥2 times (end_p, end_e)")
	assert_true(_state_changed_count >= 5, "state_changed emitted ≥5 times")

	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_victory_condition() -> void:
	print("Test: victory — all enemies signal-lost")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)
	_connect_signals(bs)

	um.add_party_member(_make_unit("Scala", 20))
	var enemy := _make_unit("Goblin", 10, Unit.UnitType.ENEMY)

	bs.start_battle([enemy])

	# Kill the enemy (signal lost).
	enemy.take_damage(10)
	assert_true(enemy.is_signal_lost(), "enemy is signal-lost after lethal damage")

	# End player turn — should detect victory during resolution.
	var result: Dictionary = bs.end_player_turn()
	assert_true(result["success"], "end_player_turn succeeds")
	assert_true(result["battle_over"], "battle is over")
	assert_eq(result["result"], "victory", "result is victory")
	assert_eq(bs.get_current_state(), 4, "state is VICTORY (4)")
	assert_true(bs.is_battle_over(), "is_battle_over returns true")
	assert_eq(_battle_won_count, 1, "battle_won signal emitted once")
	assert_eq(_battle_lost_count, 0, "battle_lost signal not emitted")

	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_defeat_condition() -> void:
	print("Test: defeat — all party signal-lost")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)
	_connect_signals(bs)

	var party := _make_unit("Scala", 20)
	um.add_party_member(party)
	var enemy := _make_unit("Goblin", 10, Unit.UnitType.ENEMY)

	bs.start_battle([enemy])

	# End player turn (no damage yet, goes to enemy turn).
	bs.end_player_turn()
	assert_eq(bs.get_current_state(), 2, "state is ENEMY_TURN (2)")

	# Kill party member during enemy turn.
	party.take_damage(20)
	assert_true(party.is_signal_lost(), "party member is signal-lost")

	# End enemy turn — should detect defeat during resolution.
	var result: Dictionary = bs.end_enemy_turn()
	assert_true(result["success"], "end_enemy_turn succeeds")
	assert_true(result["battle_over"], "battle is over")
	assert_eq(result["result"], "defeat", "result is defeat")
	assert_eq(bs.get_current_state(), 5, "state is DEFEAT (5)")
	assert_true(bs.is_battle_over(), "is_battle_over returns true")
	assert_eq(_battle_lost_count, 1, "battle_lost signal emitted once")
	assert_eq(_battle_won_count, 0, "battle_won signal not emitted")

	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_state_name() -> void:
	print("Test: state_name() static method")
	# Access via the script directly since it's a static method.
	assert_eq(BattleSystemScript.state_name(0), "INIT", "state 0 = INIT")
	assert_eq(BattleSystemScript.state_name(1), "PLAYER_TURN", "state 1 = PLAYER_TURN")
	assert_eq(BattleSystemScript.state_name(2), "ENEMY_TURN", "state 2 = ENEMY_TURN")
	assert_eq(BattleSystemScript.state_name(3), "RESOLUTION", "state 3 = RESOLUTION")
	assert_eq(BattleSystemScript.state_name(4), "VICTORY", "state 4 = VICTORY")
	assert_eq(BattleSystemScript.state_name(5), "DEFEAT", "state 5 = DEFEAT")


func test_is_battle_over() -> void:
	print("Test: is_battle_over() in non-terminal states")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)

	# INIT state — not over.
	assert_false(bs.is_battle_over(), "INIT is not battle over")

	um.add_party_member(_make_unit("Scala", 20))
	bs.start_battle([_make_unit("Goblin", 10, Unit.UnitType.ENEMY)])

	# PLAYER_TURN state — not over.
	assert_false(bs.is_battle_over(), "PLAYER_TURN is not battle over")

	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_turn_number_increments() -> void:
	print("Test: turn number increments across multiple turns")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)

	um.add_party_member(_make_unit("Scala", 20))
	bs.start_battle([_make_unit("Goblin", 10, Unit.UnitType.ENEMY)])

	assert_eq(bs.get_turn_number(), 1, "turn 1 after start")
	bs.end_player_turn()
	bs.end_enemy_turn()
	assert_eq(bs.get_turn_number(), 2, "turn 2 after first cycle")
	bs.end_player_turn()
	bs.end_enemy_turn()
	assert_eq(bs.get_turn_number(), 3, "turn 3 after second cycle")

	bs.free()
	um.free()
	ap.free()
	dm.free()


func test_ap_reset_on_player_turn() -> void:
	print("Test: AP is reset at player turn start")
	var bs := _make_battle_system()
	var um := _make_unit_manager()
	var ap := _make_ap_manager()
	var dm := _make_draw_manager()
	_setup_system(bs, um, ap, dm)

	um.add_party_member(_make_unit("Scala", 20))

	# Spend some AP first.
	ap.spend_ap(3)
	assert_eq(ap.current_ap, 2, "AP is 2 after spending 3")

	# Start battle — should reset AP.
	bs.start_battle([_make_unit("Goblin", 10, Unit.UnitType.ENEMY)])
	assert_eq(ap.current_ap, 5, "AP reset to 5 at player turn start")

	# Spend AP during player turn.
	ap.spend_ap(4)
	assert_eq(ap.current_ap, 1, "AP is 1 after spending 4")

	# Cycle through enemy turn and back.
	bs.end_player_turn()
	bs.end_enemy_turn()

	# AP should be reset again at new player turn.
	assert_eq(ap.current_ap, 5, "AP reset to 5 at turn 2 start")

	bs.free()
	um.free()
	ap.free()
	dm.free()
