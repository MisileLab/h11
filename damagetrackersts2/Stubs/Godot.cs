namespace Godot {
    public partial class Node { public virtual void _Ready() {} public virtual void _Process(double delta) {} public void AddChild(Node n) {} public void QueueFree() {} public Node GetNode(string path) => null!; }
    public partial class CanvasLayer : Node { public int Layer { get; set; } }
    public partial class Control : Node { public bool Visible { get; set; } public Vector2 GlobalPosition { get; set; } public Vector2 CustomMinimumSize { get; set; } }
    public partial class VBoxContainer : Control {}
    public partial class HBoxContainer : Control {}
    public partial class Label : Control { public string Text { get; set; } = ""; }
    public partial class ColorRect : Control { public Color Color { get; set; } }
    public partial class Engine { public static bool IsEditorHint() => false; }
    public struct Vector2 { public float X, Y; public Vector2(float x, float y) { X = x; Y = y; } }
    public struct Color { public Color(string html) {} }
    public class MultiplayerApi { public static void SendBytes(byte[] bytes, int peer = 0, int mode = 0) {} public byte[] GetCustomPacket() => null!; }
}
