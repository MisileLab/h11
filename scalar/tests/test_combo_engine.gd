extends SceneTree

## Verification test for combo_engine.gd — Task 10.
## Runs headless:  godot --headless --script tests/test_combo_engine.gd
##
## Tests:
##   1. Guard: not_ready before setup
##   2. check_ally_combo: successful match (Lambda Q1 × AP4 ≥ Scala K3)
##   3. check_ally_combo: failed match (Lambda Q1 × AP2 < Scala K3)
##   4. check_ally_combo: self-combo blocked
##   5. check_ally_combo: signal-lost unit blocked
##   6. check_ally_combo: zero AP blocked
##   7. check_ally_combo: insufficient AP blocked
##   8. execute_combo: success — AP spent, V amplified, signal emitted
##   9. execute_combo: match_failed — no AP spent, no V change, signal emitted
##  10. execute_combo: not_ready guard
##  11. execute_combo: self_combo guard
##  12. execute_combo: signal-lost guards
##  13. execute_combo: invalid_ap guard (zero/negative)
##  14. execute_combo: insufficient_ap guard
##  15. get_available_combos: returns correct pairs with min_ap + affordable
##  16. get_available_combos: empty when not ready
##  17. get_available_combos: filters out signal-lost units
##  18. preview_combo_v: correct preview, no side effects
##  19. preview_combo_v: null target returns 0
##  20. _calc_min_ap: edge cases (Q=0, K=0, ceiling division)
##  21. combo_multiplier configuration

const ComboEngineScript := preload("res://src/battle/combo_engine.gd")
const MatchEngineScript := preload("res://src/core/matching_engine.gd")
const APManagerScript := preload("res://src/core/ap_manager.gd")
const UnitManagerScript := preload("res://src/core/unit_manager.gd")

var _pass_count: int = 0
var _fail_count: int = 0

# Signal counters
var _combo_executed_count: int = 0
var _combo_failed_count: int = 0
var _last_combo_amplified_v: int = -1
var _last_combo_fail_reason: String = ""


func _init() -> void:
	print("\n=== ComboEngine Verification Tests ===\n")

	test_guard_not_ready()
	test_check_success()
	test_check_fail_product()
	test_check_self_combo()
	test_check_signal_lost()
	test_check_zero_ap()
	test_check_insufficient_ap()
	test_execute_success()
	test_execute_match_failed()
	test_execute_not_ready()
	test_execute_self_combo()
	test_execute_signal_lost_source()
	test_execute_signal_lost_target()
	test_execute_invalid_ap()
	test_execute_insufficient_ap()
	test_check_not_party_member()
	test_execute_not_party_member()
	test_get_available_combos()
	test_get_available_combos_not_ready()
	test_get_available_combos_filters_signal_lost()
	test_preview_combo_v()
	test_preview_combo_v_null()
	test_calc_min_ap_edge_cases()
	test_custom_combo_multiplier()

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


func _make_unit(uname: String, q: int, k: int, v: int, hp: int = 20, utype: int = Unit.UnitType.SCALA) -> Unit:
	var u := Unit.new()
	u.unit_name = uname
	u.unit_type = utype
	u.q_value = q
	u.k_value = k
	u.v_value = v
	u.max_hp = hp
	u.current_hp = hp
	return u


func _make_combo_engine() -> Node:
	return ComboEngineScript.new()


func _make_match_engine() -> Node:
	return MatchEngineScript.new()


func _make_ap_manager() -> Node:
	return APManagerScript.new()


func _make_unit_manager() -> Node:
	return UnitManagerScript.new()


func _setup_combo(ce: Node, me: Node, ap: Node, um: Node) -> void:
	ce.setup(me, ap, um)


func _connect_signals(ce: Node) -> void:
	_combo_executed_count = 0
	_combo_failed_count = 0
	_last_combo_amplified_v = -1
	_last_combo_fail_reason = ""
	ce.combo_executed.connect(_on_combo_executed)
	ce.combo_failed.connect(_on_combo_failed)


func _on_combo_executed(_source: Variant, _target: Variant, amplified_v: int) -> void:
	_combo_executed_count += 1
	_last_combo_amplified_v = amplified_v


