// State store, jobs, tools, spoilage, training and the hooks package B uses.
import { describe, expect, it } from "vitest";
import { Engine, EngineError, StateError, StateStore, type TickContext } from "../../src/engine";
import { stage1Content, STAGE1_JOBS, STAGE1_STATE_VARS } from "./fixtures/stage1";

const fresh = (params = {}) => new Engine(stage1Content({ params }));

describe("state store", () => {
  it("starts every declared variable at its default", () => {
    const e = fresh();
    expect(e.state.getFlag("has_copper")).toBe(false);
    expect(e.state.getNumber("metal_tools")).toBe(0);
    expect(e.state.getEnum("labor_tier")).toBe("people");
    expect(e.state.getEnum("engine_type")).toBe("none");
    expect(e.state.getSet("bundles_taken")).toEqual([]);
  });

  it("uses a declared initial value", () => {
    const vars = STAGE1_STATE_VARS.map((v) => (v.id === "forest_cover" ? { ...v, initial: 100 } : v));
    expect(new Engine(stage1Content({ stateVars: vars })).state.getNumber("forest_cover")).toBe(100);
  });

  it("rejects undeclared variables and wrong types", () => {
    const e = fresh();
    expect(() => e.state.set("not_a_var", 1)).toThrow(StateError);
    expect(() => e.state.set("has_copper", 1)).toThrow(StateError);
    expect(() => e.state.set("engine_type", "diesel")).toThrow(StateError);
    expect(() => e.state.set("metal_tools", -1)).toThrow(StateError);
    expect(() => e.state.set("forest_cover", Number.NaN)).toThrow(StateError);
    expect(() => e.state.set("bundles_taken", { a: "x" } as never)).toThrow(StateError);
    expect(() => e.state.getFlag("metal_tools")).toThrow(StateError);
  });

  it("handles list and map sets", () => {
    const store = new StateStore(STAGE1_STATE_VARS, StateStore.initialValues(STAGE1_STATE_VARS));
    store.addMember("bundles_taken", "survey_copper_tin");
    store.addMember("bundles_taken", "survey_copper_tin");
    expect(store.getSet("bundles_taken")).toEqual(["survey_copper_tin"]);
    expect(store.hasMember("bundles_taken", "survey_copper_tin")).toBe(true);
    store.removeMember("bundles_taken", "survey_copper_tin");
    store.addMember("bundles_taken", "metallurgy_1", 0.6);
    expect(store.getSet("bundles_taken")).toEqual({ metallurgy_1: 0.6 });
    store.addMember("bundles_taken", "survey_copper_tin");
    expect(store.getSet("bundles_taken")).toEqual({ metallurgy_1: 0.6, survey_copper_tin: 1 });
  });

  it("counts never go below zero when added to", () => {
    const e = fresh();
    e.state.add("metal_tools", -5);
    expect(e.state.getNumber("metal_tools")).toBe(0);
  });
});

describe("StateView and writes_state (package B hooks)", () => {
  it("get answers declared state and metrics; stock answers resources", () => {
    const e = fresh();
    e.setMetric("energy_w_per_person", 180);
    expect(e.get("labor_tier")).toBe("people");
    expect(e.get("energy_w_per_person")).toBe(180);
    expect(e.get("nothing_here")).toBeUndefined();
    e.addStock("wood_kg", 300);
    expect(e.stock("wood_kg")).toBe(300);
  });

  it("applyWrites sets values and skips simulation-owned entries", () => {
    const e = fresh();
    const written = e.applyWrites([
      { variable: "has_copper", value: true },
      { variable: "metal_tools", value: null },
      { variable: "labor_tier", value: "works" },
    ]);
    expect(written).toEqual(["has_copper", "labor_tier"]);
    expect(e.state.getFlag("has_copper")).toBe(true);
    expect(e.laborTier()).toBe("works");
    expect(() => e.applyWrites([{ variable: "undeclared", value: true }])).toThrow(StateError);
  });

  it("spend is all-or-nothing", () => {
    const e = fresh();
    e.addStock("wood_kg", 1000);
    e.addStock("clay_kg", 10);
    expect(e.canAfford({ wood_kg: 500, clay_kg: 20 })).toBe(false);
    expect(e.spend({ wood_kg: 500, clay_kg: 20 })).toBe(false);
    expect(e.stock("wood_kg")).toBe(1000);
    expect(e.spend({ wood_kg: 500, clay_kg: 10 })).toBe(true);
    expect(e.stock("wood_kg")).toBe(500);
    expect(e.stock("clay_kg")).toBe(0);
    expect(() => e.spend({ gold_kg: 1 })).toThrow(EngineError);
  });

  it("systems take Build labor per tick; what nobody takes is lost", () => {
    const e = fresh();
    e.addStock("blades", 10000);
    e.assign("build", 1000);
    const taken: number[] = [];
    e.addSystem({
      id: "p",
      tick: (ctx: TickContext) => {
        expect(ctx.laborAvailable("build")).toBe(1000);
        taken.push(ctx.takeLabor("build", 300));
        taken.push(ctx.takeLabor("build", 5000));
        expect(ctx.laborAvailable("build")).toBe(0);
      },
    });
    const r = e.tick();
    expect(taken).toEqual([300, 700]);
    expect(r.labor.build).toBe(1000);
    expect(r.laborUsed.build).toBe(1000);
    e.tick();
    expect(e.report!.labor.build).toBe(1000); // 9,950 blades still cover 1,000 builders
  });

  it("jobs must be unlocked before people are assigned", () => {
    const e = fresh();
    expect(() => e.assign("dig_clay", 10)).toThrow(EngineError);
    e.unlockJob("dig_clay");
    expect(e.assign("dig_clay", 10)).toBe(10);
    expect(() => e.unlockJob("fly")).toThrow(EngineError);
  });

  it("manual assignments never exceed the population", () => {
    const e = fresh();
    expect(e.assign("gather_wood", 7000)).toBe(7000);
    expect(e.assign("knap_flint", 7000)).toBe(3000);
    expect(e.idle()).toBe(0);
    expect(e.assign("gather_wood", 0)).toBe(0);
    expect(e.idle()).toBe(7000);
  });
});

