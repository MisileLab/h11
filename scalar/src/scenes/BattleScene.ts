import Phaser from "phaser";
import enemies from "../data/enemies.json";
import { gameSession } from "../core/GameSession";
import { SeededRNG } from "../core/RNG";
import { saveManager } from "../core/SaveManager";
import { createButton, createPanel, headingStyle, palette, setText, textStyle } from "../core/UIComponents";
import type { CardDefinition, EnemyDefinition, EnemyRuntimeState, NodeType } from "../core/types";
import { DeckSystem } from "../systems/DeckSystem";
import { DetectionSystem } from "../systems/DetectionSystem";
import { EnemyIntentSystem } from "../systems/EnemyIntentSystem";
import { ProbabilitySystem } from "../systems/ProbabilitySystem";
import { RewardSystem } from "../systems/RewardSystem";
import { TurnSystem } from "../systems/TurnSystem";

interface BattleSceneData {
  nodeType: NodeType;
  nodeId: string;
}

const enemyCatalog = enemies as EnemyDefinition[];

export class BattleScene extends Phaser.Scene {
  private nodeType: NodeType = "battle";

  private nodeId = "";

  private rng!: SeededRNG;

  private deck!: DeckSystem;

  private turn = new TurnSystem();

  private enemies: EnemyRuntimeState[] = [];

  private selectedEnemy = 0;

  private scalarHp = 80;

  private scalarBlock = 0;

  private crystalHp = 60;

  private crystalBlock = 0;

  private ap = 3;

  private pp = 5;

  private ppHitBoost = 0;

  private jamPenalty = 0;

  private detection = 0;

  private lastPlayedOwner: "scalar" | "crystal" | null = null;

  private usedStealthOnlyThisTurn = true;

  private playedCardThisTurn = false;

  private convergeTargetId: string | null = null;

  private convergeStacks = 0;

  private wave = 1;

  private maxWave = 1;

  private battleDone = false;

  private summaryText?: Phaser.GameObjects.Text;

  private enemiesText?: Phaser.GameObjects.Text;

  private intentsText?: Phaser.GameObjects.Text;

  private handText?: Phaser.GameObjects.Text;

  private handCardsLayer?: Phaser.GameObjects.Container;

  private cardPreviewText?: Phaser.GameObjects.Text;

  private logText?: Phaser.GameObjects.Text;

  private debugPanel?: Phaser.GameObjects.Container;

  private debugText?: Phaser.GameObjects.Text;

  public constructor() {
    super("BattleScene");
  }

  public init(data: BattleSceneData): void {
    this.nodeType = data.nodeType;
    this.nodeId = data.nodeId;
  }

  public create(): void {
    const run = gameSession.run;
    if (!run) {
      this.scene.start("StationScene");
      return;
    }

    const slot = gameSession.getSelectedSlot();
    this.scalarHp = run.scalarHp;
    this.scalarBlock = run.scalarBlock;
    this.crystalHp = run.crystalHp;
    this.crystalBlock = run.crystalBlock;
    this.detection = run.detection;
    this.maxWave = this.nodeType === "boss" ? 4 : 1;
    this.wave = run.wave;

    const seed = run.seed + this.hashCode(`${this.nodeId}-${this.wave}`);
    this.rng = new SeededRNG(seed);

    const deckCards = gameSession
      .getCardCatalog()
      .filter((card) => slot.deckCardIds.includes(card.id));
    this.deck = new DeckSystem(deckCards, this.rng);

    this.turn.reset();
    this.ap = 3 + slot.baseAPUpgrade;
    this.pp = 5 + slot.basePPUpgrade;
    this.ppHitBoost = 0;
    this.selectedEnemy = 0;

    this.enemies = this.buildWaveEnemies(this.wave, this.nodeType, this.detection);

    this.cameras.main.setBackgroundColor(palette.bg);
    this.renderLayout();
    this.startPlayerTurn();
    this.setupDebugOverlay();
    this.refreshUi();

    this.input.keyboard?.on("keydown-BACKTICK", () => {
      if (!this.debugPanel) {
        return;
      }
      this.debugPanel.setVisible(!this.debugPanel.visible);
      this.refreshDebug();
    });
  }

