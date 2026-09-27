import { describe, expect, it } from "vitest";
import { emptyBook, tree, type NodeBook } from "../../src/content";
import {
  barScale,
  beatOpen,
  currentBeat,
  introCard,
  MAX_NEW_CONTROLS_PER_PAUSE,
  nodeBeatOpen,
  pressureSource,
  redThreshold,
  scaleFor,
  stageBeats,
} from "../../src/ui/pressures";
import { Game } from "../../src/ui/shellGame";

const book = (completed: string[]): NodeBook => ({ ...emptyBook(), completed });
const p1 = (id: string) => tree.stages[0]!.pressures.find((p) => p.id === id)!;

describe("beat gating", () => {
  it("beat N opens when a node of the nearest lower beat is complete", () => {
    expect(stageBeats(tree, 1)).toEqual([1, 2, 3, 4, 5, 6, 8]); // beat 7 folded into 6 (owner playtest 2026-09-27)
    expect(beatOpen(tree, 1, 1, book([]))).toBe(true);
    expect(beatOpen(tree, 1, 2, book([]))).toBe(false);
    expect(beatOpen(tree, 1, 2, book(["ground_stone_axes"]))).toBe(true); // any beat-1 node
    expect(nodeBeatOpen(tree, "pit_kiln", book(["digging_sticks"]))).toBe(true);
    expect(nodeBeatOpen(tree, "wind_furnaces", book(["trail_green_stones"]))).toBe(false); // beat 6 needs beat 5
    expect(nodeBeatOpen(tree, "wind_furnaces", book(["crucibles_blowpipes"]))).toBe(true);
    expect(nodeBeatOpen(tree, "arsenical_copper", book(["stone_molds"]))).toBe(true); // beat 8: nearest lower is 6
    expect(currentBeat(tree, 1, book(["digging_sticks", "pit_kiln"]))).toBe(3);
  });

  it("a node whose requirements hold stays hidden (no pause) until its beat opens", () => {
    const g = new Game(tree);
    // coppice_near_woods (beat 3) needs charcoal_clamps (also beat 3) and a thinning forest; force
    // both without any beat-2 node complete: requirements hold, the beat doesn't.
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = book(["charcoal_clamps"]);
    g.engine.state.set("forest_cover", 80);
    const r = g.step();
    expect(g.projects.visible()).toContain("coppice_near_woods"); // B's requirements alone
    expect(r.pauseReasons).not.toContainEqual({ kind: "node_revealed", subject: "coppice_near_woods" });
    expect(g.projects.shown()).not.toContain("coppice_near_woods");
    expect(g.projectCards().map((c) => c.id)).not.toContain("coppice_near_woods");
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = book(["pit_kiln", "charcoal_clamps"]);
    expect(g.step().pauseReasons).toContainEqual({ kind: "node_revealed", subject: "coppice_near_woods" });
    expect(g.projectCards().map((c) => c.id)).toContain("coppice_near_woods");
  });
});

