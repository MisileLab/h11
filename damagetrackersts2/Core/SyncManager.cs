using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace DamageTracker.Core;

public class SyncManager
{
    private readonly StatsEngine _engine;
    private readonly List<DamageEvent> _eventBuffer = new();

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
            _eventBuffer.RemoveAt(0);
            _eventBuffer.Add(ev);
        }
    }

    public void Update(long currentTimeMs)
    {
        if (_eventBuffer.Count > 1000)
        {
            _eventBuffer.RemoveRange(0, _eventBuffer.Count - 1000);
        }
    }

    public void OnRunEnded()
    {
        _ = Task.Run(() => SessionStorage.SaveAsync(_engine.GlobalStats));
    }
}
