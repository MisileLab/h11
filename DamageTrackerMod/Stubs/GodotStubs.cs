#if !DAMAGE_TRACKER_STUBS
// This file is only compiled when DAMAGE_TRACKER_STUBS is defined
// It provides minimal stubs for building without Godot DLLs

namespace Godot;

public struct Vector2
{
    public float X;
    public float Y;

    public Vector2(float x, float y) { X = x; Y = y; }
    public static Vector2 Zero => new(0, 0);

    public static Vector2 operator +(Vector2 a, Vector2 b) => new(a.X + b.X, a.Y + b.Y);
    public static Vector2 operator *(Vector2 a, float b) => new(a.X * b, a.Y * b);
}

public struct Vector3
{
    public float X;
    public float Y;
    public float Z;

    public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
    public static Vector3 Zero => new(0, 0, 0);
}

public struct Color
{
    public float R;
    public float G;
    public float B;
    public float A;

    public Color(float r, float g, float b, float a = 1f) { R = r; G = g; B = b; A = a; }
}

public enum MouseFilterEnum { Stop, Pass, Ignore }

public enum HorizontalAlignment { Left, Center, Right, Fill }
public enum VerticalAlignment { Top, Center, Bottom, Fill }

public partial class Node
{
    public string Name { get; set; } = "";
    public Node? GetParent() => null;
    public void AddChild(Node child) { }
    public void RemoveChild(Node child) { }
    public void QueueFree() { }
    public T? GetNodeOrNull<T>(string path) where T : Node => null;
    public T? GetChildOrNull<T>(int idx) where T : Node => null;
}

public partial class Control : Node
{
    public bool Visible { get; set; } = true;
    public Vector2 CustomMinimumSize { get; set; }
    public MouseFilterEnum MouseFilter { get; set; }
    public float AnchorLeft { get; set; }
    public float AnchorTop { get; set; }
    public float AnchorRight { get; set; }
    public float AnchorBottom { get; set; }
    public float OffsetLeft { get; set; }
    public float OffsetTop { get; set; }
    public float OffsetRight { get; set; }
    public float OffsetBottom { get; set; }
    public Color Modulate { get; set; } = new Color(1, 1, 1, 1);

    public void AddThemeColorOverride(string name, Color color) { }
    public void AddThemeFontSizeOverride(string name, int size) { }
    public void AddThemeStyleboxOverride(string name, StyleBox styleBox) { }
}

public partial class Label : Control
{
    public string Text { get; set; } = "";
    public HorizontalAlignment HorizontalAlignment { get; set; }
}

public partial class PanelContainer : Control { }

public partial class VBoxContainer : Control
{
    public int Separation { get; set; }
}

public partial class HBoxContainer : Control
{
    public int Separation { get; set; }
}

public partial class CanvasLayer : Node
{
    public int Layer { get; set; }
}

public partial class Window : Node { }

public partial class Timer : Node
{
    public double WaitTime { get; set; }
    public bool OneShot { get; set; }
    public event Action? Timeout;
    public void Start() { Timeout?.Invoke(); }
}

public abstract class StyleBox { }

public class StyleBoxFlat : StyleBox
{
    public Color BgColor { get; set; }
    public Color BorderColor { get; set; }
    public int BorderWidthLeft { get; set; }
    public int BorderWidthTop { get; set; }
    public int BorderWidthRight { get; set; }
    public int BorderWidthBottom { get; set; }
    public int CornerRadiusTopLeft { get; set; }
    public int CornerRadiusTopRight { get; set; }
    public int CornerRadiusBottomLeft { get; set; }
    public int CornerRadiusBottomRight { get; set; }
    public int ContentMarginLeft { get; set; }
    public int ContentMarginTop { get; set; }
    public int ContentMarginRight { get; set; }
    public int ContentMarginBottom { get; set; }
}

public abstract class InputEvent { }

public class InputEventKey : InputEvent
{
    public bool Pressed { get; set; }
    public bool Echo { get; set; }
    public Key Keycode { get; set; }
}

public enum Key
{
    F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
    Unknown = 0
}

#endif
