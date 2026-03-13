namespace DamageTracker.Hooks;

using System;
using System.Linq;
using System.Reflection;
using HarmonyLib;

public static class BuildingHooks
{
    private static readonly string[] BuildingTypes =
    {
        "STS2.Gameplay.Building",
        "Shapez2.Gameplay.Buildings.Building",
        "Game.Building"
    };

    private static readonly string[] DeliveryTypes =
    {
        "STS2.Gameplay.ShapeDeliverySystem",
        "Shapez2.Gameplay.Delivery.ShapeDeliveryManager",
        "Game.ShapeDeliverySystem"
    };

    private static readonly string[] ProgressionTypes =
    {
        "STS2.Gameplay.LevelManager",
        "Shapez2.Gameplay.Progression.LevelManager",
        "Game.LevelManager"
    };

    public static MethodBase? ResolveBuildingDestroyedTarget()
    {
        return ResolveFirstMethod(BuildingTypes, "Destroy", "OnDestroyed", "HandleDestroyed", "ApplyDamage");
    }

    public static MethodBase? ResolveShapeDeliveredTarget()
    {
        return ResolveFirstMethod(DeliveryTypes, "CompleteDelivery", "DeliverShape", "OnShapeDelivered", "ProcessDelivery");
    }

    public static MethodBase? ResolveLevelCompletedTarget()
    {
        return ResolveFirstMethod(ProgressionTypes, "CompleteLevel", "OnLevelCompleted", "AdvanceLevel", "HandleLevelFinished");
    }

    private static MethodBase? ResolveFirstMethod(string[] typeNames, params string[] methodNames)
    {
        foreach (string typeName in typeNames)
        {
            Type? type = AccessTools.TypeByName(typeName);
            if (type == null)
            {
                continue;
            }

            foreach (string methodName in methodNames)
            {
                MethodInfo? method = AccessTools.Method(type, methodName);
                if (method != null)
                {
                    return method;
                }
            }
        }

        return null;
    }

    private static int ResolvePlayerId(object? instance, object[] args)
    {
        int? fromInstance = ReadInt(instance, "PlayerId", "OwnerPlayerId", "OwnerId", "InstigatorPlayerId");
        if (fromInstance.HasValue)
        {
            return fromInstance.Value;
        }

        foreach (object arg in args.Where(static arg => arg != null))
        {
            int? fromArg = ReadInt(arg, "PlayerId", "OwnerPlayerId", "OwnerId", "InstigatorPlayerId", "PeerId");
            if (fromArg.HasValue)
            {
                return fromArg.Value;
            }
        }

        return ModEntry.ResolveLocalPlayerId();
    }

    private static int ResolveOwnerPlayerId(object? instance)
    {
        return ReadInt(instance, "OwnerPlayerId", "OwnerId", "PlayerId") ?? ModEntry.ResolveLocalPlayerId();
    }

    private static int ResolveInstigatorPlayerId(object? instance, object[] args)
    {
        int? fromArgs = ReadIntFromArguments(args, "InstigatorPlayerId", "AttackerPlayerId", "PlayerId", "PeerId");
        if (fromArgs.HasValue)
        {
            return fromArgs.Value;
        }

        return ResolvePlayerId(instance, args);
    }

    private static int ResolveAmount(object? instance, object[] args)
    {
        int? amount = ReadIntFromArguments(args, "Damage", "DamageAmount", "Amount", "Count", "Health", "Value");
        if (amount.HasValue && amount.Value > 0)
        {
            return amount.Value;
        }

        int? fromInstance = ReadInt(instance, "Damage", "DamageAmount", "LastDamageAmount", "Health", "RewardValue");
        if (fromInstance.HasValue && fromInstance.Value > 0)
        {
            return fromInstance.Value;
        }

        return 1;
    }

    private static string ResolveName(object? source, string fallback, params string[] members)
    {
        foreach (string member in members)
        {
            string? value = ReadString(source, member);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return fallback;
    }

    private static int? ReadIntFromArguments(object[] args, params string[] members)
    {
        foreach (object arg in args.Where(static arg => arg != null))
        {
            int? value = ReadInt(arg, members);
            if (value.HasValue)
            {
                return value;
            }
        }

        return null;
    }

    private static int? ReadInt(object? instance, params string[] members)
    {
        if (instance == null)
        {
            return null;
        }

        Type type = instance.GetType();
        foreach (string member in members)
        {
            PropertyInfo? property = AccessTools.Property(type, member);
            if (property?.GetValue(instance) is int propertyValue)
            {
                return propertyValue;
            }

            if (property?.GetValue(instance) is long longValue)
            {
                return (int)longValue;
            }

            FieldInfo? field = AccessTools.Field(type, member);
            if (field?.GetValue(instance) is int fieldValue)
            {
                return fieldValue;
            }

            if (field?.GetValue(instance) is long fieldLongValue)
            {
                return (int)fieldLongValue;
            }
        }

        return null;
    }

    private static string? ReadString(object? instance, params string[] members)
    {
        if (instance == null)
        {
            return null;
        }

        Type type = instance.GetType();
        foreach (string member in members)
        {
            PropertyInfo? property = AccessTools.Property(type, member);
            if (property?.GetValue(instance) is string propertyValue && !string.IsNullOrWhiteSpace(propertyValue))
            {
                return propertyValue;
            }

            FieldInfo? field = AccessTools.Field(type, member);
            if (field?.GetValue(instance) is string fieldValue && !string.IsNullOrWhiteSpace(fieldValue))
            {
                return fieldValue;
            }
        }

        return null;
    }

    [HarmonyPatch]
    private static class BuildingDestroyedPatch
    {
        public static MethodBase? TargetMethod()
        {
            return ResolveBuildingDestroyedTarget();
        }

        public static void Postfix(object __instance, object[] __args)
        {
            int ownerPlayerId = ResolveOwnerPlayerId(__instance);
            int instigatorPlayerId = ResolveInstigatorPlayerId(__instance, __args);
            int amount = ResolveAmount(__instance, __args);
            string source = ResolveName(__instance, "Building", "DisplayName", "Name", "BuildingName", "TypeName");
            string target = ResolveName(__args.FirstOrDefault(), "DestroyedBuilding", "DisplayName", "Name", "TargetName");

            ModEntry.RecordDamage(instigatorPlayerId, amount, true, source, target);

            if (ownerPlayerId != instigatorPlayerId)
            {
                ModEntry.RecordDamage(ownerPlayerId, amount, false, source, target);
            }
        }
    }

    [HarmonyPatch]
    private static class ShapeDeliveredPatch
    {
        public static MethodBase? TargetMethod()
        {
            return ResolveShapeDeliveredTarget();
        }

        public static void Postfix(object __instance, object[] __args)
        {
            int playerId = ResolvePlayerId(__instance, __args);
            int amount = ResolveAmount(__instance, __args);
            string source = ResolveName(__instance, "ShapeDelivery", "DisplayName", "Name", "ShapeId");
            string target = ResolveName(__args.FirstOrDefault(), "Hub", "DisplayName", "Name", "ReceiverName");

            ModEntry.RecordDamage(playerId, amount, true, source, target);
        }
    }

    [HarmonyPatch]
    private static class LevelCompletedPatch
    {
        public static MethodBase? TargetMethod()
        {
            return ResolveLevelCompletedTarget();
        }

        public static void Postfix(object __instance, object[] __args)
        {
            string levelName = ResolveName(__instance, "Level", "DisplayName", "Name", "LevelName");
            ModEntry.HandleLevelCompleted(levelName);
        }
    }
}
