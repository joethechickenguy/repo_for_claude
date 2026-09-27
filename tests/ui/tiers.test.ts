// The people panel's rows at the works and departments tiers: the same recursive control, with works
// under departments and jobs under works; ± on a works moves its target, ± on a job pins it.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { Game, WORKS_TARGET_STEP } from "../../src/ui/shellGame";

function worksGame(): Game {
  const g = new Game(tree);
  for (const j of ["dig_clay", "fire_pottery"]) g.engine.unlockJob(j);
  g.engine.addWorks({ id: "kiln_1", name: "Kiln 1", output: "pots", primaryJob: "fire_pottery", supportJobs: ["dig_clay"], department: "ceramics" }, 10);
  g.engine.setLaborTier("works");
  return g;
}

describe("people rows at higher tiers", () => {
  it("works tier: a works row with its jobs; ± moves the target, a job ± pins it", () => {
    const g = worksGame();
    const rows = g.peopleRows();
    const kiln = rows.find((r) => r.id === "kiln_1")!;
    expect(kiln.children!.map((c) => c.id)).toEqual(["fire_pottery", "dig_clay"]);
    expect(kiln.value).toBe(kiln.children!.reduce((s, c) => s + c.value, 0));
    expect(kiln.value).toBeGreaterThan(0);
    g.adjust(["kiln_1"], 1);
    expect(g.engine.works()[0]!.target).toBe(10 + WORKS_TARGET_STEP);
    g.adjust(["kiln_1", "dig_clay"], 100);
    const pinned = g.peopleRows().find((r) => r.id === "kiln_1")!.children!.find((c) => c.id === "dig_clay")!;
    expect(pinned.pinned).toBe(true);
    g.setPinned(["kiln_1", "dig_clay"], false);
    expect(g.engine.pins()).toEqual({});
    // Jobs outside any works stay flat rows.
    expect(rows.map((r) => r.id)).toContain("gather_wood");
  });

  it("departments tier: departments hold works; ± moves the priority", () => {
    const g = worksGame();
    g.engine.setLaborTier("departments");
    const dept = g.peopleRows().find((r) => r.id === "ceramics")!;
    expect(dept.children!.map((c) => c.id)).toEqual(["kiln_1"]);
    g.adjust(["ceramics"], 1);
    expect(g.engine.departmentPriority("ceramics")).toBe(1);
    g.adjust(["ceramics", "kiln_1"], 1);
    expect(g.engine.works()[0]!.target).toBe(11);
  });
});