func _on_combo_failed(_source: Variant, _target: Variant, reason: String) -> void:
	_combo_failed_count += 1
	_last_combo_fail_reason = reason


func _free_all(nodes: Array) -> void:
	for n in nodes:
		if n is Node:
			n.free()


# --- Tests ---

func test_guard_not_ready() -> void:
	print("Test: guard — not_ready before setup")
	var ce := _make_combo_engine()
	var source := _make_unit("Lambda", 1, 2, 10)
	var target := _make_unit("Scala", 3, 3, 8)

	assert_false(ce.is_ready(), "is_ready false before setup")
	assert_false(ce.check_ally_combo(source, target, 4), "check returns false when not ready")

	var result: Dictionary = ce.execute_combo(source, target, 4)
	assert_false(result["success"], "execute fails when not ready")
	assert_eq(result["reason"], "not_ready", "reason is not_ready")

	ce.free()


func test_check_success() -> void:
	print("Test: check_ally_combo — Lambda Q(1) × AP(4) = 4 ≥ Scala K(3)")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	# Lambda: Q=1, K=2, V=10 ; Scala: Q=3, K=3, V=8
	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# AP starts at 5, allocating 4 is affordable
	assert_true(ce.check_ally_combo(lambda, scala, 4), "Q(1)×AP(4)=4 ≥ K(3) → true")

	# Verify no AP was actually spent (pure check)
	assert_eq(ap.current_ap, 5, "AP unchanged after check (pure read)")

	_free_all([ce, me, ap, um])


func test_check_fail_product() -> void:
	print("Test: check_ally_combo — Lambda Q(1) × AP(2) = 2 < Scala K(3)")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	assert_false(ce.check_ally_combo(lambda, scala, 2), "Q(1)×AP(2)=2 < K(3) → false")

	_free_all([ce, me, ap, um])


func test_check_self_combo() -> void:
	print("Test: check_ally_combo — self-combo blocked")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var scala := _make_unit("Scala", 3, 3, 8)

	assert_false(ce.check_ally_combo(scala, scala, 3), "self-combo returns false")

	_free_all([ce, me, ap, um])


func test_check_signal_lost() -> void:
	print("Test: check_ally_combo — signal-lost unit blocked")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)

	# Kill source
	lambda.take_damage(20)
	assert_true(lambda.is_signal_lost(), "Lambda is signal-lost")
	assert_false(ce.check_ally_combo(lambda, scala, 4), "signal-lost source → false")

	# Revive source, kill target
	lambda.current_hp = 20
	scala.take_damage(20)
	assert_true(scala.is_signal_lost(), "Scala is signal-lost")
	assert_false(ce.check_ally_combo(lambda, scala, 4), "signal-lost target → false")

	_free_all([ce, me, ap, um])


func test_check_zero_ap() -> void:
	print("Test: check_ally_combo — zero AP blocked")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	assert_false(ce.check_ally_combo(lambda, scala, 0), "zero AP → false")
	assert_false(ce.check_ally_combo(lambda, scala, -1), "negative AP → false")

	_free_all([ce, me, ap, um])


func test_check_insufficient_ap() -> void:
	print("Test: check_ally_combo — insufficient AP blocked")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# Spend 4 AP, leaving 1
	ap.spend_ap(4)
	assert_eq(ap.current_ap, 1, "AP is 1")

	# Trying to allocate 4 exceeds current AP
	assert_false(ce.check_ally_combo(lambda, scala, 4), "allocating 4 AP when only 1 left → false")

	_free_all([ce, me, ap, um])


func test_execute_success() -> void:
	print("Test: execute_combo — success path")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)
	_connect_signals(ce)

	# Lambda Q=1, Scala K=3, V=8
	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# AP=5, allocating 4 → Q(1)×AP(4)=4 ≥ K(3) → success
	var result: Dictionary = ce.execute_combo(lambda, scala, 4)

	assert_true(result["success"], "combo succeeds")
	assert_eq(result["source_name"], "Lambda", "source_name is Lambda")
	assert_eq(result["target_name"], "Scala", "target_name is Scala")
	assert_eq(result["ap_spent"], 4, "ap_spent is 4")
	assert_eq(result["original_v"], 8, "original_v is 8")
	# 8 * 1.5 = 12.0 → int(12.0) = 12
	assert_eq(result["amplified_v"], 12, "amplified_v is 12 (8 × 1.5)")
	assert_eq(result["combo_multiplier"], 1.5, "combo_multiplier is 1.5")

	# V was actually modified on the target
	assert_eq(scala.v_value, 12, "target V updated to 12")

	# AP was spent
	assert_eq(ap.current_ap, 1, "AP went from 5 to 1 (spent 4)")

	# Signal emitted
	assert_eq(_combo_executed_count, 1, "combo_executed emitted once")
	assert_eq(_last_combo_amplified_v, 12, "signal carried amplified_v=12")
	assert_eq(_combo_failed_count, 0, "combo_failed not emitted")

	_free_all([ce, me, ap, um])


