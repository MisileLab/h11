extends SceneTree

func _init() -> void:
	print("Loading Matching Indicator...")
	var scene = load("res://src/ui/test_matching_indicator.tscn")
	var instance = scene.instantiate()
	root.add_child(instance)
	print("Success!")
	quit()
