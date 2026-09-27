// Real-time driver: one tick per real second at 1x, two at 2x, one every two seconds at 0.5x. The
// game never stops: when a system flags something for the player (a red bar, a finished project, a
// new node; `ctx.pause` in the engine's terms), the clock drops to DECISION_SPEED and keeps running.
// The engine itself never reads the wall clock; the clock only decides how many ticks to run.
import type { Engine } from "./engine";
import { CLOCK_SPEEDS, DECISION_SPEED } from "./params";
import type { PauseReason, TickReport } from "./types";

export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

/** Something needs the player: the reasons a tick gave, and the speed the clock dropped from. */
export interface DecisionEvent {
  reasons: PauseReason[];
  day: number;
  fromSpeed: ClockSpeed;
}

export type DecisionListener = (e: DecisionEvent) => void;

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
  /** A run opens slow, like any other moment that needs the player. */
  private speedValue: ClockSpeed = DECISION_SPEED;
  private carryMs = 0;
  private lastNow: number | null = null;
  private stopTimer: (() => void) | null = null;
  private readonly decisionListeners: DecisionListener[] = [];

  constructor(private readonly engine: Engine) {}

  get speed(): ClockSpeed {
    return this.speedValue;
  }

  setSpeed(speed: ClockSpeed): void {
    if (!CLOCK_SPEEDS.includes(speed)) throw new Error(`speed must be one of ${CLOCK_SPEEDS.join(", ")}`);
    this.speedValue = speed;
  }

  onDecision(listener: DecisionListener): () => void {
    this.decisionListeners.push(listener);
    return () => {
      const i = this.decisionListeners.indexOf(listener);
      if (i >= 0) this.decisionListeners.splice(i, 1);
    };
  }

  /**
   * Feed `realMs` of elapsed real time; runs the ticks it pays for at the current speed. When a tick
   * carries pause reasons, drops to DECISION_SPEED, tells the listeners, and drops the leftover time
   * (it was paid for at the old speed). Returns the reports of the ticks it ran.
   */
  advance(realMs: number): TickReport[] {
    const out: TickReport[] = [];
    if (realMs <= 0) return out;
    this.carryMs += realMs;
    while (this.carryMs >= MS_PER_DAY_AT_1X / this.speedValue && out.length < MAX_TICKS_PER_ADVANCE) {
      this.carryMs -= MS_PER_DAY_AT_1X / this.speedValue;
      const r = this.engine.tick();
      out.push(r);
      if (r.pauseReasons.length > 0) {
        const fromSpeed = this.speedValue;
        this.speedValue = DECISION_SPEED;
        this.carryMs = 0;
        this.emit({ reasons: [...r.pauseReasons], day: this.engine.day, fromSpeed });
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

  /** Stop driving (leaving the run: New run, unmount). Not a player control; the game has no pause. */
  stop(): void {
    this.stopTimer?.();
    this.stopTimer = null;
    this.lastNow = null;
  }

  private emit(e: DecisionEvent): void {
    for (const l of [...this.decisionListeners]) l(e);
  }
}
