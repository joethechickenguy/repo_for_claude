// Node visibility, affordability, building, milestones and writes_state against a stub state,
// plus a headless Stage 1 run by scripted choices. The stub stands in for package A's engine:
// "production" is scripted by adding stock and setting the metrics the conditions read.

import { describe, expect, it } from "vitest";
import {
  advanceBuild,
  advanceBuilds,
  availableDials,
  availableJobs,
  checkRequires,
  currentStage,
  effectiveLabor,
  emptyBook,
  gateStatus,
  initialState,
  isAffordable,
  missingResources,
  nodeStatus,
  openWorkshops,
  pagesTier,
  revealNodes,
  stageOpen,
  startBuild,
  stateAssignments,
  tree,
  visibleNodes,
  type BuildEvent,
  type NodeBook,
  type StateValue,
  type StateView,
} from "../src/content";

class StubWorld {
  vars: Record<string, StateValue> = initialState(tree);
  /** Engine metrics that conditions name without declaring (tree.identifiers "undeclared"). */
  metrics: Record<string, number | boolean> = {};
  stock: Record<string, number> = {};
  book: NodeBook = emptyBook();
  log: BuildEvent[] = [];
  view: StateView = {
    get: (n) => (n in this.vars ? this.vars[n] : this.metrics[n]),
    stock: (r) => this.stock[r] ?? 0,
  };

  add(r: Record<string, number>) {
    for (const [k, v] of Object.entries(r)) this.stock[k] = (this.stock[k] ?? 0) + v;
  }
  reveal(): string[] {
    const r = revealNodes(tree, this.view, this.book);
    this.book = r.book;
    return r.revealed;
  }
  apply(events: BuildEvent[]) {
    for (const e of events) {
      this.log.push(e);
      if (e.type === "complete") Object.assign(this.vars, stateAssignments(tree, e.node));
    }
  }
  start(id: string) {
    const r = startBuild(tree, id, this.view, this.book);
    if (!r.ok) throw new Error(`cannot start ${id}: ${r.reason} ${JSON.stringify(r.missing)}`);
    for (const [k, v] of Object.entries(r.consume)) this.stock[k] = (this.stock[k] ?? 0) - v;
    this.book = r.book;
    this.apply(r.events);
  }
  /** Run days of Build labor until `id` completes; returns days taken. */
  buildUntilDone(id: string, builders: number): number {
    let days = 0;
    while (nodeStatus(tree, id, this.view, this.book) !== "complete") {
      const r = advanceBuilds(tree, this.book, builders);
      this.book = r.book;
      this.apply(r.events);
      if (++days > 100000) throw new Error(`${id} never completes`);
    }
    return days;
  }
}

const FULL_PAGES = { primitive_technology: 1, metallurgy_1: 1, survey_copper_tin: 1 };

