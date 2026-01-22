using UnityEngine;

[CreateAssetMenu(fileName = "ShinjeoguSeed", menuName = "Project Attention/Seed Item", order = 10)]
public class SeedItemData : ScriptableObject
{
    [Header("Identity")]
    public string displayName = "Shinjeogu Seed";

    [Header("Attention Bonuses")]
    [Range(0f, 3f)]
    public float rechargeRateBonus = 0.5f;

    [Min(0)]
    public int maxAttentionBonus = 2;

    [Min(0)]
    public int flatRechargeBonus = 0;
}
