extends Node2D

@onready var combo_indicator_success = $ComboIndicatorSuccess
@onready var combo_indicator_fail = $ComboIndicatorFail
@onready var target_indicator_success = $TargetIndicatorSuccess
@onready var target_indicator_fail = $TargetIndicatorFail
@onready var toggle_btn = $CanvasLayer/Panel/VBoxContainer/ToggleInfoButton

func _ready() -> void:
	# Success Ally Combo
	combo_indicator_success.setup_combo(Vector2(200, 200), Vector2(500, 150), 3, 2, 5) # 6 >= 5 (Success)
	
	# Fail Ally Combo
	combo_indicator_fail.setup_combo(Vector2(200, 300), Vector2(500, 350), 2, 2, 5) # 4 < 5 (Fail)
	
	# Success Enemy Target
	target_indicator_success.setup_target(Vector2(600, 200), Vector2(900, 150), 4, 3, 10) # 12 >= 10 (Success)
	
	# Fail Enemy Target
	target_indicator_fail.setup_target(Vector2(600, 300), Vector2(900, 350), 2, 3, 10) # 6 < 10 (Fail)
	
	if toggle_btn:
		toggle_btn.toggled.connect(_on_toggle_info)

func _on_toggle_info(toggled_on: bool) -> void:
	combo_indicator_success.set_always_show_info(toggled_on)
	combo_indicator_fail.set_always_show_info(toggled_on)
	target_indicator_success.set_always_show_info(toggled_on)
	target_indicator_fail.set_always_show_info(toggled_on)
