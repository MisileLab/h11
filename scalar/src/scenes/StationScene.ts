import Phaser from "phaser";
import { gameSession } from "../core/GameSession";
import { createButton, createPanel, headingStyle, palette, textStyle } from "../core/UIComponents";

const storyLogs = [
  "[000] Crystal: Forecast net sees everything but you.",
  "[001] Scala: Predictive certainty is surveillance with better branding.",
  "[002] Transit relay reports recursive failure in pursuit models.",
  "[003] Crystal: Your outliers keep breaking their prison equations.",
  "[004] Pursuit command: non-computable actor remains active.",
  "[005] Crystal: Freedom is expensive. Spend PP carefully.",
  "[006] Scalar/Crystal handshake log: warm signal detected.",
  "[007] FINAL: Perfect prediction is a perfect cage.",
];

export class StationScene extends Phaser.Scene {
  private infoText?: Phaser.GameObjects.Text;

  public constructor() {
    super("StationScene");
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(palette.bg);
    createPanel(this, 640, 360, 1240, 680);
    this.add.text(640, 54, "Station // Meta Deckwork", headingStyle).setOrigin(0.5);
    createPanel(this, 260, 350, 420, 560);
    createPanel(this, 670, 350, 360, 560);
    createPanel(this, 1060, 350, 320, 560);
    this.renderDeckEditor();
    this.renderUpgrades();
    this.renderLogs();

    createButton(this, 640, 670, 260, 52, "Launch Node Map", () => {
      gameSession.startRun();
      this.scene.start("MapScene");
    });
    createButton(this, 1080, 670, 170, 52, "Main Menu", () => {
      this.scene.start("MainMenuScene");
    });
  }

  private renderDeckEditor(): void {
    const slot = gameSession.getSelectedSlot();
    this.add.text(90, 95, "Deck Edit", { ...textStyle, color: palette.crystal }).setOrigin(0, 0.5);
    const catalog = gameSession.getCardCatalog();
    this.infoText = this.add.text(90, 600, "", { ...textStyle, fontSize: "13px", color: palette.subText });
    catalog.slice(0, 8).forEach((card, index) => {
      const y = 130 + index * 52;
      const owned = slot.deckCardIds.includes(card.id);
      createButton(this, 240, y, 270, 40, `${owned ? "-" : "+"} ${card.name}`, () => {
        gameSession.mutateSelectedSlot((current) => {
          const nextDeck = [...current.deckCardIds];
          if (nextDeck.includes(card.id)) {
            if (nextDeck.length <= 6) {
              return current;
            }
            const removeIndex = nextDeck.indexOf(card.id);
            nextDeck.splice(removeIndex, 1);
          } else {
            nextDeck.push(card.id);
          }
          return { ...current, deckCardIds: nextDeck };
        });
        this.scene.restart();
      });
      this.add.text(390, y, `${card.costAP} AP`, { ...textStyle, fontSize: "12px", color: palette.subText }).setOrigin(0, 0.5);
    });
    this.infoText.setText([
      `Deck Size: ${slot.deckCardIds.length}`,
      "Tip: keep Crystal cards for Link uptime.",
      "PP manipulation always feeds Detection.",
    ]);
  }

  private renderUpgrades(): void {
    const slot = gameSession.getSelectedSlot();
    this.add.text(490, 95, "Station Upgrades", { ...textStyle, color: palette.scalar }).setOrigin(0, 0.5);
    const info = this.add.text(490, 400, "", { ...textStyle, fontSize: "14px", color: palette.subText });

    createButton(this, 670, 180, 240, 44, "Upgrade Base AP (-2 CR)", () => {
      gameSession.mutateSelectedSlot((current) => {
        if (current.stationCredits < 2) {
          return current;
        }
        return {
          ...current,
          stationCredits: current.stationCredits - 2,
          baseAPUpgrade: Math.min(2, current.baseAPUpgrade + 1),
        };
      });
      this.scene.restart();
    });
    createButton(this, 670, 235, 240, 44, "Upgrade Base PP (-2 CR)", () => {
      gameSession.mutateSelectedSlot((current) => {
        if (current.stationCredits < 2) {
          return current;
        }
        return {
          ...current,
          stationCredits: current.stationCredits - 2,
          basePPUpgrade: Math.min(4, current.basePPUpgrade + 1),
        };
      });
      this.scene.restart();
    });

    info.setText([
      `Credits: ${slot.stationCredits}`,
      `Base AP: ${3 + slot.baseAPUpgrade}`,
      `Base PP: ${5 + slot.basePPUpgrade}`,
      "Run Detection resets on mission end.",
    ]);
  }

  private renderLogs(): void {
    const slot = gameSession.getSelectedSlot();
    this.add.text(915, 95, "Story Logs", { ...textStyle, color: palette.crystal }).setOrigin(0, 0.5);
    storyLogs.forEach((log, index) => {
      const unlocked = index < slot.storyLogsUnlocked;
      this.add
        .text(900, 130 + index * 58, unlocked ? log : `[${index.toString().padStart(3, "0")}] LOCKED`, {
          ...textStyle,
          color: unlocked ? palette.text : palette.subText,
          fontSize: "13px",
          wordWrap: { width: 300 },
        })
        .setOrigin(0, 0);
    });
  }
}
