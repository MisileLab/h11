import cards from "../data/cards.json";
import nodeRules from "../data/nodes.json";
import { saveManager } from "./SaveManager";
import { SeededRNG } from "./RNG";
import type { CardDefinition, MapNode, MetaSaveSlot, NodeRule, RunState } from "./types";

const rules = nodeRules as NodeRule[];

const pickRule = (rng: SeededRNG): NodeRule => {
  const total = rules.reduce((acc, item) => acc + item.weight, 0);
  let roll = rng.nextFloat("map.rule") * total;
  for (const rule of rules) {
    roll -= rule.weight;
    if (roll <= 0) {
      return rule;
    }
  }
  return rules[0] as NodeRule;
};

const buildMap = (seed: number): MapNode[] => {
  const rng = new SeededRNG(seed ^ 0x7f4a19c2);
  const depthCount = 20;
  const all: MapNode[] = [];
  const matrix: string[][] = [];
  for (let depth = 0; depth < depthCount; depth += 1) {
    const laneCount = depth === 0 || depth === depthCount - 1 ? 1 : rng.int(2, 3, `map.depth.${depth}`);
    const row: string[] = [];
    for (let lane = 0; lane < laneCount; lane += 1) {
      const id = `n-${depth}-${lane}`;
      const rule: NodeRule = depth === depthCount - 1 ? { type: "boss", icon: "G", weight: 1 } : pickRule(rng);
      all.push({ id, depth, lane, type: rule.type, icon: rule.icon, links: [], visited: false });
      row.push(id);
    }
    matrix.push(row);
  }
  for (let depth = 0; depth < depthCount - 1; depth += 1) {
    const current = matrix[depth] as string[];
    const next = matrix[depth + 1] as string[];
    current.forEach((id, index) => {
      const left = Math.max(0, index - 1);
      const right = Math.min(next.length - 1, index + 1);
      const links = Array.from(new Set([next[left], next[right]].filter((item): item is string => Boolean(item))));
      const node = all.find((item) => item.id === id);
      if (node) {
        node.links = links;
      }
    });
  }
  return all;
};

export class GameSession {
  public slots: MetaSaveSlot[];

  public selectedSlotId = 0;

  public run: RunState | null = null;

  public constructor() {
    this.slots = saveManager.getSlots();
  }

  public getSelectedSlot(): MetaSaveSlot {
    return this.slots[this.selectedSlotId] as MetaSaveSlot;
  }

  public selectSlot(slotId: number): void {
    this.selectedSlotId = slotId;
  }

  public mutateSelectedSlot(mutator: (slot: MetaSaveSlot) => MetaSaveSlot): void {
    const updated = mutator(this.getSelectedSlot());
    this.slots = this.slots.map((slot) => (slot.id === updated.id ? updated : slot));
    saveManager.saveSlots(this.slots);
  }

  public startRun(seed?: number): RunState {
    const runSeed = seed ?? Math.floor(Math.random() * 1_000_000_000);
    const mapNodes = buildMap(runSeed);
    const startNode = mapNodes.find((node) => node.depth === 0);
    this.run = {
      seed: runSeed,
      nodeIdsCleared: [],
      currentNodeId: startNode?.id ?? null,
      mapNodes,
      detection: 0,
      forcedElitePending: false,
      scalarHp: 80,
      scalarBlock: 0,
      crystalHp: 60,
      crystalBlock: 0,
      wave: 1,
    };
    return this.run;
  }

  public markNodeCleared(nodeId: string): void {
    if (!this.run) {
      return;
    }
    if (!this.run.nodeIdsCleared.includes(nodeId)) {
      this.run.nodeIdsCleared.push(nodeId);
    }
    this.run.mapNodes = this.run.mapNodes.map((node) => (node.id === nodeId ? { ...node, visited: true } : node));
    this.run.currentNodeId = nodeId;

    if (this.run.detection < 3) {
      this.run.forcedElitePending = false;
    }
  }

  public getReachableNodes(): MapNode[] {
    if (!this.run || !this.run.currentNodeId) {
      return [];
    }
    const current = this.run.mapNodes.find((node) => node.id === this.run?.currentNodeId);
    if (!current) {
      return [];
    }
    const reachable = this.run.mapNodes.filter((node) => current.links.includes(node.id) && !node.visited);

    if (this.run.detection >= 3 && !this.run.forcedElitePending) {
      const target = reachable.find((node) => node.type !== "boss");
      if (target) {
        this.run.mapNodes = this.run.mapNodes.map((node) => {
          if (node.id === target.id) {
            return { ...node, type: "elite", icon: "!" };
          }
          return node;
        });
        this.run.forcedElitePending = true;
        return this.run.mapNodes.filter((node) => current.links.includes(node.id) && !node.visited);
      }
    }

    return reachable;
  }

  public endRun(victory: boolean): void {
    if (victory) {
      this.mutateSelectedSlot((slot) => ({
        ...slot,
        stationCredits: slot.stationCredits + 2,
        storyLogsUnlocked: Math.min(8, slot.storyLogsUnlocked + 1),
      }));
    }
    this.run = null;
  }

  public getCardCatalog(): CardDefinition[] {
    return cards as CardDefinition[];
  }
}

export const gameSession = new GameSession();
