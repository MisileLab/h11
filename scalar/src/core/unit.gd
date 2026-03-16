class_name Unit
extends Resource

## Unit resource — defines a character or enemy with Q/K/V combat stats.
##
## Q (Query): attack power for matching checks (Q × AP ≥ K).
## K (Key): defensive threshold opponents must beat.
## V (Value): damage/heal multiplier applied on successful match.
##
## References:
##   GDD Section 3 — Character Q/K/V/HP values
##   GDD Section 7 — Signal Lost (HP <= 0 = incapacitated)

enum UnitType { SCALA, LAMBDA, RIFF, ENEMY }

@export var unit_name: String = ""
@export var unit_type: UnitType = UnitType.SCALA
@export var q_value: int = 0
@export var k_value: int = 0
@export var v_value: int = 0
@export var max_hp: int = 1
@export var current_hp: int = 1


## Apply damage. HP is clamped to 0 (never negative).
func take_damage(amount: int) -> void:
	current_hp = maxi(current_hp - amount, 0)


## Restore HP. Clamped at max_hp (never over-heals).
func heal(amount: int) -> void:
	current_hp = mini(current_hp + amount, max_hp)


## Returns true when unit is incapacitated (Signal Lost).
func is_signal_lost() -> bool:
	return current_hp <= 0
