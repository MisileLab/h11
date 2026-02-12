import type { CardDefinition } from "../core/types";
import { SeededRNG } from "../core/RNG";

export class RewardSystem {
  public static pickCardChoices(pool: CardDefinition[], rng: SeededRNG): string[] {
    const unique = new Set<string>();
    while (unique.size < 3 && unique.size < pool.length) {
      unique.add(rng.pickOne(pool, "reward.card.choice").id);
    }
    return Array.from(unique);
  }

  public static creditReward(nodeType: "battle" | "elite" | "boss" | "event" | "shop" | "hideout", rng: SeededRNG): number {
    if (nodeType === "boss") {
      return 8;
    }
    if (nodeType === "elite") {
      return rng.nextInt(4, 6, "reward.credit.elite");
    }
    return rng.nextInt(2, 4, "reward.credit.normal");
  }
}
