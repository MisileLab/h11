class_name EnemyLoader
extends Node

## EnemyLoader — loads and parses enemy JSON files into Unit resources with AI metadata.
##
## Loads JSON definitions from zone enemy files and boss file, converting them to
## Unit instances with validated fields and AI type metadata for later AI hookup.
##
## Schema (Zone Enemies):
##   Root: { zone: int, enemies: Array[Object] }
##   Each enemy: id, name, k_value, max_hp, q_value, v_value, ai_type, special_abilities[], description
##
## Schema (Bosses):
##   Root: { bosses: Array[Object] }
##   Each boss: id, name, k_value, max_hp, q_value, v_value, ai_type, phases[], description
##   Each phase: phase, max_hp, threshold, special_abilities[], attack_pattern
##
## Errors:
##   - Missing JSON file → returns empty Array
##   - Malformed JSON → logs error, returns empty Array
##   - Missing required fields → logs field name, skips invalid enemy (deterministic skip)
##   - Type mismatches → coerced to int with fallback defaults

# --- File Paths ---

const ZONE1_ENEMIES_PATH: String = "res://src/data/enemies/zone1_enemies.json"
const ZONE2_ENEMIES_PATH: String = "res://src/data/enemies/zone2_enemies.json"
const ZONE3_ENEMIES_PATH: String = "res://src/data/enemies/zone3_enemies.json"
const BOSSES_PATH: String = "res://src/data/enemies/bosses.json"

# --- Preload for Typing ---

const UnitRes := preload("res://src/core/unit.gd")

# --- Public API ---

## Load all enemies from a single zone file. Returns Array of Unit resources.
## Empty array if file not found or invalid JSON.
func load_zone_enemies(file_path: String) -> Array:
	var enemies: Array = []
	
	# Load and parse JSON
	var json_data: Variant = _load_json_file(file_path)
	if json_data == null or json_data is not Dictionary:
		push_error("EnemyLoader: file '%s' is empty or not a JSON object" % file_path)
		return enemies
	
	# Validate zone field exists
	if not (json_data as Dictionary).has("enemies"):
		push_error("EnemyLoader: file '%s' missing 'enemies' array" % file_path)
		return enemies
	
	var enemies_data: Variant = (json_data as Dictionary).get("enemies", [])
	if enemies_data is not Array:
		push_error("EnemyLoader: 'enemies' field is not an Array in '%s'" % file_path)
		return enemies
	
	# Convert each entry to Unit resource
	for enemy_entry: Variant in enemies_data:
		if enemy_entry is not Dictionary:
			push_error("EnemyLoader: enemy entry is not a Dictionary, skipping")
			continue
		
		var unit: Variant = _parse_enemy_entry(enemy_entry as Dictionary, false)
		if unit != null:
			enemies.append(unit)
	
	return enemies


## Load all bosses from boss file. Returns Array of Unit resources.
## Empty array if file not found or invalid JSON.
func load_bosses() -> Array:
	var bosses: Array = []
	
	# Load and parse JSON
	var json_data: Variant = _load_json_file(BOSSES_PATH)
	if json_data == null or json_data is not Dictionary:
		push_error("EnemyLoader: bosses file is empty or not a JSON object")
		return bosses
	
	# Validate bosses field exists
	if not (json_data as Dictionary).has("bosses"):
		push_error("EnemyLoader: bosses file missing 'bosses' array")
		return bosses
	
	var bosses_data: Variant = (json_data as Dictionary).get("bosses", [])
	if bosses_data is not Array:
		push_error("EnemyLoader: 'bosses' field is not an Array")
		return bosses
	
	# Convert each entry to Unit resource
	for boss_entry: Variant in bosses_data:
		if boss_entry is not Dictionary:
			push_error("EnemyLoader: boss entry is not a Dictionary, skipping")
			continue
		
		var unit: Variant = _parse_enemy_entry(boss_entry as Dictionary, true)
		if unit != null:
			bosses.append(unit)
	
	return bosses


## Load all zone enemies and bosses. Returns Dictionary { zone1: Array, zone2: Array, zone3: Array, bosses: Array }.
func load_all_enemies() -> Dictionary:
	return {
		"zone1": load_zone_enemies(ZONE1_ENEMIES_PATH),
		"zone2": load_zone_enemies(ZONE2_ENEMIES_PATH),
		"zone3": load_zone_enemies(ZONE3_ENEMIES_PATH),
		"bosses": load_bosses(),
	}

# --- Private Helpers ---

## Load and parse a JSON file. Returns parsed Variant (Dictionary, Array, or null on error).
func _load_json_file(file_path: String) -> Variant:
	var file: FileAccess = FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		push_error("EnemyLoader: cannot open file '%s' (error code %d)" % [file_path, FileAccess.get_open_error()])
		return null
	
	var json_string: String = file.get_as_text()
	var json: JSON = JSON.new()
	var parse_error: Error = json.parse(json_string)
	
	if parse_error != OK:
		push_error("EnemyLoader: JSON parse error in '%s': %s (line %d)" % [file_path, json.get_error_message(), json.get_error_line()])
		return null
	
	return json.data


## Parse a single enemy/boss Dictionary into a Unit resource.
## is_boss: if true, also extracts and stores phase data as metadata.
## Returns Unit on success, null on validation failure.
func _parse_enemy_entry(entry: Dictionary, is_boss: bool) -> Variant:
	# Validate required fields
	var required_fields: Array[String] = ["id", "name", "k_value", "max_hp", "q_value", "v_value", "ai_type"]
	for field: String in required_fields:
		if not entry.has(field):
			push_error("EnemyLoader: enemy missing required field '%s'" % field)
			return null
	
	# Create Unit instance
	var unit: Resource = UnitRes.new()
	
	# Set basic Unit fields
	unit.unit_name = entry.get("name", "Unknown") as String
	unit.k_value = int(entry.get("k_value", 1))
	unit.q_value = int(entry.get("q_value", 1))
	unit.v_value = int(entry.get("v_value", 1))
	unit.max_hp = int(entry.get("max_hp", 10))
	unit.current_hp = unit.max_hp
	
	# Store AI type as custom metadata (Unit doesn't have this field natively)
	# This is stored in a dictionary that can be accessed later for AI initialization
	var ai_metadata: Dictionary = {
		"ai_type": entry.get("ai_type", "basic") as String,
		"special_abilities": entry.get("special_abilities", []) as Array,
		"description": entry.get("description", "") as String,
	}
	
	# If boss, store phase data
	if is_boss and entry.has("phases"):
		var phases_data: Variant = entry.get("phases", [])
		if phases_data is Array:
			var phases: Array = []
			for phase_entry: Variant in phases_data:
				if phase_entry is Dictionary:
					phases.append(phase_entry as Dictionary)
			ai_metadata["phases"] = phases
	
	# Attach AI metadata to Unit via custom property (accessed as metadata)
	unit.metadata = ai_metadata
	
	return unit

