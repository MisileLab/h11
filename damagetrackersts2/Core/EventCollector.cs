using System;
using System.Collections.Generic;
using HarmonyLib;
using MegaCrit.Sts2.Core;
using MegaCrit.Sts2.Core.Commands;

namespace DamageTracker.Core;

[HarmonyPatch(typeof(CreatureCmd), "Damage")]
public static class EventCollectorPatch
{
    public static Action<DamageEvent>? OnDamageEvent;

    public static void Postfix(
        PlayerChoiceContext ctx,
        IEnumerable<Creature> targets,
        decimal amount,
        ValueProp prop,
        Creature? dealer,
        CardModel? cardSource,
        IEnumerable<DamageResult> __result)
    {
        if (__result == null) return;

        foreach (var result in __result)
        {
            if (result.UnblockedDamage == 0) continue;

            var sourceType = DetermineSourceType(cardSource, prop, dealer);
            var sourceName = DetermineSourceName(sourceType, cardSource, dealer);

            var ev = new DamageEvent
            {
                Turn = RunState.CurrentTurn,
                SourceType = sourceType,
                SourceName = sourceName,
                TargetId = result.Receiver?.Id ?? "unknown",
                TargetName = result.Receiver?.Name ?? "unknown",
                Amount = result.UnblockedDamage,
                BlockedDamage = result.BlockedDamage,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PlayerId = RunState.LocalPlayerId
            };

            if (dealer != null && dealer is not MonsterModel)
            {
                ev.PlayerId = dealer.Id; 
            }

            OnDamageEvent?.Invoke(ev);
        }
    }

    private static SourceType DetermineSourceType(CardModel? card, ValueProp prop, Creature? dealer)
    {
        if (card != null) return SourceType.Card;
        if (prop.Unblockable || prop.Unpowered) return SourceType.Dot;
        if (dealer is MonsterModel) return SourceType.EnemyAttack;
        return SourceType.Passive;
    }

    private static string DetermineSourceName(SourceType type, CardModel? card, Creature? dealer)
    {
        if (type == SourceType.Card && card != null)
            return card.Name;
        if (type == SourceType.Dot)
            return "Poison"; 
        if (type == SourceType.EnemyAttack && dealer != null)
            return dealer.Name;
        if (type == SourceType.Passive && dealer != null)
            return "Passive / " + dealer.Name;
            
        return "Unknown";
    }
}

public class EventCollector
{
    private Harmony? _harmony;
    private readonly StatsEngine _engine;
    private readonly SyncManager _syncManager;

    public EventCollector(StatsEngine engine, SyncManager syncManager)
    {
        _engine = engine;
        _syncManager = syncManager;
    }

    public void Install()
    {
        _harmony = new Harmony("com.sts2.damagetracker");
        _harmony.PatchAll(typeof(EventCollectorPatch).Assembly);
        
        EventCollectorPatch.OnDamageEvent += HandleEvent;
        Console.WriteLine("[DamageTracker] Harmony patches installed.");
    }

    public void Uninstall()
    {
        _harmony?.UnpatchAll("com.sts2.damagetracker");
        EventCollectorPatch.OnDamageEvent -= HandleEvent;
    }

    private void HandleEvent(DamageEvent ev)
    {
        _engine.AddEvent(ev);
        _syncManager.QueueEvent(ev);
    }
}
