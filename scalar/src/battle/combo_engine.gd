extends Node

## Combo Engine — handles ally-to-ally matching for V amplification.
##
## Combo formula: Source.Q × AP_allocated ≥ Target.K → amplify Target.V
## Amplification: target.v_value * combo_multiplier (default 1.5)
##
## This is the core ally-combo system. UI selection is in Task 14.
## AP cost is validated and displayed before confirmation (Metis guardrail).
##
## References:
##   GDD Section 4   — Q × AP ≥ K formula (reused for ally combos)
##   GDD Section 12  — Blue line visual indicator for ally combos
##   Metis guardrail — Combo UI must show AP cost before confirmation

# --- Preloads ---

const UnitRes := preload("res://src/core/unit.gd")

# --- Signals ---

## Emitted after a successful combo execution.
signal combo_executed(source: UnitRes, target: UnitRes, amplified_v: int)

## Emitted when a combo attempt fails.
signal combo_failed(source: UnitRes, target: UnitRes, reason: String)

# --- Constants ---

## Default combo multiplier for V amplification.
const DEFAULT_COMBO_MULTIPLIER: float = 1.5

# --- Dependencies ---

var _match_engine: Node = null
var _ap_manager: Node = null
var _unit_manager: Node = null

# --- Configuration ---

var combo_multiplier: float = DEFAULT_COMBO_MULTIPLIER

# --- Public API ---

## Initialize with manager references. Must be called before any combo operations.
func setup(match_engine: Node, ap_manager: Node, unit_manager: Node) -> void:
	_match_engine = match_engine
	_ap_manager = ap_manager
	_unit_manager = unit_manager


## Returns true if all three manager dependencies have been assigned.
func is_ready() -> bool:
	return _match_engine != null and _ap_manager != null and _unit_manager != null


## Pure check — can source combo with target at the given AP cost?
## No side effects, no AP spend, no signals.
##
## Validates:
##   1. System readiness
##   2. Source and target are both valid, alive, and different units
##   3. Both are party members (ally-to-ally only)
##   4. AP affordability
##   5. Match formula: source.Q × ap_allocated ≥ target.K
func check_ally_combo(source: UnitRes, target: UnitRes, ap_allocated: int) -> bool:
	if not is_ready():
		return false

	# Guard: null units
	if source == null or target == null:
		return false

	# Guard: self-combo not allowed
	if source == target:
		return false

	# Guard: both must be alive
	if source.is_signal_lost() or target.is_signal_lost():
		return false

	# Guard: both must be active party members (ally-to-ally only)
	if source not in _unit_manager.party_members or target not in _unit_manager.party_members:
		return false

	# Guard: AP must be positive
	if ap_allocated <= 0:
		return false

	# Guard: must afford the AP
	if _ap_manager.current_ap < ap_allocated:
		return false

	# Match formula via MatchEngine (passive read, no signals)
	return _match_engine.can_match(source.q_value, ap_allocated, target.k_value)


