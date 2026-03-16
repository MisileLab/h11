class_name HandUI
extends Control

signal card_selected(card: Card)
signal card_play_requested(card: Card)

@onready var scala_cards: HBoxContainer = $Margin/DecksContainer/ScalaContainer/Cards
@onready var lambda_cards: HBoxContainer = $Margin/DecksContainer/LambdaContainer/Cards
@onready var riff_cards: HBoxContainer = $Margin/DecksContainer/RiffContainer/Cards

const CARD_UI_SCENE = preload("res://src/ui/card_ui.tscn")

var _selected_card_ui: CardUI = null
var _all_card_uis: Array[CardUI] = []

func _ready() -> void:
	clear_hands()

## Clears all cards from the UI
func clear_hands() -> void:
	_clear_container(scala_cards)
	_clear_container(lambda_cards)
	_clear_container(riff_cards)
	_selected_card_ui = null
	_all_card_uis.clear()

func _clear_container(container: Control) -> void:
	if not container:
		return
	for child in container.get_children():
		child.queue_free()

## Populates the hands based on a dictionary mapping deck names to arrays of cards
## (as returned by draw_manager.get_hands_by_deck())
func update_hands(hands_by_deck: Dictionary) -> void:
	clear_hands()
	
	if not is_node_ready():
		await ready
	
	if hands_by_deck.has("scala"):
		_populate_container(scala_cards, "scala", hands_by_deck["scala"])
	if hands_by_deck.has("lambda"):
		_populate_container(lambda_cards, "lambda", hands_by_deck["lambda"])
	if hands_by_deck.has("riff"):
		_populate_container(riff_cards, "riff", hands_by_deck["riff"])

func _populate_container(container: HBoxContainer, deck_name: String, cards: Array) -> void:
	for card in cards:
		var card_ui: CardUI = CARD_UI_SCENE.instantiate() as CardUI
		container.add_child(card_ui)
		card_ui.setup(card, deck_name)
		card_ui.selected.connect(_on_card_ui_selected)
		card_ui.play_requested.connect(_on_card_ui_play_requested)
		_all_card_uis.append(card_ui)

## Updates playability state for all cards based on current AP
func update_playability(current_ap: int) -> void:
	for card_ui in _all_card_uis:
		if is_instance_valid(card_ui) and card_ui.card:
			card_ui.set_playable(card_ui.card.ap_cost <= current_ap)

func _on_card_ui_selected(card_ui: CardUI) -> void:
	if _selected_card_ui and is_instance_valid(_selected_card_ui):
		_selected_card_ui.is_selected = false
		
	_selected_card_ui = card_ui
	_selected_card_ui.is_selected = true
	card_selected.emit(card_ui.card)

func _on_card_ui_play_requested(card_ui: CardUI) -> void:
	# Double click also acts as selection
	if _selected_card_ui != card_ui:
		_on_card_ui_selected(card_ui)
		
	card_play_requested.emit(card_ui.card)

## Deselect currently selected card
func deselect() -> void:
	if _selected_card_ui and is_instance_valid(_selected_card_ui):
		_selected_card_ui.is_selected = false
	_selected_card_ui = null
