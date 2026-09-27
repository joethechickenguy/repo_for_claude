// The labor tiers on real content (DESIGN.md, Labor): foremen switch the colony to works, each works
// joins as its job unlocks with a first target of what that job's crew made, so production holds
// through the switch; targets move by a step scaled to them; departments group the works.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../src/content";
import { Game, worksStep } from "../../src/ui/shellGame";

const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });

function ironColony(): Game {
  const g = new Game(tree);
  setBook(g, ["gate_steam"]);
  const e = g.engine;
  for (const j of ["mine_iron_ore", "mine_coal", "coke_coal", "run_coke_furnace", "quarry_stone", "burn_lime", "forge_iron_tools"]) e.unlockJob(j);
  for (const [r, n] of Object.entries({ iron_tools: 5000, coke_kg: 50000, coal_kg: 100000, iron_ore_kg: 50000, lime_kg: 5000, stone_kg: 20000 })) e.addStock(r, n);
  for (const [j, n] of Object.entries({ mine_iron_ore: 400, mine_coal: 300, coke_coal: 150, run_coke_furnace: 150, quarry_stone: 50, burn_lime: 30, gather_wood: 2000 })) e.assign(j, n);
  return g;
}

describe("works and departments tiers", () => {
  it("every works names jobs with rates, and its primary job makes its output", () => {
    for (const w of tree.works ?? []) {
      expect(tree.jobs[w.primaryJob]?.rates?.outputs?.[w.output], w.id).toBeGreaterThan(0);
      for (const j of w.supportJobs) expect(tree.jobs[j]?.rates, `${w.id}: ${j}`).toBeDefined();
      if (w.department) expect(tree.departments!.map((d) => d.id)).toContain(w.department);
    }
  });

  it("foremen switch to works; the works join with their crews' output as targets, and iron keeps coming", () => {
    const g = ironColony();
    for (let d = 0; d < 5; d++) g.step();
    const before = g.engine.report!.produced["iron_kg"] ?? 0;
    expect(before).toBeGreaterThan(0);
    // Foremen complete: their writes set the tier.
    g.engine.applyWrites(tree.nodes.foremen!.writesState);
    expect(g.engine.laborTier()).toBe("works");
    g.step();
    const ids = g.engine.works().map((w) => w.def.id);
    expect(ids).toContain("ironworks");
    expect(ids).toContain("coal_mine");
    const iron = g.engine.works().find((w) => w.def.id === "ironworks")!;
    expect(typeof iron.target).toBe("number");
    for (let d = 0; d < 10; d++) g.step();
    const after = g.engine.report!.produced["iron_kg"] ?? 0;
    expect(after).toBeGreaterThan(before * 0.8);
    // The people panel shows works rows with their crews.
    const row = g.peopleRows().find((r) => r.id === "ironworks")!;
    expect(row.children!.map((c) => c.id)).toContain("run_coke_furnace");
  });

  it("± on a works target moves by a step scaled to it", () => {
    expect(worksStep(4500)).toBe(1000);
    expect(worksStep(90)).toBe(10);
    expect(worksStep(0)).toBe(1);
    const g = ironColony();
    g.step();
    g.engine.applyWrites(tree.nodes.foremen!.writesState);
    g.step();
    const t0 = g.engine.works().find((w) => w.def.id === "ironworks")!.target as number;
    g.adjust(["ironworks"], 1);
    expect(g.engine.works().find((w) => w.def.id === "ironworks")!.target).toBe(t0 + worksStep(t0));
  });

  it("departments group the works under their priorities", () => {
    const g = ironColony();
    g.step();
    g.engine.applyWrites(tree.nodes.foremen!.writesState);
    g.step();
    g.engine.applyWrites(tree.nodes.departments!.writesState);
    expect(g.engine.laborTier()).toBe("departments");
    const rows = g.peopleRows();
    const metals = rows.find((r) => r.id === "metals")!;
    expect(metals.children!.map((c) => c.id)).toContain("ironworks");
    expect(g.engine.departmentPriority("propulsion")).toBe(5);
  });
});
