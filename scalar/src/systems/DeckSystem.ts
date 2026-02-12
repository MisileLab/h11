import type { CardDefinition } from "../core/types";
import { SeededRNG } from "../core/RNG";

export class DeckSystem {
  public drawPile: CardDefinition[];

  public discardPile: CardDefinition[] = [];

  public exhaustPile: CardDefinition[] = [];

  public hand: CardDefinition[] = [];

  private readonly rng: SeededRNG;

  public constructor(cards: CardDefinition[], rng: SeededRNG) {
    this.rng = rng;
    this.drawPile = [...cards];
    this.shuffleDrawPile();
  }

  public draw(count: number): CardDefinition[] {
    const drawn: CardDefinition[] = [];
    for (let i = 0; i < count; i += 1) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) {
          break;
        }
        this.drawPile = [...this.discardPile];
        this.discardPile = [];
        this.shuffleDrawPile();
      }
      const card = this.drawPile.shift();
      if (card) {
        this.hand.push(card);
        drawn.push(card);
      }
    }
    return drawn;
  }

  public discardHand(): void {
    this.discardPile.push(...this.hand);
    this.hand = [];
  }

  public consumeCard(card: CardDefinition): void {
    this.hand = this.hand.filter((item) => item !== card);
    if (card.exhaust) {
      this.exhaustPile.push(card);
      return;
    }
    this.discardPile.push(card);
  }

  public handSize(): number {
    return this.hand.length;
  }

  public piles(): { draw: number; discard: number; exhaust: number } {
    return {
      draw: this.drawPile.length,
      discard: this.discardPile.length,
      exhaust: this.exhaustPile.length
    };
  }

  private shuffleDrawPile(): void {
    for (let i = this.drawPile.length - 1; i > 0; i -= 1) {
      const j = this.rng.nextInt(0, i, "deck.shuffle");
      const temp = this.drawPile[i] as CardDefinition;
      this.drawPile[i] = this.drawPile[j] as CardDefinition;
      this.drawPile[j] = temp;
    }
  }
}
