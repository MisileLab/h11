interface RNGLogEntry {
  index?: number;
  label: string;
  value: number;
}

const MAX_LOG_SIZE = 40;

export class SeededRNG {
  private state: number;

  private readonly seed: number;

  private readonly logs: RNGLogEntry[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next(label = "next"): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.pushLog(label, value);
    return value;
  }

  nextFloat(label = "nextFloat"): number {
    return this.next(label);
  }

  int(min: number, max: number, label = "int"): number {
    const value = Math.floor(this.next(label) * (max - min + 1)) + min;
    return value;
  }

  nextInt(min: number, max: number, label = "nextInt"): number {
    return this.int(min, max, label);
  }

  pick<T>(values: T[], label = "pick"): T {
    const index = this.int(0, values.length - 1, label);
    return values[index] as T;
  }

  pickOne<T>(values: T[], label = "pickOne"): T {
    return this.pick(values, label);
  }

  getLogs(): RNGLogEntry[] {
    return this.logs.map((entry, index) => ({ ...entry, index: index + 1 }));
  }

  getLog(): Array<{ index: number; context: string; value: number }> {
    return this.logs.map((entry, index) => ({ index: index + 1, context: entry.label, value: entry.value }));
  }

  getSeed(): number {
    return this.seed;
  }

  getState(): number {
    return this.state;
  }

  private pushLog(label: string, value: number): void {
    this.logs.push({ label, value });
    if (this.logs.length > MAX_LOG_SIZE) {
      this.logs.shift();
    }
  }
}

export const createSeedFromNow = (): number => Date.now() & 0xffffffff;
