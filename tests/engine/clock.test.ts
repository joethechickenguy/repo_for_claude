// The clock: 1x/5x/20x, starts paused, stops itself when a system asks.
import { describe, expect, it } from "vitest";
import { Clock, Engine, type PauseEvent, type Scheduler } from "../../src/engine";
import { stage1Content } from "./fixtures/stage1";

describe("clock", () => {
  it("starts paused and runs one day per real second at 1x, 5 at 5x, 20 at 20x", () => {
    const e = new Engine(stage1Content());
    const c = new Clock(e);
    expect(c.isPaused).toBe(true);
    expect(c.advance(5000)).toHaveLength(0);
    c.resume();
    expect(c.advance(999)).toHaveLength(0);
    expect(c.advance(1)).toHaveLength(1);
    c.setSpeed(5);
    expect(c.advance(1000)).toHaveLength(5);
    c.setSpeed(20);
    expect(c.advance(1000)).toHaveLength(20);
    expect(e.day).toBe(26);
    expect(() => c.setSpeed(3 as never)).toThrow();
  });

  it("auto-pauses after the tick where a system asks, with its reasons", () => {
    const e = new Engine(stage1Content());
    e.addSystem({
      id: "reveal",
      tick: (ctx) => {
        if (ctx.day === 6) ctx.pause({ kind: "node_revealed", subject: "digging_sticks" });
      },
    });
    const c = new Clock(e);
    const events: PauseEvent[] = [];
    c.onPause((ev) => events.push(ev));
    c.setSpeed(20);
    c.resume();
    const ran = c.advance(1000);
    expect(ran).toHaveLength(7);
    expect(c.isPaused).toBe(true);
    expect(events).toEqual([{ byPlayer: false, reasons: [{ kind: "node_revealed", subject: "digging_sticks" }], day: 7 }]);
    c.resume();
    expect(c.advance(1000)).toHaveLength(20);
  });

  it("player pause emits once; a long gap runs a bounded number of ticks", () => {
    const e = new Engine(stage1Content());
    const c = new Clock(e);
    const events: PauseEvent[] = [];
    c.onPause((ev) => events.push(ev));
    c.setSpeed(20);
    c.resume();
    expect(c.advance(3_600_000).length).toBeLessThanOrEqual(60);
    c.pause();
    c.pause();
    expect(events).toHaveLength(1);
    expect(events[0]!.byPlayer).toBe(true);
  });

  it("drives itself from a scheduler", () => {
    let now = 0;
    let fire: (() => void) | null = null;
    const sched: Scheduler = {
      now: () => now,
      every: (_ms, fn) => {
        fire = fn;
        return () => (fire = null);
      },
    };
    const e = new Engine(stage1Content());
    const c = new Clock(e);
    c.start(sched);
    c.resume();
    for (let i = 0; i < 10; i++) {
      now += 250;
      fire!();
    }
    expect(e.day).toBe(2);
    c.stop();
    expect(fire).toBeNull();
  });
});
