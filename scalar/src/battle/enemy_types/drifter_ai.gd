extends "res://src/battle/enemy_ai.gd"

## Drifter AI — Zone 1 basic enemy.
##
## Behavior: Always attacks a random active party member using V-value damage.
## No special abilities, no defensive patterns. The simplest enemy AI.
##
## References:
##   GDD Section 11 — Enemy AI: Drifter (simple attack pattern)
##   GDD Section 3  — V-value as damage multiplier

# --- Preloads ---
const UnitRes2 := preload("res://src/core/unit.gd")


## Pick a random active party member and attack with the enemy's V-value.
##
## Parameters:
##   battle_state — { "active_party": Array, "active_enemies": Array,
##                    "turn_number": int, "current_enemy": Resource }
##
## Returns: EnemyAction (ATTACK) or null if no valid targets exist.
func decide_action(battle_state: Dictionary) -> EnemyAction:
	# Guard: need a valid enemy unit from battle_state.
	var enemy: Resource = battle_state.get("current_enemy")
	if enemy == null:
		push_warning("DrifterAI: no current_enemy in battle_state")
		return null

	# Guard: need active party members to target.
	var active_party: Array = battle_state.get("active_party", [])
	if active_party.is_empty():
		push_warning("DrifterAI: no active party members to target")
		return null

	# Pick a random target from active party.
	var target: Resource = active_party[randi() % active_party.size()]

	# Drifter always attacks with its V-value.
	var damage: int = enemy.v_value

	return EnemyAction.create(
		EnemyAction.ActionType.ATTACK,
		enemy,
		target,
		damage,
		"%s attacks %s for %d damage" % [enemy.unit_name, target.unit_name, damage],
	)
