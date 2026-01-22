using System;
using UnityEngine;

public class AttentionManager : MonoBehaviour
{
    [Header("Gauge")]
    [SerializeField] private int maxAttention = 10;
    [SerializeField] private int attentionPerTurn = 2;

    [Header("Runtime")]
    [SerializeField] private int currentAttention = 0;
    [SerializeField] private int turnCount = 0;

    [Header("Modifiers")]
    [SerializeField] private float rechargeMultiplier = 1f;
    [SerializeField] private SeedItemData plantedSeed;

    private int baseMaxAttention;
    private int baseAttentionPerTurn;

    public event Action<int, int> AttentionChanged;

    public int CurrentAttention => currentAttention;
    public int MaxAttention => maxAttention;
    public int TurnCount => turnCount;

    private void Awake()
    {
        baseMaxAttention = maxAttention;
        baseAttentionPerTurn = attentionPerTurn;
        ClampAttention();
    }

    public void AdvanceTurn(int turns = 1)
    {
        if (turns < 1)
        {
            return;
        }

        for (int i = 0; i < turns; i++)
        {
            turnCount++;
            ChargeAttention();
        }
    }

    public bool SpendAttention(int amount)
    {
        if (amount <= 0 || currentAttention < amount)
        {
            return false;
        }

        currentAttention -= amount;
        NotifyChanged();
        return true;
    }

    public void ApplySeedBonus(SeedItemData seed)
    {
        plantedSeed = seed;
        rechargeMultiplier = 1f + (seed != null ? seed.rechargeRateBonus : 0f);
        maxAttention = baseMaxAttention + (seed != null ? seed.maxAttentionBonus : 0);
        attentionPerTurn = baseAttentionPerTurn + (seed != null ? seed.flatRechargeBonus : 0);
        ClampAttention();
        NotifyChanged();
    }

    private void ChargeAttention()
    {
        int amount = Mathf.Max(0, Mathf.RoundToInt(attentionPerTurn * rechargeMultiplier));
        currentAttention = Mathf.Clamp(currentAttention + amount, 0, maxAttention);
        NotifyChanged();
    }

    private void ClampAttention()
    {
        currentAttention = Mathf.Clamp(currentAttention, 0, maxAttention);
    }

    private void NotifyChanged()
    {
        AttentionChanged?.Invoke(currentAttention, maxAttention);
    }
}
