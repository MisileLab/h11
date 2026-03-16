extends Node

## Card Play System — executes card plays with AP validation, effect application,
## and discard management.
##
## Coordinates between APManager (AP spend), MatchEngine (enemy-target validation),
## UnitManager (target resolution), and Deck (discard movement).
##
## Card execution flow:
##   1. Call set_play_context(deck, caster, target) to store execution context
##   2. Call play_card(card) to execute:
##      a. Validate system readiness and play context
##      b. Validate card is in deck hand
##      c. Validate AP affordability via can_play_card()
##      d. For enemy-target cards, validate via MatchEngine (Q × AP ≥ K)
##      e. Spend AP through APManager
##      f. Resolve targets based on card.target_type
##      g. Apply effects to resolved targets
##      h. Move card from hand to discard pile via Deck.discard_card()
##      i. Emit card_played signal with remaining AP
##      j. Return deterministic result Dictionary
##
## Scope: card execution only — no combo selection or combo resolution.
##
## References:
##   GDD Section 5  — Card types and effect categories
##   GDD Section 4  — Q × AP ≥ K matching for enemy validation

# --- Preloads ---
# Explicit preloads for headless --script mode where Godot's global class_name
# registry may not be populated. Used as type annotations throughout.
# Pattern: use preload constants (CardRes, DeckRes, UnitRes) instead of bare
# class_name types (Card, Deck, Unit) for headless-compatible strong typing.
const CardRes := preload("res://src/battle/card.gd")
const DeckRes := preload("res://src/battle/deck.gd")
const UnitRes := preload("res://src/core/unit.gd")

# --- Signals ---

## Emitted after a card is successfully played.
## Carries the played card and AP remaining after the spend.
signal card_played(card: CardRes, ap_remaining: int)

# --- Dependencies ---

## Injected via setup(). All must be non-null before play_card() calls.
var _ap_manager: Node = null
var _match_engine: Node = null
var _unit_manager: Node = null

# --- Play Context ---

## Stored via set_play_context() before calling play_card().
## _deck is required; _caster/_target are optional depending on card target_type.
var _deck: DeckRes = null
var _caster: UnitRes = null
var _target: UnitRes = null

# --- Public API ---

## Initialize with manager references. Must be called before any play operations.
func setup(ap_manager: Node, match_engine: Node, unit_manager: Node) -> void:
	_ap_manager = ap_manager
	_match_engine = match_engine
	_unit_manager = unit_manager


## Returns true if all three manager dependencies have been assigned.
func is_ready() -> bool:
	return _ap_manager != null and _match_engine != null and _unit_manager != null


## Store the execution context needed by play_card().
## Must be called before each play_card() invocation.
##   deck   — the Deck that owns the card (required, for hand check and discard)
##   caster — the Unit playing the card (for SELF targeting and match Q value)
##   target — the target Unit (required for ALLY_SINGLE / ENEMY_SINGLE)
func set_play_context(deck: DeckRes, caster: UnitRes = null, target: UnitRes = null) -> void:
	_deck = deck
	_caster = caster
	_target = target


## Pure affordability check — no side effects, no signals.
## Returns true when the player has enough AP to play this card.
func can_play_card(card: CardRes, current_ap: int) -> bool:
	if card == null:
		return false
	return current_ap >= card.ap_cost


## Execute a card play: validate, spend AP, apply effects, discard, emit signal.
##
## Requires set_play_context() to have been called first with at minimum a deck.
## The stored _deck, _caster, _target are consumed from the play context.
##
## Parameters:
##   card — the Card resource to play (must be in the context deck's hand)
##
## Returns a deterministic Dictionary:
##   On success: { success, card_name, ap_spent, ap_remaining, effects_applied, discarded }
##   On failure: { success=false, reason, card_name }
func play_card(card: CardRes) -> Dictionary:
	# --- Guard: system readiness ---
	if not is_ready():
		return _failure("not_ready", "")

	# --- Guard: play context ---
	if _deck == null:
		return _failure("no_context", "")

	# --- Guard: null card ---
	if card == null:
		return _failure("invalid_args", "")

	var cname: String = card.card_name

	# --- Guard: card must be in hand ---
	if card not in _deck.hand:
		return _failure("not_in_hand", cname)

	# --- Guard: AP affordability ---
	if not can_play_card(card, _ap_manager.current_ap):
		return _failure("insufficient_ap", cname)

	# --- Guard: enemy-target match validation ---
	if _needs_match_validation(card):
		var valid: bool = _validate_enemy_target(card)
		if not valid:
			return _failure("match_failed", cname)

	# --- Guard: single-target cards require a non-null, living target ---
	if _needs_single_target(card) and (_target == null or _target.is_signal_lost()):
		return _failure("invalid_target", cname)

	# --- Spend AP ---
	var spent: bool = _ap_manager.spend_ap(card.ap_cost)
	if not spent:
		return _failure("ap_spend_failed", cname)

	# --- Apply effects ---
	var targets: Array = _resolve_targets(card)
	var applied: Array[Dictionary] = _apply_effects(card, targets)

	# --- Discard ---
	var discarded: bool = _deck.discard_card(card)
	if not discarded:
		return _failure("discard_failed", cname)

	# --- Signal ---
	var ap_remaining: int = _ap_manager.current_ap
	card_played.emit(card, ap_remaining)

	return {
		"success": true,
		"card_name": cname,
		"ap_spent": card.ap_cost,
		"ap_remaining": ap_remaining,
		"effects_applied": applied,
		"discarded": true,
	}


