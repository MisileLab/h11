using UnityEngine;

public enum Team
{
    Ally,
    Enemy
}

public class BaseUnit : MonoBehaviour
{
    [Header("Identity")]
    [SerializeField] private string unitId = "Unit";
    [SerializeField] private Team team = Team.Ally;

    [Header("Stats")]
    [SerializeField] private int maxHealth = 10;
    [SerializeField] private int baseSpeed = 3;

    private int currentHealth;
    private int currentSpeed;
    private TrajectoryVisualizer trajectoryVisualizer;

    public string UnitId => unitId;
    public Team Team => team;
    public int CurrentHealth => currentHealth;
    public int CurrentSpeed => currentSpeed;

    private void Awake()
    {
        currentHealth = maxHealth;
        currentSpeed = baseSpeed;
        trajectoryVisualizer = GetComponent<TrajectoryVisualizer>();
    }

    public void ApplyGreenhouseBuff(int speedBonus)
    {
        currentSpeed = Mathf.Max(0, baseSpeed + speedBonus);
    }

    public void PreviewMove(Vector3 destination)
    {
        if (trajectoryVisualizer == null)
        {
            return;
        }

        trajectoryVisualizer.DrawSimple(transform.position, destination);
    }

    public void ClearPreview()
    {
        if (trajectoryVisualizer == null)
        {
            return;
        }

        trajectoryVisualizer.Clear();
    }
}
