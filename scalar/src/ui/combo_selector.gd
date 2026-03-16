extends Control

signal combo_confirmed(source_unit: Resource, target_unit: Resource, ap_allocated: int)
signal combo_canceled()

@onready var combo_list: OptionButton = $Panel/VBox/ComboList
@onready var ap_spinbox: SpinBox = $Panel/VBox/APContainer/APSpinBox
@onready var formula_label: Label = $Panel/VBox/FormulaLabel
@onready var error_label: Label = $Panel/VBox/ErrorLabel
@onready var confirm_button: Button = $Panel/VBox/Buttons/ConfirmButton
@onready var cancel_button: Button = $Panel/VBox/Buttons/CancelButton

var _combo_engine: Node = null
var _ap_manager: Node = null
var _available_combos: Array[Dictionary] = []

func setup(combo_engine: Node, ap_manager: Node) -> void:
	_combo_engine = combo_engine
	_ap_manager = ap_manager

func refresh() -> void:
	if _combo_engine == null or _ap_manager == null:
		return
		
	_available_combos = _combo_engine.get_available_combos()
	combo_list.clear()
	
	if _available_combos.is_empty():
		combo_list.add_item("No combos available")
		combo_list.disabled = true
		_update_ui(-1)
		return
		
	combo_list.disabled = false
	for i in range(_available_combos.size()):
		var c = _available_combos[i]
		var text = "%s → %s (Min AP: %d)" % [c.source_name, c.target_name, c.min_ap_needed]
		combo_list.add_item(text)
		
	_update_ui(0)

func _ready() -> void:
	combo_list.item_selected.connect(_on_combo_selected)
	ap_spinbox.value_changed.connect(_on_ap_changed)
	confirm_button.pressed.connect(_on_confirm_pressed)
	cancel_button.pressed.connect(_on_cancel_pressed)

func _on_combo_selected(index: int) -> void:
	_update_ui(index)

func _on_ap_changed(value: float) -> void:
	var index = combo_list.selected
	_update_ui(index, int(value))

func _update_ui(index: int, forced_ap: int = -1) -> void:
	if index < 0 or index >= _available_combos.size():
		ap_spinbox.editable = false
		formula_label.text = ""
		error_label.text = "No valid combo selected."
		error_label.add_theme_color_override("font_color", Color.DIM_GRAY)
		confirm_button.disabled = true
		return
		
	var combo = _available_combos[index]
	var min_ap = combo.min_ap_needed
	var q = combo.source_q
	var k = combo.target_k
	
	ap_spinbox.editable = true
	ap_spinbox.min_value = 1
	if _ap_manager != null:
		ap_spinbox.max_value = max(1, _ap_manager.current_ap)
	
	var ap = forced_ap
	if ap == -1:
		ap = min_ap
		ap_spinbox.set_value_no_signal(ap)
		
	var product = q * ap
	var is_valid = product >= k
	var can_afford = _ap_manager != null and _ap_manager.current_ap >= ap
	
	var symbol = "≥" if is_valid else "<"
	formula_label.text = "Q(%d) × AP(%d) = %d %s K(%d)" % [q, ap, product, symbol, k]
	
	if not can_afford:
		error_label.text = "Insufficient AP!"
		error_label.add_theme_color_override("font_color", Color.RED)
		confirm_button.disabled = true
	elif not is_valid:
		error_label.text = "Invalid combo (Q × AP < K)!"
		error_label.add_theme_color_override("font_color", Color.RED)
		confirm_button.disabled = true
	else:
		error_label.text = "Combo valid."
		error_label.add_theme_color_override("font_color", Color.GREEN)
		confirm_button.disabled = false

func _on_confirm_pressed() -> void:
	var index = combo_list.selected
	if index >= 0 and index < _available_combos.size():
		var combo = _available_combos[index]
		combo_confirmed.emit(combo.source_unit, combo.target_unit, int(ap_spinbox.value))

func _on_cancel_pressed() -> void:
	combo_canceled.emit()
