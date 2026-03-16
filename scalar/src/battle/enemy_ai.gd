extends RefCounted

## Base enemy AI — strategy pattern for enemy decision-making and action execution.
##
## Each enemy type extends this class and overrides decide_action() to produce
## an EnemyAction describing what the enemy will do. The base class provides
## execute_action() which dispatches on action type and applies effects.
##
## Intent System (Task 12):
##   calculate_intent() calls decide_action() at turn start and stores the result.
##   The stored intent remains stable during the player turn (no recalculation).
##   get_intent_display() exposes the intent as a Dictionary for UI consumption.
##   After execution, clear_intent() resets for the next turn cycle.
##
## EnemyAction is an inner class representing a single deterministic action.
##
## Usage:
##   var ai := DrifterAI.new()
##   ai.calculate_intent(battle_state)       # Turn start: decide + store
##   var display := ai.get_intent_display()  # UI reads intent data
##   var action := ai.get_current_intent()   # Execution reads stored action
##   var result := ai.execute_action(action)
##   ai.clear_intent()                       # Reset after execution
##
## References:
##   GDD Section 11 — Enemy AI patterns
##   GDD Section 14 — Battle flow (ENEMY_TURN phase)

# --- Preloads ---
const UnitRes := preload("res://src/core/unit.gd")

# --- Signals ---

## Emitted when this enemy's intent is calculated or cleared.
## Carries the enemy Unit and the intent data Dictionary.
## Intent dict format matches EnemyAction.to_dict() + "icon" key, or empty {} when cleared.
signal intent_changed(enemy: Unit, intent: Dictionary)

# --- Intent State ---

## The currently stored intent action. Null before calculate_intent() or after clear_intent().
var _current_intent: EnemyAction = null

# --- Inner Class: EnemyAction ---

## Represents a single enemy action with all data needed for execution and display.
class EnemyAction extends RefCounted:

	## The five action categories an enemy can perform.
	enum ActionType { ATTACK, DEFEND, BUFF, DEBUFF, SPECIAL }

	## What kind of action this is.
	var action_type: ActionType = ActionType.ATTACK

	## The enemy performing the action.
	var source: Resource = null

	## The target of the action (null for self-targeted actions like DEFEND/BUFF).
	var target: Resource = null

	## Numeric magnitude (damage, heal amount, buff value, etc.).
	var value: int = 0

	## Human-readable description for battle log / intent display.
	var description: String = ""

	## Static factory for creating actions with all fields set.
	static func create(
		p_action_type: ActionType,
		p_source: Resource,
		p_target: Resource,
		p_value: int,
		p_description: String,
	) -> EnemyAction:
		var action := EnemyAction.new()
		action.action_type = p_action_type
		action.source = p_source
		action.target = p_target
		action.value = p_value
		action.description = p_description
		return action

	## Serialize to Dictionary for UI consumption (Task 12) and battle log.
	func to_dict() -> Dictionary:
		var source_name: String = ""
		if source != null and source is UnitRes:
			source_name = source.unit_name

		var target_name: String = ""
		if target != null and target is UnitRes:
			target_name = target.unit_name

		return {
			"action_type": _type_name(action_type),
			"source": source_name,
			"target": target_name,
			"value": value,
			"description": description,
		}

	## Convert ActionType enum to string.
	static func _type_name(action_type: ActionType) -> String:
		match action_type:
			ActionType.ATTACK: return "ATTACK"
			ActionType.DEFEND: return "DEFEND"
			ActionType.BUFF: return "BUFF"
			ActionType.DEBUFF: return "DEBUFF"
			ActionType.SPECIAL: return "SPECIAL"
		return "UNKNOWN"


# --- Virtual API ---

## Override in subclass. Inspect battle_state and decide what this enemy does.
##
## Parameters:
##   battle_state — { "active_party": Array, "active_enemies": Array,
##                    "turn_number": int, "current_enemy": Resource }
##
## Returns: EnemyAction describing the chosen action, or null if no valid action.
func decide_action(battle_state: Dictionary) -> EnemyAction:
	push_warning("EnemyAI.decide_action() not overridden — returning null")
	return null


# --- Intent API ---

## Calculate and store this enemy's intended action for the upcoming turn.
##
## Calls decide_action() once and caches the result. The intent remains stable
## until clear_intent() is called (typically after action execution).
## Emits intent_changed with the enemy unit and intent display Dictionary.
##
## Parameters:
##   battle_state — same format as decide_action():
##     { "active_party": Array, "active_enemies": Array,
##       "turn_number": int, "current_enemy": Resource }
func calculate_intent(battle_state: Dictionary) -> void:
	_current_intent = decide_action(battle_state)
	var enemy: Unit = battle_state.get("current_enemy")
	intent_changed.emit(enemy, get_intent_display())