# --- Private: Validation ---

## True when the card targets a single enemy and needs Q × AP ≥ K validation.
## Only ENEMY_TARGET cards aimed at a single enemy require match-engine gating.
## ENEMY_ALL (AoE) bypasses per-unit match checks by design.
func _needs_match_validation(card: CardRes) -> bool:
	return (card.card_type == CardRes.CardType.ENEMY_TARGET
		and card.target_type == CardRes.TargetType.ENEMY_SINGLE)


## True when card requires a specific single target (ally or enemy).
func _needs_single_target(card: CardRes) -> bool:
	return (card.target_type == CardRes.TargetType.ALLY_SINGLE
		or card.target_type == CardRes.TargetType.ENEMY_SINGLE)


## Validate an enemy-target card via MatchEngine's Q × AP ≥ K formula.
## Uses the caster's Q and the card's AP cost as the match commitment.
## Reads _caster and _target from stored play context.
func _validate_enemy_target(card: CardRes) -> bool:
	if _caster == null or _target == null:
		return false
	if _target.is_signal_lost():
		return false
	return _match_engine.can_match(_caster.q_value, card.ap_cost, _target.k_value)


# --- Private: Target Resolution ---

## Resolve which units receive this card's effects based on target_type.
## Reads _caster and _target from stored play context.
func _resolve_targets(card: CardRes) -> Array:
	var resolved: Array = []
	match card.target_type:
		CardRes.TargetType.SELF:
			if _caster != null and not _caster.is_signal_lost():
				resolved.append(_caster)
		CardRes.TargetType.ALLY_SINGLE:
			if _target != null and not _target.is_signal_lost():
				resolved.append(_target)
		CardRes.TargetType.ALLY_ALL:
			if _unit_manager != null:
				resolved.append_array(_unit_manager.get_active_party())
		CardRes.TargetType.ENEMY_SINGLE:
			if _target != null and not _target.is_signal_lost():
				resolved.append(_target)
		CardRes.TargetType.ENEMY_ALL:
			if _unit_manager != null:
				resolved.append_array(_unit_manager.get_active_enemies())
	return resolved


# --- Private: Effect Application ---

## Apply all card effects to resolved targets.
## Returns an array of per-effect-per-target result dictionaries.
func _apply_effects(card: CardRes, targets: Array) -> Array[Dictionary]:
	var results: Array[Dictionary] = []
	for effect in card.effects:
		for unit in targets:
			var result: Dictionary = _apply_single_effect(effect, unit)
			results.append(result)
	return results


## Apply one CardEffect to one Unit. Returns a deterministic result dictionary.
## Stat modifications: Q/K/V are direct additive changes on the Unit.
## HP: positive value → heal, negative → damage (absolute value passed).
## AP: positive value → add to shared pool via APManager.
func _apply_single_effect(effect: RefCounted, unit: UnitRes) -> Dictionary:
	var result: Dictionary = {
		"unit_name": unit.unit_name,
		"stat_type": effect.stat_type,
		"value": effect.value,
		"duration": effect.duration,
	}
	match effect.stat_type:
		CardRes.StatType.Q:
			unit.q_value += effect.value
		CardRes.StatType.K:
			unit.k_value += effect.value
		CardRes.StatType.V:
			unit.v_value += effect.value
		CardRes.StatType.HP:
			if effect.value >= 0:
				unit.heal(effect.value)
			else:
				unit.take_damage(-effect.value)
		CardRes.StatType.AP:
			if effect.value > 0 and _ap_manager != null:
				_ap_manager.add_ap(effect.value)
	return result


# --- Private: Result Builders ---

## Build a failure result dictionary.
func _failure(reason: String, cname: String) -> Dictionary:
	return {
		"success": false,
		"reason": reason,
		"card_name": cname,
	}


# --- Lifecycle ---

func _ready() -> void:
	print("CardPlayer initialized — card execution system active")
