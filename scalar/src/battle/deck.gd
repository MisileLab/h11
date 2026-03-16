class_name Deck
extends Resource

## Deck resource — manages the three card zones for a battle participant.
##
## Each Deck belongs to one owner (a Unit) and tracks cards across three zones:
##   - draw_pile: face-down cards available to draw (index 0 = top)
##   - hand: cards currently held and playable
##   - discard_pile: cards that have been played or discarded
##
## Card movement rules:
##   - draw_cards() moves from draw_pile → hand
##   - discard_card() moves from hand → discard_pile
##   - discard_hand() moves all hand → discard_pile
##   - When draw_pile is exhausted, discard_pile reshuffles into draw_pile
##   - add_to_deck() inserts a new card at the bottom of draw_pile
##
## Hand size limits are NOT enforced here — overflow handling is delegated
## to the Draw System (Task 7) which decides which excess cards to discard.
##
## References:
##   GDD Section 10 — Deck construction and draw rules

# --- Signals ---

## Emitted after draw_pile is shuffled (including reshuffle from discard).
signal draw_pile_shuffled()

## Emitted when cards are drawn. Payload is the array of drawn cards.
signal cards_drawn(cards: Array[Card])

## Emitted when a single card moves from hand to discard.
signal card_discarded(card: Card)

## Emitted when the entire hand is discarded. Payload is the moved cards.
signal hand_discarded(cards: Array[Card])

# --- State ---

## The Unit that owns this deck. Null until assigned.
var owner: Unit = null

## Face-down cards available to draw. Index 0 is the top of the pile.
var draw_pile: Array[Card] = []

## Cards currently held by the owner and available for play.
var hand: Array[Card] = []

## Cards that have been played or discarded. Chronological order.
var discard_pile: Array[Card] = []

# --- Public API ---

## Randomize the order of the draw pile using Fisher-Yates shuffle.
func shuffle_draw_pile() -> void:
	_fisher_yates_shuffle(draw_pile)
	draw_pile_shuffled.emit()


## Draw up to `count` cards from draw_pile into hand.
## When draw_pile is empty and discard_pile has cards, reshuffles discard
## into draw_pile and continues drawing.
## Returns the Array of cards actually drawn (may be fewer than requested
## when both piles are exhausted).
## Does NOT enforce hand size limits — caller handles overflow.
func draw_cards(count: int) -> Array[Card]:
	if count <= 0:
		return []
	var drawn: Array[Card] = []
	for i: int in range(count):
		if draw_pile.is_empty():
			if discard_pile.is_empty():
				break
			_reshuffle_discard_into_draw()
		var card: Card = draw_pile.pop_front()
		hand.append(card)
		drawn.append(card)
	if not drawn.is_empty():
		cards_drawn.emit(drawn)
	return drawn


## Move a specific card from hand to discard pile.
## Returns true if the card was found and moved, false otherwise.
func discard_card(card: Card) -> bool:
	var index: int = hand.find(card)
	if index == -1:
		return false
	hand.remove_at(index)
	discard_pile.append(card)
	card_discarded.emit(card)
	return true


## Move all cards from hand to discard pile.
## Emits hand_discarded with the moved cards (empty array if hand was empty).
func discard_hand() -> void:
	var moved: Array[Card] = hand.duplicate()
	discard_pile.append_array(hand)
	hand.clear()
	hand_discarded.emit(moved)


## Add a new card to the bottom of the draw pile.
## Used for mid-battle card-add effects.
func add_to_deck(card: Card) -> void:
	draw_pile.append(card)


## Total number of cards across all three zones.
func total_cards() -> int:
	return draw_pile.size() + hand.size() + discard_pile.size()


## Number of cards currently in hand.
func hand_size() -> int:
	return hand.size()


## Number of cards in the draw pile.
func draw_pile_size() -> int:
	return draw_pile.size()


## Number of cards in the discard pile.
func discard_pile_size() -> int:
	return discard_pile.size()


# --- Private ---

## Fisher-Yates (Knuth) in-place shuffle.
## Iterates from the last element down to the second, swapping each element
## with a randomly chosen earlier element (including itself).
## Uses Godot's randi_range() for uniform random indices.
static func _fisher_yates_shuffle(arr: Array) -> void:
	var n: int = arr.size()
	for i: int in range(n - 1, 0, -1):
		var j: int = randi_range(0, i)
		var tmp: Variant = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


## Move all discard cards into draw pile and shuffle.
func _reshuffle_discard_into_draw() -> void:
	draw_pile.append_array(discard_pile)
	discard_pile.clear()
	_fisher_yates_shuffle(draw_pile)
	draw_pile_shuffled.emit()
