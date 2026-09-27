import { describe, expect, it } from "vitest";
import { compileTree } from "../src/content/compile";
import * as exprLib from "../src/content/expr";
import { initialState, tree } from "../src/content";
import { loadRaw } from "./content-raw";

describe("compiled tree", () => {
  it("compiles the YAML without errors and matches tree.json", () => {
    const { tree: fresh, errors } = compileTree(loadRaw(), exprLib);
    expect(errors).toEqual([]);
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(tree);
  });

  it("has six stages in order, each with a gate node", () => {
    expect(tree.stages.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of tree.stages) {
      expect(tree.nodes[s.gate.id]?.kind).toBe("gate");
      for (const id of s.nodes) expect(tree.nodes[id]?.stage).toBe(s.stage);
    }
    expect(tree.nodeOrder.length).toBe(Object.keys(tree.nodes).length);
  });

  it("types every state variable with a default of the right shape", () => {
    const state = initialState(tree);
    for (const v of Object.values(tree.stateVariables)) {
      const d = state[v.id];
      if (v.type === "flag") expect(typeof d).toBe("boolean");
      if (v.type === "number" || v.type === "count") expect(typeof d).toBe("number");
      if (v.type === "enum") expect(v.values).toContain(d);
      if (v.type === "set") expect(typeof d).toBe("object");
    }
    expect(state.engine_type).toBe("none");
  });

  it("merges workshop extensions in stage order", () => {
    const furnace = tree.workshops.furnace_workshop!;
    expect(furnace.opensWith).toBe("crucibles_blowpipes");
    expect(furnace.dials.slice(0, 2).map((d) => d.id)).toEqual(["air_supply", "fuel_ratio"]);
    const stages = furnace.dials.map((d) => d.stage);
    expect([...stages].sort((a, b) => a - b)).toEqual(stages);
    expect(new Set(stages).size).toBeGreaterThan(1);
    for (const w of Object.values(tree.workshops)) for (const d of w.dials) expect(tree.nodes[d.addedBy]).toBeDefined();
  });

  it("turns gate numeric keys into conditions", () => {
    const g = tree.stages[0]!.gate;
    expect(g.condition.map((c) => c.text)).toEqual(["energy_w_per_person >= 250", "metal_tools >= 5000", "tool_wear >= 0"]);
  });

  it("lists jobs with producers and starting jobs", () => {
    expect(tree.jobs.gather_wood?.startingInStage).toBe(1);
    expect(tree.jobs.gather_wood?.produces).toContain("wood_kg");
    expect(tree.jobs.burn_charcoal?.unlockedBy).toEqual(["charcoal_clamps"]);
    expect(tree.jobs.burn_charcoal?.rateNote).toMatch(/charcoal per worker-day/);
    for (const r of Object.values(tree.resources)) expect(tree.jobs[r.producedBy]).toBeDefined();
  });

  it("resolves enum writes from the node id and leaves choices to the engine", () => {
    const w = (id: string) => tree.nodes[id]!.writesState;
    expect(w("watt_engine").find((x) => x.variable === "engine_type")?.value).toBe("watt");
    expect(w("high_pressure_engine").find((x) => x.variable === "engine_type")?.value).toBe("high_pressure");
    expect(w("deposit_choice").find((x) => x.variable === "iron_ore_phosphorus")?.value).toBeNull();
    expect(w("crucibles_blowpipes").find((x) => x.variable === "has_copper")?.value).toBe(true);
    expect(w("stone_molds").find((x) => x.variable === "metal_tools")?.value).toBeNull();
  });

  it("parses red_when when it is an expression and leaves prose to package F", () => {
    const p = (stage: number, id: string) => tree.stages[stage - 1]!.pressures.find((x) => x.id === id)!;
    expect(p(1, "ore_outcrop").redWhen.expr).toEqual({ kind: "cmp", ref: "malachite_left_kg", op: "<", value: 20000 });
    expect(p(1, "wood_distance").redWhen.expr).toEqual({ kind: "cmp", ref: "forest_cover", op: "<", value: 70 });
    expect(p(1, "tool_wear").redWhen).toEqual({ text: "tools < tool users", expr: null });
    expect(p(2, "fuel_balance").redWhen.expr).toBeNull();
    expect(p(2, "fuel_balance").heartbeat).toBe(true);
    expect(p(2, "tool_wear").heartbeat).toBe(false);
  });

  it("reads the optional default, writes_values and without_pages_labor fields", () => {
    const raw = loadRaw();
    raw.stateVariables.variables.iron_quality.default = 3;
    const roast = raw.stages[0]!.data.nodes.find((n: { id: string }) => n.id === "ore_roasting");
    roast.writes_values = { ore_type: "sulfide" };
    const kiln = raw.stages[0]!.data.nodes.find((n: { id: string }) => n.id === "pit_kiln");
    kiln.without_pages_labor = 2;
    const { tree: t, errors, warnings } = compileTree(raw, exprLib);
    expect(errors).toEqual([]);
    expect(t.stateVariables.iron_quality!.default).toBe(3);
    expect(t.nodes.ore_roasting!.writesState.find((w) => w.variable === "ore_type")?.value).toBe("sulfide");
    expect(warnings.some((w) => w.startsWith("ore_roasting: writes enum"))).toBe(false);
    expect(t.nodes.pit_kiln!.withoutPagesLaborFactor).toBe(2);

    const bad = loadRaw();
    bad.stateVariables.variables.engine_type.default = "diesel";
    bad.stages[0]!.data.nodes.find((n: { id: string }) => n.id === "pit_kiln").requires.state = ["clay_kg >"];
    const r = compileTree(bad, exprLib);
    expect(r.errors.some((e) => e.includes("engine_type default"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("pit_kiln: cannot parse"))).toBe(true);
  });

  it("lists the names conditions read, and which the engine must supply", () => {
    expect(tree.identifiers.wood_kg).toBe("resource");
    expect(tree.identifiers.tool_wear).toBe("state");
    expect(tree.identifiers.energy_w_per_person).toBe("undeclared");
  });
});
