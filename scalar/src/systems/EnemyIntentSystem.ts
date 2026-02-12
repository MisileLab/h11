import { SeededRNG } from "../core/RNG";
import type { EnemyRuntimeState, IntentOption } from "../core/types";

export interface ResolvedIntent {
  sourceEnemyId: string;
  intent: IntentOption;
}

export class EnemyIntentSystem {
  public static buildIntentPool(enemy: EnemyRuntimeState): IntentOption[] {
    const sum = enemy.intentPool.reduce((acc, item) => acc + item.probability, 0);
    if (sum <= 0) {
      return enemy.intentPool;
    }
    return enemy.intentPool.map((item) => ({ ...item, probability: item.probability / sum }));
  }

  public static resolve(enemy: EnemyRuntimeState, rng: SeededRNG): ResolvedIntent {
    const pool = this.buildIntentPool(enemy);
    let roll = rng.nextFloat(`enemy.intent.${enemy.id}`);
    for (const intent of pool) {
      roll -= intent.probability;
      if (roll <= 0) {
        return { sourceEnemyId: enemy.id, intent };
      }
    }
    return { sourceEnemyId: enemy.id, intent: pool[pool.length - 1] as IntentOption };
  }
}
