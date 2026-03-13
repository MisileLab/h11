namespace DamageTracker;

using System;
using DamageTracker.Data;
using DamageTracker.Hooks;
using DamageTracker.Network;
using DamageTracker.UI;
using Godot;
using HarmonyLib;

/// <summary>
/// Owns lifecycle, hooks, UI, and network wiring for the damage tracker mod.
/// </summary>
public partial class ModEntry : Node, ISts2Mod
{
    private const string HarmonyId = "misile.damagetracker";

    private static ModEntry? _instance;
    private static string _currentRunId = "";
    private static long _runStartTime;
    private Harmony? _harmony;
    private CanvasLayer? _overlayLayer;
    private DamageOverlay? _overlay;
    private DamageSync? _damageSync;

    public static ModEntry? Instance => _instance;

    public static void Initialize()
    {
        if (_instance != null)
        {
            return;
        }

        ModEntry entry = new()
        {
            Name = nameof(ModEntry)
        };

        if (Engine.GetMainLoop() is SceneTree tree)
        {
            tree.Root.AddChild(entry);
            entry.OnModLoaded();
            return;
        }

        entry.OnModLoaded();
    }

    public override void _EnterTree()
    {
        OnModLoaded();
    }

    public override void _ExitTree()
    {
        OnModUnloaded();
    }

    public void OnModLoaded()
    {
        if (_instance != null)
        {
            return;
        }

        _instance = this;
        _harmony = new Harmony(HarmonyId);
        _harmony.PatchAll(typeof(BuildingHooks).Assembly);

        StartNewRun();
        EnsureRuntimeNodes();

        Console.WriteLine("[DamageTracker] Mod initialized and runtime nodes registered");
    }

    public void OnModUnloaded()
    {
        if (!ReferenceEquals(_instance, this))
        {
            return;
        }

        EndCurrentRun();
        _harmony?.UnpatchAll(HarmonyId);

        _overlayLayer?.QueueFree();
        _damageSync?.QueueFree();

        _overlayLayer = null;
        _overlay = null;
        _damageSync = null;
        _harmony = null;
        _instance = null;
    }

    public static void StartNewRun()
    {
        _currentRunId = GenerateRunId();
        _runStartTime = GetCurrentTimestamp();

        DamageTrackerManager.Instance.RegisterPlayer(ResolveLocalPlayerId());
        DamageTrackerManager.Instance.ResetAll();

        _instance?._overlay?.Refresh();

        Console.WriteLine($"[DamageTracker] Run started with ID: {_currentRunId}");
    }

    public static void EndCurrentRun()
    {
        if (string.IsNullOrEmpty(_currentRunId))
            return;

        long endTime = GetCurrentTimestamp();
        DamagePersistence.SaveRun(_currentRunId, _runStartTime, endTime);
        Console.WriteLine($"[DamageTracker] Run ended and saved: {_currentRunId}");
    }

    public static void RecordDamage(int playerId, int amount, bool isDealt, string source, string target)
    {
        DamageTrackerManager.Instance.RecordDamage(playerId, amount, isDealt, source, target);
        _instance?._overlay?.Refresh();
        _instance?._damageSync?.BroadcastSnapshot(playerId);
    }

    public static void HandleLevelCompleted(string levelName)
    {
        Console.WriteLine($"[DamageTracker] Level completed: {levelName}");
        EndCurrentRun();
        StartNewRun();
    }

    public static int ResolveLocalPlayerId()
    {
        if (_instance?._damageSync != null)
        {
            return _instance._damageSync.Multiplayer.GetUniqueId();
        }

        return 1;
    }

    public void ToggleOverlay()
    {
        _overlay?.ToggleVisibility();
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is not InputEventKey keyEvent)
        {
            return;
        }

        if (!keyEvent.Pressed || keyEvent.Echo)
        {
            return;
        }

        if (keyEvent.Keycode == Key.F8)
        {
            ToggleOverlay();
        }
    }

    private static string GenerateRunId()
    {
        return DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
    }

    private static long GetCurrentTimestamp()
    {
        return (long)DateTime.UtcNow.Subtract(DateTime.UnixEpoch).TotalSeconds;
    }

    private void EnsureRuntimeNodes()
    {
        SceneTree? tree = GetTree();
        Window? root = tree?.Root;
        if (root == null)
        {
            return;
        }

        _damageSync ??= new DamageSync
        {
            Name = nameof(DamageSync)
        };

        if (_damageSync.GetTree() == null)
        {
            root.AddChild(_damageSync);
        }

        if (_overlayLayer == null)
        {
            _overlayLayer = new CanvasLayer
            {
                Name = "DamageOverlayLayer"
            };

            root.AddChild(_overlayLayer);
        }

        if (_overlay == null)
        {
            _overlay = new DamageOverlay
            {
                Name = nameof(DamageOverlay)
            };

            _overlayLayer.AddChild(_overlay);
            _overlay.Refresh();
        }
    }
}

/// <summary>
/// Defines the lifecycle callbacks expected by the tracker runtime entry point.
/// </summary>
public interface ISts2Mod
{
    void OnModLoaded();

    void OnModUnloaded();
}