describe("node logic", () => {
  it("starts with Stage 1 open, its starting jobs, and nothing complete", () => {
    const w = new StubWorld();
    expect(stageOpen(tree, 1, w.book)).toBe(true);
    expect(stageOpen(tree, 2, w.book)).toBe(false);
    expect(currentStage(tree, w.book)).toBe(1);
    expect(availableJobs(tree, w.book)).toEqual(["gather_wood", "knap_flint", "build"]);
    expect(openWorkshops(tree, w.book)).toEqual([]);
  });

  it("shows a node only when its state condition holds, then keeps it revealed", () => {
    const w = new StubWorld();
    expect(nodeStatus(tree, "digging_sticks", w.view, w.book)).toBe("hidden");
    expect(checkRequires(tree, "digging_sticks", w.view, w.book).failedState.map((c) => c.text)).toEqual(["wood_kg > 300"]);
    w.add({ wood_kg: 400 });
    expect(w.reveal()).toContain("digging_sticks");
    w.stock.wood_kg = 0; // condition lapses
    expect(nodeStatus(tree, "digging_sticks", w.view, w.book)).toBe("available");
    expect(w.reveal()).toEqual([]);
  });

  it("never shows a later stage's node before the previous gate", () => {
    const w = new StubWorld();
    const s2 = tree.stages[1]!;
    for (const id of s2.nodes) expect(nodeStatus(tree, id, w.view, w.book), id).toBe("hidden");
  });

  it("checks affordability against stock and reports the shortfall", () => {
    const w = new StubWorld();
    w.add({ wood_kg: 400 });
    expect(isAffordable(tree, "digging_sticks", w.view)).toBe(false);
    expect(missingResources(tree, "digging_sticks", w.view)).toEqual({ wood_kg: 600 });
    const r = startBuild(tree, "digging_sticks", w.view, w.book);
    expect(r).toEqual({ ok: false, reason: "unaffordable", missing: { wood_kg: 600 } });
    expect(startBuild(tree, "pit_kiln", w.view, w.book)).toMatchObject({ ok: false, reason: "hidden" });
  });

  it("scales labor by page coverage only when the without-pages route is 'Nx labor'", () => {
    const w = new StubWorld();
    expect(pagesTier(tree, "digging_sticks", w.view)).toBe("absent");
    expect(effectiveLabor(tree, "digging_sticks", w.view)).toBe(120000 * 1.5);
    expect(effectiveLabor(tree, "pit_kiln", w.view)).toBe(400000); // different route, not slower
    w.vars.bundles_taken = { primitive_technology: 0.6 };
    expect(pagesTier(tree, "digging_sticks", w.view)).toBe("partial");
    expect(effectiveLabor(tree, "digging_sticks", w.view)).toBe(120000);
    w.vars.bundles_taken = { primitive_technology: 1 };
    expect(pagesTier(tree, "digging_sticks", w.view)).toBe("known");
    // category coverage is the topics' coverage weighted by `full`
    w.vars.bundles_taken = { survey_copper_tin: 1, survey_iron_coal: 1, survey_minerals: 0, survey_oil_hydro: 0 };
    expect(pagesTier(tree, "gate_reliable_smelting", w.view)).toBe("known"); // no bundle
  });

  it("fires milestones at their fractions and completes with writes, jobs and workshops", () => {
    const w = new StubWorld();
    w.vars.bundles_taken = FULL_PAGES;
    const book: NodeBook = { completed: [], building: { trail_green_stones: { laborDone: 0, laborTotal: 1000, milestonesFired: [] } }, revealed: [] };
    let r = advanceBuild(tree, book, "trail_green_stones", 399);
    expect(r.events).toEqual([]);
    r = advanceBuild(tree, r.book, "trail_green_stones", 1);
    expect(r.events.map((e) => e.type === "milestone" && e.milestone.id)).toEqual(["native_copper_find"]);
    r = advanceBuild(tree, r.book, "trail_green_stones", 10000);
    expect(r.used).toBe(600);
    expect(r.events.map((e) => (e.type === "milestone" ? e.milestone.id : e.type))).toEqual(["sledges", "complete"]);
    expect(r.book.completed).toEqual(["trail_green_stones"]);
    expect(r.book.building).toEqual({});
    expect(stateAssignments(tree, "trail_green_stones")).toEqual({ has_copper_ore: true });
    const done = advanceBuild(tree, { completed: [], building: { crucibles_blowpipes: { laborDone: 0, laborTotal: 1, milestonesFired: [] } }, revealed: [] }, "crucibles_blowpipes", 1);
    expect(done.events.at(-1)).toMatchObject({ type: "complete", jobs: ["smelt_copper"], opensWorkshop: "furnace_workshop" });
  });

  it("splits Build labor evenly and passes a finished build's share on", () => {
    const book: NodeBook = {
      completed: [],
      building: {
        digging_sticks: { laborDone: 0, laborTotal: 100, milestonesFired: [] },
        ground_stone_axes: { laborDone: 0, laborTotal: 1000, milestonesFired: [] },
      },
      revealed: [],
    };
    const r = advanceBuilds(tree, book, 400);
    expect(r.book.completed).toEqual(["digging_sticks"]);
    expect(r.book.building.ground_stone_axes?.laborDone).toBe(300);
    expect(r.unused).toBe(0);
    expect(advanceBuilds(tree, emptyBook(), 50).unused).toBe(50);
  });

  it("re-checks a gate's conditions at start even when revealed", () => {
    const book: NodeBook = { completed: ["stone_molds", "pot_bellows"], building: {}, revealed: ["gate_reliable_smelting"] };
    const w = new StubWorld();
    w.book = book;
    expect(startBuild(tree, "gate_reliable_smelting", w.view, w.book)).toMatchObject({ ok: false, reason: "hidden" });
  });
});

