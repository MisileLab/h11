extends Control

@onready var spend_1_button = $VBoxContainer/Spend1Button
@onready var spend_3_button = $VBoxContainer/Spend3Button
@onready var reset_button = $VBoxContainer/ResetButton
@onready var log_text = $LogText

func _ready() -> void:
	spend_1_button.pressed.connect(_on_spend_1_pressed)
	spend_3_button.pressed.connect(_on_spend_3_pressed)
	reset_button.pressed.connect(_on_reset_pressed)
	
	_log_message("Test Harness initialized. APManager Base AP: %d / %d" % [APManager.current_ap, APManager.max_ap])
	
	# Simulate clicks for automated testing
	await get_tree().create_timer(0.5).timeout
	_on_spend_1_pressed()
	await get_tree().create_timer(0.5).timeout
	_on_spend_3_pressed()
	await get_tree().create_timer(0.5).timeout
	_on_reset_pressed()
	
	await get_tree().create_timer(0.5).timeout
	get_tree().quit()

func _on_spend_1_pressed() -> void:
	if APManager.spend_ap(1):
		_log_message("Spent 1 AP. Current: %d" % APManager.current_ap)
	else:
		_log_message("Failed to spend 1 AP. Not enough AP!")

func _on_spend_3_pressed() -> void:
	if APManager.spend_ap(3):
		_log_message("Spent 3 AP. Current: %d" % APManager.current_ap)
	else:
		_log_message("Failed to spend 3 AP. Not enough AP!")

func _on_reset_pressed() -> void:
	APManager.reset_ap()
	_log_message("Reset AP to max (%d)" % APManager.max_ap)

func _log_message(msg: String) -> void:
	print(msg)
	log_text.text += "\n" + msg
