extends Node

## Draw System — coordinates draws across three named decks (Scala, Lambda, Riff).
##
## At turn start, draws exactly 2 cards from each deck for a normal total of 6.
## Tracks per-deck hands independently while enforcing a global max hand limit.
## When total hand size exceeds the limit after drawing, emits overflow_needed
## with the excess cards and a discard callback for later UI integration.
##
## Deck names match Unit.UnitType: "scala", "lambda", "riff".
##
## References:
##   GDD Section 10 — Draw rules and hand limits

# --- Constants ---

## Number of cards drawn per deck at turn start.
const CARDS_PER_DECK: int = 2

## Maximum total cards across all three hands combined.
const MAX_HAND_SIZE: int = 10

## The three deck names that this manager coordinates.
const DECK_NAMES: Array[String] = ["scala", "lambda", "riff"]

# --- Signals ---

## Emitted after turn-start draw completes. Payload is total cards drawn this turn.
signal cards_drawn(total_count: int)

## Emitted when total hand size exceeds MAX_HAND_SIZE after drawing.
## excess_cards: flat array of all hand cards eligible for discard selection.
## callback: a Callable that accepts Array[Card] of chosen discards.
signal overflow_needed(excess_cards: Array[Card], callback: Callable)

# --- Lifecycle ---

func _ready() -> void:
	pass  # Decks assigned via setup(); no tree-dependent init needed.

# --- State ---

## The three managed decks, keyed by deck name.
var _decks: Dictionary = {}

# --- Public API ---

## Initialize with exactly three Deck instances keyed by name.
## Must be called before any draw operations.
func setup(scala_deck: Deck, lambda_deck: Deck, riff_deck: Deck) -> void:
	_decks = {
		"scala": scala_deck,
		"lambda": lambda_deck,
		"riff": riff_deck,
	}


## Returns true if all three decks have been assigned.
func is_ready() -> bool:
	return _decks.size() == 3 and _decks.has("scala") and _decks.has("lambda") and _decks.has("riff")


## Draw CARDS_PER_DECK from each deck at turn start.
## Returns a Dictionary keyed by deck name -> Array[Card] of drawn cards.
## Emits cards_drawn with total count.
## If total hand size exceeds MAX_HAND_SIZE, emits overflow_needed.
func draw_turn_start() -> Dictionary:
	var result: Dictionary = {}
	var total_drawn: int = 0

	for deck_name: String in DECK_NAMES:
		var deck: Deck = _decks[deck_name] as Deck
		var drawn: Array[Card] = deck.draw_cards(CARDS_PER_DECK)
		result[deck_name] = drawn
		total_drawn += drawn.size()

	cards_drawn.emit(total_drawn)

	var total_hand: int = get_total_hand_size()
	if total_hand > MAX_HAND_SIZE:
		_trigger_overflow()

	return result


## Get a specific deck by name. Returns null if name is invalid.
func get_deck(deck_name: String) -> Deck:
	if _decks.has(deck_name):
		return _decks[deck_name] as Deck
	return null


## Total cards currently in hand across all three decks.
func get_total_hand_size() -> int:
	var total: int = 0
	for deck_name: String in DECK_NAMES:
		var deck: Deck = _decks[deck_name] as Deck
		total += deck.hand_size()
	return total


## Number of cards that exceed the max hand limit. 0 if within limit.
func get_overflow_count() -> int:
	return maxi(get_total_hand_size() - MAX_HAND_SIZE, 0)


## Returns a flat array of all hand cards across all three decks.
## Useful for UI to present overflow discard choices.
func get_all_hand_cards() -> Array[Card]:
	var all_cards: Array[Card] = []
	for deck_name: String in DECK_NAMES:
		var deck: Deck = _decks[deck_name] as Deck
		all_cards.append_array(deck.hand)
	return all_cards


## Returns a Dictionary mapping deck_name -> Array[Card] of current hand contents.
## Preserves per-deck grouping for UI presentation.
func get_hands_by_deck() -> Dictionary:
	var result: Dictionary = {}
	for deck_name: String in DECK_NAMES:
		var deck: Deck = _decks[deck_name] as Deck
		result[deck_name] = deck.hand.duplicate()
	return result


## Handle overflow by accepting an array of cards the player chose to discard.
## Each card is discarded from its owning deck.
## Returns true if the correct number of cards were discarded, false otherwise.
func resolve_overflow(cards_to_discard: Array) -> bool:
	var expected: int = get_overflow_count()
	if expected == 0:
		return true
	if cards_to_discard.size() != expected:
		return false

	for i: int in range(cards_to_discard.size()):
		var card: Card = cards_to_discard[i] as Card
		var discarded: bool = false
		for deck_name: String in DECK_NAMES:
			var deck: Deck = _decks[deck_name] as Deck
			if deck.discard_card(card):
				discarded = true
				break
		if not discarded:
			return false

	return true


## Trigger overflow handling. Emits the overflow_needed signal with all hand
## cards and a bound callback. UI connects to this signal, presents choices,
## then calls the callback with selected discards.
func handle_overflow() -> void:
	_trigger_overflow()


# --- Private ---

## Internal overflow trigger: compute excess, gather hand cards, emit signal.
func _trigger_overflow() -> void:
	var overflow: int = get_overflow_count()
	if overflow <= 0:
		return
	var all_hand: Array[Card] = get_all_hand_cards()
	var callback: Callable = Callable(self, "resolve_overflow")
	overflow_needed.emit(all_hand, callback)
