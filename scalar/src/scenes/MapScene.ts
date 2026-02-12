import Phaser from "phaser";
import { gameSession } from "../core/GameSession";
import { createButton, createPanel, headingStyle, palette, textStyle } from "../core/UIComponents";
import type { MapNode } from "../core/types";

const nodeColor = (type: string): number => {
  if (type === "battle") return 0x2f5f9f;
  if (type === "event") return 0x2a7f7f;
  if (type === "shop") return 0x7f6a2a;
  if (type === "hideout") return 0x3b7a4f;
  if (type === "elite") return 0x883344;
  return 0xc9973c;
};

export class MapScene extends Phaser.Scene {
  public constructor() {
    super("MapScene");
  }

  public create(): void {
    const run = gameSession.run ?? gameSession.startRun();
    this.cameras.main.setBackgroundColor(palette.bg);
    createPanel(this, 640, 360, 1240, 680);
    this.add.text(640, 48, "Node Map // Escape Corridor", headingStyle).setOrigin(0.5);
    this.add.text(66, 80, `Seed ${run.seed} | Detection ${run.detection}`, { ...textStyle, color: palette.subText }).setOrigin(0, 0.5);
    createButton(this, 1090, 48, 180, 40, "Return Station", () => {
      this.scene.start("StationScene");
    });
    this.renderMap(run.mapNodes);
  }

  private renderMap(nodes: MapNode[]): void {
    const currentId = gameSession.run?.currentNodeId;
    const reachable = new Set(gameSession.getReachableNodes().map((node) => node.id));
    nodes.forEach((node) => {
      const x = 110 + node.depth * 54;
      const y = 140 + node.lane * 90;
      const radius = node.depth === nodes.length - 1 ? 18 : 14;
      const color = node.visited ? 0x29405f : nodeColor(node.type);
      const circle = this.add.circle(x, y, radius, color).setStrokeStyle(1, palette.line);
      this.add.text(x, y, node.icon, { ...textStyle, fontSize: "12px" }).setOrigin(0.5);

      const selectable = reachable.has(node.id) || (!currentId && node.depth === 0) || (currentId === node.id && !node.visited);
      if (!node.visited && selectable) {
        circle.setInteractive({ useHandCursor: true });
        circle.on("pointerdown", () => this.enterNode(node));
      }
      node.links.forEach((nextId) => {
        const nextNode = nodes.find((item) => item.id === nextId);
        if (!nextNode) return;
        const nx = 110 + nextNode.depth * 54;
        const ny = 140 + nextNode.lane * 90;
        this.add.line(0, 0, x, y, nx, ny, palette.line, 0.3).setOrigin(0, 0);
      });
    });
  }

  private enterNode(node: MapNode): void {
    gameSession.markNodeCleared(node.id);
    if (node.type === "battle" || node.type === "elite" || node.type === "boss") {
      this.scene.start("BattleScene", { nodeType: node.type, nodeId: node.id });
      return;
    }

    const detection = gameSession.run?.detection ?? 0;
    const eventWorsened = node.type === "event" && detection >= 3;

    if (node.type === "hideout" && gameSession.run) {
      gameSession.run.scalarHp = Math.min(80, gameSession.run.scalarHp + 10);
      gameSession.run.crystalHp = Math.min(60, gameSession.run.crystalHp + 10);
      gameSession.run.detection = Math.max(0, gameSession.run.detection - 1);
    }

    this.scene.start("ResultScene", {
      victory: true,
      nodeType: node.type,
      rewardCardChoices: [],
      creditReward: node.type === "shop" ? 2 : eventWorsened ? 0 : 1,
      storyFragmentFound: node.type === "event" && !eventWorsened,
    });
  }
}
