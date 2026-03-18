#!/usr/bin/env -S godot --headless --script
var loader = preload("res://src/battle/card_loader.gd").new()

# Load all three decks
var all_decks = loader.load_all_decks()

print("\n=== CARD LOADING VERIFICATION ===\n")

for deck_name: String in all_decks:
	var cards = all_decks[deck_name]
	print("%s: %d cards" % [deck_name.to_upper(), cards.size()])
	
	# Verify each card
	for i in range(cards.size()):
		var card = cards[i]
		if card == null:
			print("  [ERROR] Card %d is null" % i)
			continue
		
		# Check required fields
		if card.card_name == "":
			print("  [ERROR] Card %d: empty name" % i)
		
		var effect_count = card.effect_count()
		if effect_count == 0:
			print("  [ERROR] Card %d: no effects" % i)
		
		# Validate first effect (sample)
		if effect_count > 0:
			var effect = card.effects[0]
			if effect.stat_type < 0 or effect.stat_type > 4:
				print("  [ERROR] Card %d: invalid stat_type %d" % [i, effect.stat_type])

print("\n=== SAMPLE CARDS ===\n")

# Show sample cards from each deck
for deck_name: String in ["scala", "lambda", "riff"]:
	var cards = all_decks[deck_name]
	if cards.size() > 0:
		var card = cards[0]
		print("%s Sample: %s (AP: %d, Type: %d, Target: %d, Effects: %d)" % [
			deck_name.to_upper(),
			card.card_name,
			card.ap_cost,
			card.card_type,
			card.target_type,
			card.effect_count()
		])

print("\n=== ROUND-TRIP SERIALIZATION ===\n")

# Test round-trip: card -> dict -> card
var scala_cards = all_decks["scala"]
if scala_cards.size() > 0:
	var original = scala_cards[0]
	var dict = original.to_dict()
	var restored = preload("res://src/battle/card.gd").from_dict(dict)
	
	print("Original: %s (AP: %d, Effects: %d)" % [original.card_name, original.ap_cost, original.effect_count()])
	print("Restored: %s (AP: %d, Effects: %d)" % [restored.card_name, restored.ap_cost, restored.effect_count()])
	print("Match: %s" % (original.card_name == restored.card_name and original.ap_cost == restored.ap_cost))

print("\n=== TOTAL CARDS ===")
var total = 0
for deck_name: String in all_decks:
	total += all_decks[deck_name].size()
print("Total: %d cards across 3 decks" % total)
