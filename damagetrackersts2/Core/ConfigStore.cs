using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DamageTracker.Core;

public class AppConfig
{
    [JsonPropertyName("toggle_key")]
    public string ToggleKey { get; set; } = "F9";

    [JsonPropertyName("panel_position")]
    public float[] PanelPosition { get; set; } = new float[] { 100f, 100f };

    [JsonPropertyName("default_mode")]
    public string DefaultMode { get; set; } = "Dealt";

    [JsonPropertyName("layer_preference")]
    public string LayerPreference { get; set; } = "auto";
}

public static class ConfigStore
{
    private static readonly string ConfigPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "SlayTheSpire2", "mods", "DamageTracker", "config.json");

    public static AppConfig Instance { get; private set; } = new AppConfig();

    public static void Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                Instance = JsonSerializer.Deserialize<AppConfig>(json) ?? new AppConfig();
                Validate(Instance);
            }
            else
            {
                Save(); // Save default if doesn't exist
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DamageTracker] Failed to load config: {ex.Message}");
            Instance = new AppConfig();
        }
    }

    public static void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(ConfigPath);
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir!);
            }
            var json = JsonSerializer.Serialize(Instance, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(ConfigPath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DamageTracker] Failed to save config: {ex.Message}");
        }
    }

    private static void Validate(AppConfig config)
    {
        if (config.DefaultMode != "Dealt" && config.DefaultMode != "Taken")
            config.DefaultMode = "Dealt";
            
        if (config.LayerPreference != "auto" && config.LayerPreference != "128" && config.LayerPreference != "1025")
            config.LayerPreference = "auto";
            
        if (config.PanelPosition == null || config.PanelPosition.Length != 2)
            config.PanelPosition = new float[] { 100f, 100f };
    }
}
