namespace DamageTracker.Data;

/// <summary>
/// Represents a single damage event (dealt or taken).
/// </summary>
public struct DamageEvent
{
    public string Source { get; set; }      // Card name or source
    public string Target { get; set; }      // Target entity name
    public int Amount { get; set; }         // Damage amount
    public bool IsDealt { get; set; }       // true=dealt, false=taken
    public long Timestamp { get; set; }     // Unix timestamp
}
