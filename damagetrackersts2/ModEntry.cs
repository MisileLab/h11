using Godot;
using MegaCrit.Sts2.Core.Modding;

namespace DamageTracker;

[ModInitializer(nameof(Initialize))]
public static class ModEntry
{
    private static Plugin? _plugin;

    private static void Initialize()
    {
        if (_plugin != null)
        {
            return;
        }

        if (Engine.GetMainLoop() is not SceneTree tree)
        {
            GD.PrintErr("[DamageTracker] Failed to initialize: SceneTree was not available.");
            return;
        }

        _plugin = new Plugin();
        tree.Root.CallDeferred(Node.MethodName.AddChild, _plugin);
        GD.Print("[DamageTracker] Mod initializer scheduled plugin node attach.");
    }
}
