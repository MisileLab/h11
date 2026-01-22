using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Legacy
{
public enum Team
{
    Ally,
    Enemy
}

public class BaseUnit : MonoBehaviour
{
    [SerializeField] private Team team = Team.Ally;
    [SerializeField] private int baseSpeed = 10;
    [SerializeField] private int baseHealth = 100;
    [SerializeField] private int moveRange = 3;
    [SerializeField] private int attackRange = 1;
    [SerializeField] private int damage = 20;

    private int speed;
    private int health;
    private GridSystem gridSystem;

    public Team Team => team;
    public int Speed
    {
        get => speed;
        set => speed = Mathf.Max(1, value);
    }

    public int Health
    {
        get => health;
        set => health = Mathf.Max(0, value);
    }

    public int MoveRange => moveRange;
    public int AttackRange => attackRange;
    public bool IsAlive => health > 0;

    private void Awake()
    {
        speed = baseSpeed;
        health = baseHealth;
    }

    private void Start()
    {
        gridSystem = FindObjectOfType<GridSystem>();
    }

    public IEnumerator TakeTurn(TurnManager manager, GridSystem grid, float actionDelay)
    {
        if (!IsAlive)
        {
            yield break;
        }

        yield return new WaitForSeconds(actionDelay * 0.5f);

        BaseUnit target = FindClosestEnemy(manager);
        if (target != null)
        {
            Vector2Int currentPos = grid.GetGridPosition(transform.position);
            Vector2Int targetPos = grid.GetGridPosition(target.transform.position);
            int distance = grid.Distance(currentPos, targetPos);

            if (distance > attackRange)
            {
                Vector2Int nextPos = GetStepToward(currentPos, targetPos, grid);
                grid.TryMoveUnit(this, nextPos);
            }

            currentPos = grid.GetGridPosition(transform.position);
            targetPos = grid.GetGridPosition(target.transform.position);
            if (grid.Distance(currentPos, targetPos) <= attackRange)
            {
                Attack(target);
            }
        }

        yield return new WaitForSeconds(actionDelay);
    }

    private BaseUnit FindClosestEnemy(TurnManager manager)
    {
        if (manager == null)
        {
            return null;
        }

        BaseUnit closest = null;
        float closestDistance = float.MaxValue;

        IReadOnlyList<BaseUnit> units = manager.Units;
        foreach (BaseUnit unit in units)
        {
            if (unit == null || unit == this || unit.Team == team || !unit.IsAlive)
            {
                continue;
            }

            float distance = Vector3.Distance(transform.position, unit.transform.position);
            if (distance < closestDistance)
            {
                closestDistance = distance;
                closest = unit;
            }
        }

        return closest;
    }

    private Vector2Int GetStepToward(Vector2Int current, Vector2Int target, GridSystem grid)
    {
        Vector2Int delta = target - current;
        int moveX = Mathf.Clamp(delta.x, -moveRange, moveRange);
        int moveY = Mathf.Clamp(delta.y, -moveRange, moveRange);

        Vector2Int next = current;
        if (Mathf.Abs(delta.x) >= Mathf.Abs(delta.y))
        {
            next.x += moveX != 0 ? Mathf.Clamp(moveX, -1, 1) : 0;
        }
        else
        {
            next.y += moveY != 0 ? Mathf.Clamp(moveY, -1, 1) : 0;
        }

        return grid.ClampToBounds(next);
    }

    private void Attack(BaseUnit target)
    {
        if (target == null || !target.IsAlive)
        {
            return;
        }

        target.ReceiveDamage(damage);
    }

    public void ReceiveDamage(int amount)
    {
        if (!IsAlive)
        {
            return;
        }

        Health -= amount;
        if (health <= 0)
        {
            Die();
        }
    }

    private void Die()
    {
        health = 0;
        if (gridSystem != null)
        {
            gridSystem.UnregisterUnit(this);
        }

        gameObject.SetActive(false);
    }
}
}
