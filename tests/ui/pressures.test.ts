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
  stageBeats,
} from "../../src/ui/pressures";
import { Game } from "../../src/ui/shellGame";

const book = (completed: string[]): NodeBook => ({ ...emptyBook(), completed });
const p1 = (id: string) => tree.stages[0]!.pressures.find((p) => p.id === id)!;

describe("beat gating", () => {
  it("beat N opens when a node of the nearest lower beat is complete", () => {
    expect(stageBeats(tree, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(beatOpen(tree, 1, 1, book([]))).toBe(true);
    expect(beatOpen(tree, 1, 2, book([]))).toBe(false);
    expect(beatOpen(tree, 1, 2, book(["ground_stone_axes"]))).toBe(true); // any beat-1 node
    expect(nodeBeatOpen(tree, "pit_kiln", book(["digging_sticks"]))).toBe(true);
    expect(nodeBeatOpen(tree, "wind_furnaces", book(["crucibles_blowpipes"]))).toBe(false); // beat 7 needs beat 6
    expect(nodeBeatOpen(tree, "wind_furnaces", book(["stone_molds"]))).toBe(true);
    expect(currentBeat(tree, 1, book(["digging_sticks", "pit_kiln"]))).toBe(3);
  });

  it("a node whose requirements hold stays hidden (no pause) until its beat opens", () => {
    const g = new Game(tree);
    // ore_roasting (beat 5) needs crucibles_blowpipes and a low outcrop; force both without any
    // beat-4 node complete: requirements hold, the beat doesn't.
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = book(["crucibles_blowpipes"]);
    g.engine.state.set("malachite_left_kg", 100);
    const r = g.step();
    expect(g.projects.visible()).toContain("ore_roasting"); // B's requirements alone
    expect(r.pauseReasons).not.toContainEqual({ kind: "node_revealed", subject: "ore_roasting" });
    expect(g.projects.shown()).not.toContain("ore_roasting");
    expect(g.projectCards().map((c) => c.id)).not.toContain("ore_roasting");
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = book(["trail_green_stones", "crucibles_blowpipes"]);
    expect(g.step().pauseReasons).toContainEqual({ kind: "node_revealed", subject: "ore_roasting" });
    expect(g.projectCards().map((c) => c.id)).toContain("ore_roasting");
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
