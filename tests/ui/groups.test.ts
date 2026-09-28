// Supply groups (owner playtest 2026-09-27: "over 20 labor controls in Stage 4; put people on Fuel,
// not on gathering wood and burning charcoal"). From Stage 2 on, Stage 1's jobs fold into one row per
// group; the player sets people per group and the game splits them by what's used.
import { beforeAll, describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import type { SaveGame } from "../../src/engine";
import type { TreeRow } from "../../src/ui/controls/peopleTree";
import { Game, GROUPS_LOG } from "../../src/ui/shellGame";
import { GROUP_REBALANCE_DAYS, splitByWeight } from "../../src/ui/shellGroups";
import { playRun } from "../play/bot";
import { STAGE1, STAGE2, STAGE3, STAGE4, STAGE5, STAGE6 } from "../play/plans";

const PLANS = { 1: STAGE1, 2: STAGE2, 3: STAGE3, 4: STAGE4, 5: STAGE5, 6: STAGE6 };
const row = (g: Game, id: string): TreeRow | undefined => g.peopleRows().find((r) => r.id === id);
const staffed = (g: Game): number => g.engine.unlockedJobs().reduce((s, j) => s + g.engine.manual(j.id), 0);

describe("splitByWeight", () => {
  it("gives out exactly n people, in proportion, ties to the earlier id", () => {
    expect(splitByWeight(10, ["a", "b"], { a: 3, b: 1 })).toEqual({ a: 8, b: 2 }); // 7.5 / 2.5
    expect(splitByWeight(3, ["a", "b"], { a: 1, b: 1 })).toEqual({ a: 2, b: 1 });
    expect(splitByWeight(5, ["a", "b"], {})).toEqual({ a: 3, b: 2 });
    const big = splitByWeight(1003, ["a", "b", "c"], { a: 0.2, b: 0.3, c: 0.5 });
    expect(big.a! + big.b! + big.c!).toBe(1003);
  });
});

describe("supply groups", () => {
  let stage2: SaveGame;
  beforeAll(() => {
    stage2 = playRun(PLANS, 1, 10 * 365).game.engine.save();
  }, 120_000);

  it("Stage 1 has none: every job is its own row", () => {
    const g = new Game(tree);
    for (let d = 0; d < 30; d++) g.step();
    expect(g.peopleRows().some((r) => r.id.startsWith("group:"))).toBe(false);
  });

  it("at Stage 2, Stage 1's jobs fold into groups with their crews; Stage 2's jobs stay rows", () => {
    const g = new Game(tree, { save: stage2 });
    const before = staffed(g);
    g.step();
    expect(g.stage).toBe(2);
    const fuel = row(g, "group:fuel")!;
    expect(fuel.name).toBe("Fuel");
    expect(fuel.children!.map((c) => c.id)).toEqual(expect.arrayContaining(["gather_wood", "burn_charcoal"]));
    expect(row(g, "gather_wood")).toBeUndefined();
    expect(row(g, "build")).toBeDefined();
    // Nobody lost or gained at the fold.
    expect(staffed(g)).toBe(before);
    expect(g.logLines().some((l) => l.kind === GROUPS_LOG && l.text.includes("Fuel"))).toBe(true);
  });

  it("± on a group moves its people; it works as many as it needs and the rest are spare", () => {
    const g = new Game(tree, { save: stage2 });
    g.step();
    const was = row(g, "group:fuel")!.value;
    g.adjust(["build"], -500);
    g.adjust(["group:fuel"], 300);
    expect(row(g, "group:fuel")!.value).toBe(was + 300);
    const kids = row(g, "group:fuel")!.children!;
    const working = kids.reduce((s, k) => s + k.value, 0);
    expect(working).toBe(Math.min(was + 300, g.groups.needPeople("fuel")));
    // Unpinned jobs are the game's (muted), not the player's.
    expect(kids.every((k) => k.tone === "auto" || k.tone === "short")).toBe(true);
  });

  it("a job changed by hand inside a group is pinned there and the group grows with it", () => {
    const g = new Game(tree, { save: stage2 });
    g.step();
    g.adjust(["build"], -500);
    const was = row(g, "group:fuel")!.value;
    const wood = g.engine.manual("gather_wood");
    g.adjust(["group:fuel", "gather_wood"], 100);
    expect(g.engine.manual("gather_wood")).toBe(wood + 100);
    expect(row(g, "group:fuel")!.value).toBe(was + 100);
    for (let d = 0; d < 2 * GROUP_REBALANCE_DAYS; d++) g.step();
    expect(g.engine.manual("gather_wood")).toBe(wood + 100);
    const kid = row(g, "group:fuel")!.children!.find((k) => k.id === "gather_wood")!;
    expect(kid.pinned).toBe(true);
    g.setPinned(["group:fuel", "gather_wood"], false);
    expect(g.groups.pinned("gather_wood")).toBeUndefined();
  });

  it("from empty stores, groups staffed to what they say they need rebuild them and keep the furnaces supplied", () => {
    const g = new Game(tree, { save: stage2 });
    g.step();
    // The bot's colony is hugely overstocked; start from nothing so the split has to work.
    for (const r of ["wood_kg", "charcoal_kg", "clay_kg", "pots", "ore_kg", "copper_kg"]) g.engine.spend({ [r]: g.engine.stock(r) });
    let shortDays = 0;
    for (let d = 0; d < 365; d++) {
      // A player who tops up any group that says it's short, from the builders.
      for (const r of g.peopleRows().filter((x) => x.id.startsWith("group:"))) {
        const need = g.groups.needPeople(r.id.slice("group:".length));
        if (need > r.value) {
          const add = Math.min(need - r.value, row(g, "build")!.value);
          g.adjust(["build"], -add);
          g.adjust([r.id], add);
        }
      }
      g.step();
      const grouped = new Set(g.groups.groups(g.engine).flatMap((x) => x.jobs));
      const jobs = g.engine.report!.jobs;
      if (d > 90 && Object.entries(jobs).some(([id, j]) => j.people > 0 && j.fraction < 0.9 && j.limitedBy && j.limitedBy !== "pull" && [...grouped].some((m) => (g.engine.jobDef(m)?.outputs?.[j.limitedBy!] ?? 0) > 0) && id)) shortDays++;
    }
    expect(shortDays).toBeLessThan(15);
  });

  it("Stores fold earlier materials into one line and bring one back when it runs short", () => {
    const g = new Game(tree, { save: stage2 });
    for (let d = 0; d < 3; d++) g.step();
    const earlier = g.earlierStores().map((r) => r.id);
    expect(earlier.length).toBeGreaterThan(0);
    expect(g.stores().map((r) => r.id)).not.toEqual(expect.arrayContaining(earlier));
    // Stage 2's own materials (iron ore, bloom) are never folded.
    expect(earlier).not.toContain("iron_ore_kg");
    // Nobody on building materials, and the pots store empty while the smelters want pots: it comes back.
    expect(g.engine.report!.requested.pots ?? 0).toBeGreaterThan(0);
    g.adjust(["group:building"], -row(g, "group:building")!.value);
    g.engine.spend({ pots: g.engine.stock("pots") });
    g.step();
    expect(g.stores().map((r) => r.id)).toContain("pots");
    expect(g.earlierStores().map((r) => r.id)).not.toContain("pots");
  });

  it("groups survive save and load", () => {
    const g = new Game(tree, { save: stage2 });
    g.step();
    g.adjust(["build"], -300);
    g.adjust(["group:fuel", "burn_charcoal"], 200);
    const h = new Game(tree, { save: g.engine.save() });
    expect(h.groups.pinned("burn_charcoal")).toBe(g.groups.pinned("burn_charcoal"));
    expect(h.groups.people("fuel")).toBe(g.groups.people("fuel"));
  });
});