describe("tools", () => {
  it("workers without tools run at the bare-hand fraction", () => {
    const e = fresh();
    e.assign("gather_wood", 100);
    const r = e.tick();
    expect(r.toolCoverage).toBe(0);
    expect(r.toolEfficiency).toBe(0.25);
    expect(r.produced.wood_kg).toBe(100 * 40 * 0.25);
  });

  it("coverage scales efficiency; non-tool jobs are unaffected", () => {
    const e = fresh();
    e.addStock("blades", 50);
    e.assign("gather_wood", 100);
    e.assign("knap_flint", 10);
    const r = e.tick();
    expect(r.toolCoverage).toBe(0.5);
    expect(r.toolEfficiency).toBeCloseTo(0.25 + 0.75 * 0.5);
    expect(r.produced.blades).toBe(30);
  });

  it("users take the longest-lived tools first and wear 1/life per user-day", () => {
    const e = fresh();
    e.addStock("blades", 1000);
    e.addStock("copper_tools", 60);
    e.assign("gather_wood", 100);
    const r = e.tick();
    expect(r.worn.copper_tools).toBeCloseTo(60 / 200);
    expect(r.worn.blades).toBeCloseTo(40 / 20);
    expect(e.state.getNumber("metal_tools")).toBeCloseTo(60 - 0.3);
    expect(e.state.getNumber("tool_wear")).toBeCloseTo((1000 - 2 + 60 - 0.3) / 100);
  });

  it("a toolLife modifier stretches wear, and can reorder which tool is used first", () => {
    const e = fresh();
    e.addStock("blades", 100);
    e.addStock("copper_tools", 100);
    e.setModifier("toolLife", "blades", "magic_flint", 20); // 400 worker-days, beats copper's 200
    e.assign("gather_wood", 100);
    const r = e.tick();
    expect(r.worn.blades).toBeCloseTo(100 / 400);
    expect(r.worn.copper_tools ?? 0).toBe(0);
  });

  it("tool_wear is 1 when nobody uses a tool", () => {
    const e = fresh();
    e.assign("knap_flint", 10);
    e.tick();
    expect(e.state.getNumber("tool_wear")).toBe(1);
  });
});