## Execute an ally combo: validate, spend AP, amplify target V, emit signal.
##
## Returns a deterministic Dictionary:
##   On success: { success, source_name, target_name, ap_spent, original_v,
##                 amplified_v, combo_multiplier }
##   On failure: { success=false, reason, source_name, target_name }
func execute_combo(source: UnitRes, target: UnitRes, ap_allocated: int) -> Dictionary:
	# --- Guard: system readiness ---
	if not is_ready():
		return _failure("not_ready", source, target)

	# --- Guard: null units ---
	if source == null or target == null:
		return _failure("invalid_args", source, target)

	var src_name: String = source.unit_name if source != null else ""
	var tgt_name: String = target.unit_name if target != null else ""

	# --- Guard: self-combo ---
	if source == target:
		return _failure("self_combo", source, target)

	# --- Guard: both alive ---
	if source.is_signal_lost():
		return _failure("source_signal_lost", source, target)
	if target.is_signal_lost():
		return _failure("target_signal_lost", source, target)

	# --- Guard: both must be active party members (ally-to-ally only) ---
	if source not in _unit_manager.party_members:
		return _failure("not_party_member", source, target)
	if target not in _unit_manager.party_members:
		return _failure("not_party_member", source, target)

	# --- Guard: AP positive ---
	if ap_allocated <= 0:
		return _failure("invalid_ap", source, target)

	# --- Guard: AP affordability ---
	if _ap_manager.current_ap < ap_allocated:
		return _failure("insufficient_ap", source, target)

	# --- Guard: match formula ---
	if not _match_engine.can_match(source.q_value, ap_allocated, target.k_value):
		combo_failed.emit(source, target, "match_failed")
		return {
			"success": false,
			"reason": "match_failed",
			"source_name": src_name,
			"target_name": tgt_name,
			"q_value": source.q_value,
			"ap_allocated": ap_allocated,
			"target_k": target.k_value, "source_unit": source, "target_unit": target,
			"product": source.q_value * ap_allocated,
		}

	# --- Spend AP ---
	var spent: bool = _ap_manager.spend_ap(ap_allocated)
	if not spent:
		return _failure("ap_spend_failed", source, target)

	# --- Amplify V ---
	var original_v: int = target.v_value
	var amplified_v: int = int(float(original_v) * combo_multiplier)
	target.v_value = amplified_v

	# --- Signal ---
	combo_executed.emit(source, target, amplified_v)

	return {
		"success": true,
		"source_name": src_name,
		"target_name": tgt_name,
		"ap_spent": ap_allocated,
		"original_v": original_v,
		"amplified_v": amplified_v,
		"combo_multiplier": combo_multiplier,
	}


## Returns an array of available combo opportunities for the current party.
## Each entry is a Dictionary with:
##   { source_name, target_name, source_q, target_k, min_ap_needed, affordable }
##
## Used by UI (Task 14) to display combo options with AP costs.
## Satisfies Metis guardrail: "AP cost displayed before confirmation".
func get_available_combos() -> Array[Dictionary]:
	var combos: Array[Dictionary] = []

	if not is_ready():
		return combos

	var active_party: Array = _unit_manager.get_active_party()

	# Check every source → target pair (excluding self)
	for source in active_party:
		for target in active_party:
			if source == target:
				continue

			# Calculate minimum AP needed: ceil(K / Q)
			var min_ap: int = _calc_min_ap(source.q_value, target.k_value)
			if min_ap <= 0:
				continue

			var affordable: bool = _ap_manager.current_ap >= min_ap

			combos.append({
				"source_name": source.unit_name,
				"target_name": target.unit_name,
				"source_q": source.q_value,
				"target_k": target.k_value, "source_unit": source, "target_unit": target,
				"min_ap_needed": min_ap,
				"affordable": affordable,
			})

	return combos


## Preview combo result without executing. Returns the amplified V value.
## Used by UI to show the effect before player confirms.
func preview_combo_v(target: UnitRes) -> int:
	if target == null:
		return 0
	return int(float(target.v_value) * combo_multiplier)


# --- Private ---

## Calculate minimum AP needed for source Q to match target K.
## Formula: ceil(K / Q). Returns -1 if Q is 0 (impossible match).
func _calc_min_ap(source_q: int, target_k: int) -> int:
	# Zero K: always matchable with any positive AP
	if target_k <= 0:
		return 1

	# Zero Q: impossible to match
	if source_q <= 0:
		return -1

	# ceil(K / Q) using integer arithmetic: (K + Q - 1) / Q
	@warning_ignore("integer_division")
	return (target_k + source_q - 1) / source_q


## Build a failure result dictionary.
func _failure(reason: String, source: UnitRes, target: UnitRes) -> Dictionary:
	var src_name: String = source.unit_name if source != null else ""
	var tgt_name: String = target.unit_name if target != null else ""
	return {
		"success": false,
		"reason": reason,
		"source_name": src_name,
		"target_name": tgt_name,
	}


# --- Lifecycle ---

func _ready() -> void:
	print("ComboEngine initialized — ally combo multiplier: %.1f" % combo_multiplier)
