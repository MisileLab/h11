extends Node

## Action Point manager singleton (Autoload).
## Manages the shared AP resource used for Q×AP matching.
## AP is a party-wide resource: spent on match attempts, restored each turn.
##
## References:
##   GDD Section 15 — Base 5 AP per turn
##   GDD Section 4  — AP spent in Q × AP ≥ K formula
##
## Invariant: 0 <= current_ap <= max_ap (always)

# --- Signals ---

## Emitted after any successful AP state change.
signal ap_changed(current: int, max: int)

# --- State ---

var current_ap: int = 5
var max_ap: int = 5

# --- Public API ---

## Attempt to spend AP. Returns true if successful, false if blocked.
## Three-layer guard:
##   1. Reject negative amounts (amount < 0)
##   2. Reject overspend (amount > current_ap)
##   3. Deduct and emit signal
func spend_ap(amount: int) -> bool:
	# Layer 1: negative guard
	if amount < 0:
		return false

	# Layer 2: overspend guard
	if amount > current_ap:
		return false

	# Layer 3: deduct
	current_ap -= amount
	ap_changed.emit(current_ap, max_ap)
	return true


## Restore AP to max (called at turn start).
func reset_ap() -> void:
	current_ap = max_ap
	ap_changed.emit(current_ap, max_ap)


## Add AP (e.g., from card effects). Capped at max_ap.
func add_ap(amount: int) -> void:
	if amount <= 0:
		return
	current_ap = mini(current_ap + amount, max_ap)
	ap_changed.emit(current_ap, max_ap)


func _ready() -> void:
	name = "APManager"
	print("APManager initialized — base AP: %d/%d" % [current_ap, max_ap])
