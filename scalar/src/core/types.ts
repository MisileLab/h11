export type SceneKey =
  | "BootScene"
  | "PreloadScene"
  | "MainMenuScene"
  | "StationScene"
  | "MapScene"
  | "BattleScene"
  | "ResultScene";

export type NodeType = "battle" | "event" | "shop" | "hideout" | "elite" | "boss";

export type CardOwner = "scalar" | "crystal";

export type CardKeyword = "Overload" | "Converge" | "Scatter" | "Stealth" | "Compute" | "Link";

export type EffectType =
  | "damage"
  | "shield"
  | "recoverCrystal"
  | "intentShift"
  | "detectionDown"
  | "draw"
  | "ppGain";

export interface CardEffect {
  type: EffectType;
  value: number;
  target?: "enemy" | "all-enemies" | "scalar" | "crystal";
}

export interface CardDefinition {
  id: string;
  name: string;
  owner: CardOwner;
  costAP: number;
  baseHitChance: number;
  exhaust?: boolean;
  keywords: CardKeyword[];
  effects: CardEffect[];
  description: string;
}

export type EnemyArchetype = "grunt" | "detector" | "converger" | "mirror" | "boss";

export interface IntentOption {
  id: string;
  label: string;
  type: "attack" | "defend" | "debuff" | "idle";
  value: number;
  probability: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  archetype: EnemyArchetype;
  maxHp: number;
  intents: IntentOption[];
}

export interface EnemyRuntimeState {
  id: string;
  name: string;
  archetype: EnemyArchetype;
  hp: number;
  maxHp: number;
  block: number;
  convergeStacks: number;
  mirroredHitBonus: number;
  intentPool: IntentOption[];
  intentPoolOverrides: Partial<Record<string, number>>;
}

export interface NodeRule {
  type: NodeType;
  icon: string;
  weight: number;
}

export interface MapNode {
  id: string;
  depth: number;
  lane: number;
  type: NodeType;
  icon: string;
  links: string[];
  visited: boolean;
}

export interface MetaSaveSlot {
  id: number;
  name: string;
  unlockedCardIds: string[];
  deckCardIds: string[];
  stationCredits: number;
  baseAPUpgrade: number;
  basePPUpgrade: number;
  storyLogsUnlocked: number;
  bestDetectionRecord: number;
}

export interface RuntimeSettings {
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  debugOverlayDefaultOn: boolean;
}

export interface SaveData {
  version: number;
  slots: MetaSaveSlot[];
  settings: RuntimeSettings;
}

export interface RunState {
  seed: number;
  nodeIdsCleared: string[];
  currentNodeId: string | null;
  mapNodes: MapNode[];
  detection: number;
  forcedElitePending: boolean;
  scalarHp: number;
  scalarBlock: number;
  crystalHp: number;
  crystalBlock: number;
  wave: number;
}

export interface BattleResultPayload {
  victory: boolean;
  nodeType: NodeType;
  rewardCardChoices: string[];
  creditReward: number;
  storyFragmentFound: boolean;
}