  private renderLayout(): void {
    createPanel(this, 640, 360, 1240, 680);
    this.add.text(640, 44, `Battle // ${this.nodeType.toUpperCase()} // wave ${this.wave}/${this.maxWave}`, headingStyle).setOrigin(0.5);

    this.summaryText = this.add.text(50, 80, "", { ...textStyle, fontSize: "13px", color: palette.subText, lineSpacing: 4 }).setOrigin(0, 0);

    createPanel(this, 250, 230, 390, 250, 0.92);
    this.enemiesText = this.add.text(70, 128, "", { ...textStyle, fontSize: "14px", lineSpacing: 6, wordWrap: { width: 340 } }).setOrigin(0, 0);

    createPanel(this, 655, 230, 390, 250, 0.92);
    this.intentsText = this.add.text(475, 128, "", { ...textStyle, fontSize: "14px", lineSpacing: 6, wordWrap: { width: 340 } }).setOrigin(0, 0);

    createPanel(this, 1060, 230, 300, 250, 0.92);
    createButton(this, 1060, 120, 180, 34, "Target Prev", () => {
      if (this.enemies.length === 0) {
        return;
      }
      this.selectedEnemy = (this.selectedEnemy - 1 + this.enemies.length) % this.enemies.length;
      this.refreshUi();
    });
    createButton(this, 1060, 160, 180, 34, "Target Next", () => {
      if (this.enemies.length === 0) {
        return;
      }
      this.selectedEnemy = (this.selectedEnemy + 1) % this.enemies.length;
      this.refreshUi();
    });
    createButton(this, 1060, 202, 180, 34, "Intent -10% (1PP)", () => {
      this.adjustEnemyIntent(-0.1);
    });
    createButton(this, 1060, 242, 180, 34, "Intent +10% (1PP)", () => {
      this.adjustEnemyIntent(0.1);
    });
    createButton(this, 1060, 286, 86, 30, "Hit-", () => {
      this.ppHitBoost = Math.max(0, this.ppHitBoost - 1);
      this.refreshUi();
    });
    createButton(this, 1154, 286, 86, 30, "Hit+", () => {
      this.ppHitBoost = Math.min(3, this.ppHitBoost + 1);
      this.refreshUi();
    });
    createButton(this, 1060, 332, 180, 38, "End Turn", () => {
      if (this.turn.phase !== "player") {
        return;
      }
      this.endPlayerTurn();
    });

    createPanel(this, 440, 578, 770, 185, 0.92);
    this.handText = this.add.text(70, 496, "", { ...textStyle, fontSize: "13px", lineSpacing: 7, wordWrap: { width: 725 } }).setOrigin(0, 0);
    this.handCardsLayer = this.add.container(0, 0);

    this.add.rectangle(1025, 578, 300, 185, palette.panelSoft, 0.98).setStrokeStyle(1, palette.line);
    this.cardPreviewText = this.add
      .text(885, 500, "Hover a card to inspect\nClick a card to play\nNumber keys (1..9) also work", {
        ...textStyle,
        fontSize: "12px",
        lineSpacing: 4,
        wordWrap: { width: 280 }
      })
      .setOrigin(0, 0);

    createPanel(this, 1025, 432, 300, 120, 0.92);
    this.logText = this.add.text(885, 378, "", { ...textStyle, fontSize: "12px", color: palette.subText, lineSpacing: 4, wordWrap: { width: 280 } }).setOrigin(0, 0);
  }

