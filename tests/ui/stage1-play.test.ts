// Stage 1 plays end to end through the shell's controller (src/ui/shellGame.ts), the same object the
// page drives: people are moved with the people panel's ± (only on rows the panel shows), projects
// start from the projects panel's cards (only when a card offers them), the clock stops on its own,
// and the run reaches the Stage 1 gate on content from the YAML alone (A + B + C + D + F).
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import type { PauseEvent, Scheduler } from "../../src/engine";
import { introControls, INTRO_PAUSE, MAX_NEW_CONTROLS_PER_PAUSE } from "../../src/ui/pressures";
import { Game, PEOPLE_BLOCK } from "../../src/ui/shellGame";

/** A middling player's allocation once each job's row exists; Build takes everyone else. */
const PLAN: [string, number][] = [
  ["gather_wood", 2700],
  ["knap_flint", 1000],
  ["dig_clay", 600],
  ["fire_pottery", 200],
  ["burn_charcoal", 500],
  ["mine_malachite", 300],
  ["smelt_copper", 400],
  ["cast_copper_tools", 300],
];

/** Projects the player starts when their card offers Start (the bellows route). */
const WANT = [
  "digging_sticks",
  "pit_kiln",
  "charcoal_clamps",
  "trail_green_stones",
  "crucibles_blowpipes",
  "stone_molds",
  "pot_bellows",
];

/** Press ± on a row until it shows `target` (blocks of PEOPLE_BLOCK, like the page's buttons). */
function setRow(game: Game, job: string, target: number): void {
  for (let guard = 0; guard < 200; guard++) {
    const row = game.peopleRows().find((r) => r.id === job);
    if (!row) return;
    const d = target - row.value;
    if (Math.abs(d) < PEOPLE_BLOCK) {
      if (d !== 0) game.adjust([job], d);
      return;
    }
    if (d > 0 && row.canInc === false) return;
    game.adjust([job], Math.sign(d) * PEOPLE_BLOCK);
  }
}

/** One player turn: staff the rows the panel shows, start what the cards offer, then a day passes. */
function playDay(game: Game): void {
  setRow(game, "build", 0);
  for (const [job, n] of PLAN) setRow(game, job, n);
  const build = game.peopleRows().find((r) => r.id === "build");
  if (build) setRow(game, "build", build.value + game.idle());
  for (const card of game.projectCards())
    if (WANT.includes(card.id) && card.status === "available" && card.affordable) game.startProject(card.id);
  game.step();
}

