class_name CardUI
extends PanelContainer

signal selected(card_ui: CardUI)
signal play_requested(card_ui: CardUI)

var card: Card
var deck_name: String = ""

var is_selected: bool = false:
	set(v):
		is_selected = v
		_update_visuals()

var is_playable: bool = true:
	set(v):
		is_playable = v
		_update_visuals()

@onready var name_label: Label = $Margin/VBox/Header/NameLabel
@onready var ap_label: Label = $Margin/VBox/Header/APLabel
@onready var type_label: Label = $Margin/VBox/TypeLabel
@onready var desc_label: Label = $Margin/VBox/DescLabel
@onready var stylebox: StyleBoxFlat = get_theme_stylebox("panel").duplicate()

var last_click_time: float = 0.0
const DOUBLE_CLICK_TIME: float = 0.3

func _ready() -> void:
	add_theme_stylebox_override("panel", stylebox)
	
func setup(p_card: Card, p_deck_name: String) -> void:
	card = p_card
	deck_name = p_deck_name
	
	if not is_node_ready():
		await ready
		
	if card:
		name_label.text = card.card_name
		ap_label.text = str(card.ap_cost)
		
		# Map card type enum to string
		var type_str = "Card"
		match card.card_type:
			Card.CardType.Q_BUFF: type_str = "Q BUFF"
			Card.CardType.K_BUFF: type_str = "K BUFF"
			Card.CardType.V_BUFF: type_str = "V BUFF"
			Card.CardType.ALLY_TRIGGER: type_str = "TRIGGER"
			Card.CardType.ENEMY_TARGET: type_str = "ATTACK"
			Card.CardType.SPECIAL: type_str = "SPECIAL"
		type_label.text = type_str
		
		desc_label.text = card.description
		
		# Generate a compact tooltip
		var tooltip: String = "%s (AP: %d)\nType: %s\nTarget: %s\n\n%s" % [
			card.card_name, card.ap_cost, type_str, str(card.target_type), card.description
		]
		for effect in card.effects:
			var stat_name = "Unknown"
			match effect.stat_type:
				Card.StatType.Q: stat_name = "Q"
				Card.StatType.K: stat_name = "K"
				Card.StatType.V: stat_name = "V"
				Card.StatType.HP: stat_name = "HP"
				Card.StatType.AP: stat_name = "AP"
			var dur_str = "Perm" if effect.duration == 0 else str(effect.duration) + " turns"
			var sign_str = "+" if effect.value >= 0 else ""
			tooltip += "\nEffect: %s%d %s (%s)" % [sign_str, effect.value, stat_name, dur_str]
			
		self.tooltip_text = tooltip
	else:
		name_label.text = "Empty"
		desc_label.text = "No data"
		
	_update_visuals()

func set_playable(playable: bool) -> void:
	is_playable = playable

func _update_visuals() -> void:
	if not is_instance_valid(stylebox):
		return
		
	var base_color := Color(0.2, 0.2, 0.2)
	match deck_name:
		"scala": base_color = Color(0.2, 0.3, 0.4) # Blue-ish
		"lambda": base_color = Color(0.4, 0.2, 0.3) # Purple/Red-ish
		"riff": base_color = Color(0.3, 0.4, 0.2) # Green-ish
		
	if not is_playable:
		modulate = Color(0.6, 0.6, 0.6, 0.7) # Grayed out and slightly transparent
		ap_label.add_theme_color_override("font_color", Color(0.8, 0.4, 0.4, 1.0)) # Reddish AP cost to indicate cannot afford / unplayable
	else:
		modulate = Color.WHITE
		ap_label.add_theme_color_override("font_color", Color(1.0, 0.8, 0.0, 1.0)) # Normal gold AP
		
	if is_selected:
		stylebox.bg_color = base_color.lightened(0.2)
		stylebox.border_color = Color.WHITE if is_playable else Color(0.8, 0.8, 0.8)
		stylebox.border_width_left = 3
		stylebox.border_width_right = 3
		stylebox.border_width_top = 3
		stylebox.border_width_bottom = 3
		position.y = -10 # Pop up slightly
	else:
		stylebox.bg_color = base_color
		stylebox.border_color = base_color.darkened(0.2)
		stylebox.border_width_left = 2
		stylebox.border_width_right = 2
		stylebox.border_width_top = 2
		stylebox.border_width_bottom = 2
		position.y = 0

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var current_time = Time.get_ticks_msec() / 1000.0
		if current_time - last_click_time < DOUBLE_CLICK_TIME:
			# Double click
			play_requested.emit(self)
		else:
			# Single click
			selected.emit(self)
			
		last_click_time = current_time

func _on_mouse_entered() -> void:
	if not is_selected:
		stylebox.bg_color = stylebox.bg_color.lightened(0.1)

func _on_mouse_exited() -> void:
	if not is_selected:
		_update_visuals()
