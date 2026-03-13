#if !DAMAGE_TRACKER_STUBS

namespace Godot;

using System.Collections.Generic;

public static partial class Engine
{
    public static MainLoop? GetMainLoop() => null;
}

public abstract class MainLoop { }

public partial class SceneTree : MainLoop
{
    public Window Root => new();
    public MultiplayerApi Multiplayer => new();
}

public partial class MultiplayerApi
{
    public int GetUniqueId() => 1;
    public bool HasMultiplayerPeer() => false;
    public Godot.Collections.Array<int> GetPeers() => new();
}

namespace Godot.Collections
{
    public class Array<T> : System.Collections.Generic.List<T>
    {
        public Array() { }
        public Array(System.Collections.Generic.IEnumerable<T> collection) : base(collection) { }
    }

    public class Dictionary<TKey, TValue> : System.Collections.Generic.Dictionary<TKey, TValue>
    {
        public Dictionary() { }
        public Dictionary(System.Collections.Generic.IDictionary<TKey, TValue> dictionary) : base(dictionary) { }
    }
}

#endif
