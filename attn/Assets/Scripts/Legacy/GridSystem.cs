using System.Collections.Generic;
using UnityEngine;

namespace Legacy
{
[ExecuteAlways]
public class GridSystem : MonoBehaviour
{
    [SerializeField] private int width = 10;
    [SerializeField] private int height = 10;
    [SerializeField] private float tileSize = 1f;
    [SerializeField] private float tileHeight = 0.1f;
    [SerializeField] private bool generateTiles = true;
    [SerializeField] private Transform tileRoot;

    private readonly Dictionary<Vector2Int, BaseUnit> units = new Dictionary<Vector2Int, BaseUnit>();

    public int Width => width;
    public int Height => height;

    private void Awake()
    {
        if (generateTiles)
        {
            CreateTilesIfNeeded();
        }
    }

    private void OnEnable()
    {
        if (!Application.isPlaying && generateTiles)
        {
            CreateTilesIfNeeded();
        }
    }

    private void Start()
    {
        RegisterExistingUnits();
    }

    public Vector3 GetWorldPosition(Vector2Int gridPos)
    {
        float offsetX = (width - 1) * 0.5f;
        float offsetY = (height - 1) * 0.5f;
        return new Vector3((gridPos.x - offsetX) * tileSize, 0f, (gridPos.y - offsetY) * tileSize);
    }

    public Vector2Int GetGridPosition(Vector3 worldPos)
    {
        float offsetX = (width - 1) * 0.5f;
        float offsetY = (height - 1) * 0.5f;
        int x = Mathf.RoundToInt(worldPos.x / tileSize + offsetX);
        int y = Mathf.RoundToInt(worldPos.z / tileSize + offsetY);
        return new Vector2Int(x, y);
    }

    public int Distance(Vector2Int a, Vector2Int b)
    {
        return Mathf.Abs(a.x - b.x) + Mathf.Abs(a.y - b.y);
    }

    public bool IsWithinBounds(Vector2Int pos)
    {
        return pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height;
    }

    public bool IsTileWalkable(Vector2Int pos)
    {
        return IsWithinBounds(pos) && !units.ContainsKey(pos);
    }

    public bool TryMoveUnit(BaseUnit unit, Vector2Int targetPos)
    {
        if (unit == null || !IsTileWalkable(targetPos))
        {
            return false;
        }

        Vector2Int currentPos = GetGridPosition(unit.transform.position);
        units.Remove(currentPos);
        units[targetPos] = unit;

        Vector3 worldPos = GetWorldPosition(targetPos);
        worldPos.y = unit.transform.position.y;
        unit.transform.position = worldPos;
        return true;
    }

    public void RegisterUnit(BaseUnit unit)
    {
        if (unit == null)
        {
            return;
        }

        Vector2Int gridPos = GetGridPosition(unit.transform.position);
        if (!IsWithinBounds(gridPos))
        {
            return;
        }

        units[gridPos] = unit;
    }

    public void UnregisterUnit(BaseUnit unit)
    {
        if (unit == null)
        {
            return;
        }

        Vector2Int gridPos = GetGridPosition(unit.transform.position);
        if (units.TryGetValue(gridPos, out BaseUnit existing) && existing == unit)
        {
            units.Remove(gridPos);
        }
    }

    public BaseUnit GetUnitAt(Vector2Int pos)
    {
        units.TryGetValue(pos, out BaseUnit unit);
        return unit;
    }

    public Vector2Int ClampToBounds(Vector2Int pos)
    {
        return new Vector2Int(Mathf.Clamp(pos.x, 0, width - 1), Mathf.Clamp(pos.y, 0, height - 1));
    }

    public void RebuildUnitMap()
    {
        RegisterExistingUnits();
    }

    private void RegisterExistingUnits()
    {
        units.Clear();
        BaseUnit[] foundUnits = FindObjectsOfType<BaseUnit>();
        foreach (BaseUnit unit in foundUnits)
        {
            RegisterUnit(unit);
        }
    }

    private void CreateTilesIfNeeded()
    {
        if (tileRoot == null)
        {
            GameObject existingRoot = GameObject.Find("GridTiles");
            if (existingRoot != null)
            {
                tileRoot = existingRoot.transform;
            }
            else
            {
                GameObject root = new GameObject("GridTiles");
                tileRoot = root.transform;
            }
        }

        if (tileRoot.childCount > 0)
        {
            return;
        }

        for (int x = 0; x < width; x++)
        {
            for (int y = 0; y < height; y++)
            {
                Vector3 position = GetWorldPosition(new Vector2Int(x, y));
                GameObject tile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                tile.name = $"Tile_{x}_{y}";
                tile.transform.SetParent(tileRoot);
                tile.transform.position = position;
                tile.transform.localScale = new Vector3(tileSize, tileHeight, tileSize);
            }
        }
    }
}
}
