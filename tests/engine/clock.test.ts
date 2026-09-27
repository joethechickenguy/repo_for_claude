// The clock: 0.5x/1x/2x, never stops; a decision drops it to 0.5x and it keeps running.
import { describe, expect, it } from "vitest";
import { CLOCK_SPEEDS, Clock, DECISION_SPEED, Engine, type DecisionEvent, type Scheduler } from "../../src/engine";
import { stage1Content } from "./fixtures/stage1";

describe("clock", () => {
  it("offers only 0.5x, 1x and 2x, and opens at the decision speed", () => {
    expect([...CLOCK_SPEEDS]).toEqual([0.5, 1, 2]);
    expect(DECISION_SPEED).toBe(0.5);
    const c = new Clock(new Engine(stage1Content()));
    expect(c.speed).toBe(0.5);
    expect(() => c.setSpeed(5 as never)).toThrow();
    expect(() => c.setSpeed(20 as never)).toThrow();
  });

  it("runs one day every two seconds at 0.5x, one a second at 1x, two a second at 2x", () => {
    const e = new Engine(stage1Content());
    const c = new Clock(e);
    expect(c.advance(1999)).toHaveLength(0);
    expect(c.advance(1)).toHaveLength(1);
    c.setSpeed(1);
    expect(c.advance(999)).toHaveLength(0);
    expect(c.advance(1)).toHaveLength(1);
    c.setSpeed(2);
    expect(c.advance(1000)).toHaveLength(2);
    expect(e.day).toBe(4);
  });

  it("a decision drops the clock to 0.5x and it keeps running", () => {
    const e = new Engine(stage1Content());
    e.addSystem({
      id: "reveal",
      tick: (ctx) => {
        if (ctx.day === 6) ctx.pause({ kind: "node_revealed", subject: "digging_sticks" });
      },
    });
    const c = new Clock(e);
    const events: DecisionEvent[] = [];
    c.onDecision((ev) => events.push(ev));
    c.setSpeed(2);
    // 10 s at 2x would be 20 days; the decision on day 7 cuts the call short.
    expect(c.advance(10_000)).toHaveLength(7);
    expect(c.speed).toBe(0.5);
    expect(events).toEqual([{ reasons: [{ kind: "node_revealed", subject: "digging_sticks" }], day: 7, fromSpeed: 2 }]);
    // Never stopped: the next 2 s run one more day at 0.5x.
    expect(c.advance(2000)).toHaveLength(1);
    expect(e.day).toBe(8);
  });

  it("a long gap runs a bounded number of ticks", () => {
    const c = new Clock(new Engine(stage1Content()));
    c.setSpeed(2);
    expect(c.advance(3_600_000).length).toBeLessThanOrEqual(60);
  });

  it("drives itself from a scheduler with no resume needed", () => {
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
    c.setSpeed(1);
    c.start(sched);
    for (let i = 0; i < 10; i++) {
      now += 250;
      fire!();
    }
    expect(e.day).toBe(2);
    c.stop();
    expect(fire).toBeNull();
  });
});
