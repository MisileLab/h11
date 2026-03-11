namespace DamageTracker.Data;

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
}
