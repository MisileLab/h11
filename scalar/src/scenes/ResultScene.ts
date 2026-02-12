import Phaser from "phaser";
import cards from "../data/cards.json";
import { gameSession } from "../core/GameSession";
import { createButton, createPanel, headingStyle, palette, textStyle } from "../core/UIComponents";
import type { BattleResultPayload, CardDefinition, NodeType } from "../core/types";

interface ResultData extends BattleResultPayload {
  nodeType: NodeType;
}

const cardCatalog = cards as CardDefinition[];

export class ResultScene extends Phaser.Scene {
  private payload!: ResultData;

  public constructor() {
    super("ResultScene");
  }

  public init(data: ResultData): void {
    this.payload = data;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(palette.bg);
    createPanel(this, 640, 360, 900, 580);
    this.add.text(
      640,
      110,
      this.payload.victory ? "Result // Mission Segment Cleared" : "Result // Capture Simulation",
      headingStyle,
    ).setOrigin(0.5);

    const slot = gameSession.getSelectedSlot();
    if (this.payload.victory) {
      gameSession.mutateSelectedSlot((current) => ({
        ...current,
        stationCredits: current.stationCredits + this.payload.creditReward,
        storyLogsUnlocked: this.payload.storyFragmentFound ? Math.min(8, current.storyLogsUnlocked + 1) : current.storyLogsUnlocked,
      }));
    }

    this.add.text(
      640,
      180,
      [
        `Node: ${this.payload.nodeType}`,
        `Reward Credits: ${this.payload.creditReward}`,
        `Station Credits: ${slot.stationCredits + (this.payload.victory ? this.payload.creditReward : 0)}`,
      ],
      textStyle,
    ).setOrigin(0.5);

    if (this.payload.victory && this.payload.rewardCardChoices.length > 0) {
      this.add.text(640, 260, "Choose 1 reward card", { ...textStyle, color: palette.crystal }).setOrigin(0.5);
      this.payload.rewardCardChoices.forEach((cardId, index) => {
        const card = cardCatalog.find((item) => item.id === cardId);
        if (!card) return;
        createButton(this, 640, 320 + index * 70, 500, 52, `${card.name} (${card.owner})`, () => {
          gameSession.mutateSelectedSlot((current) => ({
            ...current,
            unlockedCardIds: Array.from(new Set([...current.unlockedCardIds, card.id])),
            deckCardIds: [...current.deckCardIds, card.id],
          }));
          this.goNext();
        });
      });
    }

    createButton(this, 640, 620, 280, 56, this.payload.victory ? "Continue to Map" : "Return to Station", () => {
      this.goNext();
    });
  }

  private goNext(): void {
    if (!this.payload.victory) {
      gameSession.endRun(false);
      this.scene.start("StationScene");
      return;
    }
    if (this.payload.nodeType === "boss") {
      gameSession.endRun(true);
      this.scene.start("StationScene");
      return;
    }
    this.scene.start("MapScene");
  }
}
