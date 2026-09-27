// No dead ends (owner playtest 2026-09-27: Stage 2 opened, then for years nothing could move because
// no Stage 2 job made anything). For every stage that is meant to be playable, everything its nodes
// need must be makeable by a job with rates that exists by then, and every name its conditions read
// must be declared state, a resource, or a metric a running system supplies.
//
// PLAYABLE grows as each stage's content lands (its G package adds the stage here and a headless run
// that reaches its gate). A stage outside this list isn't finished; the game says so when a player
// reaches it (tests/ui/stuck.test.ts).
import { describe, expect, it } from "vitest";
import { exprRefs, jobFirstStage, producers, producibleBy, reach, stageGaps, tree, type Tree } from "../src/content";
import { SUPPLIED_METRICS as SUPPLIED } from "../src/ui/shellSystems";

export const PLAYABLE = [1, 2, 3, 4, 5, 6];

/** Everything before `stage` done, taking the first option of every earlier stage's choice (the rest closed). */
function doneBefore(t: Tree, stage: number): { done: string[]; closed: string[] } {
  const closed = new Set(Object.values(t.choices ?? {}).filter((c) => c.stage < stage).flatMap((c) => c.options.slice(1)));
  const done = t.nodeOrder.filter((id) => t.nodes[id]!.stage < stage && !closed.has(id));
  return { done, closed: [...closed] };
}

describe("what the content can make", () => {
  it("finds producers and the stage a job first exists in", () => {
    expect(producers(tree, "wood_kg")).toEqual(["gather_wood"]);
    expect(jobFirstStage(tree, "gather_wood")).toBe(1);
    expect(jobFirstStage(tree, "smelt_copper")).toBe(1);
    expect(producibleBy(tree, "copper_kg", 1)).toBe(true);
  });

  for (const stage of PLAYABLE) {
    it(`stage ${stage}: every resource a node needs is made by some job by then`, () => {
      expect(stageGaps(tree, stage)).toEqual([]);
    });

    it(`stage ${stage}: its gate is reachable from the start of the stage, whichever options are taken`, () => {
      const choices = Object.values(tree.choices ?? {}).filter((c) => c.stage === stage);
      // Every option of every choice in turn (the others of that choice closed).
      for (const c of [undefined, ...choices])
        for (const pick of c ? c.options : [undefined]) {
          const { done, closed } = doneBefore(tree, stage);
          const shut = [...closed, ...(c && pick ? c.options.filter((o) => o !== pick) : [])];
          const r = reach(tree, stage, done, shut, SUPPLIED);
          const gate = tree.stages.find((s) => s.stage === stage)!.gate.id;
          expect(r.nodes.has(gate), `${c?.id ?? "no choice"} -> ${pick ?? "-"}: missing ${[...r.missing].join(", ")}`).toBe(true);
        }
    });

    it(`stage ${stage}: every name a condition reads is declared or supplied`, () => {
      const unsupplied: string[] = [];
      for (const id of tree.nodeOrder) {
        const n = tree.nodes[id]!;
        if (n.stage !== stage) continue;
        for (const c of n.requires.state)
          for (const ref of exprRefs(c.expr))
            if (!(ref in tree.stateVariables) && !(ref in tree.resources) && !SUPPLIED.has(ref)) unsupplied.push(`${id}: ${ref}`);
      }
      const gate = tree.stages.find((s) => s.stage === stage)!.gate;
      for (const c of gate.condition)
        for (const ref of exprRefs(c.expr))
          if (!(ref in tree.stateVariables) && !(ref in tree.resources) && !SUPPLIED.has(ref)) unsupplied.push(`gate: ${ref}`);
      expect(unsupplied).toEqual([]);
    });
  }

  it("a stage whose content isn't finished is a dead end, and reach names what's missing", () => {
    // The real tree with smelting's rates removed: copper can't be made, so the Stage 1 gate can't be reached.
    const t = JSON.parse(JSON.stringify(tree)) as Tree;
    delete t.jobs.smelt_copper!.rates;
    const r = reach(t, 1, [], [], SUPPLIED);
    expect(r.nodes.has("gate_reliable_smelting")).toBe(false);
    expect([...r.missing]).toContain("copper_kg");
    expect(r.nodes.has("charcoal_clamps")).toBe(true); // everything before copper still reachable
  });
});
