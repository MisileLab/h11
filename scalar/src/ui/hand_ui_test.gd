extends Control

@onready var hand_ui: HandUI = $HandUI
@onready var log_label: Label = $LogLabel

func _ready() -> void:
	# Create some dummy cards
	var hands: Dictionary = {
		"scala": [
			_create_card("Strike", "Deal 5 damage", Card.CardType.ENEMY_TARGET, 1),
			_create_card("Big Block", "Gain 15 block", Card.CardType.K_BUFF, 3) # Expensive card
		],
		"lambda": [
			_create_card("Multiply", "Double damage", Card.CardType.V_BUFF, 2),
			_create_card("Heal", "Restore 10 HP", Card.CardType.SPECIAL, 1)
		],
		"riff": [
			_create_card("Song of Power", "+2 Q for 2 turns", Card.CardType.Q_BUFF, 2),
			_create_card("Aria", "Trigger combos", Card.CardType.ALLY_TRIGGER, 0)
		]
	}
	
	hand_ui.update_hands(hands)
	
	# Simulate 2 AP available, so the 3-AP card becomes unplayable
	hand_ui.update_playability(2)
	
	hand_ui.card_selected.connect(_on_card_selected)
	hand_ui.card_play_requested.connect(_on_card_play_requested)

func _create_card(c_name: String, desc: String, type: Card.CardType, cost: int) -> Card:
	var card = Card.new()
	card.card_name = c_name
	card.description = desc
	card.card_type = type
	card.ap_cost = cost
	# Add a dummy effect for tooltip testing
	card.add_effect_from(Card.StatType.HP, -5, 0)
	return card

func _on_card_selected(card: Card) -> void:
	log_label.text = "Selected: " + card.card_name

func _on_card_play_requested(card: Card) -> void:
	log_label.text = "Play Requested: " + card.card_name