func test_execute_match_failed() -> void:
	print("Test: execute_combo — match_failed path")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)
	_connect_signals(ce)

	# Lambda Q=1, Scala K=3, allocating AP=2 → 1×2=2 < 3 → fail
	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	var result: Dictionary = ce.execute_combo(lambda, scala, 2)

	assert_false(result["success"], "combo fails")
	assert_eq(result["reason"], "match_failed", "reason is match_failed")
	assert_eq(result["q_value"], 1, "q_value reported")
	assert_eq(result["ap_allocated"], 2, "ap_allocated reported")
	assert_eq(result["target_k"], 3, "target_k reported")
	assert_eq(result["product"], 2, "product reported (1×2=2)")

	# V unchanged
	assert_eq(scala.v_value, 8, "target V unchanged")

	# AP unchanged (no spend on failed match)
	assert_eq(ap.current_ap, 5, "AP unchanged on match failure")

	# combo_failed signal emitted
	assert_eq(_combo_failed_count, 1, "combo_failed emitted once")
	assert_eq(_last_combo_fail_reason, "match_failed", "fail reason is match_failed")
	assert_eq(_combo_executed_count, 0, "combo_executed not emitted")

	_free_all([ce, me, ap, um])


func test_execute_not_ready() -> void:
	print("Test: execute_combo — not_ready guard")
	var ce := _make_combo_engine()
	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)

	var result: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(result["success"], "fails when not ready")
	assert_eq(result["reason"], "not_ready", "reason is not_ready")

	ce.free()


func test_execute_self_combo() -> void:
	print("Test: execute_combo — self_combo guard")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var scala := _make_unit("Scala", 3, 3, 8)

	var result: Dictionary = ce.execute_combo(scala, scala, 3)
	assert_false(result["success"], "self-combo fails")
	assert_eq(result["reason"], "self_combo", "reason is self_combo")

	_free_all([ce, me, ap, um])


func test_execute_signal_lost_source() -> void:
	print("Test: execute_combo — source signal-lost guard")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	lambda.take_damage(20)

	var result: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(result["success"], "signal-lost source fails")
	assert_eq(result["reason"], "source_signal_lost", "reason is source_signal_lost")

	_free_all([ce, me, ap, um])


func test_execute_signal_lost_target() -> void:
	print("Test: execute_combo — target signal-lost guard")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	scala.take_damage(20)

	var result: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(result["success"], "signal-lost target fails")
	assert_eq(result["reason"], "target_signal_lost", "reason is target_signal_lost")

	_free_all([ce, me, ap, um])


func test_execute_invalid_ap() -> void:
	print("Test: execute_combo — invalid_ap guard (zero/negative)")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	var r0: Dictionary = ce.execute_combo(lambda, scala, 0)
	assert_false(r0["success"], "zero AP fails")
	assert_eq(r0["reason"], "invalid_ap", "reason is invalid_ap")

	var rn: Dictionary = ce.execute_combo(lambda, scala, -3)
	assert_false(rn["success"], "negative AP fails")
	assert_eq(rn["reason"], "invalid_ap", "reason is invalid_ap")

	_free_all([ce, me, ap, um])


func test_execute_insufficient_ap() -> void:
	print("Test: execute_combo — insufficient_ap guard")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# Drain AP to 1
	ap.spend_ap(4)

	var result: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(result["success"], "insufficient AP fails")
	assert_eq(result["reason"], "insufficient_ap", "reason is insufficient_ap")

	# AP unchanged
	assert_eq(ap.current_ap, 1, "AP unchanged")

	_free_all([ce, me, ap, um])


