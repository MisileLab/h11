class_name Card
extends Resource

## Card resource — defines a playable card with typed stat-modification effects.
##
## Cards are the primary player action in battle. Each card has:
##   - An AP cost deducted from the shared AP pool on play
##   - A card type classifying its mechanical role (Q/K/V buff, trigger, etc.)
##   - A target type determining valid recipients
##   - One or more effects that modify unit stats (Q, K, V, HP, or AP)
##
## Effect duration:
##   - Permanent (duration 0): lasts for the rest of the battle
##   - Temporary (duration > 0): expires after N turns
##
## Serialization:
##   to_dict() / from_dict() enable deterministic JSON round-tripping.
##   Enum fields serialize as integers matching their declaration order.
##
## References:
##   GDD Section 5  — Card types and effect categories
##   GDD Section 10 — Deck construction rules

# --- Enums ---

## Mechanical role of the card in the Q/K/V combat system.
enum CardType {
	Q_BUFF,         ## Increases a unit's Query attack power
	K_BUFF,         ## Increases a unit's Key defensive threshold
	V_BUFF,         ## Increases a unit's Value damage/heal multiplier
	ALLY_TRIGGER,   ## Triggers an ally-specific ability or combo
	ENEMY_TARGET,   ## Targets an enemy for debuff or direct effect
	SPECIAL,        ## Unique mechanic outside the Q/K/V system
}

## Valid target selection modes for card play.
enum TargetType {
	SELF,           ## Targets the card user only
	ALLY_SINGLE,    ## Targets one ally (player selects)
	ALLY_ALL,       ## Targets all living allies
	ENEMY_SINGLE,   ## Targets one enemy (player selects)
	ENEMY_ALL,      ## Targets all living enemies
}

## Unit stats that card effects can modify.
enum StatType {
	Q,   ## Query — attack multiplier
	K,   ## Key — defense threshold
	V,   ## Value — damage/heal multiplier
	HP,  ## Hit Points — direct heal or damage
	AP,  ## Action Points — add to shared pool
}

# --- CardEffect ---

## A single stat modification produced by playing a card.
## Duration of 0 means permanent; >0 means temporary (expires after N turns).
## Modeled as a RefCounted inner class for lightweight allocation without
## scene-tree overhead. Serializes to/from plain Dictionaries for JSON.
class CardEffect extends RefCounted:
	var stat_type: int = 0    ## StatType enum value
	var value: int = 0        ## Magnitude (positive = buff, negative = debuff)
	var duration: int = 0     ## 0 = permanent, >0 = turns remaining

	func _init(p_stat_type: int = 0, p_value: int = 0, p_duration: int = 0) -> void:
		stat_type = p_stat_type
		value = p_value
		duration = maxi(p_duration, 0)

	## True when this effect expires after a set number of turns.
	func is_temporary() -> bool:
		return duration > 0

	## Serialize to a plain Dictionary for JSON export.
	func to_dict() -> Dictionary:
		return {
			"stat_type": stat_type,
			"value": value,
			"duration": duration,
		}

	## Deserialize from a Dictionary (e.g., loaded from JSON).
	static func from_dict(data: Dictionary) -> CardEffect:
		return CardEffect.new(
			data.get("stat_type", 0) as int,
			data.get("value", 0) as int,
			data.get("duration", 0) as int,
		)

# --- Exports ---

@export var card_name: String = ""
@export var description: String = ""

## AP deducted from the shared pool when this card is played.
## Setter enforces non-negative constraint (minimum 0).
@export var ap_cost: int = 1:
	set(v):
		ap_cost = maxi(v, 0)

@export var card_type: CardType = CardType.Q_BUFF
@export var target_type: TargetType = TargetType.SELF

## Card effects applied when this card is played.
## Typed Array[CardEffect] for downstream type safety in deck/play systems.
## Not @export — inner-class typed arrays are not inspector-editable in Godot 4.
## Populated via add_effect(), add_effect_from(), or from_dict() deserialization.
var effects: Array[CardEffect] = []

# --- Public API ---

## Append a pre-built CardEffect instance.
func add_effect(effect: CardEffect) -> void:
	effects.append(effect)


## Create and append a new effect in one call.
## stat: StatType enum value, value: magnitude, duration: 0=permanent />0=turns.
func add_effect_from(stat: int, val: int, duration: int = 0) -> void:
	effects.append(CardEffect.new(stat, val, duration))


## Number of effects on this card.
func effect_count() -> int:
	return effects.size()


# --- Serialization ---

## Serialize the full card to a Dictionary for JSON export.
## Enum fields are stored as their integer ordinal values.
func to_dict() -> Dictionary:
	var effect_dicts: Array[Dictionary] = []
	for effect: CardEffect in effects:
		effect_dicts.append(effect.to_dict())
	return {
		"card_name": card_name,
		"description": description,
		"ap_cost": ap_cost,
		"card_type": card_type,
		"target_type": target_type,
		"effects": effect_dicts,
	}


## Deserialize a Card from a Dictionary (e.g., loaded from JSON).
## Returns Resource (Card) — avoids class_name self-reference for headless compat.
static func from_dict(data: Dictionary) -> Resource:
	var script: GDScript = load("res://src/battle/card.gd") as GDScript
	var card: Resource = script.new()
	card.card_name = data.get("card_name", "") as String
	card.description = data.get("description", "") as String
	card.ap_cost = data.get("ap_cost", 1) as int
	card.card_type = data.get("card_type", CardType.Q_BUFF) as int
	card.target_type = data.get("target_type", TargetType.SELF) as int
	var effect_list: Array = data.get("effects", [])
	for effect_data: Dictionary in effect_list:
		card.effects.append(CardEffect.from_dict(effect_data))
	return card
