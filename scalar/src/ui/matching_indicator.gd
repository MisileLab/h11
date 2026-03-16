extends CanvasLayer
class_name MatchingIndicator

## Visualizes matching opportunities (ally combos and enemy targets).
## Displays formula information (Q * AP >= K) on hover or selection.
## Structured as a CanvasLayer overlay.

enum IndicatorType {
	ALLY_COMBO,
	ENEMY_TARGET
}

var _type: int = IndicatorType.ALLY_COMBO
var _source_pos: Vector2 = Vector2.ZERO
var _target_pos: Vector2 = Vector2.ZERO
var _formula_text: String = ""
var _is_hovered: bool = false
var _is_active: bool = false
var _always_show_info: bool = false

# Styling configuration
const ALLY_COLOR := Color(0.2, 0.6, 1.0, 0.8) # Blue
const ENEMY_COLOR := Color(0.9, 0.2, 0.2, 0.8) # Red
const LINE_WIDTH := 4.0
const CROSSHAIR_SIZE := 20.0

@onready var draw_rect: Control = $DrawRect
@onready var formula_label: RichTextLabel = $FormulaLabel

func _ready() -> void:
	if formula_label:
		formula_label.hide()
	
	if draw_rect:
		draw_rect.draw.connect(_on_draw_rect_draw)

func _process(_delta: float) -> void:
	if not _is_active:
		return
		
	# Check hover
	var mouse_pos = draw_rect.get_local_mouse_position() if draw_rect else Vector2.ZERO
	var was_hovered = _is_hovered
	
	# Determine if mouse is near the line or target
	var is_near = false
	if _type == IndicatorType.ALLY_COMBO:
		# Check distance to line segment
		is_near = _is_point_near_segment(mouse_pos, _source_pos, _target_pos, 15.0)
	else:
		# Check distance to target (crosshair)
		is_near = mouse_pos.distance_to(_target_pos) < CROSSHAIR_SIZE * 1.5
		
	if is_near != was_hovered:
		_is_hovered = is_near
		_update_visibility()
		if draw_rect:
			draw_rect.queue_redraw()

func _update_visibility() -> void:
	if formula_label:
		formula_label.visible = _is_active and (_is_hovered or _always_show_info)

func set_always_show_info(show: bool) -> void:
	_always_show_info = show
	_update_visibility()

func _on_draw_rect_draw() -> void:
	if not _is_active or not draw_rect:
		return
		
	if _type == IndicatorType.ALLY_COMBO:
		# Blue line for ally combo
		var color = ALLY_COLOR
		if _is_hovered or _always_show_info:
			color.a = 1.0 # Highlight
		draw_rect.draw_line(_source_pos, _target_pos, color, LINE_WIDTH, true)
		
		# Draw a small dot at source and target
		draw_rect.draw_circle(_source_pos, LINE_WIDTH * 1.5, color)
		draw_rect.draw_circle(_target_pos, LINE_WIDTH * 1.5, color)
		
	elif _type == IndicatorType.ENEMY_TARGET:
		# Red dashed/faded line and crosshair for enemy
		var color = ENEMY_COLOR
		if _is_hovered or _always_show_info:
			color.a = 1.0 # Highlight
		
		# Draw a subtle line to the target
		var faded_color = color
		faded_color.a *= 0.5
		draw_rect.draw_line(_source_pos, _target_pos, faded_color, LINE_WIDTH * 0.5, true)
		
		# Draw Crosshair
		_draw_crosshair(draw_rect, _target_pos, color, CROSSHAIR_SIZE)

func _draw_crosshair(canvas: Control, pos: Vector2, color: Color, size: float) -> void:
	var half = size / 2.0
	var gap = size * 0.2
	canvas.draw_line(pos + Vector2(gap, 0), pos + Vector2(half, 0), color, LINE_WIDTH)
	canvas.draw_line(pos - Vector2(gap, 0), pos - Vector2(half, 0), color, LINE_WIDTH)
	canvas.draw_line(pos + Vector2(0, gap), pos + Vector2(0, half), color, LINE_WIDTH)
	canvas.draw_line(pos - Vector2(0, gap), pos - Vector2(0, half), color, LINE_WIDTH)
	canvas.draw_arc(pos, size * 0.6, 0, TAU, 16, color, LINE_WIDTH * 0.5)

## Configure and show an ally combo indicator
func setup_combo(src: Vector2, tgt: Vector2, q: int, ap: int, k: int) -> void:
	_type = IndicatorType.ALLY_COMBO
	_source_pos = src
	_target_pos = tgt
	_build_formula_text(q, ap, k)
	_is_active = true
	_update_label_position()
	_update_visibility()
	if draw_rect: draw_rect.queue_redraw()

## Configure and show an enemy target indicator
func setup_target(src: Vector2, tgt: Vector2, q: int, ap: int, k: int) -> void:
	_type = IndicatorType.ENEMY_TARGET
	_source_pos = src
	_target_pos = tgt
	_build_formula_text(q, ap, k)
	_is_active = true
	_update_label_position()
	_update_visibility()
	if draw_rect: draw_rect.queue_redraw()

func _build_formula_text(q: int, ap: int, k: int) -> void:
	var product = q * ap
	if product >= k:
		_formula_text = "[center]Q(%d) × AP(%d) = %d [color=green]≥[/color] K(%d) [color=green]✓[/color][/center]" % [q, ap, product, k]
	else:
		_formula_text = "[center]Q(%d) × AP(%d) = %d [color=red]<[/color] K(%d) [color=red]✗[/color][/center]" % [q, ap, product, k]

## Clear and hide the indicator
func clear() -> void:
	_is_active = false
	_update_visibility()
	if draw_rect: draw_rect.queue_redraw()

func _update_label_position() -> void:
	if not formula_label:
		return
	formula_label.text = _formula_text
	
	# Position label near the middle for combos, or above target for enemies
	var pos = Vector2.ZERO
	if _type == IndicatorType.ALLY_COMBO:
		pos = (_source_pos + _target_pos) / 2.0
	else:
		pos = _target_pos + Vector2(0, -CROSSHAIR_SIZE - 20)
		
	# Offset so it's centered
	pos -= formula_label.get_minimum_size() / 2.0
	formula_label.position = pos

# Utility: Distance from point to line segment
func _is_point_near_segment(p: Vector2, a: Vector2, b: Vector2, tolerance: float) -> bool:
	var l2 = a.distance_squared_to(b)
	if l2 == 0:
		return p.distance_to(a) < tolerance
		
	var t = max(0.0, min(1.0, (p - a).dot(b - a) / l2))
	var projection = a + t * (b - a)
	return p.distance_to(projection) < tolerance
