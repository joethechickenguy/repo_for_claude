// The campaign played headless by a middling bot (tests/play/bot.ts) through the real shell
// controller, stage by stage (packages G1-G6). Each stage is played from the same saved start with
// opposite options at every exclusive choice. Each variant must reach the gate with no dead end,
// meet a new decision (a node with a trade-off line) at least once a year, and never bring more than
// two new controls in one slowdown. Stage lengths are checked loosely (J tunes them).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SaveGame } from "../../src/engine";
import { playRun, summarize, type StagePlan, type StageReport } from "./bot";
import { STAGE1, STAGE2, STAGE3, STAGE4, STAGE5, STAGE6 } from "./plans";

const YEAR = 365;
const PLANS: Record<number, StagePlan> = { 1: STAGE1, 2: STAGE2, 3: STAGE3, 4: STAGE4, 5: STAGE5, 6: STAGE6 };

/**
 * Options to try at each stage, one variant per list. The first is the stage's main variant: it must
 * meet a decision every year. The others must reach the gate; their gaps go in the playtest notes
 * (a route the draft carried no pages for can be a long build by design).
 */
const VARIANTS: Record<number, string[][]> = {
  3: [
    ["rails_wagonways", "steam_engine_house"],
    ["canals", "water_turbine"],
  ],
  4: [
    ["linde_liquefier", "tool_steel"],
    ["claude_expander", "heat_resistant_steel"],
  ],
  5: [
    ["gas_generator_turbopump", "hypergolic_propellants", "differential_analyzer"],
    ["hydrogen_peroxide", "solid_motors", "human_computers"],
  ],
  6: [["radio_command_guidance"], ["inertial_guidance"]],
};

/** What each stage's gate proves, beyond reaching it. */
const PROOF: Record<number, (r: ReturnType<typeof playRun>) => void> = {
  3: (r) => expect(r.game.engine.state.getNumber("dynamo_output_kw")).toBeGreaterThanOrEqual(50),
  4: (r) => expect(r.game.engine.state.getNumber("lox_kg_per_day")).toBeGreaterThanOrEqual(500),
  5: (r) => {
    expect(r.game.engine.get("engine_static_fire_s")).toBeGreaterThanOrEqual(60);
    expect(r.game.engine.get("engine_thrust_kn")).toBeGreaterThanOrEqual(250);
    expect(r.game.engine.get("has_launch_pad")).toBe(true);
  },
  6: (r) => {
    expect(r.game.engine.get("crewed_landing_survived")).toBe(true);
    expect(r.game.engine.state.getNumber("dv_margin_km_s")).toBeGreaterThanOrEqual(0);
  },
};

function checkStage(s: StageReport | undefined, maxYears: number, main: boolean): void {
  expect(s, "stage played").toBeDefined();
  expect(s!.gateDay, "gate reached").not.toBeNull();
  expect(s!.deadEndDays).toBe(0);
  if (main) expect(s!.longestDecisionGapDays, s!.decisions.map((d) => `${d.id}@${d.day}`).join(" ")).toBeLessThanOrEqual(YEAR);
  expect(s!.maxControlsPerSlowdown).toBeLessThanOrEqual(2);
  expect(s!.gateDay!).toBeLessThan(maxYears * YEAR);
}

/**
 * Let the worker answer vitest's RPC. Each run here is synchronous and 15-30 s long, and vitest moves
 * from one test to the next without a turn of the event loop, so back-to-back runs past 60 s fail
 * the suite with "Timeout calling onTaskUpdate" though every test passes (vitest-dev/vitest#6479).
 */
const yieldToWorker = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("the campaign, played by a middling bot", () => {
  const starts: Record<number, SaveGame> = {};
  beforeAll(async () => {
    // One run through the main variants; each stage's start is saved for the variants.
    let from: SaveGame | undefined;
    for (const stage of [2, 3, 4, 5, 6]) {
      const r = playRun(PLANS, stage, 20 * YEAR, from);
      from = r.game.engine.save();
      starts[stage + 1] = from;
      await yieldToWorker();
    }
  }, 600_000);
  afterEach(yieldToWorker);

  for (const stage of [3, 4, 5, 6])
    VARIANTS[stage]!.forEach((picks, i) =>
      it(`Stage ${stage} reaches its gate taking ${picks.join(", ")}`, () => {
        const r = playRun({ ...PLANS, [stage]: { ...PLANS[stage]!, picks } }, stage, 12 * YEAR, starts[stage]);
        const s = r.stages.find((x) => x.stage === stage);
        checkStage(s, 8, i === 0);
        // Each option taken was started (a long one may still be building at the gate); the others closed.
        for (const p of picks) expect(["complete", "building"], summarize(r)).toContain(r.game.projects.status(p));
        PROOF[stage]!(r);
      }, 300_000),
    );
});