  private setupDebugOverlay(): void {
    const bg = this.add.rectangle(640, 90, 1180, 150, 0x090508, 0.92).setStrokeStyle(1, 0xff8f4a, 0.8);
    const text = this.add.text(70, 32, "", { ...textStyle, color: palette.scalar, fontSize: "12px", lineSpacing: 4, wordWrap: { width: 980 } }).setOrigin(0, 0);

    const forceWin = createButton(this, 1110, 48, 110, 28, "Force Win", () => {
      this.finishBattle(true);
    }, 0x2a1d16);
    const forceLose = createButton(this, 1110, 82, 110, 28, "Force Lose", () => {
      this.finishBattle(false);
    }, 0x2a1d16);
    const forceEnd = createButton(this, 1110, 116, 110, 28, "Force End", () => {
      this.endPlayerTurn();
    }, 0x2a1d16);

    this.debugPanel = this.add.container(0, 0, [bg, text, forceWin, forceLose, forceEnd]);
    this.debugPanel.setVisible(saveManager.getSettings().debugOverlayDefaultOn);
    this.debugText = text;
  }

  private refreshUi(): void {
    if (!this.summaryText || !this.enemiesText || !this.intentsText || !this.handText) {
      return;
    }

    const penalty = DetectionSystem.getPenalty(this.detection);
    setText(
      this.summaryText,
      [
        `Turn ${this.turn.turn} [${this.turn.phase}]`,
        `Scala HP ${this.scalarHp} Block ${this.scalarBlock} | Crystal HP ${this.crystalHp} Block ${this.crystalBlock}`,
        `AP ${this.ap} PP ${this.pp} (jam -${this.jamPenalty}) | Detection ${this.detection}`,
        `Detection effect: enemyHP x${penalty.enemyHpMultiplier.toFixed(2)} extraEnemy=${penalty.extraEnemy ? "Y" : "N"} trackerChance=${Math.round(
          penalty.trackerJoinChance * 100,
        )}%`,
        `Hit boost reserve: ${this.ppHitBoost} PP -> +${this.ppHitBoost * 10}%`
      ].join("\n"),
    );

    setText(
      this.enemiesText,
      this.enemies
        .map((enemy, index) => {
          const mark = index === this.selectedEnemy ? ">" : " ";
          return `${mark} ${enemy.name} (${enemy.archetype}) HP ${enemy.hp}/${enemy.maxHp} B ${enemy.block}`;
        })
        .join("\n"),
    );

    setText(
      this.intentsText,
      this.enemies
        .map((enemy, index) => {
          const mark = index === this.selectedEnemy ? "*" : " ";
          const intentLine = enemy.intentPool
            .map((intent) => `${intent.label} (${Math.round(intent.probability * 100)}%)`)
            .join(" / ");
          return `${mark} ${enemy.name}: ${intentLine}`;
        })
        .join("\n"),
    );

    setText(
      this.handText,
      "Card Hand",
    );

    this.renderHandCards();

    this.deck.hand.forEach((_, index) => {
      const key = `${index + 1}`;
      this.input.keyboard?.off(`keydown-${key}`);
      this.input.keyboard?.on(`keydown-${key}`, () => {
        this.playCardByIndex(index);
      });
    });

    if (this.cardPreviewText) {
      setText(this.cardPreviewText, "Hover a card to inspect\nClick a card to play\nNumber keys (1..9) also work");
    }

    this.refreshDebug();
  }

