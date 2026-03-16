extends Control

const UnitRes := preload("res://src/core/unit.gd")
const ComboEngine := preload("res://src/battle/combo_engine.gd")
const APManager := preload("res://src/core/ap_manager.gd")
const UnitManager := preload("res://src/core/unit_manager.gd")
const MatchEngine := preload("res://src/core/matching_engine.gd")
const ComboSelector := preload("res://src/ui/combo_selector.gd")

var _match_engine: Node
var _ap_manager: Node
var _unit_manager: Node
var _combo_engine: Node
var _selector: Node

func _ready() -> void:
	_match_engine = MatchEngine.new()
	add_child(_match_engine)
	
	_ap_manager = APManager.new()
	add_child(_ap_manager)
	
	_unit_manager = UnitManager.new()
	add_child(_unit_manager)
	
	_combo_engine = ComboEngine.new()
	add_child(_combo_engine)
	
	_combo_engine.setup(_match_engine, _ap_manager, _unit_manager)
	
	var p1 = UnitRes.new()
	p1.unit_name = "Warrior"
	p1.q_value = 2
	p1.k_value = 2
	p1.v_value = 10
	
	var p2 = UnitRes.new()
	p2.unit_name = "Mage"
	p2.q_value = 1
	p2.k_value = 5
	p2.v_value = 5
	
	_unit_manager.add_party_member(p1)
	_unit_manager.add_party_member(p2)
	
	_ap_manager.max_ap = 4
	_ap_manager.current_ap = 3
	
	var selector_scene = load("res://src/ui/combo_selector.tscn")
	_selector = selector_scene.instantiate()
	add_child(_selector)
	
	_selector.setup(_combo_engine, _ap_manager)
	_selector.refresh()
	
	_selector.combo_confirmed.connect(_on_confirmed)
	_selector.combo_canceled.connect(_on_canceled)
	
	print("TEST: Setup complete. Current AP: ", _ap_manager.current_ap)
	
	var timer = get_tree().create_timer(0.5)
	timer.timeout.connect(_run_test_scenario)

func _run_test_scenario():
	print("--- UI SIMULATION ---")
	
	print("Initial formula label: ", _selector.formula_label.text)
	print("Initial error label: ", _selector.error_label.text)
	print("Is confirm disabled? ", _selector.confirm_button.disabled)
	
	print("\nSimulating AP spinbox reduction to 1 (invalid combo, Q*AP < K)")
	_selector.ap_spinbox.value = 1
	print("Formula label: ", _selector.formula_label.text)
	print("Error label: ", _selector.error_label.text)
	print("Is confirm disabled? ", _selector.confirm_button.disabled)
	
	print("\nSimulating AP spinbox increase to 3 (valid combo)")
	_selector.ap_spinbox.value = 3
	print("Formula label: ", _selector.formula_label.text)
	print("Error label: ", _selector.error_label.text)
	print("Is confirm disabled? ", _selector.confirm_button.disabled)
	
	print("\nSimulating confirm button press...")
	_selector.confirm_button.pressed.emit()
	
	get_tree().quit()

func _on_confirmed(source, target, ap):
	print("TEST: Combo Confirmed - Source: %s, Target: %s, AP: %d" % [source.unit_name, target.unit_name, ap])
	var result = _combo_engine.execute_combo(source, target, ap)
	print("TEST: Execution result: ", result)
	_selector.refresh()

func _on_canceled():
	print("TEST: Combo Canceled")
