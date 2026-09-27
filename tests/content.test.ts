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
});
