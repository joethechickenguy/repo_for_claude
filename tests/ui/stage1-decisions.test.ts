// Owner playtest 2026-09-27: "at least one interesting semi-big decision every year" and
// alternatives that read as alternatives. A decision here is a node with a `tradeoff` line (every
// option of an exclusive choice, plus arsenic and tin). Two opposite players take a different option
// from every choice; for both, a new decision appears at least once every 365 days from the start
// until the gate, and taking one option closes the other for good.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { Game, PEOPLE_BLOCK } from "../../src/ui/shellGame";

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
const CRITICAL = ["digging_sticks", "pit_kiln", "charcoal_clamps", "trail_green_stones", "crucibles_blowpipes", "stone_molds", "arsenical_copper"];

function setRow(game: Game, job: string, target: number): void {
  for (let g = 0; g < 200; g++) {
    const row = game.peopleRows().find((r) => r.id === job);
    if (!row) return;
    const d = target - row.value;
    if (Math.abs(d) < PEOPLE_BLOCK) {
      if (d) game.adjust([job], d);
      return;
    }
    if (d > 0 && row.canInc === false) return;
    game.adjust([job], Math.sign(d) * PEOPLE_BLOCK);
  }
}

function play(picks: string[]): { firstSeen: Record<string, number>; gateDay: number; game: Game } {
  const game = new Game(tree);
  const firstSeen: Record<string, number> = {};
  let day = 0;
  for (; !game.gateReached(1) && day < 6 * 365; day++) {
    setRow(game, "build", 0);
    for (const [j, n] of PLAN) setRow(game, j, n);
    const b = game.peopleRows().find((r) => r.id === "build");
    if (b) setRow(game, "build", b.value + game.idle());
    for (const c of game.projectCards()) {
      if (tree.nodes[c.id]?.tradeoff && !(c.id in firstSeen)) firstSeen[c.id] = day;
      const want = CRITICAL.includes(c.id) || picks.includes(c.id);
      if (want && c.status === "available" && c.affordable) game.startProject(c.id);
    }
    game.step();
  }
  return { firstSeen, gateDay: day, game };
}

describe("Stage 1 decisions", () => {
  it("has exclusive choices whose options all carry a trade-off line", () => {
    const stage1 = Object.values(tree.choices ?? {}).filter((c) => c.stage === 1);
    expect(stage1.map((c) => c.id)).toEqual(["first_tool_fix", "woodland", "ore_source", "air_supply"]);
    for (const c of stage1) for (const o of c.options) expect(tree.nodes[o]!.tradeoff, o).toBeTruthy();
  });

  for (const picks of [
    ["hafted_blades", "coppice_near_woods", "eastern_outcrop", "pot_bellows"],
    ["ground_stone_axes", "timber_sledges", "ore_roasting", "wind_furnaces"],
  ]) {
    it(`never goes a year without a new decision (${picks.join(", ")})`, () => {
      const { firstSeen, gateDay, game } = play(picks);
      expect(game.gateReached(1)).toBe(true);
      const days = [0, ...Object.values(firstSeen).sort((a, b) => a - b), gateDay];
      const gaps = days.slice(1).map((d, i) => d - days[i]!);
      expect(Math.max(...gaps), `decision days ${days.join(", ")}`).toBeLessThanOrEqual(365);
      // Taking an option closed the other one for good (the taken one may still be building at the
      // gate: the gate's any_of can be met by arsenic first).
      for (const p of picks) {
        const c = tree.choices![tree.nodes[p]!.choice!]!;
        for (const o of c.options)
          if (o === p) expect(["complete", "building"], o).toContain(game.projects.status(o));
          else expect(game.projects.status(o), o).toBe("closed");
      }
    });
  }
});
