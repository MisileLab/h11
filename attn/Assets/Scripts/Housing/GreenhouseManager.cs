using System.Collections.Generic;
using UnityEngine;

public class GreenhouseManager : MonoBehaviour
{
    [Header("Grid")]
    [SerializeField] private int width = 4;
    [SerializeField] private int height = 4;
    [SerializeField] private float tileSize = 1f;

    [Header("Buffs")]
    [SerializeField] private int unitSpeedBonus = 1;

    [Header("Links")]
    [SerializeField] private AttentionManager attentionManager;

    [Header("Seed Setup")]
    [SerializeField] private SeedItemData initialSeed;
    [SerializeField] private Vector2Int initialSeedTile = new Vector2Int(1, 1);

    private readonly Dictionary<Vector2Int, SeedItemData> plantedSeeds = new();

    private void Awake()
    {
        if (attentionManager == null)
        {
            attentionManager = FindFirstObjectByType<AttentionManager>();
        }
    }

    private void Start()
    {
        if (initialSeed != null)
        {
            PlantSeed(initialSeedTile, initialSeed);
        }
    }

    public bool PlantSeed(Vector2Int tile, SeedItemData seed)
    {
        if (!IsInBounds(tile) || seed == null)
        {
            return false;
        }

        plantedSeeds[tile] = seed;
        attentionManager?.ApplySeedBonus(seed);
        return true;
    }

    public void ApplyBuffs(IEnumerable<BaseUnit> units)
    {
        if (units == null)
        {
            return;
        }

        foreach (BaseUnit unit in units)
        {
            if (unit == null)
            {
                continue;
            }

            unit.ApplyGreenhouseBuff(unitSpeedBonus);
        }
    }

    public Vector3 TileToWorld(Vector2Int tile)
    {
        return new Vector3(tile.x * tileSize, 0f, tile.y * tileSize);
    }

    private bool IsInBounds(Vector2Int tile)
    {
        return tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height;
    }
}