## Returns the current intent as a Dictionary for UI consumption.
##
## Format extends EnemyAction.to_dict() with an icon mapping:
##   { "action_type": String, "source": String, "target": String,
##     "value": int, "description": String, "icon": String }
##
## Icon mapping (deterministic):
##   ATTACK → "sword", DEFEND → "shield", BUFF → "arrow_up",
##   DEBUFF → "arrow_down", SPECIAL → "star", UNKNOWN → "question"
##
## Returns empty Dictionary if no intent has been calculated or after clear.
func get_intent_display() -> Dictionary:
	if _current_intent == null:
		return {}
	var display := _current_intent.to_dict()
	display["icon"] = _intent_icon(_current_intent.action_type)
	return display


## Deterministic icon name for an ActionType. Used by get_intent_display().
static func _intent_icon(action_type: EnemyAction.ActionType) -> String:
	match action_type:
		EnemyAction.ActionType.ATTACK: return "sword"
		EnemyAction.ActionType.DEFEND: return "shield"
		EnemyAction.ActionType.BUFF: return "arrow_up"
		EnemyAction.ActionType.DEBUFF: return "arrow_down"
		EnemyAction.ActionType.SPECIAL: return "star"
	return "question"


## Returns the raw EnemyAction intent for execution.
## Returns null if no intent has been calculated.
func get_current_intent() -> EnemyAction:
	return _current_intent


## Clear the stored intent. Call after the enemy's action has been executed.
## Emits intent_changed with empty Dictionary to signal the intent is resolved.
func clear_intent() -> void:
	var enemy: Unit = null
	if _current_intent != null and _current_intent.source is Unit:
		enemy = _current_intent.source as Unit
	_current_intent = null
	intent_changed.emit(enemy, {})


# --- Action Execution ---

## Execute an EnemyAction and return a result Dictionary.
## Dispatches to type-specific handlers.
##
## Returns: { "success": bool, "type": String, ... } with type-specific details.
func execute_action(action: EnemyAction) -> Dictionary:
	if action == null:
		return {"success": false, "reason": "null_action"}

	match action.action_type:
		EnemyAction.ActionType.ATTACK:
			return _execute_attack(action)
		EnemyAction.ActionType.DEFEND:
			return _execute_defend(action)
		EnemyAction.ActionType.BUFF:
			return _execute_buff(action)
		EnemyAction.ActionType.DEBUFF:
			return _execute_debuff(action)
		EnemyAction.ActionType.SPECIAL:
			return _execute_special(action)

	return {"success": false, "reason": "unknown_action_type"}


# --- Type-specific Handlers ---

## Apply attack damage to the target.
func _execute_attack(action: EnemyAction) -> Dictionary:
	if action.target == null:
		return {"success": false, "reason": "no_target"}

	if not action.target is UnitRes:
		return {"success": false, "reason": "invalid_target"}

	var target_unit: Resource = action.target
	var hp_before: int = target_unit.current_hp
	target_unit.take_damage(action.value)
	var hp_after: int = target_unit.current_hp

	return {
		"success": true,
		"type": "ATTACK",
		"source": action.source.unit_name if action.source else "",
		"target": target_unit.unit_name,
		"damage": action.value,
		"hp_before": hp_before,
		"hp_after": hp_after,
		"signal_lost": target_unit.is_signal_lost(),
	}


## Placeholder: defend action (raise K or reduce incoming damage next turn).
func _execute_defend(action: EnemyAction) -> Dictionary:
	return {
		"success": true,
		"type": "DEFEND",
		"source": action.source.unit_name if action.source else "",
		"value": action.value,
		"note": "defend_not_yet_implemented",
	}


## Placeholder: buff self or ally (raise stats temporarily).
func _execute_buff(action: EnemyAction) -> Dictionary:
	return {
		"success": true,
		"type": "BUFF",
		"source": action.source.unit_name if action.source else "",
		"value": action.value,
		"note": "buff_not_yet_implemented",
	}


## Placeholder: debuff a party member (reduce stats temporarily).
func _execute_debuff(action: EnemyAction) -> Dictionary:
	return {
		"success": true,
		"type": "DEBUFF",
		"source": action.source.unit_name if action.source else "",
		"target": action.target.unit_name if action.target else "",
		"value": action.value,
		"note": "debuff_not_yet_implemented",
	}


## Placeholder: special actions (unique per enemy type).
func _execute_special(action: EnemyAction) -> Dictionary:
	return {
		"success": true,
		"type": "SPECIAL",
		"source": action.source.unit_name if action.source else "",
		"value": action.value,
		"note": "special_not_yet_implemented",
	}
