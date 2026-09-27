// When nothing in the stage can move, the game says so and says why (owner playtest 2026-09-27),
// instead of "keep working; new problems will surface".
import { describe, expect, it } from "vitest";
import { tree as realTree, type NodeBook, type Tree } from "../../src/content";
import { Game, STUCK_PAUSE } from "../../src/ui/shellGame";
import { STRINGS } from "../../src/ui/strings";

/** The real tree with one job's rates removed: nothing makes clay, so the pit kiln can never start. */
function treeWithoutClay(): Tree {
  const t = JSON.parse(JSON.stringify(realTree)) as Tree;
  delete t.jobs.dig_clay!.rates;
  return t;
}

describe("stuck", () => {
  it("waiting for the first wood is not a dead end, and makes no notice", () => {
    const g = new Game(realTree);
    const s = g.stuck()!; // nothing to build on day 0: digging sticks wait for wood
    expect(s.deadEnd).toBe(false);
    expect(s.waiting.map((w) => w.id)).toContain("digging_sticks");
    g.adjust(["gather_wood"], 1000);
    for (let d = 0; d < 5; d++) g.step();
    expect(g.stuck()).toBeNull(); // digging sticks can start
    expect(g.logLines().filter((l) => l.kind === STUCK_PAUSE)).toHaveLength(0);
  });

  it("a long stretch with nothing to build slows the game and says what the next projects wait on", async () => {
    const { IDLE_NOTICE_DAYS } = await import("../../src/ui/shellGame");
    const g = new Game(realTree); // nobody gathers wood, so the first project never appears
    g.dismissDecision();
    g.clock.setSpeed(2);
    for (let d = 0; d < IDLE_NOTICE_DAYS - 1; d++) g.step();
    expect(g.logLines().filter((l) => l.kind === STUCK_PAUSE)).toHaveLength(0);
    g.step();
    expect(g.clock.speed).toBe(0.5);
    expect(g.logLines().filter((l) => l.kind === STUCK_PAUSE)).toHaveLength(1);
    expect(g.stuck()!.waiting.find((w) => w.id === "digging_sticks")!.needs).toContain("Wood (kg) above 300");
  });

  it("a dead end says the build can't make it, slows the game at once and logs it once", () => {
    const t = treeWithoutClay();
    const g = new Game(t);
    (g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed: ["digging_sticks", "hafted_blades"], building: {}, revealed: [] };
    g.dismissDecision();
    g.clock.setSpeed(2);
    g.step();
    const s = g.stuck()!;
    expect(s).not.toBeNull();
    const kiln = s.waiting.find((w) => w.id === "pit_kiln")!;
    expect(kiln.needs.join("; ")).toContain("Clay (kg) above 300");
    expect(s.deadEnd).toBe(true);
    expect(s.cantMake).toContain("Clay (kg)");
    expect(g.clock.speed).toBe(0.5);
    expect(g.decision).toContainEqual({ kind: STUCK_PAUSE, subject: "1" });
    expect(g.pauseView().line).toBe(STRINGS.pause.stuck);
    g.step();
    g.step();
    expect(g.logLines().filter((l) => l.kind === STUCK_PAUSE)).toHaveLength(1);
  });

  it("the real Stage 1 never gets stuck on the way to its gate", async () => {
    const { PEOPLE_BLOCK } = await import("../../src/ui/shellGame");
    const g = new Game(realTree);
    const plan: [string, number][] = [["gather_wood", 2700], ["knap_flint", 1000], ["dig_clay", 600], ["fire_pottery", 200], ["burn_charcoal", 500], ["mine_malachite", 300], ["smelt_copper", 400], ["cast_copper_tools", 300]];
    const want = ["digging_sticks", "pit_kiln", "charcoal_clamps", "trail_green_stones", "crucibles_blowpipes", "stone_molds", "pot_bellows", "hafted_blades", "coppice_near_woods", "eastern_outcrop"];
    const setRow = (job: string, target: number) => {
      for (let i = 0; i < 200; i++) {
        const row = g.peopleRows().find((r) => r.id === job);
        if (!row) return;
        const d = target - row.value;
        if (Math.abs(d) < PEOPLE_BLOCK) return void (d && g.adjust([job], d));
        if (d > 0 && row.canInc === false) return;
        g.adjust([job], Math.sign(d) * PEOPLE_BLOCK);
      }
    };
    let stuckDays = 0;
    for (let day = 0; !g.gateReached(1) && day < 6 * 365; day++) {
      setRow("build", 0);
      for (const [j, n] of plan) setRow(j, n);
      const b = g.peopleRows().find((r) => r.id === "build");
      if (b) setRow("build", b.value + g.idle());
      for (const c of g.projectCards()) if (want.includes(c.id) && c.status === "available" && c.affordable) g.startProject(c.id);
      g.step();
      if (g.stuck()?.deadEnd) stuckDays++;
    }
    expect(g.gateReached(1)).toBe(true);
    expect(stuckDays).toBe(0);
  }, 60_000);

  it("unnamed ids read as words", async () => {
    const { idWords } = await import("../../src/ui/shellGame");
    expect(idWords("iron_kg")).toBe("Iron (kg)");
    expect(idWords("iron_kg_total")).toBe("Iron (kg) total");
    expect(idWords("terrain_allows_adit")).toBe("Terrain allows adit");
  });
});

