namespace DamageTracker.Hooks;

using System;
using System.Reflection;
using HarmonyLib;
using DamageTracker.Data;

/// <summary>
/// Harmony hooks for intercepting damage events in the game.
/// </summary>
public static class DamageHooks
{
    private static Harmony? _harmony;
    private const string HarmonyId = "com.damagetracker.mod";

    /// <summary>
    /// Initialize and apply all Harmony patches.
    /// </summary>
    public static void Initialize()
    {
        if (_harmony != null)
        {
            Console.WriteLine("[DamageTracker] Hooks already initialized");
            return;
        }

        _harmony = new Harmony(HarmonyId);
        _harmony.PatchAll(Assembly.GetExecutingAssembly());
        Console.WriteLine("[DamageTracker] Harmony hooks applied");
    }

    /// <summary>
    /// Cleanup and unapply all patches.
    /// </summary>
    public static void Cleanup()
    {
        _harmony?.UnpatchSelf();
        _harmony = null;
        Console.WriteLine("[DamageTracker] Harmony hooks removed");
    }

    /// <summary>
    /// Records a damage event for the specified player.
    /// </summary>
    public static void RecordDamage(int playerId, int damageDealt, int damageTaken, string source)
    {
        var tracker = DamageTrackerManager.Instance.GetTracker(playerId);
        
        if (damageDealt > 0)
        {
            tracker.TotalDealt += damageDealt;
            tracker.Events.Add(new DamageEvent
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                Amount = damageDealt,
                IsDealt = true,
                Source = source
            });
        }
        
        if (damageTaken > 0)
        {
            tracker.TotalTaken += damageTaken;
            tracker.Events.Add(new DamageEvent
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                Amount = damageTaken,
                IsDealt = false,
                Source = source
            });
        }

        if (!tracker.DamageBySource.ContainsKey(source))
        {
            tracker.DamageBySource[source] = 0;
        }
        tracker.DamageBySource[source] += damageDealt + damageTaken;
    }
}

// ============================================================================
// EXAMPLE PATCHES - Uncomment and modify to match actual game API
// ============================================================================

/*
// Patch for when entity takes damage
[HarmonyPatch]
public static class EntityTakeDamagePatch
{
    // Replace "GameEntity" and "TakeDamage" with actual game types/methods
    static MethodBase TargetMethod()
    {
        // Example: Find the TakeDamage method on the entity class
        var entityType = AccessTools.TypeByName("Game.Entity");
        return AccessTools.Method(entityType, "TakeDamage");
    }

    static void Postfix(object __instance, int damage, object source)
    {
        // Extract player ID from entity
        int playerId = GetPlayerId(__instance);
        string sourceName = source?.ToString() ?? "Unknown";
        
        DamageHooks.RecordDamage(playerId, 0, damage, sourceName);
    }
}

// Patch for when entity deals damage
[HarmonyPatch]
public static class EntityDealDamagePatch
{
    static MethodBase TargetMethod()
    {
        var entityType = AccessTools.TypeByName("Game.Entity");
        return AccessTools.Method(entityType, "DealDamage");
    }

    static void Postfix(object __instance, int damage, object target)
    {
        int playerId = GetPlayerId(__instance);
        string targetName = target?.ToString() ?? "Unknown";
        
        DamageHooks.RecordDamage(playerId, damage, 0, targetName);
    }
}
*/
