import cards from "../data/cards.json";
import type { MetaSaveSlot, RuntimeSettings, SaveData } from "./types";

const STORAGE_KEY = "scalar.save.v1";

const defaultDeck = [
  "strike_scalar",
  "strike_scalar",
  "strike_scalar",
  "guard_scalar",
  "precision_spike",
  "scatter_noise",
  "compute_ping",
  "crystal_patch",
  "link_drive"
];

const allCardIds = (cards as { id: string }[]).map((card) => card.id);

const createDefaultSlot = (id: number, name: string): MetaSaveSlot => ({
  id,
  name,
  unlockedCardIds: [...allCardIds],
  deckCardIds: [...defaultDeck],
  stationCredits: 3,
  baseAPUpgrade: 0,
  basePPUpgrade: 0,
  storyLogsUnlocked: 1,
  bestDetectionRecord: 0
});

const defaultSettings: RuntimeSettings = {
  musicVolume: 0.7,
  sfxVolume: 0.7,
  reducedMotion: false,
  debugOverlayDefaultOn: false
};

const createDefaultData = (): SaveData => ({
  version: 1,
  slots: [createDefaultSlot(0, "Slot 1"), createDefaultSlot(1, "Slot 2"), createDefaultSlot(2, "Slot 3")],
  settings: defaultSettings
});

export class SaveManager {
  public load(): SaveData {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = createDefaultData();
      this.save(defaults);
      return defaults;
    }

    try {
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed.version !== 1 || !Array.isArray(parsed.slots) || !parsed.settings) {
        throw new Error("save format mismatch");
      }
      return parsed;
    } catch {
      const defaults = createDefaultData();
      this.save(defaults);
      return defaults;
    }
  }

  public save(data: SaveData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  public getSlots(): MetaSaveSlot[] {
    return this.load().slots;
  }

  public saveSlots(slots: MetaSaveSlot[]): void {
    const data = this.load();
    this.save({
      ...data,
      slots
    });
  }

  public getSettings(): RuntimeSettings {
    return this.load().settings;
  }

  public saveSettings(settings: RuntimeSettings): void {
    const data = this.load();
    this.save({
      ...data,
      settings
    });
  }

  public updateSlot(slot: MetaSaveSlot): void {
    const data = this.load();
    const nextSlots = data.slots.map((existing) => {
      if (existing.id !== slot.id) {
        return existing;
      }
      return {
        ...slot,
        updatedAt: Date.now()
      };
    });

    this.save({
      ...data,
      slots: nextSlots
    });
  }

  public renameSlot(slotId: number, name: string): void {
    const data = this.load();
    const slot = data.slots.find((item) => item.id === slotId);
    if (slot) {
      this.updateSlot({ ...slot, name: name.trim() || slot.name });
    }
  }

  public resetSlot(slotId: number): void {
    const data = this.load();
    const slotIndex = data.slots.findIndex((slot) => slot.id === slotId);
    if (slotIndex !== -1) {
      const name = data.slots[slotIndex]?.name ?? `Slot ${slotId + 1}`;
      data.slots[slotIndex] = createDefaultSlot(slotId, name);
      this.save(data);
    }
  }
}

export const saveManager = new SaveManager();
