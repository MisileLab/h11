using System;
using System.Collections.Generic;
using System.Linq;
using Godot;
using DamageTracker.Core;

namespace DamageTracker.UI;

public partial class OverlayUI : CanvasLayer
{
    private readonly StatsEngine _engine;
    private VBoxContainer _container = null!;
    private HBoxContainer _header = null!;
    private Label _toggleLabel = null!;
    private bool _isDealtMode = true;

    private Dictionary<string, Color> _paletteCache = new();

    public OverlayUI(StatsEngine engine)
    {
        _engine = engine;
    }

    public override void _Ready()
    {
        Layer = ConfigStore.Instance.LayerPreference == "1025" ? 1025 : 128;
        
        _isDealtMode = ConfigStore.Instance.DefaultMode == "Dealt";

        var root = new Control
        {
            GlobalPosition = new Vector2(ConfigStore.Instance.PanelPosition[0], ConfigStore.Instance.PanelPosition[1])
        };
        AddChild(root);

        _container = new VBoxContainer();
        root.AddChild(_container);

        _header = new HBoxContainer();
        _container.AddChild(_header);

        _toggleLabel = new Label { Text = _isDealtMode ? "Mode: Dealt" : "Mode: Taken" };
        _header.AddChild(_toggleLabel);
    }

    public override void _Process(double delta)
    {
        if (!_container.Visible) return;

        UpdateSegments();
    }

    private void UpdateSegments()
    {
        foreach (var child in _container.GetChildren().Skip(1))
        {
            child.QueueFree();
        }

        var stats = _engine.GlobalStats;
        if (stats == null) return;

        var sourceDict = _isDealtMode ? stats.DamageBySource : stats.TakenBySource;
        if (sourceDict.Count == 0) return;

        var total = sourceDict.Values.Sum();

        foreach (var kvp in sourceDict.OrderByDescending(x => x.Value))
        {
            var row = new HBoxContainer();
            _container.AddChild(row);

            var label = new Label { Text = $"{kvp.Key}: {kvp.Value}" };
            row.AddChild(label);

            var segment = new ColorRect
            {
                Color = GetColorForSource(kvp.Key, SourceType.Card),
                CustomMinimumSize = new Vector2(100f * (float)(kvp.Value / total), 20f)
            };
            row.AddChild(segment);
        }
    }

    private Color GetColorForSource(string sourceName, SourceType type)
    {
        if (_paletteCache.TryGetValue(sourceName, out var color))
            return color;

        string[] palette = type switch
        {
            SourceType.Card => new[] { "#d85a30", "#e6a817" },
            SourceType.Dot => new[] { "#639922" },
            SourceType.EnemyAttack => new[] { "#F09595" },
            _ => new[] { "#9FE1CB", "#7F77DD" }
        };

        var hash = Math.Abs(sourceName.GetHashCode());
        var colorStr = palette[hash % palette.Length];
        
        var parsed = new Color(colorStr);
        _paletteCache[sourceName] = parsed;
        return parsed;
    }

    public void ToggleMode()
    {
        _isDealtMode = !_isDealtMode;
        _toggleLabel.Text = _isDealtMode ? "Mode: Dealt" : "Mode: Taken";
    }
}

public static class NodeExtensions
{
    public static IEnumerable<Node> GetChildren(this Node node) => Array.Empty<Node>();
}