describe("production", () => {
  it("a job short of an input runs at the fraction it can supply", () => {
    const e = fresh({ defaultSpoilPerDay: 0 });
    for (const j of STAGE1_JOBS) e.unlockJob(j.id);
    e.addStock("wood_kg", 500);
    e.assign("burn_charcoal", 10); // wants 1,000 kg wood
    const r = e.tick();
    expect(r.jobs.burn_charcoal).toMatchObject({ fraction: 0.5, limitedBy: "wood_kg" });
    expect(r.produced.charcoal_kg).toBe(100);
    expect(e.stock("wood_kg")).toBe(0);
    expect(r.requested.wood_kg).toBe(1000);
  });

  it("rate modifiers scale inputs and outputs; yield modifiers scale outputs", () => {
    const e = fresh({ defaultSpoilPerDay: 0 });
    for (const j of STAGE1_JOBS) e.unlockJob(j.id);
    e.addStock("wood_kg", 1e6);
    e.assign("burn_charcoal", 10);
    e.setModifier("rate", "burn_charcoal", "a", 2);
    e.setModifier("yield", "burn_charcoal", "b", 1.5);
    const r = e.tick();
    expect(r.consumed.wood_kg).toBe(2000);
    expect(r.produced.charcoal_kg).toBe(600);
    e.setModifier("rate", "burn_charcoal", "a", null);
    expect(e.modifier("rate", "burn_charcoal")).toBe(1);
    e.setModifier("rate", "*", "red_bar", 0.5);
    expect(e.modifier("rate", "burn_charcoal")).toBe(0.5);
  });

  it("burned fuel is reported for energy accounting", () => {
    const e = fresh({ defaultSpoilPerDay: 0 });
    for (const j of STAGE1_JOBS) e.unlockJob(j.id);
    e.addStock("wood_kg", 1e6);
    e.addStock("clay_kg", 1e6);
    e.assign("fire_pottery", 10);
    const r = e.tick();
    expect(r.burned.wood_kg).toBe(240);
    expect(r.produced.pots).toBe(20);
  });

  it("jobs_active and year are kept in state", () => {
    const e = fresh();
    e.assign("gather_wood", 1);
    e.assign("knap_flint", 1);
    e.run(365);
    expect(e.state.getNumber("jobs_active")).toBe(2);
    expect(e.state.getNumber("year")).toBe(1);
  });
});

describe("spoilage", () => {
  it("only wood, charcoal and clay spoil", () => {
    const e = fresh({ defaultSpoilPerDay: 0.01 });
    for (const r of ["wood_kg", "charcoal_kg", "clay_kg", "blades", "pots", "copper_kg"]) e.addStock(r, 1000);
    const rep = e.tick();
    expect(e.stock("wood_kg")).toBeCloseTo(990);
    expect(e.stock("charcoal_kg")).toBeCloseTo(990);
    expect(e.stock("clay_kg")).toBeCloseTo(990);
    expect(e.stock("blades")).toBe(1000);
    expect(e.stock("pots")).toBe(1000);
    expect(e.stock("copper_kg")).toBe(1000);
    expect(Object.keys(rep.spoiled).sort()).toEqual(["charcoal_kg", "clay_kg", "wood_kg"]);
  });

  it("a resource's own rate overrides the default", () => {
    const content = stage1Content();
    content.resources = content.resources.map((r) => (r.id === "clay_kg" ? { ...r, spoilPerDay: 0.1 } : r));
    const e = new Engine(content);
    e.addStock("clay_kg", 1000);
    e.addStock("wood_kg", 1000);
    e.tick();
    expect(e.stock("clay_kg")).toBeCloseTo(900);
    expect(e.stock("wood_kg")).toBeCloseTo(1000 * (1 - 0.001));
  });
});

describe("training", () => {
  it("idle person-days become trained people in the chosen trade", () => {
    const e = fresh();
    e.assign("gather_wood", 9000); // 1,000 idle
    e.setTrainingTrade("machinists_trained");
    e.run(365);
    // 1,000 idle x 365 days / 365 person-days per person
    expect(e.state.getNumber("machinists_trained")).toBe(1000);
    expect(e.state.getNumber("trained_smiths")).toBe(0);
  });

  it("no trade chosen: nobody trains", () => {
    const e = fresh();
    e.run(100);
    expect(e.state.getNumber("machinists_trained")).toBe(0);
  });

  it("a training modifier (teachers) speeds it up; trained never exceeds the population", () => {
    const e = fresh();
    e.setTrainingTrade("trained_smiths");
    e.setModifier("training", "trained_smiths", "teachers", 2);
    const r = e.tick();
    expect(r.trained.trained_smiths).toBe(Math.floor((10000 * 2) / 365));
    e.run(2000);
    expect(e.state.getNumber("trained_smiths")).toBe(10000);
  });

  it("refuses a trade that isn't listed", () => {
    expect(() => fresh().setTrainingTrade("has_copper")).toThrow(EngineError);
  });
});

describe("content checks", () => {
  it("rejects jobs that name unknown resources and unknown starting jobs", () => {
    expect(() => new Engine(stage1Content({ jobs: [{ id: "x", outputs: { gold_kg: 1 } }], startingJobs: [] }))).toThrow(
      /unknown resource/,
    );
    expect(() => new Engine(stage1Content({ startingJobs: ["nope"] }))).toThrow(/starting job/);
  });
});
