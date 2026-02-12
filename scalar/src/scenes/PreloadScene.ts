import Phaser from "phaser";
import { createPanel, headingStyle, palette, textStyle } from "../core/UIComponents";

export class PreloadScene extends Phaser.Scene {
  public constructor() {
    super("PreloadScene");
  }

  public preload(): void {
    createPanel(this, 640, 360, 560, 240);
    this.add.text(640, 320, "scalar // loading systems", headingStyle).setOrigin(0.5);
    const status = this.add.text(640, 370, "Initializing deterministic runtime...", textStyle).setOrigin(0.5);
    const barBg = this.add.rectangle(640, 420, 420, 12, palette.panelSoft).setStrokeStyle(1, palette.line);
    const bar = this.add.rectangle(430, 420, 4, 8, palette.bg).setOrigin(0, 0.5).setFillStyle(0x4df0d8);

    this.load.on("progress", (value: number) => {
      bar.width = 4 + value * 412;
    });

    this.load.on("complete", () => {
      status.setText("Ready");
      barBg.setStrokeStyle(1, 0x4df0d8);
    });
  }

  public create(): void {
    this.scene.start("MainMenuScene");
  }
}
