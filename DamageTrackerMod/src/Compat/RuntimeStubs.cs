#if DAMAGE_TRACKER_STUBS
namespace Godot
{
    using System;
    using System.Collections.Generic;

    public class Node
    {
        private readonly List<Node> _children = new();

        public string Name { get; set; } = string.Empty;

        public SceneTree? Tree { get; set; }

        public MultiplayerAPI Multiplayer { get; } = new();

        public virtual void AddChild(Node child)
        {
            if (child == null)
            {
                return;
            }

            child.Tree = Tree;
            _children.Add(child);
        }

        public virtual void RemoveChild(Node child)
        {
            _children.Remove(child);
        }

        public virtual SceneTree? GetTree()
        {
            return Tree;
        }

        public virtual bool IsInsideTree()
        {
            return Tree != null;
        }

        public virtual T? GetNodeOrNull<T>(string path) where T : Node
        {
            return null;
        }

        public virtual void QueueFree()
        {
        }

        public virtual void Rpc(string method, params object[] args)
        {
        }

        public virtual void RpcId(long peerId, string method, params object[] args)
        {
        }

        public virtual void CallDeferred(string method, params object[] args)
        {
        }

        public virtual void _EnterTree()
        {
        }

        public virtual void _ExitTree()
        {
        }

        public virtual void _Ready()
        {
        }

        public virtual void _Process(double delta)
        {
        }

        public virtual void _UnhandledInput(InputEvent @event)
        {
        }
    }

    public class Control : Node
    {
        public LayoutPreset LayoutPreset { get; set; }

        public float OffsetLeft { get; set; }

        public float OffsetTop { get; set; }

        public float OffsetRight { get; set; }

        public float OffsetBottom { get; set; }

        public MouseFilterEnum MouseFilter { get; set; }

        public bool Visible { get; set; } = true;

        public void SetAnchorsPreset(LayoutPreset preset)
        {
            LayoutPreset = preset;
        }
    }

    public class CanvasLayer : Node
    {
    }

    public class PanelContainer : Control
    {
        public StyleBoxFlat? ThemeOverrideStylesPanel { get; set; }
    }

    public class VBoxContainer : Control
    {
        public int Separation { get; set; }
    }

    public class Label : Control
    {
        public string Text { get; set; } = string.Empty;
    }

    public class StyleBoxFlat
    {
        public Color BgColor { get; set; } = new(0f, 0f, 0f, 0f);

        public Vector4I ContentMargin { get; set; } = new(0, 0, 0, 0);

        public int CornerRadiusAll { get; set; }
    }

    public readonly struct Vector4I
    {
        public Vector4I(int left, int top, int right, int bottom)
        {
            Left = left;
            Top = top;
            Right = right;
            Bottom = bottom;
        }

        public int Left { get; }

        public int Top { get; }

        public int Right { get; }

        public int Bottom { get; }
    }

    public readonly struct Color
    {
        public Color(float r, float g, float b, float a = 1f)
        {
            R = r;
            G = g;
            B = b;
            A = a;
        }

        public float R { get; }

        public float G { get; }

        public float B { get; }

        public float A { get; }
    }

    public enum LayoutPreset
    {
        TopRight
    }

    public enum MouseFilterEnum
    {
        Stop,
        Pass,
        Ignore
    }

    public class InputEvent
    {
    }

    public class InputEventKey : InputEvent
    {
        public bool Pressed { get; set; }

        public bool Echo { get; set; }

        public Key Keycode { get; set; }
    }

    public enum Key
    {
        None = 0,
        F8 = 1
    }

    public class SceneTree
    {
        public SceneTree()
        {
            Root.Tree = this;
        }

        public Window Root { get; } = new();
    }

    public class Window : Node
    {
    }

    public class MultiplayerApi
    {
        public event Action<long>? PeerConnected;

        public event Action<long>? PeerDisconnected;

        public bool HasMultiplayerPeer() => false;

        public int GetUniqueId() => 1;

        public void EmitPeerConnected(long peerId)
        {
            PeerConnected?.Invoke(peerId);
        }

        public void EmitPeerDisconnected(long peerId)
        {
            PeerDisconnected?.Invoke(peerId);
        }

        public enum RpcMode
        {
            Authority,
            AnyPeer
        }
    }

    public class MultiplayerAPI : MultiplayerApi
    {
    }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class RpcAttribute : Attribute
    {
        public RpcAttribute()
        {
        }

        public MultiplayerApi.RpcMode Mode { get; init; }

        public bool CallLocal { get; init; }
    }

    public static class Engine
    {
        public static object? MainLoop { get; set; }

        public static object? GetMainLoop()
        {
            return MainLoop;
        }
    }
}

namespace HarmonyLib
{
    using System;
    using System.Reflection;

    public sealed class Harmony
    {
        public Harmony(string id)
        {
            Id = id;
        }

        public string Id { get; }

        public void PatchAll(Assembly assembly)
        {
        }

        public void UnpatchAll(string harmonyId)
        {
        }
    }

    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
    public sealed class HarmonyPatch : Attribute
    {
        public HarmonyPatch()
        {
        }
    }

    public static class AccessTools
    {
        public static Type? TypeByName(string name)
        {
            return Type.GetType(name);
        }

        public static MethodInfo? Method(Type? type, string name)
        {
            return type?.GetMethod(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
        }

        public static MethodInfo? Method(Type? type, string name, Type[] parameters)
        {
            return type?.GetMethod(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static, null, parameters, null);
        }

        public static PropertyInfo? Property(Type? type, string name)
        {
            return type?.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
        }

        public static FieldInfo? Field(Type? type, string name)
        {
            return type?.GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
        }
    }
}

namespace MegaCrit.Sts2.Core.Modding
{
    using System;

    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class ModInitializerAttribute : Attribute
    {
        public ModInitializerAttribute(string methodName)
        {
            MethodName = methodName;
        }

        public string MethodName { get; }
    }
}
#endif