describe("headless Stage 1 by scripted choices (stub state; tests/loader-engine.test.ts runs it on the engine)", () => {
  it("reaches the gate via the bellows route and opens Stage 2", () => {
    const w = new StubWorld();
    w.vars.bundles_taken = FULL_PAGES;
    const BUILDERS = 5000; // person-days of Build per day in this script
    let days = 0;

    // Beat 1: gather wood, fire-harden digging sticks
    w.add({ wood_kg: 1500 });
    expect(w.reveal()).toEqual(expect.arrayContaining(["digging_sticks"]));
    w.start("digging_sticks");
    days += w.buildUntilDone("digging_sticks", BUILDERS);
    expect(availableJobs(tree, w.book)).toContain("dig_clay");

    // Beat 2: pit kiln
    w.add({ clay_kg: 4500, wood_kg: 5000 });
    expect(w.reveal()).toContain("pit_kiln");
    w.start("pit_kiln");
    days += w.buildUntilDone("pit_kiln", BUILDERS);

    // Beat 3: charcoal
    w.add({ wood_kg: 20000, clay_kg: 30000 });
    expect(w.reveal()).toContain("charcoal_clamps");
    w.start("charcoal_clamps");
    days += w.buildUntilDone("charcoal_clamps", BUILDERS);

    // Beat 4: the trail, with two milestones on the way
    w.add({ blades: 3000 });
    w.reveal();
    w.start("trail_green_stones");
    days += w.buildUntilDone("trail_green_stones", BUILDERS);
    expect(w.log.filter((e) => e.type === "milestone").map((e) => e.type === "milestone" && e.milestone.id)).toEqual(["native_copper_find", "sledges"]);
    expect(w.vars.has_copper_ore).toBe(true);
    w.vars.malachite_left_kg = 60000; // simulation-owned write: the outcrop's size

    // Beat 5: crucibles open the furnace workshop
    expect(nodeStatus(tree, "crucibles_blowpipes", w.view, w.book)).toBe("hidden");
    w.add({ ore_kg: 200 }); // a resources.yaml stock since D declared it (open question 26)
    w.add({ pots: 400, charcoal_kg: 2000 });
    expect(w.reveal()).toContain("crucibles_blowpipes");
    w.start("crucibles_blowpipes");
    days += w.buildUntilDone("crucibles_blowpipes", BUILDERS);
    expect(openWorkshops(tree, w.book)).toEqual(["furnace_workshop"]);
    expect(availableDials(tree, "furnace_workshop", w.book)).toEqual(["air_supply", "fuel_ratio"]);
    expect(w.vars.has_copper).toBe(true);
    expect(nodeStatus(tree, "ore_roasting", w.view, w.book)).toBe("hidden"); // outcrop not yet low

    // Beat 6: stone molds
    w.add({ copper_kg: 250 });
    expect(w.reveal()).toContain("stone_molds");
    w.start("stone_molds");
    days += w.buildUntilDone("stone_molds", BUILDERS);

    // Beat 7: after five campaigns, both forced-draft options appear; choose bellows
    w.metrics.campaigns_run = 6;
    expect(w.reveal()).toEqual(expect.arrayContaining(["wind_furnaces", "pot_bellows"]));
    w.add({ pots: 300, wood_kg: 5000 });
    w.start("pot_bellows");
    days += w.buildUntilDone("pot_bellows", BUILDERS);
    expect(w.vars.has_bellows).toBe(true);

    // Beat 8: the gate lists what's unmet until tools and watts arrive
    expect(gateStatus(tree, 1, w.view).unmet.map((c) => c.text)).toEqual(["energy_w_per_person >= 250", "metal_tools >= 5000"]);
    expect(startBuild(tree, "gate_reliable_smelting", w.view, w.book)).toMatchObject({ ok: false });
    w.vars.metal_tools = 5000;
    w.metrics.energy_w_per_person = 260;
    expect(gateStatus(tree, 1, w.view)).toEqual({ met: true, unmet: [] });
    expect(w.reveal()).toContain("gate_reliable_smelting");
    w.start("gate_reliable_smelting"); // no labor: completes at once

    expect(stageOpen(tree, 2, w.book)).toBe(true);
    expect(currentStage(tree, w.book)).toBe(2);
    expect(visibleNodes(tree, w.view, w.book, 2).length).toBeGreaterThan(0);
    expect(w.book.completed).toEqual([
      "digging_sticks",
      "pit_kiln",
      "charcoal_clamps",
      "trail_green_stones",
      "crucibles_blowpipes",
      "stone_molds",
      "pot_bellows",
      "gate_reliable_smelting",
    ]);
    // 6,120,000 person-days of Stage 1 projects at 5,000 builders is ~1,224 days (~3.4 years)
    expect(days).toBe(Math.ceil(120000 / BUILDERS) + 80 + 120 + 240 + 160 + 200 + 180);
  });
});
