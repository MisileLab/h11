namespace DamageTracker.UI;

using DamageTracker.Data;
using Godot;

/// <summary>
/// Renders the non-blocking top-right damage summary overlay.
/// </summary>
public partial class DamageOverlay : Control
{
    private readonly Label _titleLabel = new();
    private readonly Label _dealtLabel = new();
    private readonly Label _takenLabel = new();
    private int _lastPlayerId = -1;
    private int _lastTotalDealt = -1;
    private int _lastTotalTaken = -1;

    public override void _Ready()
    {
        Name = "DamageOverlay";
        MouseFilter = MouseFilterEnum.Ignore;
        SetAnchorsPreset(LayoutPreset.TopRight);
        OffsetLeft = -260f;
        OffsetTop = 20f;
        OffsetRight = -20f;
        OffsetBottom = 140f;

        PanelContainer panel = new()
        {
            MouseFilter = MouseFilterEnum.Ignore,
            ThemeOverrideStylesPanel = new StyleBoxFlat
            {
                BgColor = new Color(0f, 0f, 0f, 0.55f),
                CornerRadiusAll = 8,
                ContentMargin = new Vector4I(14, 10, 14, 10)
            }
        };

        VBoxContainer content = new()
        {
            MouseFilter = MouseFilterEnum.Ignore,
            Separation = 4
        };

        _titleLabel.Text = "Damage Tracker";
        _dealtLabel.Text = "Dealt: 0";
        _takenLabel.Text = "Taken: 0";

        content.AddChild(_titleLabel);
        content.AddChild(_dealtLabel);
        content.AddChild(_takenLabel);
        panel.AddChild(content);
        AddChild(panel);

        RefreshLabels(force: true);
    }

    public override void _Process(double delta)
    {
        if (!Visible)
        {
            return;
        }

        RefreshLabels(force: false);
    }

    public void ToggleVisibility()
    {
        Visible = !Visible;
        if (Visible)
        {
            RefreshLabels(force: true);
        }
    }

    public void Refresh()
    {
        RefreshLabels(force: true);
    }

    private void RefreshLabels(bool force)
    {
        int playerId = ModEntry.ResolveLocalPlayerId();
        PlayerDamageTracker tracker = DamageTrackerManager.Instance.GetTracker(playerId);

        if (!force && playerId == _lastPlayerId && tracker.TotalDealt == _lastTotalDealt && tracker.TotalTaken == _lastTotalTaken)
        {
            return;
        }

        _lastPlayerId = playerId;
        _lastTotalDealt = tracker.TotalDealt;
        _lastTotalTaken = tracker.TotalTaken;

        _dealtLabel.Text = $"Dealt: {tracker.TotalDealt}";
        _takenLabel.Text = $"Taken: {tracker.TotalTaken}";
    }
}
