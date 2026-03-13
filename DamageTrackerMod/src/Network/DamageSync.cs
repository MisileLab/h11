namespace DamageTracker.Network;

using System;
using System.Collections.Generic;
using System.Text.Json;
using DamageTracker.Data;
using Godot;

/// <summary>
/// Synchronizes per-player damage totals across multiplayer peers.
/// </summary>
public partial class DamageSync : Node
{
    public override void _Ready()
    {
        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;
    }

    public override void _ExitTree()
    {
        Multiplayer.PeerConnected -= OnPeerConnected;
        Multiplayer.PeerDisconnected -= OnPeerDisconnected;
    }

    public void BroadcastSnapshot(int playerId)
    {
        if (!Multiplayer.HasMultiplayerPeer())
        {
            return;
        }

        PlayerDamageTracker tracker = DamageTrackerManager.Instance.GetTracker(playerId);
        string payload = JsonSerializer.Serialize(tracker.DamageBySource);

        Rpc(nameof(ReceiveDamageSnapshot), playerId, tracker.TotalDealt, tracker.TotalTaken, payload);
    }

    [Rpc]
    public void ReceiveDamageSnapshot(int playerId, int totalDealt, int totalTaken, string serializedSources)
    {
        PlayerDamageTracker tracker = DamageTrackerManager.Instance.GetTracker(playerId);
        tracker.TotalDealt = totalDealt;
        tracker.TotalTaken = totalTaken;

        tracker.DamageBySource.Clear();
        if (!string.IsNullOrWhiteSpace(serializedSources))
        {
            Dictionary<string, int>? sources = JsonSerializer.Deserialize<Dictionary<string, int>>(serializedSources);
            if (sources != null)
            {
                foreach ((string key, int value) in sources)
                {
                    tracker.DamageBySource[key] = value;
                }
            }
        }
    }

    private void OnPeerConnected(long peerId)
    {
        SyncAllTrackedPlayersToPeer(peerId);
    }

    private void OnPeerDisconnected(long peerId)
    {
        int disconnectedPlayerId = (int)peerId;
        if (disconnectedPlayerId != ModEntry.ResolveLocalPlayerId())
        {
            DamageTrackerManager.Instance.UnregisterPlayer(disconnectedPlayerId);
        }
    }

    private void SyncAllTrackedPlayersToPeer(long peerId)
    {
        if (!Multiplayer.HasMultiplayerPeer())
        {
            return;
        }

        foreach ((int playerId, PlayerDamageTracker tracker) in DamageTrackerManager.Instance.GetAllTrackers())
        {
            string payload = JsonSerializer.Serialize(tracker.DamageBySource);
            RpcId(peerId, nameof(ReceiveDamageSnapshot), playerId, tracker.TotalDealt, tracker.TotalTaken, payload);
        }
    }
}
