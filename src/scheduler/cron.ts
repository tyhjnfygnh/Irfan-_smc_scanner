import { getConfig } from '../config/env';
import { runScanCycle } from '../scanner/scanCycle';
import { ScanCycleResult, SchedulerState } from '../scanner/types';

class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;
  private lastCycleAt: Date | null = null;
  private nextCycleAt: Date | null = null;
  private lastCycleResult: ScanCycleResult | null = null;
  private lastCycleError: string | null = null;
  private readonly intervalMs: number;

  constructor() {
    const cfg = getConfig();
    const seconds = Math.max(10, cfg.scanner.intervalSeconds);
    this.intervalMs = seconds * 1000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  pause(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextCycleAt = null;
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  async triggerNow(): Promise<ScanCycleResult | null> {
    return this.runCycle();
  }

  getState(): SchedulerState {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: this.nextCycleAt,
      lastCycleResult: this.lastCycleResult,
      lastCycleError: this.lastCycleError,
    };
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.nextCycleAt = new Date(Date.now() + this.intervalMs);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.onTick();
    }, this.intervalMs);
  }

  private async onTick(): Promise<void> {
    await this.runCycle();
    if (this.running) this.scheduleNext();
  }

  private async runCycle(): Promise<ScanCycleResult | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.lastCycleAt = new Date();
    try {
      const result = await runScanCycle();
      this.lastCycleResult = result;
      this.lastCycleError = null;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastCycleError = message;
      return null;
    } finally {
      this.inFlight = false;
    }
  }
}

export const scheduler = new Scheduler();
