// Stage 2 is playable (owner playtest 2026-09-27: it opened, then for years nothing could move).
// Two players take opposite options of every Stage 2 choice, one building only the main path and one
// building everything. Both reach the Stage 2 gate, never hit a dead end, and see a new decision (a
// node with a `tradeoff`) at least every 365 days from the start of Stage 2 to its gate.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { Game } from "../../src/ui/shellGame";
import { setRow } from "../play/bot";

const PLAN1: [string, number][] = [
  ["gather_wood", 2700], ["knap_flint", 1000], ["dig_clay", 600], ["fire_pottery", 200],
  ["burn_charcoal", 500], ["mine_malachite", 300], ["smelt_copper", 400], ["cast_copper_tools", 300],
];
/** A middling Stage 2 colony: copper casting stops (iron tools are coming), iron and fuel ramp up. */
const PLAN2: [string, number][] = [
  ["gather_wood", 2800], ["knap_flint", 300], ["dig_clay", 300], ["fire_pottery", 50], ["burn_charcoal", 1000],
  ["mine_malachite", 100], ["smelt_copper", 100], ["cast_copper_tools", 0], ["mine_iron_ore", 500],
  ["smelt_iron_bloom", 300], ["smith_bloom", 100], ["forge_iron_tools", 60], ["quarry_stone", 150], ["burn_lime", 50],
  ["run_blast_furnace", 200], ["mine_coal", 150], ["coke_coal", 100], ["run_coke_furnace", 100], ["bail_mine", 200],
  ["tend_engine", 20],
];
const STAGE1 = ["digging_sticks", "pit_kiln", "charcoal_clamps", "trail_green_stones", "crucibles_blowpipes", "stone_molds", "pot_bellows", "hafted_blades", "coppice_near_woods", "eastern_outcrop", "arsenical_copper"];
const MAIN2 = ["iron_prospecting", "bloomery", "bloom_smithing", "coal_mining", "lime_burning", "blast_furnace", "sand_casting", "mine_drainage_manual", "newcomen_engine", "finery_forge", "water_wheels"];

function play(picks: string[], focused: boolean) {
  const game = new Game(tree);
  let day = 0;
  let s2 = -1;
  let rows = "";
  let deadDays = 0;
  const decisions: number[] = [];
  const seen = new Set<string>();
  while (!game.gateReached(2) && day < 12 * 365) {
    const plan = game.stage >= 2 ? PLAN2 : PLAN1;
    const key = `${game.stage}|${game.peopleRows().map((r) => r.id).join(",")}`;
    if (key !== rows) {
      // New rows appeared (or the stage changed): lay the plan out again.
      rows = key;
      setRow(game, "build", 0); // free the builders first, or nobody is idle to staff the new rows
      for (const [j] of plan) setRow(game, j, 0);
      for (const [j, n] of plan) setRow(game, j, n);
    }
    setRow(game, "build", (game.peopleRows().find((r) => r.id === "build")?.value ?? 0) + game.idle());
    for (const c of game.projectCards()) {
      const n = tree.nodes[c.id]!;
      if (n.stage === 2 && n.tradeoff && !seen.has(c.id)) {
        seen.add(c.id);
        decisions.push(day - s2);
      }
      const want = n.stage === 1 ? STAGE1.includes(c.id) : n.choice ? picks.includes(c.id) : focused ? MAIN2.includes(c.id) : c.id !== "savery_pump";
      if (want && c.status === "available" && c.affordable) game.startProject(c.id);
    }
    game.step();
    day++;
    if (game.stage === 2 && s2 < 0) s2 = day;
    if (s2 > 0 && game.stuck()?.deadEnd) deadDays++;
  }
  return { game, stage2Days: day - s2, decisions, deadDays };
}

describe("Stage 2 decisions", () => {
  it("has exclusive choices whose options all carry a trade-off line", () => {
    const s2 = Object.values(tree.choices ?? {}).filter((c) => c.stage === 2);
    expect(s2.map((c) => c.id)).toEqual(["iron_deposit", "coal_seam", "mine_water_plan", "engine_path"]);
    for (const c of s2) for (const o of c.options) expect(tree.nodes[o]!.tradeoff, o).toBeTruthy();
  });

  for (const [picks, focused] of [
    [["bog_iron", "near_seam", "shallow_pits", "boring_mill"], true],
    [["hillside_ore", "far_seam", "drainage_adit", "plate_rolling"], false],
  ] as const) {
    it(`reaches the gate with a decision at least every year (${focused ? "main path" : "everything"}: ${picks.join(", ")})`, () => {
      const { game, stage2Days, decisions, deadDays } = play([...picks], focused);
      expect(game.gateReached(2)).toBe(true);
      expect(deadDays).toBe(0);
      const days = [0, ...decisions.sort((a, b) => a - b), stage2Days];
      const gaps = days.slice(1).map((d, i) => d - days[i]!);
      expect(Math.max(...gaps), `decision days ${days.join(", ")}`).toBeLessThanOrEqual(365);
      expect(stage2Days).toBeLessThan(6 * 365);
      // The option taken is built; the other one is closed for good.
      for (const p of picks) {
        const c = tree.choices![tree.nodes[p]!.choice!]!;
        for (const o of c.options) if (o !== p) expect(game.projects.status(o), o).toBe("closed");
      }
      // The gate means it: the mine is actually below the water line and the colony at 600 W.
      expect(game.engine.state.getNumber("mine_water_m")).toBeLessThan(0);
      expect(game.energy()).toBeGreaterThanOrEqual(600);
    }, 120_000);
  }
});
