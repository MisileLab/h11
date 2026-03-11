namespace DamageTracker.Data;

using System.Collections.Generic;

public class PlayerDamageTracker
{
    public List<DamageEvent> Events { get; set; } = new();
    public int TotalDealt { get; set; }
    public int TotalTaken { get; set; }
    public Dictionary<string, int> DamageBySource { get; set; } = new();

    public void ResetAll()
    {
        Events.Clear();
        TotalDealt = 0;
        TotalTaken = 0;
        DamageBySource.Clear();
    }
}
