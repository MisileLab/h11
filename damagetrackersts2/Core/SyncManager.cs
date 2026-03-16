using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Godot;
using MegaCrit.Sts2.Core.Multiplayer;

namespace DamageTracker.Core;

public enum PacketType : byte
{
    EventBatch = 1,
    Snapshot = 2,
    FinalFlush = 3
}

public class SyncManager
{
    private readonly StatsEngine _engine;
    private readonly List<DamageEvent> _eventBuffer = new();
    private long _lastBatchTime = 0;
    private long _lastSnapshotTime = 0;

    public SyncManager(StatsEngine engine)
    {
        _engine = engine;
    }

    public void QueueEvent(DamageEvent ev)
    {
        // Spec constraints: 이벤트 버퍼 최대 1000개
        if (_eventBuffer.Count < 1000)
        {
            _eventBuffer.Add(ev);
        }
        else
        {
            FlushBatch(); // Force flush
            _eventBuffer.Add(ev);
        }
    }

    public void Update(long currentTimeMs)
    {
        // Only run sync if we are in multiplayer (Multiplayer isn't null in actual STS2)
        if (NetMessageBus.Multiplayer == null) return;

        bool isHost = NetMessageBus.IsHost;

        // Client: Send batch every 200ms
        if (!isHost && currentTimeMs - _lastBatchTime >= 200)
        {
            _lastBatchTime = currentTimeMs;
            FlushBatch();
        }

        // Host: Broadcast snapshot every 500ms
        if (isHost && currentTimeMs - _lastSnapshotTime >= 500)
        {
            _lastSnapshotTime = currentTimeMs;
            BroadcastSnapshot();
        }
    }

    private void FlushBatch()
    {
        if (_eventBuffer.Count == 0) return;

        var json = JsonSerializer.Serialize(_eventBuffer);
        var payload = System.Text.Encoding.UTF8.GetBytes(json);
        
        var packet = new byte[payload.Length + 1];
        packet[0] = (byte)PacketType.EventBatch;
        Array.Copy(payload, 0, packet, 1, payload.Length);

        // Client to Host (mode 0 is generic send, often peer=1 for host in Godot 3/4)
        MultiplayerApi.SendBytes(packet, 1, 0); 

        _eventBuffer.Clear();
    }

    private void BroadcastSnapshot()
    {
        var json = JsonSerializer.Serialize(_engine.GlobalStats);
        var payload = System.Text.Encoding.UTF8.GetBytes(json);
        
        var packet = new byte[payload.Length + 1];
        packet[0] = (byte)PacketType.Snapshot;
        Array.Copy(payload, 0, packet, 1, payload.Length);

        // Host to All (peer=0)
        MultiplayerApi.SendBytes(packet, 0, 0);
    }

    public void OnRunEnded()
    {
        // Final flush logic
        if (NetMessageBus.IsHost)
        {
            var json = JsonSerializer.Serialize(_engine.GlobalStats);
            var payload = System.Text.Encoding.UTF8.GetBytes(json);
            
            var packet = new byte[payload.Length + 1];
            packet[0] = (byte)PacketType.FinalFlush;
            Array.Copy(payload, 0, packet, 1, payload.Length);

            MultiplayerApi.SendBytes(packet, 0, 1); // Reliable

            Task.Run(async () => await SessionStorage.SaveAsync(_engine.GlobalStats));
        }
    }
}