describe("pressures", () => {
  it("thresholds and scales come from the YAML", () => {
    expect(redThreshold(p1("tool_wear"))).toBe(1);
    expect(redThreshold(p1("wood_distance"))).toBe(70);
    expect(barScale(tree, p1("wood_distance"))).toBe(100);
    expect(barScale(tree, p1("ore_outcrop"))).toBe(tree.stateVariables.malachite_left_kg!.default);
    expect(barScale(tree, p1("tool_wear"))).toBe(1);
  });

  it("a red, shown bar applies its production fractions and pauses once; clearing removes them", () => {
    const g = new Game(tree);
    const bar = p1("wood_distance");
    const mod = bar.redModifiers![0]!;
    // Introduce the bar and push the forest under the line.
    (g.intro as unknown as { introducedList: string[] }).introducedList.push("pressure:wood_distance");
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = book(["digging_sticks", "pit_kiln"]);
    g.engine.state.set("forest_cover", 60);
    const r1 = g.step();
    expect(r1.pauseReasons).toContainEqual({ kind: "pressure_red", subject: "wood_distance" });
    expect(g.engine.modifier("rate", mod.target)).toBeCloseTo(mod.factor);
    expect(g.bars().find((b) => b.id === "wood_distance")!.red).toBe(true);
    const r2 = g.step();
    expect(r2.pauseReasons).not.toContainEqual({ kind: "pressure_red", subject: "wood_distance" });
    g.engine.state.set("forest_cover", 90);
    g.step();
    expect(g.engine.modifier("rate", mod.target)).toBe(1);
    expect(g.engine.modifier("rate", mod.target)).toBe(1);
    expect(Object.keys((g.engine.save().engine.modifiers))).not.toContain(`rate|${mod.target}|${pressureSource(bar.id)}`);
  });

  it("the forest falls with wood cut, per the YAML model", () => {
    const g = new Game(tree);
    g.adjust(["gather_wood"], 1000);
    g.adjust(["knap_flint"], 1000);
    const before = g.engine.state.getNumber("forest_cover");
    g.step();
    const cut = g.engine.report!.produced.wood_kg!;
    const m = p1("wood_distance").model!;
    expect(g.engine.state.getNumber("forest_cover")).toBeCloseTo(Math.min(m.max!, before + cut * m.perUnitProduced.wood_kg! + m.perDay));
  });

  it("rails and canals scale hauling by the fraction their cards promise (-80%, -50%)", () => {
    expect(scaleFor(tree, "haul_labor", book([]))).toBe(1);
    expect(scaleFor(tree, "haul_labor", book(["rails_wagonways"]))).toBeCloseTo(1 - 0.8);
    expect(scaleFor(tree, "haul_labor", book(["canals"]))).toBeCloseTo(1 - 0.5);
    expect(scaleFor(tree, "wood_distance", book(["rails_wagonways"]))).toBe(1);
  });

  it("an unshown bar never applies its effect", () => {
    const g = new Game(tree);
    g.engine.state.set("malachite_left_kg", 100);
    g.step();
    expect(g.engine.modifier("rate", "mine_malachite")).toBe(1);
  });
});

describe("introductions", () => {
  it("cards take their text from content", () => {
    const c = introCard(tree, "pressure:tool_wear");
    expect(c.name).toBe("Tools");
    expect(c.what).toBe(p1("tool_wear").risesWith[0]);
    expect(c.why).toBe(p1("tool_wear").effectWhenRed);
    const j = introCard(tree, "job:dig_clay");
    expect(j.what).toBe(tree.jobs.dig_clay!.what);
    expect(j.why).toBe(tree.nodes.digging_sticks!.problem); // the unlocking node's problem
    const w = introCard(tree, "workshop:furnace_workshop");
    expect(w.what).toBe(tree.workshops.furnace_workshop!.loop);
  });

  it("releases at most two per pause and queues the rest", () => {
    const g = new Game(tree);
    for (const j of ["dig_clay", "fire_pottery", "burn_charcoal"]) g.engine.unlockJob(j);
    const seen: string[][] = [];
    for (let i = 0; i < 4; i++) {
      const r = g.step();
      seen.push(r.pauseReasons.filter((p) => p.kind === "intro").flatMap((p) => (p.subject ?? "").split(" ")));
    }
    for (const s of seen) expect(s.length).toBeLessThanOrEqual(MAX_NEW_CONTROLS_PER_PAUSE);
    expect(seen.flat()).toEqual(["job:build", "pressure:tool_wear", "job:dig_clay", "job:fire_pottery", "job:burn_charcoal"]);
    expect(g.peopleRows().map((r) => r.id)).toContain("burn_charcoal");
  });
});

describe("answer hints (owner playtest 2026-09-27: a red bar always says what fixes it)", () => {
  it("names answers that aren't reachable yet, with what they wait on; closed options drop out", async () => {
    const { answerHints } = await import("../../src/ui/pressures/pressures");
    const g = new Game(tree);
    const wood = p1("wood_distance");
    let hints = answerHints(tree, g.engine, g.projects.book, wood, []);
    expect(hints.map((h) => [h.id, h.state])).toEqual([
      ["coppice_near_woods", "later"],
      ["timber_sledges", "later"],
    ]);
    expect(hints[0]!.after).toEqual([tree.nodes.charcoal_clamps!.name]);
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = { ...book(["pit_kiln", "charcoal_clamps"]), building: { timber_sledges: { laborDone: 0, laborTotal: 1, milestonesFired: [] } } } as NodeBook;
    hints = answerHints(tree, g.engine, g.projects.book, wood, []);
    expect(hints.map((h) => [h.id, h.state])).toEqual([
      ["coppice_near_woods", "closed"],
      ["timber_sledges", "building"],
    ]);
  });
});

