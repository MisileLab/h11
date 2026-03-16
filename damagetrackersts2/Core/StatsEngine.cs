using System;
using System.Collections.Generic;
using System.Linq;

namespace DamageTracker.Core;

public class StatsEngine
{
    public SessionStats GlobalStats { get; private set; } = new();
    private long _lastDpsUpdate = 0;

    public void AddEvent(DamageEvent ev)
    {
        ProcessEvent(GlobalStats, ev);

        if (!string.IsNullOrEmpty(ev.PlayerId))
        {
            if (!GlobalStats.ByPlayer.TryGetValue(ev.PlayerId, out var playerStats))
            {
                playerStats = new SessionStats();
                GlobalStats.ByPlayer[ev.PlayerId] = playerStats;
            }
            ProcessEvent(playerStats, ev);
        }
    }

    private void ProcessEvent(SessionStats stats, DamageEvent ev)
    {
        // Add to buffer for DPS calculation
        stats.EventBuffer.Add(ev);

        if (ev.SourceType == SourceType.EnemyAttack || ev.TargetId == "local_player") // Placeholder for taken dmg logic
        {
            AddDict(stats.TakenBySource, ev.SourceName, ev.Amount);
        }
        else
        {
            AddDict(stats.DamageByTurn, ev.Turn, ev.Amount);
            AddDict(stats.DamageBySource, ev.SourceName, ev.Amount);
            AddDict(stats.DamageByTarget, ev.TargetName, ev.Amount);
        }
    }

    private void AddDict<T>(Dictionary<T, decimal> dict, T key, decimal amount) where T : notnull
    {
        if (!dict.TryGetValue(key, out var current))
            dict[key] = amount;
        else
            dict[key] = current + amount;
    }

    public void Update(long currentTimeMs)
    {
        if (currentTimeMs - _lastDpsUpdate >= 500)
        {
            _lastDpsUpdate = currentTimeMs;
            UpdateDps(GlobalStats, currentTimeMs);
            foreach (var pStats in GlobalStats.ByPlayer.Values)
            {
                UpdateDps(pStats, currentTimeMs);
            }
        }
    }

    private void UpdateDps(SessionStats stats, long currentTimeMs)
    {
        long cutoff = currentTimeMs - 5000;
        
        // Remove old events from buffer to keep memory low
        stats.EventBuffer.RemoveAll(e => e.Timestamp < cutoff);

        // Sum damage in [t-5s, t]
        decimal sum = 0;
        foreach (var ev in stats.EventBuffer)
        {
            if (ev.SourceType != SourceType.EnemyAttack) // Assuming DPS is only for 'Dealt' damage
            {
                sum += ev.Amount;
            }
        }

        decimal dps = sum / 5m;
        stats.DpsTimeline[currentTimeMs] = dps;
    }

    public void Reset()
    {
        GlobalStats = new SessionStats();
        _lastDpsUpdate = 0;
    }
}