  private renderHandCards(): void {
    if (!this.handCardsLayer) {
      return;
    }

    this.handCardsLayer.removeAll(true);
    const startX = 70;
    const y = 520;
    const cardWidth = 130;
    const cardHeight = 150;
    const gap = 12;

    this.deck.hand.forEach((card, index) => {
      const x = startX + index * (cardWidth + gap);
      const playable = this.canPlay(card) && this.turn.phase === "player";
      const hit = Math.round(ProbabilitySystem.applyHitChanceBoost(card.baseHitChance, this.ppHitBoost) * 100);

      const bgColor = playable ? palette.panelSoft : 0x1c2432;
      const borderColor = card.owner === "crystal" ? 0x4df0d8 : 0xffb15c;
      const bg = this.add.rectangle(x, y, cardWidth, cardHeight, bgColor, playable ? 0.98 : 0.7).setOrigin(0, 0).setStrokeStyle(1, borderColor, 0.7);
      const label = this.add
        .text(
          x + 8,
          y + 8,
          [
            `${index + 1}. ${card.name}`,
            `AP ${card.costAP}  Hit ${hit}%`,
            `${card.keywords.join(", ") || "-"}`,
            card.description
          ].join("\n"),
          { ...textStyle, fontSize: "11px", wordWrap: { width: cardWidth - 14 }, lineSpacing: 3, color: playable ? palette.text : palette.subText },
        )
        .setOrigin(0, 0);

      this.handCardsLayer?.add([bg, label]);

      if (!playable) {
        return;
      }

      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => {
        bg.setFillStyle(0x263a55, 1);
        this.updateCardPreview(index, card, hit);
      });
      bg.on("pointerout", () => {
        bg.setFillStyle(bgColor, 0.98);
      });
      bg.on("pointerdown", () => {
        this.playCardByIndex(index);
      });
    });
  }

  private updateCardPreview(index: number, card: CardDefinition, hitChance: number): void {
    if (!this.cardPreviewText) {
      return;
    }

    const selectedEnemy = this.enemies[this.selectedEnemy];
    const lines = [
      `Card #${index + 1} // ${card.name}`,
      `Owner: ${card.owner}`,
      `Cost: AP ${card.costAP}`,
      `Current Hit Chance: ${hitChance}%`,
      `Keywords: ${card.keywords.join(", ") || "-"}`,
      `Target: ${selectedEnemy ? selectedEnemy.name : "none"}`,
      "",
      card.description,
    ];

    setText(this.cardPreviewText, lines.join("\n"));
  }

  private refreshDebug(): void {
    if (!this.debugText) {
      return;
    }
    const rngLog = this.rng
      .getLog()
      .slice(-6)
      .map((entry) => `${entry.index}.${entry.context}=${entry.value.toFixed(4)}`)
      .join(" | ");

    setText(
      this.debugText,
      [
        "Debug [~]",
        `seed=${this.rng.getSeed()} state=${this.rng.getState()} node=${this.nodeId} wave=${this.wave}/${this.maxWave}`,
        `AP=${this.ap} PP=${this.pp} Detection=${this.detection} turn=${this.turn.turn}/${this.turn.phase}`,
        `intents=${this.enemies
          .map((enemy) => `${enemy.id}[${enemy.intentPool.map((intent) => Math.round(intent.probability * 100)).join(",")}]`)
          .join(" ; ")}`,
        `rng: ${rngLog || "none"}`
      ].join("\n"),
    );
  }

  private startPlayerTurn(): void {
    const slot = gameSession.getSelectedSlot();
    this.ap = 3 + slot.baseAPUpgrade;
    const basePp = 5 + slot.basePPUpgrade;
    this.pp = Math.max(0, basePp - this.jamPenalty);
    this.jamPenalty = 0;
    this.ppHitBoost = 0;
    this.playedCardThisTurn = false;
    this.usedStealthOnlyThisTurn = true;
    this.scalarBlock = 0;
    this.crystalBlock = 0;
    this.deck.draw(5);
    this.pushLog(`Player turn ${this.turn.turn} started.`);
  }

  private endPlayerTurn(): void {
    if (this.turn.phase !== "player") {
      return;
    }

    if (this.playedCardThisTurn && this.usedStealthOnlyThisTurn) {
      this.detection = DetectionSystem.reduceByStealthTurn(this.detection);
      this.pushLog("Stealth-only turn: Detection -1.");
    }

    this.deck.discardHand();
    this.turn.nextPhase();
    this.enemyTurn();
  }

  private enemyTurn(): void {
    for (const enemy of this.enemies) {
      const resolved = EnemyIntentSystem.resolve(enemy, this.rng);
      const intent = resolved.intent;

      if (intent.type === "attack") {
        let damage = intent.value;
        if (enemy.archetype === "mirror" && enemy.mirroredHitBonus > 0) {
          damage += enemy.mirroredHitBonus;
          enemy.mirroredHitBonus = 0;
        }

        const targetCrystal = this.crystalHp > 0 && this.rng.nextFloat("enemy.target") < 0.35;
        if (targetCrystal) {
          const afterBlock = Math.max(0, damage - this.crystalBlock);
          this.crystalBlock = Math.max(0, this.crystalBlock - damage);
          this.crystalHp = Math.max(0, this.crystalHp - afterBlock);
          this.pushLog(`${enemy.name} hit Crystal for ${afterBlock}.`);
        } else {
          const afterBlock = Math.max(0, damage - this.scalarBlock);
          this.scalarBlock = Math.max(0, this.scalarBlock - damage);
          this.scalarHp = Math.max(0, this.scalarHp - afterBlock);
          this.pushLog(`${enemy.name} hit Scala for ${afterBlock}.`);
        }
      }

      if (intent.type === "defend") {
        enemy.block += intent.value;
        this.pushLog(`${enemy.name} gained ${intent.value} block.`);
      }

      if (intent.type === "debuff") {
        if (enemy.archetype === "detector") {
          this.detection = Math.min(4, this.detection + intent.value);
          this.pushLog(`${enemy.name} scan raised Detection by ${intent.value}.`);
        }
        if (enemy.archetype === "converger") {
          const attack = enemy.intentPool.find((entry) => entry.type === "attack");
          const other = enemy.intentPool.find((entry) => entry.id !== attack?.id);
          if (attack && other) {
            attack.probability = ProbabilitySystem.clampProbability(attack.probability + 0.1);
            other.probability = 1 - attack.probability;
          }
          this.pushLog(`${enemy.name} intent converged toward attack.`);
        }
        if (enemy.archetype === "mirror") {
          enemy.mirroredHitBonus += 2;
          this.pushLog(`${enemy.name} prepared mirror retaliation.`);
        }
      }
    }

    if (this.scalarHp <= 0) {
      this.finishBattle(false);
      return;
    }

    this.turn.nextPhase();
    this.startPlayerTurn();
    this.refreshUi();
  }

  private playCardByIndex(index: number): void {
    if (this.turn.phase !== "player" || this.battleDone) {
      return;
    }
    const card = this.deck.hand[index];
    if (!card || !this.canPlay(card)) {
      return;
    }

    const boostCost = this.ppHitBoost;
    if (boostCost > this.pp) {
      this.pushLog("Insufficient PP for selected hit boost.");
      return;
    }

    const hitChance = ProbabilitySystem.applyHitChanceBoost(card.baseHitChance, boostCost);
    const hitRoll = this.rng.nextFloat(`card.hit.${card.id}`);

    this.ap -= card.costAP;
    this.pp -= boostCost;
    this.playedCardThisTurn = true;

    const isStealth = card.keywords.includes("Stealth");
    if (!isStealth) {
      this.usedStealthOnlyThisTurn = false;
    }

    if (boostCost > 0) {
      this.detection = DetectionSystem.addByPP(this.detection, boostCost, isStealth);
      if (!isStealth) {
        this.pushWarmPulse();
      }
      if (this.enemies.some((enemy) => enemy.archetype === "converger")) {
        this.enemies.forEach((enemy) => {
          if (enemy.archetype === "converger") {
            const attack = enemy.intentPool.find((entry) => entry.type === "attack");
            const other = enemy.intentPool.find((entry) => entry.id !== attack?.id);
            if (attack && other) {
              attack.probability = ProbabilitySystem.clampProbability(attack.probability + 0.05);
              other.probability = 1 - attack.probability;
            }
          }
        });
      }
    }

    this.ppHitBoost = 0;
    if (hitRoll <= hitChance) {
      this.resolveCardEffects(card);
      this.pushLog(`${card.name} landed (${Math.round(hitChance * 100)}%).`);
    } else {
      this.pushLog(`${card.name} missed (${Math.round(hitChance * 100)}%).`);
    }

    this.deck.consumeCard(card);
    this.cleanupDefeatedEnemies();

    if (this.enemies.length === 0) {
      this.advanceWaveOrWin();
      return;
    }

    if (this.ap <= 0) {
      this.endPlayerTurn();
      return;
    }

    this.refreshUi();
  }

  private resolveCardEffects(card: CardDefinition): void {
    const enemy = this.enemies[this.selectedEnemy] ?? this.enemies[0];
    if (!enemy) {
      return;
    }

    if (card.keywords.includes("Overload")) {
      this.detection = Math.min(4, this.detection + 1);
      this.pushWarmPulse();
    }

    const linkActive = this.lastPlayedOwner !== null && this.lastPlayedOwner !== card.owner && this.crystalHp > 0;

    for (const effect of card.effects) {
      if (effect.type === "damage") {
        if (effect.target === "all-enemies") {
          this.enemies = this.enemies.map((item) => this.applyDamage(item, effect.value));
        } else {
          let bonus = 0;
          if (card.keywords.includes("Converge")) {
            if (this.convergeTargetId === enemy.id) {
              this.convergeStacks += 1;
            } else {
              this.convergeTargetId = enemy.id;
              this.convergeStacks = 1;
            }
            bonus += Math.max(0, this.convergeStacks - 1) * 3;
          }
          if (linkActive && card.keywords.includes("Link")) {
            bonus += 4;
          }
          const total = effect.value + bonus;
          this.applyDamage(enemy, total);
          this.pushLog(`${enemy.name} took ${total}.`);
        }
      }

      if (effect.type === "shield") {
        if (effect.target === "scalar") {
          this.scalarBlock += effect.value + (linkActive && card.keywords.includes("Link") ? 2 : 0);
        }
        if (effect.target === "crystal") {
          this.crystalBlock += effect.value;
        }
      }

      if (effect.type === "recoverCrystal") {
        this.crystalHp = Math.min(60, this.crystalHp + effect.value);
        this.pushLog(`Crystal restored by ${effect.value}.`);
      }

      if (effect.type === "intentShift") {
        if (effect.target === "all-enemies") {
          this.enemies = this.enemies.map((item) => ({
            ...item,
            intentPool: ProbabilitySystem.shiftAwayFromAttack(item.intentPool, effect.value),
          }));
        } else {
          enemy.intentPool = ProbabilitySystem.shiftAwayFromAttack(enemy.intentPool, effect.value);
        }
      }

      if (effect.type === "detectionDown") {
        this.detection = Math.max(0, this.detection - effect.value);
      }

      if (effect.type === "draw") {
        this.deck.draw(effect.value);
      }

      if (effect.type === "ppGain") {
        this.pp += effect.value;
      }
    }

    this.lastPlayedOwner = card.owner;
  }

  private applyDamage(enemy: EnemyRuntimeState, rawDamage: number): EnemyRuntimeState {
    let damage = rawDamage;
    if (enemy.block > 0) {
      const absorbed = Math.min(enemy.block, damage);
      enemy.block -= absorbed;
      damage -= absorbed;
    }
    enemy.hp = Math.max(0, enemy.hp - damage);
    return enemy;
  }

  private canPlay(card: CardDefinition): boolean {
    if (card.costAP > this.ap) {
      return false;
    }
    if (card.owner === "crystal" && card.id !== "crystal_patch" && this.crystalHp <= 0) {
      return false;
    }
    return true;
  }

  private adjustEnemyIntent(delta: number): void {
    if (this.turn.phase !== "player" || this.pp <= 0) {
      return;
    }
    const enemy = this.enemies[this.selectedEnemy] ?? this.enemies[0];
    if (!enemy) {
      return;
    }

    const attack = enemy.intentPool.find((intent) => intent.type === "attack");
    const secondary = enemy.intentPool.find((intent) => intent.id !== attack?.id);
    if (!attack || !secondary) {
      return;
    }

    const nextAttack = ProbabilitySystem.clampProbability(attack.probability + delta);
    const moved = Math.abs(nextAttack - attack.probability);
    attack.probability = nextAttack;
    secondary.probability = 1 - nextAttack;

    if (moved > 0) {
      this.pp -= 1;
      this.detection = DetectionSystem.addByPP(this.detection, 1, false);
      this.usedStealthOnlyThisTurn = false;
      this.pushWarmPulse();
      this.pushLog(`${enemy.name} intent shifted by ${Math.round(moved * 100)}%p.`);
      if (enemy.archetype === "converger") {
        attack.probability = ProbabilitySystem.clampProbability(attack.probability + 0.05);
        secondary.probability = 1 - attack.probability;
      }
    }

    this.refreshUi();
  }

  private cleanupDefeatedEnemies(): void {
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    if (this.selectedEnemy >= this.enemies.length) {
      this.selectedEnemy = Math.max(0, this.enemies.length - 1);
    }
  }

  private advanceWaveOrWin(): void {
    if (this.wave < this.maxWave) {
      this.wave += 1;
      this.enemies = this.buildWaveEnemies(this.wave, this.nodeType, this.detection);
      this.selectedEnemy = 0;
      this.turn.phase = "player";
      this.pushLog(`Wave ${this.wave}/${this.maxWave} started.`);
      this.startPlayerTurn();
      this.refreshUi();
      return;
    }
    this.finishBattle(true);
  }

  private finishBattle(victory: boolean): void {
    if (this.battleDone) {
      return;
    }
    this.battleDone = true;

    if (gameSession.run) {
      gameSession.run.scalarHp = this.scalarHp;
      gameSession.run.scalarBlock = this.scalarBlock;
      gameSession.run.crystalHp = this.crystalHp;
      gameSession.run.crystalBlock = this.crystalBlock;
      gameSession.run.detection = this.detection;
      gameSession.run.wave = this.wave;
    }

    const slotCards = gameSession.getCardCatalog();
    const rewardCardChoices = victory ? RewardSystem.pickCardChoices(slotCards, this.rng) : [];
    const creditReward = victory ? RewardSystem.creditReward(this.nodeType, this.rng) : 0;

    this.scene.start("ResultScene", {
      victory,
      nodeType: this.nodeType,
      rewardCardChoices,
      creditReward,
      storyFragmentFound: victory && this.nodeType === "event",
    });
  }

  private buildWaveEnemies(wave: number, nodeType: NodeType, detection: number): EnemyRuntimeState[] {
    const penalty = DetectionSystem.getPenalty(detection);
    const make = (id: string): EnemyRuntimeState | null => {
      const def = enemyCatalog.find((item) => item.id === id);
      if (!def) {
        return null;
      }
      return {
        id: `${def.id}-${wave}-${this.rng.nextInt(0, 999, "enemy.uid")}`,
        name: def.name,
        archetype: def.archetype,
        hp: Math.ceil(def.maxHp * penalty.enemyHpMultiplier),
        maxHp: Math.ceil(def.maxHp * penalty.enemyHpMultiplier),
        block: 0,
        convergeStacks: 0,
        mirroredHitBonus: 0,
        intentPool: def.intents.map((intent) => ({ ...intent })),
        intentPoolOverrides: {},
      };
    };

    const result: EnemyRuntimeState[] = [];
    const add = (id: string): void => {
      const enemy = make(id);
      if (enemy) {
        result.push(enemy);
      }
    };

    if (nodeType === "boss") {
      add("escape_gate");
      if (wave >= 2) add("pursuit_drone");
      if (wave >= 3) add("converger");
      if (wave >= 4) add("mirror");
    } else if (nodeType === "elite") {
      const elites = ["detector", "converger", "mirror"];
      add(elites[this.rng.nextInt(0, elites.length - 1, "elite.roll")] ?? "detector");
      add("pursuit_drone");
    } else {
      add("pursuit_drone");
      if (penalty.extraEnemy) {
        add("pursuit_drone");
      }
    }

    if (penalty.trackerJoinChance > 0 && this.rng.nextFloat("tracker.roll") <= penalty.trackerJoinChance) {
      add("detector");
    }

    return result;
  }

  private pushWarmPulse(): void {
    this.cameras.main.flash(60, 255, 140, 74, false);
  }

  private pushLog(message: string): void {
    if (!this.logText) {
      return;
    }
    const next = [message, ...this.logText.text.split("\n").filter(Boolean)].slice(0, 10);
    setText(this.logText, next.join("\n"));
  }

  private hashCode(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