func test_check_not_party_member() -> void:
	print("Test: check_ally_combo — non-party unit blocked")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)

	# Neither registered as party member
	assert_false(ce.check_ally_combo(lambda, scala, 4), "both non-party → false")

	# Register only source
	um.add_party_member(lambda)
	assert_false(ce.check_ally_combo(lambda, scala, 4), "target non-party → false")

	# Register target too → should pass
	um.add_party_member(scala)
	assert_true(ce.check_ally_combo(lambda, scala, 4), "both party → true")

	_free_all([ce, me, ap, um])


func test_execute_not_party_member() -> void:
	print("Test: execute_combo — not_party_member guard")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)
	_connect_signals(ce)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)

	# Neither registered → not_party_member
	var r1: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(r1["success"], "both non-party fails")
	assert_eq(r1["reason"], "not_party_member", "reason is not_party_member")

	# Register only source → target still rejected
	um.add_party_member(lambda)
	var r2: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_false(r2["success"], "target non-party fails")
	assert_eq(r2["reason"], "not_party_member", "reason is not_party_member (target)")

	# AP unchanged — no spend on rejected combos
	assert_eq(ap.current_ap, 5, "AP unchanged after rejected combos")

	# Early guard returns don't emit signals (combo_failed only fires on match_failed)
	assert_eq(_combo_failed_count, 0, "combo_failed not emitted for early guard")
	assert_eq(_combo_executed_count, 0, "combo_executed not emitted")

	_free_all([ce, me, ap, um])


func test_get_available_combos() -> void:
	print("Test: get_available_combos — correct pairs with min_ap + affordable")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	# Lambda Q=1, K=2, V=10 ; Scala Q=3, K=3, V=8
	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# AP=5
	var combos: Array[Dictionary] = ce.get_available_combos()

	# 2 units → 2 directed pairs (Lambda→Scala, Scala→Lambda)
	assert_eq(combos.size(), 2, "2 combo pairs for 2 units")

	# Find Lambda→Scala pair
	var ls_combo: Dictionary = {}
	var sl_combo: Dictionary = {}
	for c in combos:
		if c["source_name"] == "Lambda" and c["target_name"] == "Scala":
			ls_combo = c
		elif c["source_name"] == "Scala" and c["target_name"] == "Lambda":
			sl_combo = c

	# Lambda→Scala: Q=1, K=3 → ceil(3/1) = 3 → affordable (5≥3)
	assert_eq(ls_combo["source_q"], 1, "Lambda→Scala source_q=1")
	assert_eq(ls_combo["target_k"], 3, "Lambda→Scala target_k=3")
	assert_eq(ls_combo["min_ap_needed"], 3, "Lambda→Scala min_ap=3 (ceil(3/1))")
	assert_true(ls_combo["affordable"], "Lambda→Scala affordable with 5 AP")

	# Scala→Lambda: Q=3, K=2 → ceil(2/3) = 1 → affordable (5≥1)
	assert_eq(sl_combo["source_q"], 3, "Scala→Lambda source_q=3")
	assert_eq(sl_combo["target_k"], 2, "Scala→Lambda target_k=2")
	assert_eq(sl_combo["min_ap_needed"], 1, "Scala→Lambda min_ap=1 (ceil(2/3))")
	assert_true(sl_combo["affordable"], "Scala→Lambda affordable with 5 AP")

	# Now drain AP to 2 and check affordability changes
	ap.spend_ap(3)  # AP=2
	var combos2: Array[Dictionary] = ce.get_available_combos()
	var ls2: Dictionary = {}
	for c in combos2:
		if c["source_name"] == "Lambda" and c["target_name"] == "Scala":
			ls2 = c
	assert_false(ls2["affordable"], "Lambda→Scala NOT affordable with 2 AP (needs 3)")

	_free_all([ce, me, ap, um])


func test_get_available_combos_not_ready() -> void:
	print("Test: get_available_combos — empty when not ready")
	var ce := _make_combo_engine()
	var combos: Array[Dictionary] = ce.get_available_combos()
	assert_eq(combos.size(), 0, "empty array when not ready")
	ce.free()


