using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Godot;
using HarmonyLib;
using MegaCrit.Sts2.Core.Commands;
using MegaCrit.Sts2.Core.Entities.Creatures;
using MegaCrit.Sts2.Core.GameActions.Multiplayer;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.ValueProps;

namespace DamageTracker.Core;

[HarmonyPatch(
    typeof(CreatureCmd),
    nameof(CreatureCmd.Damage),
    new[]
    {
        typeof(PlayerChoiceContext),
        typeof(IEnumerable<Creature>),
        typeof(decimal),
        typeof(ValueProp),
        typeof(Creature),
        typeof(CardModel)
    })]
public static class EventCollectorPatch
{
    public static Action<DamageEvent>? OnDamageEvent;

    public static void Postfix(
        ref Task<IEnumerable<DamageResult>> __result,
        PlayerChoiceContext ctx,
        IEnumerable<Creature> targets,
        decimal amount,
        ValueProp props,
        Creature? dealer,
        CardModel? cardSource)
    {
        __result = CaptureDamageResultsAsync(__result, amount, props, dealer, cardSource);
    }

    private static async Task<IEnumerable<DamageResult>> CaptureDamageResultsAsync(
        Task<IEnumerable<DamageResult>> pendingResults,
        decimal amount,
        ValueProp props,
        Creature? dealer,
        CardModel? cardSource)
    {
        var results = await pendingResults;

        if (amount <= 0)
        {
            return results;
        }

        var resolvedResults = results?.ToArray();
        if (resolvedResults == null || resolvedResults.Length == 0)
        {
            return Array.Empty<DamageResult>();
        }

        var sourceType = DetermineSourceType(cardSource, props, dealer);
        var sourceName = DetermineSourceName(sourceType, cardSource, dealer);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var playerId = dealer?.Player?.NetId.ToString() ?? string.Empty;

        foreach (var result in resolvedResults)
        {
            if (result.UnblockedDamage <= 0 && result.BlockedDamage <= 0)
            {
                continue;
            }

            var target = result.Receiver;
            var ev = new DamageEvent
            {
                Turn = 0,
                SourceType = sourceType,
                SourceName = sourceName,
                TargetId = target.Player?.NetId.ToString() ?? target.ToString() ?? "unknown",
                TargetName = target.Name.ToString(),
                Amount = result.UnblockedDamage,
                BlockedDamage = result.BlockedDamage,
                Timestamp = timestamp,
                PlayerId = playerId
            };

            OnDamageEvent?.Invoke(ev);
        }

        return resolvedResults;
    }

    private static SourceType DetermineSourceType(CardModel? card, ValueProp props, Creature? dealer)
    {
        if (card != null) return SourceType.Card;
        if (props.HasFlag(ValueProp.Unblockable) || props.HasFlag(ValueProp.Unpowered)) return SourceType.Dot;
        if (dealer?.IsMonster == true) return SourceType.EnemyAttack;
        return SourceType.Passive;
    }

    private static string DetermineSourceName(SourceType type, CardModel? card, Creature? dealer)
    {
        if (type == SourceType.Card && card != null)
            return card.ToString() ?? "Card";
        if (type == SourceType.Dot)
            return "Poison"; 
        if (type == SourceType.EnemyAttack && dealer != null)
            return dealer.Name.ToString();
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
        GD.Print("[DamageTracker] Harmony patches installed.");
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
