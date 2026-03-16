using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Attributes;

namespace DamageTracker.Core;

public class SessionStatsDto
{
    [BsonElement("schema_version")]
    public int SchemaVersion { get; set; } = 1;

    [BsonElement("timestamp")]
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    [BsonElement("damage_by_turn")]
    public Dictionary<string, decimal> DamageByTurn { get; set; } = new();

    [BsonElement("damage_by_source")]
    public Dictionary<string, decimal> DamageBySource { get; set; } = new();

    [BsonElement("taken_by_source")]
    public Dictionary<string, decimal> TakenBySource { get; set; } = new();

    [BsonElement("damage_by_target")]
    public Dictionary<string, decimal> DamageByTarget { get; set; } = new();

    [BsonElement("dps_timeline")]
    public Dictionary<string, decimal> DpsTimeline { get; set; } = new();

    [BsonElement("by_player")]
    public Dictionary<string, SessionStatsDto> ByPlayer { get; set; } = new();
}

public static class SessionStorage
{
    private static readonly string RunsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "SlayTheSpire2", "mods", "DamageTracker", "runs");

    public static async Task SaveAsync(SessionStats stats)
    {
        try
        {
            if (!Directory.Exists(RunsPath))
            {
                Directory.CreateDirectory(RunsPath);
            }

            var dto = MapToDto(stats);
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var filePath = Path.Combine(RunsPath, $"run_{timestamp}.bson");

            // Non-blocking write
            var bytes = dto.ToBson();
            await File.WriteAllBytesAsync(filePath, bytes);
            Console.WriteLine($"[DamageTracker] Session saved: {filePath}");
        }
        catch (Exception ex)
        {
            // Logging without throwing (per spec: 저장 실패 시 인게임 경고 표시, 재시도 없음)
            Console.WriteLine($"[DamageTracker] Failed to save session: {ex.Message}");
            // Need a way to show in-game warning... usually via some UI component
        }
    }

    private static SessionStatsDto MapToDto(SessionStats stats)
    {
        var dto = new SessionStatsDto();

        foreach (var kvp in stats.DamageByTurn)
            dto.DamageByTurn[kvp.Key.ToString()] = kvp.Value;

        foreach (var kvp in stats.DamageBySource)
            dto.DamageBySource[kvp.Key] = kvp.Value;

        foreach (var kvp in stats.TakenBySource)
            dto.TakenBySource[kvp.Key] = kvp.Value;

        foreach (var kvp in stats.DamageByTarget)
            dto.DamageByTarget[kvp.Key] = kvp.Value;

        foreach (var kvp in stats.DpsTimeline)
            dto.DpsTimeline[kvp.Key.ToString()] = kvp.Value;

        foreach (var kvp in stats.ByPlayer)
            dto.ByPlayer[kvp.Key] = MapToDto(kvp.Value);

        return dto;
    }
}
