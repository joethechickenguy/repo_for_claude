// The game's engine content comes from the YAML alone, and Stage 1's rates there are the ones the
// engine fixture cites line by line (open question 25).
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { fuelsFromTree, gameContent, jobDefsFromTree, toolDefsFromTree } from "../../src/ui/shellContent";
import { STAGE1_JOBS, STAGE1_TOOLS } from "../engine/fixtures/stage1";

describe("engine content from the tree", () => {
  it("Stage 1 job rates in the YAML match the cited fixture", () => {
    const fromYaml = new Map(jobDefsFromTree(tree).map((j) => [j.id, j]));
    for (const j of STAGE1_JOBS) expect(fromYaml.get(j.id), j.id).toEqual(j);
  });

  it("tools and fuels come from the YAML", () => {
    const tools = new Map(toolDefsFromTree(tree).map((t) => [t.resource, t]));
    for (const t of STAGE1_TOOLS) expect(tools.get(t.resource)).toEqual(t);
    expect(fuelsFromTree(tree)).toEqual({ wood_kg: "wood", charcoal_kg: "charcoal", coal_kg: "coal", coke_kg: "coal" });
  });

  it("builds engine content an Engine accepts", () => {
    const c = gameContent(tree);
    expect(c.startingJobs).toEqual(["gather_wood", "knap_flint", "build"]);
    expect(c.jobs.find((j) => j.id === "smelt_copper")?.burns).toEqual({ charcoal_kg: 5 });
    expect(c.resources.some((r) => r.id === "ore_kg")).toBe(true);
  });

  it("every Stage 1 job with rates has a name and a what line", () => {
    for (const j of Object.values(tree.jobs)) if (j.rates) {
      expect(j.name, j.id).toBeTruthy();
      expect(j.what, j.id).toBeTruthy();
    }
  });
});
