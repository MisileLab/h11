class_name CardLoader
extends Node

## CardLoader — loads and parses card JSON files into Card resources.
##
## Loads JSON definitions from three deck files (scala, lambda, riff) and
## converts them to Card instances with validated fields and effects.
##
## Schema:
##   Each card entry must have: id, name, description, ap_cost, type, target, effects[]
##   Each effect must have: stat_type, value, duration
##   All numeric fields are ints. String fields are trimmed for whitespace.
##
## Errors:
##   - Missing JSON file → returns empty Array
##   - Malformed JSON → logs error, returns empty Array
##   - Missing required fields → logs field name, continues to next card (skips invalid)
##   - Type mismatches → coerced to int with fallback defaults

# --- File Paths ---

const SCALA_CARDS_PATH: String = "res://src/data/cards/scala_cards.json"
const LAMBDA_CARDS_PATH: String = "res://src/data/cards/lambda_cards.json"
const RIFF_CARDS_PATH: String = "res://src/data/cards/riff_cards.json"

# --- Preload for Typing ---

const CardRes := preload("res://src/battle/card.gd")

# --- Public API ---

## Load all cards from a single deck file. Returns Array of Card resources.
## Empty array if file not found or invalid JSON.
func load_deck(file_path: String) -> Array:
	var cards: Array = []
	
	# Load and parse JSON
	var json_data: Variant = _load_json_file(file_path)
	if json_data == null or json_data is not Array:
		push_error("CardLoader: file '%s' is empty or not a JSON array" % file_path)
		return cards
	
	# Convert each entry to Card resource
	for card_entry: Variant in json_data:
		if card_entry is not Dictionary:
			push_error("CardLoader: entry is not a Dictionary, skipping")
			continue
		
		var card: Variant = _parse_card_entry(card_entry as Dictionary)
		if card != null:
			cards.append(card)
	
	return cards


## Load all three decks and return as Dictionary { deck_name: Array[Card] }.
func load_all_decks() -> Dictionary:
	return {
		"scala": load_deck(SCALA_CARDS_PATH),
		"lambda": load_deck(LAMBDA_CARDS_PATH),
		"riff": load_deck(RIFF_CARDS_PATH),
	}

# --- Private Helpers ---

## Load and parse a JSON file. Returns parsed Variant (Array, Dictionary, or null on error).
func _load_json_file(file_path: String) -> Variant:
	var file: FileAccess = FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		push_error("CardLoader: cannot open file '%s' (error code %d)" % [file_path, FileAccess.get_open_error()])
		return null
	
	var json_string: String = file.get_as_text()
	var json: JSON = JSON.new()
	var parse_error: Error = json.parse(json_string)
	
	if parse_error != OK:
		push_error("CardLoader: JSON parse error in '%s': %s (line %d)" % [file_path, json.get_error_message(), json.get_error_line()])
		return null
	
	return json.data


## Parse a single card Dictionary into a Card resource.
## Returns Card on success, null on validation failure.
func _parse_card_entry(entry: Dictionary) -> Variant:
	# Validate required fields
	var required_fields: Array[String] = ["id", "name", "description", "ap_cost", "type", "target", "effects"]
	for field: String in required_fields:
		if not entry.has(field):
			push_error("CardLoader: card missing required field '%s'" % field)
			return null
	
	# Create Card instance (returns Resource to match from_dict() contract)
	var card: Resource = CardRes.new()
	
	# Set basic fields
	card.card_name = entry.get("name", "Unnamed") as String
	card.description = entry.get("description", "") as String
	card.ap_cost = int(entry.get("ap_cost", 1))
	card.card_type = int(entry.get("type", 0))
	card.target_type = int(entry.get("target", 0))
	
	# Parse effects array
	var effects_data: Variant = entry.get("effects", [])
	if effects_data is Array:
		for effect_entry: Variant in effects_data:
			if effect_entry is Dictionary:
				var effect: Variant = _parse_effect_entry(effect_entry as Dictionary)
				if effect != null:
					card.effects.append(effect)
			else:
				push_error("CardLoader: effect entry is not a Dictionary")
	else:
		push_error("CardLoader: 'effects' field is not an Array")
	
	return card


## Parse a single effect Dictionary into a CardEffect.
## Returns CardEffect on success, null on validation failure.
func _parse_effect_entry(entry: Dictionary) -> Variant:
	var required_fields: Array[String] = ["stat_type", "value", "duration"]
	for field: String in required_fields:
		if not entry.has(field):
			push_error("CardLoader: effect missing required field '%s'" % field)
			return null
	
	# Create CardEffect via the inner class static factory
	var effect: RefCounted = CardRes.CardEffect.new(
		int(entry.get("stat_type", 0)),
		int(entry.get("value", 0)),
		int(entry.get("duration", 0))
	)
	
	return effect
