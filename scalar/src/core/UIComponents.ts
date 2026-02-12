import Phaser from "phaser";

export const palette = {
  bg: 0x0a0f19,
  panel: 0x111a2a,
  panelSoft: 0x17253a,
  line: 0x284665,
  text: "#d6e1ef",
  subText: "#8ea3bf",
  crystal: "#4df0d8",
  scalar: "#ffb15c",
  danger: "#ff5c7a",
  success: "#5cff90",
  warmBloom: "#ff8f4a"
};

export const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
  color: palette.text,
  fontSize: "16px"
};

export const headingStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  ...textStyle,
  color: palette.crystal,
  fontSize: "24px"
};

export const buttonTextStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  ...textStyle,
  fontSize: "14px"
};

export const createButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  baseColor = palette.panelSoft
): Phaser.GameObjects.Container => {
  const bg = scene.add.rectangle(0, 0, width, height, baseColor).setStrokeStyle(1, palette.line);
  const text = scene.add.text(0, 0, label, buttonTextStyle).setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, text]);
  bg.setInteractive({ useHandCursor: true });
  bg.on("pointerover", () => {
    bg.setFillStyle(0x1f3551);
  });
  bg.on("pointerout", () => {
    bg.setFillStyle(baseColor);
  });
  bg.on("pointerdown", onClick);
  return container;
};

export const createPanel = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.95
): Phaser.GameObjects.Rectangle => {
  return scene.add.rectangle(x, y, width, height, palette.panel, alpha).setStrokeStyle(1, palette.line);
};

export const createTag = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color = palette.crystal
): Phaser.GameObjects.Text => {
  return scene.add
    .text(x, y, label, {
      ...buttonTextStyle,
      color,
      backgroundColor: "#101726",
      padding: { x: 8, y: 4 }
    })
    .setOrigin(0.5);
};

export const setText = (target: Phaser.GameObjects.Text, value: string): void => {
  if (target.text !== value) {
    target.setText(value);
  }
};
