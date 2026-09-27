import { describe, expect, it } from "vitest";
import { adjustChild, adjustTotal, apportion, setPinned, spread, stepByBlock } from "../../src/ui/controls/spread";

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** A tiny seeded generator (deterministic property tests; no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("apportion", () => {
  it("splits by weight with largest remainder, ties to the earlier entry", () => {
    expect(apportion(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(apportion(200, [150, 150, 200, 0])).toEqual([60, 60, 80, 0]);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
    expect(apportion(10, [0, 0])).toEqual([0, 0]);
  });
  it("always sums to the amount when some weight is positive", () => {
    const rnd = lcg(7);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 6);
      const w = Array.from({ length: n }, () => Math.floor(rnd() * 1000));
      const a = Math.floor(rnd() * 10000);
      const out = apportion(a, w);
      if (w.some((x) => x > 0)) expect(out.reduce((x, y) => x + y, 0)).toBe(a);
      out.forEach((v, i) => {
        expect(Number.isInteger(v)).toBe(true);
        if (w[i] === 0) expect(v).toBe(0);
      });
    }
  });
});

describe("spread", () => {
  // draft.yaml: primitive_skills default 200 over flintknappers 200, potters 150, charcoal_burners 150.
  const kids = [
    { id: "flintknappers", weight: 200 },
    { id: "potters", weight: 150 },
    { id: "charcoal_burners", weight: 150 },
  ];
  it("spreads by size when nothing is pinned", () => {
    expect(spread(200, kids).values).toEqual({ flintknappers: 80, potters: 60, charcoal_burners: 60 });
  });
  it("keeps pins and reshares the rest", () => {
    const r = spread(200, [{ ...kids[0]!, pinned: 150 }, kids[1]!, kids[2]!]);
    expect(r.values).toEqual({ flintknappers: 150, potters: 25, charcoal_burners: 25 });
    expect(r.unassigned).toBe(0);
  });
  it("cuts pins that don't fit, in list order", () => {
    const r = spread(100, [{ ...kids[0]!, pinned: 80 }, { ...kids[1]!, pinned: 50 }, kids[2]!]);
    expect(r.values).toEqual({ flintknappers: 80, potters: 20, charcoal_burners: 0 });
    expect(r.clipped).toEqual(["potters"]);
  });
  it("reports what can't be placed when all are pinned", () => {
    const r = spread(300, kids.map((k) => ({ ...k, pinned: 50 })));
    expect(r.unassigned).toBe(150);
    expect(sum(r.values)).toBe(150);
  });
  it("property: totals are exact, pins survive when they fit", () => {
    const rnd = lcg(42);
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rnd() * 5);
      const total = Math.floor(rnd() * 5000);
      const cs = Array.from({ length: n }, (_, i) => ({
        id: `c${i}`,
        weight: 1 + Math.floor(rnd() * 500),
        pinned: rnd() < 0.4 ? Math.floor(rnd() * 800) : null,
      }));
      const r = spread(total, cs);
      expect(sum(r.values) + r.unassigned).toBe(total);
      const pinSum = cs.reduce((s, c) => s + (c.pinned ?? 0), 0);
      if (pinSum <= total) for (const c of cs) if (c.pinned !== null) expect(r.values[c.id]).toBe(c.pinned);
      if (cs.some((c) => c.pinned === null)) expect(r.unassigned).toBe(0);
    }
  });
});

describe("adjustChild / adjustTotal / setPinned", () => {
  const base = {
    total: 200,
    children: [
      { id: "a", weight: 200 },
      { id: "b", weight: 150 },
      { id: "c", weight: 150 },
    ],
  };
  it("a child edit pins it and the others absorb it; the parent total stays", () => {
    const s = adjustChild(base, "a", +100);
    expect(s.total).toBe(200);
    expect(s.children[0]!.pinned).toBe(180);
    expect(spread(s.total, s.children).values).toEqual({ a: 180, b: 10, c: 10 });
  });
  it("a child can't exceed what the other pins leave", () => {
    const s = adjustChild(adjustChild(base, "b", +40), "a", +1000);
    expect(spread(s.total, s.children).values).toEqual({ a: 100, b: 100, c: 0 });
  });
  it("when every child is pinned the parent total follows the pins, within limits", () => {
    const one = { total: 400, children: [{ id: "only", weight: 800 }] };
    expect(adjustChild(one, "only", +100).total).toBe(500);
    expect(adjustChild(one, "only", +100, { maxTotal: 450 }).total).toBe(450);
    expect(adjustChild(one, "only", -1000).total).toBe(0);
  });
  it("a pin survives a parent change (draft: topic pin survives a category change)", () => {
    const pinned = adjustChild(base, "a", +20); // a = 100 pinned
    const up = adjustTotal(pinned, +300);
    expect(up.total).toBe(500);
    expect(spread(up.total, up.children).values).toEqual({ a: 100, b: 200, c: 200 });
    const down = adjustTotal(up, -1000);
    expect(down.total).toBe(100); // never below the pins while something is unpinned
  });
  it("unpinning returns the child to the spread", () => {
    const s = setPinned(adjustChild(base, "a", +100), "a", false);
    expect(spread(s.total, s.children).values).toEqual({ a: 80, b: 60, c: 60 });
    const p = setPinned(base, "b", true);
    expect(p.children[1]!.pinned).toBe(60);
  });
  it("adjustTotal respects maxTotal", () => {
    expect(adjustTotal(base, +10000, { maxTotal: 1000 }).total).toBe(1000);
  });
});

describe("stepByBlock", () => {
  it("snaps to the block before stepping", () => {
    expect(stepByBlock(5030, 1, 100)).toBe(5100);
    expect(stepByBlock(5030, -1, 100)).toBe(5000);
    expect(stepByBlock(5000, 1, 100)).toBe(5100);
    expect(stepByBlock(5000, -2, 100)).toBe(4800);
    expect(stepByBlock(50, -1, 100)).toBe(0);
    expect(stepByBlock(5000, 0, 100)).toBe(5000);
  });
});
