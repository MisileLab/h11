using Godot;
using DamageTracker.Core;
using DamageTracker.UI;

namespace DamageTracker;

public partial class Plugin : Node
{
    private EventCollector _eventCollector = null!;
    private StatsEngine _statsEngine = null!;
    private SyncManager _syncManager = null!;
    private OverlayUI _ui = null!;

    public override void _Ready()
    {
        GD.Print("[DamageTracker] Plugin _Ready start");

        ConfigStore.Load();

        _statsEngine = new StatsEngine();
        _syncManager = new SyncManager(_statsEngine);
        _eventCollector = new EventCollector(_statsEngine, _syncManager);

        _eventCollector.Install();
        GD.Print("[DamageTracker] Event collector installed");

        _ui = new OverlayUI(_statsEngine);
        AddChild(_ui);

        GD.Print("[DamageTracker] Plugin _Ready complete");
    }

    public override void _Process(double delta)
    {
        var currentTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        _statsEngine.Update(currentTimeMs);
        _syncManager.Update(currentTimeMs);

        // Simple input polling for toggle (assuming Input.IsActionJustPressed exists in real Godot)
        if (Godot.Input.IsKeyPressed(Key.F9) && ConfigStore.Instance.ToggleKey == "F9") 
        {
            _ui.ToggleMode(); 
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _eventCollector?.Uninstall();
            _syncManager?.OnRunEnded();
        }
        base.Dispose(disposing);
    }
}
