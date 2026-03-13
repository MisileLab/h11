namespace DamageTracker.Data;

using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;

public class DamagePersistence
{
    private const string BasePath = "user://mods/DamageTracker/runs/";

    public static void SaveRun(string runId, long startTime, long endTime)
    {
        try
        {
            string basePath = ResolveBasePath();
            EnsureDirectoryExists(basePath);

            var data = new Dictionary<string, object>
            {
                ["runId"] = runId,
                ["startTime"] = startTime,
                ["endTime"] = endTime,
                ["players"] = SerializeTrackers()
            };

            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
            
            var fileName = $"{runId}.json";
            var filePath = Path.Combine(basePath, fileName);
            var tmpPath = filePath + ".tmp";

            File.WriteAllText(tmpPath, json);
            
            if (File.Exists(filePath))
                File.Delete(filePath);
            File.Move(tmpPath, filePath);

            Console.WriteLine($"[DamageTracker] Run saved: {runId}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DamageTracker] Error saving run: {ex.Message}");
        }
    }

    private static Dictionary<string, object> SerializeTrackers()
    {
        var result = new Dictionary<string, object>();
        var trackers = DamageTrackerManager.Instance.GetAllTrackers();

        foreach (var kvp in trackers)
        {
            var tracker = kvp.Value;
            result[kvp.Key.ToString()] = new
            {
                totalDealt = tracker.TotalDealt,
                totalTaken = tracker.TotalTaken,
                events = tracker.Events
            };
        }

        return result;
    }

    private static void EnsureDirectoryExists(string path)
    {
        if (!Directory.Exists(path))
        {
            Directory.CreateDirectory(path);
        }
    }

    private static string ResolveBasePath()
    {
        Type? projectSettingsType = Type.GetType("Godot.ProjectSettings, GodotSharp");
        MethodInfo? globalizePath = projectSettingsType?.GetMethod("GlobalizePath", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string) }, null);
        if (globalizePath?.Invoke(null, new object[] { BasePath }) is string resolvedPath && !string.IsNullOrWhiteSpace(resolvedPath))
        {
            return resolvedPath;
        }

        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DamageTracker", "runs");
    }
}
