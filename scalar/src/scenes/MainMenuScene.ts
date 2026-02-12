import Phaser from "phaser";
import { gameSession } from "../core/GameSession";
import { createButton, createPanel, headingStyle, palette, textStyle } from "../core/UIComponents";
import { saveManager } from "../core/SaveManager";

export class MainMenuScene extends Phaser.Scene {
  private settingsText?: Phaser.GameObjects.Text;

  public constructor() {
    super("MainMenuScene");
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(palette.bg);
    createPanel(this, 640, 360, 900, 580);
    this.add.text(640, 108, "SCALAR // COLD ESCAPE", headingStyle).setOrigin(0.5);
    this.add.text(640, 145, "A deterministic noir roguelite slice", textStyle).setOrigin(0.5);

    this.add.text(160, 190, "Save Slots", { ...textStyle, color: palette.subText }).setOrigin(0, 0.5);
    const slots = gameSession.slots;
    slots.forEach((slot, index) => {
      createButton(this, 240, 240 + index * 80, 220, 56, `${slot.name} | CR ${slot.stationCredits}`, () => {
        gameSession.selectSlot(slot.id);
        this.refreshSettingsText();
      });
    });

    createButton(this, 640, 500, 320, 60, "Enter Station", () => {
      this.scene.start("StationScene");
    });

    createButton(this, 1020, 240, 190, 56, "Toggle Motion", () => {
      const settings = saveManager.getSettings();
      settings.reducedMotion = !settings.reducedMotion;
      saveManager.saveSettings(settings);
      this.refreshSettingsText();
    });
    createButton(this, 1020, 310, 190, 56, "Toggle Debug", () => {
      const settings = saveManager.getSettings();
      settings.debugOverlayDefaultOn = !settings.debugOverlayDefaultOn;
      saveManager.saveSettings(settings);
      this.refreshSettingsText();
    });

    this.settingsText = this.add.text(910, 395, "", { ...textStyle, fontSize: "14px" }).setOrigin(0.5, 0);
    this.refreshSettingsText();
  }

  private refreshSettingsText(): void {
    if (!this.settingsText) {
      return;
    }
    const selected = gameSession.getSelectedSlot();
    const settings = saveManager.getSettings();
    this.settingsText.setText([
      `Active: ${selected.name}`,
      `Reduced Motion: ${settings.reducedMotion ? "ON" : "OFF"}`,
      `Debug Overlay Default: ${settings.debugOverlayDefaultOn ? "ON" : "OFF"}`,
    ]);
  }
}
