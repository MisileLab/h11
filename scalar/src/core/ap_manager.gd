extends Node

## AP Manager - Manages shared party AP resource
## Signals AP changes and enforces overspend protection

signal ap_changed(current: int, max: int)

var current_ap: int = 5
var max_ap: int = 5


func _ready() -> void:
	name = "APManager"


## Reset AP to max value (called at turn start)
func reset_ap() -> void:
	current_ap = max_ap
	ap_changed.emit(current_ap, max_ap)


## Attempt to spend AP. Returns false if overspend attempted.
## On success, deducts AP and emits signal. On failure, leaves AP unchanged.
func spend_ap(amount: int) -> bool:
	if amount < 0:
		return false
	
	if amount > current_ap:
		return false
	
	current_ap -= amount
	ap_changed.emit(current_ap, max_ap)
	return true


## Add AP (e.g., from combo refunds or special effects)
func add_ap(amount: int) -> void:
	if amount <= 0:
		return
	
	current_ap = min(current_ap + amount, max_ap)
	ap_changed.emit(current_ap, max_ap)
