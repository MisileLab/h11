export type TurnPhase = "player" | "enemy";

export class TurnSystem {
  public turn = 1;

  public phase: TurnPhase = "player";

  public reset(): void {
    this.turn = 1;
    this.phase = "player";
  }

  public nextPhase(): TurnPhase {
    if (this.phase === "player") {
      this.phase = "enemy";
      return this.phase;
    }
    this.phase = "player";
    this.turn += 1;
    return this.phase;
  }
}
