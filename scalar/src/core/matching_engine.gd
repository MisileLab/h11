extends Node

## Matching Engine singleton (Autoload).
## Implements the Q × AP ≥ K matching formula for combat resolution.
## Handles match validation, result calculation, and match signals.
##
## References:
##   GDD Section 4  — Q × AP ≥ K → match success → V effect
##   GDD Section 13 — Core signals definition

# --- Signals ---

## Emitted when a match attempt succeeds (Q × AP ≥ K).
signal match_success(q_value: int, ap_spent: int, target_k: int, product: int)

## Emitted when a match attempt fails (Q × AP < K).
signal match_failure(q_value: int, ap_spent: int, target_k: int, product: int)

## Emitted whenever AP is allocated to a match attempt.
signal ap_spent(amount: int)

# --- Public API ---

## Checks whether a match would succeed without side effects.
## Formula: Q × AP ≥ K
## Edge cases:
##   - Zero Q → always false (no query strength)
##   - Zero AP → always false (no energy allocated)
##   - Zero K → always true (no defense threshold)
## Returns true if the match would succeed, false otherwise.
func can_match(q_value: int, ap_spent_amount: int, target_k: int) -> bool:
	# Edge case: zero K means no defense — always matches
	if target_k <= 0:
		_debug_log("can_match", q_value, ap_spent_amount, target_k, q_value * ap_spent_amount, true, "zero K → auto-success")
		return true

	# Edge case: zero Q or zero AP means no offensive power — always fails
	if q_value <= 0 or ap_spent_amount <= 0:
		_debug_log("can_match", q_value, ap_spent_amount, target_k, q_value * ap_spent_amount, false, "zero Q or AP → auto-fail")
		return false

	var product: int = q_value * ap_spent_amount
	var success: bool = product >= target_k
	_debug_log("can_match", q_value, ap_spent_amount, target_k, product, success, "")
	return success


## Calculates the full result of a match attempt.
## Returns a deterministic Dictionary with:
##   - success: bool — whether the match succeeded
##   - q_value: int — the Q value used
##   - ap_spent: int — the AP spent
##   - target_k: int — the K threshold
##   - product: int — Q × AP result
##   - surplus: int — how much the product exceeds K (0 if failed)
## Emits match_success or match_failure signal accordingly.
## Emits ap_spent signal with the AP amount.
func calculate_match_result(q: int, ap: int, k: int) -> Dictionary:
	var product: int = q * ap
	var success: bool = can_match(q, ap, k)
	var surplus: int = max(product - k, 0) if success else 0

	var result: Dictionary = {
		"success": success,
		"q_value": q,
		"ap_spent": ap,
		"target_k": k,
		"product": product,
		"surplus": surplus,
	}

	# Emit signals only on actual match attempts (not passive reads)
	ap_spent.emit(ap)

	if success:
		match_success.emit(q, ap, k, product)
	else:
		match_failure.emit(q, ap, k, product)

	_debug_log("calculate_match_result", q, ap, k, product, success, "surplus=%d" % surplus)
	return result


# --- Debug ---

func _debug_log(method: String, q: int, ap_val: int, k: int, product: int, success: bool, note: String) -> void:
	var status: String = "SUCCESS" if success else "FAILURE"
	var msg: String = "[MatchEngine.%s] Q(%d) × AP(%d) = %d vs K(%d) → %s" % [method, q, ap_val, product, k, status]
	if note != "":
		msg += " (%s)" % note
	print(msg)


func _ready() -> void:
	print("MatchEngine initialized — Q×AP≥K formula active")
