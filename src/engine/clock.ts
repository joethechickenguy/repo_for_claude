// Real-time driver: one tick per real second at 1x, 5 at 5x, 20 at 20x. Stops on its own when a
// system asks for a pause (a red bar, a finished project, a new node). The engine itself never reads
// the wall clock; the clock only decides how many ticks to run.
import type { Engine } from "./engine";
import { CLOCK_SPEEDS } from "./params";
import type { PauseReason, TickReport } from "./types";

export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

/** Why the clock stopped: the player pressed pause, or systems gave reasons. */
export interface PauseEvent {
  byPlayer: boolean;
  reasons: PauseReason[];
  day: number;
}

export type PauseListener = (e: PauseEvent) => void;

/** A timer the clock can run on; `setInterval` in the browser, a fake in tests. */
export interface Scheduler {
  now(): number;
  every(ms: number, fn: () => void): () => void;
}

/** Real ms per tick at 1x (DESIGN.md: one second is one in-game day). */
const MS_PER_DAY_AT_1X = 1000;

/** Ticks per advance() at most, so a backgrounded tab doesn't run a year on return. */
const MAX_TICKS_PER_ADVANCE = 60;

/** Frame interval for the default scheduler (ms). */
const FRAME_MS = 50;

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  every: (ms, fn) => {
    const h = setInterval(fn, ms);
    return () => clearInterval(h);
  },
};

export class Clock {
  private speedValue: ClockSpeed = CLOCK_SPEEDS[0];
  private paused = true;
  private carryMs = 0;
  private lastNow: number | null = null;
  private stopTimer: (() => void) | null = null;
  private readonly pauseListeners: PauseListener[] = [];

  constructor(private readonly engine: Engine) {}

  get speed(): ClockSpeed {
    return this.speedValue;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setSpeed(speed: ClockSpeed): void {
    if (!CLOCK_SPEEDS.includes(speed)) throw new Error(`speed must be one of ${CLOCK_SPEEDS.join(", ")}`);
    this.speedValue = speed;
  }

  resume(): void {
    this.paused = false;
    this.carryMs = 0;
  }

  /** Player pause. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.carryMs = 0;
    this.emit({ byPlayer: true, reasons: [], day: this.engine.day });
  }

  onPause(listener: PauseListener): () => void {
    this.pauseListeners.push(listener);
    return () => {
      const i = this.pauseListeners.indexOf(listener);
      if (i >= 0) this.pauseListeners.splice(i, 1);
    };
  }

  /**
   * Feed `realMs` of elapsed real time; runs the ticks it pays for at the current speed. Stops early
   * (and pauses) when a tick carries pause reasons. Returns the reports of the ticks it ran.
   */
  advance(realMs: number): TickReport[] {
    const out: TickReport[] = [];
    if (this.paused || realMs <= 0) return out;
    const msPerTick = MS_PER_DAY_AT_1X / this.speedValue;
    this.carryMs += realMs;
    while (this.carryMs >= msPerTick && out.length < MAX_TICKS_PER_ADVANCE) {
      this.carryMs -= msPerTick;
      const r = this.engine.tick();
      out.push(r);
      if (r.pauseReasons.length > 0) {
        this.paused = true;
        this.carryMs = 0;
        this.emit({ byPlayer: false, reasons: [...r.pauseReasons], day: this.engine.day });
        break;
      }
    }
    if (out.length >= MAX_TICKS_PER_ADVANCE) this.carryMs = 0;
    return out;
  }

  /** Drive advance() from a scheduler (default: setInterval). */
  start(scheduler: Scheduler = browserScheduler): void {
    this.stop();
    this.lastNow = scheduler.now();
    this.stopTimer = scheduler.every(FRAME_MS, () => {
      const now = scheduler.now();
      const elapsed = now - (this.lastNow ?? now);
      this.lastNow = now;
      this.advance(elapsed);
    });
  }

  stop(): void {
    this.stopTimer?.();
    this.stopTimer = null;
    this.lastNow = null;
  }

  private emit(e: PauseEvent): void {
    for (const l of [...this.pauseListeners]) l(e);
  }
}
