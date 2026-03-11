namespace DamageTracker;

using System;
using DamageTracker.Data;

public class ModEntry
{
    private static string _currentRunId = "";
    private static long _runStartTime;

    public static void Initialize()
    {
        StartNewRun();
        Console.WriteLine("[DamageTracker] Mod initialized and run started");
    }

    public static void StartNewRun()
    {
        _currentRunId = GenerateRunId();
        _runStartTime = GetCurrentTimestamp();
        
        DamageTrackerManager.Instance.RegisterPlayer(1);
        DamageTrackerManager.Instance.ResetAll();
        
        Console.WriteLine($"[DamageTracker] Run started with ID: {_currentRunId}");
    }

    public static void EndCurrentRun()
    {
        if (string.IsNullOrEmpty(_currentRunId))
            return;

        long endTime = GetCurrentTimestamp();
        DamagePersistence.SaveRun(_currentRunId, _runStartTime, endTime);
        Console.WriteLine($"[DamageTracker] Run ended and saved: {_currentRunId}");
    }

    private static string GenerateRunId()
    {
        return DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
    }

    private static long GetCurrentTimestamp()
    {
        return (long)DateTime.UtcNow.Subtract(DateTime.UnixEpoch).TotalSeconds;
    }
}