describe("Stage 1 end to end through the shell", () => {
  it("jobs are assigned from the panel, projects start from their cards, and the run reaches the gate", () => {
    const game = new Game(tree);
    const pauses: { day: number; reasons: string[] }[] = [];
    let day = 0;
    const maxIntro: number[] = [];
    while (!game.gateReached(1) && day < 6 * 365) {
      playDay(game);
      const r = game.engine.report!;
      if (r.pauseReasons.length) {
        pauses.push({ day, reasons: r.pauseReasons.map((p) => `${p.kind}:${p.subject ?? ""}`) });
        maxIntro.push(r.pauseReasons.filter((p) => p.kind === INTRO_PAUSE).flatMap((p) => introControls(p.subject)).length);
      }
      day++;
    }

    expect(game.gateReached(1)).toBe(true);
    const done = game.projects.book.completed;
    for (const id of [...WANT, "gate_reliable_smelting"]) expect(done, id).toContain(id);
    expect(game.engine.state.getNumber("metal_tools")).toBeGreaterThanOrEqual(5000);
    expect(game.energy()).toBeGreaterThanOrEqual(250);
    // About the stage's ~6 years at most, and not trivially fast.
    expect(day).toBeGreaterThan(365);
    expect(day).toBeLessThan(6 * 365);

    // Beats arrive in order: every completed node's beat was open when it was revealed.
    const beats = done.filter((id) => tree.nodes[id]!.stage === 1).map((id) => tree.nodes[id]!.beat);
    expect(beats).toEqual([...beats].sort((a, b) => a - b));

    // Never more than two new controls in one auto-pause.
    expect(Math.max(...maxIntro)).toBeLessThanOrEqual(MAX_NEW_CONTROLS_PER_PAUSE);
    // Every job the run used was introduced before it had a row.
    for (const [job] of PLAN) expect(game.intro.isIntroduced(`job:${job}`), job).toBe(true);
    // The gate paused the game and is in the log; the notebook filled.
    expect(pauses.some((p) => p.reasons.includes("gate:1"))).toBe(true);
    expect(game.logLines().some((l) => l.kind === "gate")).toBe(true);
    expect(game.notebook()[0]!.entries.map((e) => e.id)).toEqual(expect.arrayContaining(WANT));
    expect(game.gate().stage).toBe(2); // the goal line moves on to the next gate
    // Stage 2 opened.
    expect(game.stage).toBe(2);
  });

  it("the pressures move and go red on the way (tools at once; ore and wood after a year or more)", () => {
    const game = new Game(tree);
    const firstRed: Record<string, number> = {};
    for (let day = 0; !game.gateReached(1) && day < 6 * 365; day++) {
      playDay(game);
      for (const p of game.engine.report!.pauseReasons)
        if (p.kind === "pressure_red" && p.subject && !(p.subject in firstRed)) firstRed[p.subject] = day;
    }
    expect(firstRed.tool_wear).toBeLessThan(5);
    expect(firstRed.wood_distance).toBeGreaterThan(200);
    expect(firstRed.ore_outcrop).toBeGreaterThan(200);
    // A red bar's answers show as suggested cards.
    expect(game.engine.state.getNumber("forest_cover")).toBeLessThan(70);
  });

  it("opens with the opening problem and two introduced controls; the rest wait for the next pause", () => {
    const game = new Game(tree);
    const v = game.pauseView();
    expect(v.cards.map((c) => c.control)).toEqual(["job:gather_wood", "job:knap_flint"]);
    expect(v.cards[0]!.what).toBe(tree.jobs.gather_wood!.what);
    expect(game.peopleRows().map((r) => r.id)).toEqual(["gather_wood", "knap_flint"]);
    expect(game.logLines()[0]!.text).toBe(tree.stages[0]!.openingProblem);
    game.adjust(["gather_wood"], PEOPLE_BLOCK * 10);
    const r = game.step();
    const intro = r.pauseReasons.filter((p) => p.kind === INTRO_PAUSE).flatMap((p) => introControls(p.subject));
    expect(intro).toEqual(["job:build", "pressure:tool_wear"]);
    expect(r.pauseReasons).toContainEqual({ kind: "node_revealed", subject: "digging_sticks" });
    expect(game.pauseView().line).toContain(tree.nodes.digging_sticks!.name);
  });

  it("the clock stops on its own and names the reason; saving and loading keeps the run", () => {
    const game = new Game(tree);
    game.adjust(["gather_wood"], 1000);
    let tick: (() => void) | null = null;
    let now = 0;
    const sched: Scheduler = { now: () => now, every: (_ms, fn) => ((tick = fn), () => (tick = null)) };
    const events: PauseEvent[] = [];
    game.clock.onPause((e) => events.push(e));
    game.clock.start(sched);
    game.clock.setSpeed(20);
    game.clock.resume();
    for (let i = 0; i < 20 && events.length === 0; i++) {
      now += 1000;
      tick!();
    }
    expect(events.length).toBe(1);
    expect(events[0]!.byPlayer).toBe(false);
    expect(game.pauseView(events[0]!.reasons).line.length).toBeGreaterThan(0);
    game.clock.stop();

    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    for (let d = 0; d < 50; d++) playDay(game);
    game.save(storage);
    const back = Game.load(tree, storage)!;
    expect(back.engine.day).toBe(game.engine.day);
    expect(back.projects.book).toEqual(game.projects.book);
    expect(back.intro.introduced()).toEqual(game.intro.introduced());
    expect(back.logLines()).toEqual(game.logLines());
    for (let d = 0; d < 30; d++) {
      playDay(game);
      playDay(back);
      expect(JSON.stringify(back.engine.report)).toBe(JSON.stringify(game.engine.report));
    }
  });
});
