namespace DamageTracker.Data;

using System;
using System.Collections.Generic;

public class DamageTrackerManager
{
    private static DamageTrackerManager? _instance;
    
    public static DamageTrackerManager Instance
    {
        get { return _instance ??= new DamageTrackerManager(); }
    }

    private Dictionary<int, PlayerDamageTracker> _playerTrackers = new();

    public void RegisterPlayer(int playerId)
    {
        if (!_playerTrackers.ContainsKey(playerId))
        {
            _playerTrackers[playerId] = new PlayerDamageTracker();
        }
    }

    public void UnregisterPlayer(int playerId)
    {
        _playerTrackers.Remove(playerId);
    }

    public PlayerDamageTracker GetTracker(int playerId)
    {
        if (!_playerTrackers.ContainsKey(playerId))
        {
            RegisterPlayer(playerId);
        }
        return _playerTrackers[playerId];
    }

    public Dictionary<int, PlayerDamageTracker> GetAllTrackers()
    {
        return _playerTrackers;
    }

    public void ResetAll()
    {
        foreach (var tracker in _playerTrackers.Values)
        {
            tracker.ResetAll();
        }
    }

    public void RecordDamage(int playerId, int amount, bool isDealt, string source, string target)
    {
        if (amount <= 0)
        {
            return;
        }

        PlayerDamageTracker tracker = GetTracker(playerId);

        tracker.Events.Add(new DamageEvent
        {
            Source = string.IsNullOrWhiteSpace(source) ? "Unknown" : source,
            Target = string.IsNullOrWhiteSpace(target) ? "Unknown" : target,
            Amount = amount,
            IsDealt = isDealt,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        });

        if (isDealt)
        {
            tracker.TotalDealt += amount;
        }
        else
        {
            tracker.TotalTaken += amount;
        }

        string sourceKey = string.IsNullOrWhiteSpace(source) ? "Unknown" : source;
        if (!tracker.DamageBySource.TryAdd(sourceKey, amount))
        {
            tracker.DamageBySource[sourceKey] += amount;
        }
    }
}
