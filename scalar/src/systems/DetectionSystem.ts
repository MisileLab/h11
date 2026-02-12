export interface DetectionPenalty {
  level: number;
  enemyHpMultiplier: number;
  extraEnemy: boolean;
  forceElite: boolean;
  trackerJoinChance: number;
}

export class DetectionSystem {
  public static addByPP(current: number, ppSpent: number, isStealth: boolean): number {
    if (isStealth) {
      return current;
    }
    return Math.max(0, Math.min(4, current + ppSpent));
  }

  public static reduceByStealthTurn(current: number): number {
    return Math.max(0, current - 1);
  }

  public static getPenalty(level: number): DetectionPenalty {
    if (level <= 0) {
      return { level: 0, enemyHpMultiplier: 1, extraEnemy: false, forceElite: false, trackerJoinChance: 0 };
    }
    if (level === 1) {
      return { level, enemyHpMultiplier: 1.05, extraEnemy: false, forceElite: false, trackerJoinChance: 0 };
    }
    if (level === 2) {
      return { level, enemyHpMultiplier: 1.05, extraEnemy: true, forceElite: false, trackerJoinChance: 0 };
    }
    if (level === 3) {
      return { level, enemyHpMultiplier: 1.1, extraEnemy: true, forceElite: true, trackerJoinChance: 0 };
    }
    return { level: 4, enemyHpMultiplier: 1.12, extraEnemy: true, forceElite: true, trackerJoinChance: 0.5 };
  }
}
