using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace Legacy
{
public class TurnManager : MonoBehaviour
{
    [SerializeField] private GridSystem gridSystem;
    [SerializeField] private Text turnQueueText;
    [SerializeField] private float turnDelay = 0.4f;
    [SerializeField] private float actionDelay = 0.4f;

    private readonly List<BaseUnit> units = new List<BaseUnit>();
    private readonly Queue<BaseUnit> turnQueue = new Queue<BaseUnit>();
    private TurnSnapshot lastSnapshot;
    private bool rewindRequested;

    public IReadOnlyList<BaseUnit> Units => units;
    public BaseUnit CurrentUnit { get; private set; }

    private void Awake()
    {
        if (gridSystem == null)
        {
            gridSystem = FindObjectOfType<GridSystem>();
        }

        if (turnQueueText == null)
        {
            GameObject textObject = GameObject.Find("TurnQueueText");
            if (textObject != null)
            {
                turnQueueText = textObject.GetComponent<Text>();
            }
        }
    }

    private void Start()
    {
        RefreshUnits();
        BuildQueue();
        StartCoroutine(TurnLoop());
    }

    public void RefreshUnits()
    {
        units.Clear();
        units.AddRange(FindObjectsOfType<BaseUnit>());
    }

    public List<BaseUnit> GetQueuePreview()
    {
        List<BaseUnit> preview = new List<BaseUnit>();
        if (CurrentUnit != null)
        {
            preview.Add(CurrentUnit);
        }

        preview.AddRange(turnQueue.ToArray());
        return preview;
    }

    public void RequestRewind()
    {
        rewindRequested = true;
    }

    public void AdjustSpeedForTeam(Team team, int delta)
    {
        foreach (BaseUnit unit in units)
        {
            if (unit != null && unit.Team == team)
            {
                unit.Speed = Mathf.Max(1, unit.Speed + delta);
            }
        }

        BuildQueue();
    }

    public void GrantImmediateTurn(Team team)
    {
        BaseUnit candidate = units.Where(unit => unit != null && unit.Team == team && unit.IsAlive)
            .OrderByDescending(unit => unit.Speed)
            .FirstOrDefault();

        if (candidate == null || candidate == CurrentUnit)
        {
            return;
        }

        Queue<BaseUnit> newQueue = new Queue<BaseUnit>();
        newQueue.Enqueue(candidate);
        foreach (BaseUnit unit in turnQueue)
        {
            if (unit != candidate)
            {
                newQueue.Enqueue(unit);
            }
        }

        turnQueue.Clear();
        foreach (BaseUnit unit in newQueue)
        {
            turnQueue.Enqueue(unit);
        }

        UpdateTurnQueueUI();
    }

    private void BuildQueue()
    {
        RefreshUnits();
        turnQueue.Clear();

        List<BaseUnit> orderedUnits = units
            .Where(unit => unit != null && unit.IsAlive)
            .OrderByDescending(unit => unit.Speed)
            .ThenBy(unit => unit.name)
            .ToList();

        foreach (BaseUnit unit in orderedUnits)
        {
            turnQueue.Enqueue(unit);
        }

        UpdateTurnQueueUI();
    }

    private IEnumerator TurnLoop()
    {
        yield return new WaitForSeconds(0.2f);

        while (true)
        {
            if (turnQueue.Count == 0)
            {
                BuildQueue();
            }

            CurrentUnit = turnQueue.Dequeue();
            if (CurrentUnit == null || !CurrentUnit.IsAlive)
            {
                continue;
            }

            CaptureSnapshot();
            UpdateTurnQueueUI();
            yield return CurrentUnit.TakeTurn(this, gridSystem, actionDelay);

            if (rewindRequested && lastSnapshot != null)
            {
                ApplySnapshot(lastSnapshot);
                rewindRequested = false;
                BuildQueue();
            }

            yield return new WaitForSeconds(turnDelay);
        }
    }

    private void UpdateTurnQueueUI()
    {
        if (turnQueueText == null)
        {
            return;
        }

        List<BaseUnit> preview = GetQueuePreview();
        List<string> lines = new List<string>();
        for (int i = 0; i < preview.Count; i++)
        {
            BaseUnit unit = preview[i];
            if (unit == null)
            {
                continue;
            }

            string prefix = i == 0 ? ">" : "-";
            lines.Add($"{prefix} {unit.name} (SPD {unit.Speed})");
        }

        turnQueueText.text = string.Join("\n", lines);
    }

    private void CaptureSnapshot()
    {
        TurnSnapshot snapshot = new TurnSnapshot();
        foreach (BaseUnit unit in units)
        {
            if (unit == null)
            {
                continue;
            }

            snapshot.UnitStates[unit] = new UnitState(unit.transform.position, unit.Health, unit.Speed);
        }

        lastSnapshot = snapshot;
    }

    private void ApplySnapshot(TurnSnapshot snapshot)
    {
        foreach (KeyValuePair<BaseUnit, UnitState> pair in snapshot.UnitStates)
        {
            if (pair.Key == null)
            {
                continue;
            }

            pair.Key.transform.position = pair.Value.Position;
            pair.Key.Health = pair.Value.Health;
            pair.Key.Speed = pair.Value.Speed;
            if (!pair.Key.gameObject.activeSelf && pair.Value.Health > 0)
            {
                pair.Key.gameObject.SetActive(true);
            }
        }

        if (gridSystem != null)
        {
            gridSystem.RebuildUnitMap();
        }
    }

    private class UnitState
    {
        public Vector3 Position { get; }
        public int Health { get; }
        public int Speed { get; }

        public UnitState(Vector3 position, int health, int speed)
        {
            Position = position;
            Health = health;
            Speed = speed;
        }
    }

    private class TurnSnapshot
    {
        public Dictionary<BaseUnit, UnitState> UnitStates { get; } = new Dictionary<BaseUnit, UnitState>();
    }
}
}
