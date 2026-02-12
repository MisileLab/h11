import type { IntentOption } from "../core/types";

export class ProbabilitySystem {
  public static clampProbability(value: number, min = 0.05, max = 0.95): number {
    return Math.max(min, Math.min(max, value));
  }

  public static applyHitChanceBoost(baseHitChance: number, ppSpent: number, shiftPerPP = 0.1): number {
    return this.clampProbability(baseHitChance + ppSpent * shiftPerPP);
  }

  public static shiftIntentProbability(
    intents: IntentOption[],
    fromIntentId: string,
    toIntentId: string,
    step: number,
  ): IntentOption[] {
    const next = intents.map((intent) => ({ ...intent }));
    const from = next.find((intent) => intent.id === fromIntentId);
    const to = next.find((intent) => intent.id === toIntentId);
    if (!from || !to) {
      return next;
    }
    const movable = Math.min(step, from.probability - 0.05, 0.95 - to.probability);
    if (movable <= 0) {
      return next;
    }
    from.probability -= movable;
    to.probability += movable;
    return this.normalize(next);
  }

  public static shiftAwayFromAttack(intents: IntentOption[], step: number): IntentOption[] {
    const attackIntent = intents.find((intent) => intent.type === "attack");
    const saferIntent = intents.find((intent) => intent.type !== "attack");
    if (!attackIntent || !saferIntent) {
      return intents.map((intent) => ({ ...intent }));
    }
    return this.shiftIntentProbability(intents, attackIntent.id, saferIntent.id, step);
  }

  public static normalize(intents: IntentOption[]): IntentOption[] {
    const sum = intents.reduce((acc, intent) => acc + intent.probability, 0);
    if (sum <= 0) {
      return intents;
    }
    return intents.map((intent) => ({ ...intent, probability: intent.probability / sum }));
  }
}
