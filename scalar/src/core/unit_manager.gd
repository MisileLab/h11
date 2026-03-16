extends Node

## Unit manager singleton.
## Handles party roster and enemy list for the current encounter.

var party_members: Array[Unit] = []
var enemies: Array[Unit] = []


# --- Party management ---

func add_party_member(unit: Unit) -> void:
	if unit not in party_members:
		party_members.append(unit)


func remove_party_member(unit: Unit) -> void:
	party_members.erase(unit)


func get_party_members() -> Array[Unit]:
	return party_members


# --- Enemy management ---

func add_enemy(unit: Unit) -> void:
	if unit not in enemies:
		enemies.append(unit)


func remove_enemy(unit: Unit) -> void:
	enemies.erase(unit)


func get_enemies() -> Array[Unit]:
	return enemies


# --- Queries ---

func get_unit_by_name(unit_name: String) -> Unit:
	for u in party_members + enemies:
		if u.unit_name == unit_name:
			return u
	return null


func get_active_party() -> Array[Unit]:
	return party_members.filter(func(u: Unit) -> bool: return not u.is_signal_lost())


func get_active_enemies() -> Array[Unit]:
	return enemies.filter(func(u: Unit) -> bool: return not u.is_signal_lost())


func clear_enemies() -> void:
	enemies.clear()


func _ready() -> void:
	print("UnitManager initialized")
