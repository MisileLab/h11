using System;
using System.Collections.Generic;

namespace DamageTracker.Core;

public enum SourceType
{
    Card,
    Dot,
    Burn,
    EnemyAttack,
    Passive
}

public class DamageEvent
{
    public int Turn { get; set; }
    public SourceType SourceType { get; set; }
    public string SourceName { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string TargetName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal BlockedDamage { get; set; }
    public long Timestamp { get; set; }
    public string PlayerId { get; set; } = string.Empty;
}

public class SessionStats
{
    public Dictionary<int, decimal> DamageByTurn { get; } = new();
    public Dictionary<string, decimal> DamageBySource { get; } = new();
    public Dictionary<string, decimal> TakenBySource { get; } = new();
    public Dictionary<string, decimal> DamageByTarget { get; } = new();
    
    // Time in ms -> DPS value
    public Dictionary<long, decimal> DpsTimeline { get; } = new();
    public Dictionary<string, SessionStats> ByPlayer { get; } = new();
    
    // Helper fields for DPS tracking
    public List<DamageEvent> EventBuffer { get; } = new();
}