func test_get_available_combos_filters_signal_lost() -> void:
	print("Test: get_available_combos — filters out signal-lost units")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# Kill Lambda
	lambda.take_damage(20)
	var combos: Array[Dictionary] = ce.get_available_combos()
	# Only 1 active party member → 0 pairs (need ≥2 for combos)
	assert_eq(combos.size(), 0, "0 combos when only 1 active unit")

	_free_all([ce, me, ap, um])


func test_preview_combo_v() -> void:
	print("Test: preview_combo_v — correct preview, no side effects")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var scala := _make_unit("Scala", 3, 3, 8)

	# Preview: 8 * 1.5 = 12
	var preview: int = ce.preview_combo_v(scala)
	assert_eq(preview, 12, "preview returns 12 (8 × 1.5)")

	# V unchanged (no side effects)
	assert_eq(scala.v_value, 8, "target V unchanged after preview")

	_free_all([ce, me, ap, um])


func test_preview_combo_v_null() -> void:
	print("Test: preview_combo_v — null target returns 0")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	var preview: int = ce.preview_combo_v(null)
	assert_eq(preview, 0, "null target → 0")

	_free_all([ce, me, ap, um])


func test_calc_min_ap_edge_cases() -> void:
	print("Test: _calc_min_ap — edge cases")
	var ce := _make_combo_engine()

	# Test via get_available_combos with crafted units
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	# Case: target K=0 → min_ap should be 1 (always matchable)
	var source := _make_unit("S", 3, 5, 10)
	var target_k0 := _make_unit("T0", 2, 0, 5)
	um.add_party_member(source)
	um.add_party_member(target_k0)

	var combos: Array[Dictionary] = ce.get_available_combos()
	var st_combo: Dictionary = {}
	for c in combos:
		if c["source_name"] == "S" and c["target_name"] == "T0":
			st_combo = c
	assert_eq(st_combo["min_ap_needed"], 1, "K=0 → min_ap=1")

	# Case: source Q=0 → should be excluded (_calc_min_ap returns -1, skipped by >0 guard)
	um.party_members.clear()
	var source_q0 := _make_unit("Q0", 0, 5, 10)
	var target := _make_unit("T", 2, 3, 5)
	um.add_party_member(source_q0)
	um.add_party_member(target)

	var combos2: Array[Dictionary] = ce.get_available_combos()
	# Q0→T returns -1 → skipped, T→Q0 returns ceil(5/2)=3 → included
	var q0_found: bool = false
	for c in combos2:
		if c["source_name"] == "Q0":
			q0_found = true
	assert_false(q0_found, "Q=0 source excluded from available combos")

	# Case: ceiling division — Q=2, K=5 → ceil(5/2) = 3
	var t_to_q0: Dictionary = {}
	for c in combos2:
		if c["source_name"] == "T" and c["target_name"] == "Q0":
			t_to_q0 = c
	assert_eq(t_to_q0["min_ap_needed"], 3, "ceil(5/2) = 3")

	_free_all([ce, me, ap, um])


func test_custom_combo_multiplier() -> void:
	print("Test: custom combo_multiplier")
	var ce := _make_combo_engine()
	var me := _make_match_engine()
	var ap := _make_ap_manager()
	var um := _make_unit_manager()
	_setup_combo(ce, me, ap, um)

	# Override multiplier to 2.0
	ce.combo_multiplier = 2.0

	var lambda := _make_unit("Lambda", 1, 2, 10)
	var scala := _make_unit("Scala", 3, 3, 8)
	um.add_party_member(lambda)
	um.add_party_member(scala)

	# Preview: 8 * 2.0 = 16
	var preview: int = ce.preview_combo_v(scala)
	assert_eq(preview, 16, "preview with 2.0x → 16")

	# Execute: Q(1)×AP(4)=4 ≥ K(3) → success, V = 8*2.0 = 16
	var result: Dictionary = ce.execute_combo(lambda, scala, 4)
	assert_true(result["success"], "combo succeeds with custom multiplier")
	assert_eq(result["amplified_v"], 16, "amplified_v is 16 (8 × 2.0)")
	assert_eq(result["combo_multiplier"], 2.0, "combo_multiplier reported as 2.0")
	assert_eq(scala.v_value, 16, "target V updated to 16")

	_free_all([ce, me, ap, um])
