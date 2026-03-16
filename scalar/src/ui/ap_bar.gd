extends Control

## Displays the current and max AP for the party.
## Listens to APManager.ap_changed signal.

const COLOR_PLENTY = Color(0.2, 0.8, 1.0)    # Blue for full/high
const COLOR_LOW = Color(1.0, 0.8, 0.2)       # Yellow/Orange for low
const COLOR_CRITICAL = Color(1.0, 0.3, 0.3)  # Red for critical

@onready var value_label = %ValueLabel
@onready var pulse_effect = $PulseEffect
@onready var background = $Background
@onready var progress_bar = $ProgressBar

var current_pulse_tween: Tween

func _ready() -> void:
	# Hide default background of progress bar to use our ColorRect
	var empty_style = StyleBoxEmpty.new()
	progress_bar.add_theme_stylebox_override("background", empty_style)
	
	# Connect to APManager if it exists
	if APManager != null:
		APManager.ap_changed.connect(_on_ap_changed)
		_update_display(APManager.current_ap, APManager.max_ap)
	else:
		push_warning("APBar: APManager not found!")
		_update_display(5, 5)

func _on_ap_changed(current: int, max_val: int) -> void:
	_update_display(current, max_val)
	_play_pulse()

func _update_display(current: int, max_val: int) -> void:
	value_label.text = "%d / %d" % [current, max_val]
	
	progress_bar.max_value = max_val
	progress_bar.value = current
	
	var ratio = float(current) / float(max_val) if max_val > 0 else 0.0
	
	# Update label color based on thresholds
	var target_color: Color
	if ratio >= 0.5:
		target_color = COLOR_PLENTY
	elif ratio >= 0.25:
		target_color = COLOR_LOW
	else:
		target_color = COLOR_CRITICAL
		
	value_label.add_theme_color_override("font_color", target_color)
	
	# Update progress bar fill color (slightly darker than text to maintain text contrast)
	var fill_style = StyleBoxFlat.new()
	fill_style.bg_color = target_color.darkened(0.5)
	progress_bar.add_theme_stylebox_override("fill", fill_style)

func _play_pulse() -> void:
	if current_pulse_tween and current_pulse_tween.is_valid():
		current_pulse_tween.kill()
		
	current_pulse_tween = create_tween()
	
	# Flash white/bright slightly
	pulse_effect.color.a = 0.3
	current_pulse_tween.tween_property(pulse_effect, "color:a", 0.0, 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
