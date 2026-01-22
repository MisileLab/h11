using UnityEngine;
using UnityEngine.UI;

namespace Legacy
{
public class ChronosWand : MonoBehaviour
{
    [SerializeField] private TurnManager turnManager;
    [SerializeField] private int allySpeedBoost = 2;
    [SerializeField] private int enemySlowAmount = 2;
    [SerializeField] private Button accelerateButton;
    [SerializeField] private Button slowButton;
    [SerializeField] private Button rewindButton;

    private void Start()
    {
        if (turnManager == null)
        {
            turnManager = FindObjectOfType<TurnManager>();
        }

        BindButtons();
    }

    public void AccelerateTurn()
    {
        if (turnManager == null)
        {
            return;
        }

        turnManager.AdjustSpeedForTeam(Team.Ally, allySpeedBoost);
        turnManager.GrantImmediateTurn(Team.Ally);
    }

    public void SlowEnemies()
    {
        if (turnManager == null)
        {
            return;
        }

        turnManager.AdjustSpeedForTeam(Team.Enemy, -enemySlowAmount);
    }

    public void RewindTurn()
    {
        if (turnManager == null)
        {
            return;
        }

        turnManager.RequestRewind();
    }

    private void BindButtons()
    {
        if (accelerateButton == null)
        {
            accelerateButton = FindButton("Btn_Accelerate");
        }

        if (slowButton == null)
        {
            slowButton = FindButton("Btn_Slow");
        }

        if (rewindButton == null)
        {
            rewindButton = FindButton("Btn_Rewind");
        }

        if (accelerateButton != null)
        {
            accelerateButton.onClick.AddListener(AccelerateTurn);
        }

        if (slowButton != null)
        {
            slowButton.onClick.AddListener(SlowEnemies);
        }

        if (rewindButton != null)
        {
            rewindButton.onClick.AddListener(RewindTurn);
        }
    }

    private Button FindButton(string buttonName)
    {
        GameObject buttonObject = GameObject.Find(buttonName);
        return buttonObject != null ? buttonObject.GetComponent<Button>() : null;
    }
}
}
