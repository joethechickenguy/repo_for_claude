// The campaign played headless by a middling bot (tests/play/bot.ts) through the real shell
// controller, stage by stage (packages G1-G6). Each stage is played from the same saved start with
// opposite options at every exclusive choice. Each variant must reach the gate with no dead end,
// meet a new decision (a node with a trade-off line) at least once a year, and never bring more than
// two new controls in one slowdown. Stage lengths are checked loosely (J tunes them).
import { beforeAll, describe, expect, it } from "vitest";
import type { SaveGame } from "../../src/engine";
import { playRun, summarize, type StagePlan, type StageReport } from "./bot";
import { STAGE1, STAGE2, STAGE3 } from "./plans";

const YEAR = 365;
const PLANS: Record<number, StagePlan> = { 1: STAGE1, 2: STAGE2, 3: STAGE3 };

/** Options to try at each stage, one variant per list. */
const VARIANTS: Record<number, string[][]> = {
  3: [
    ["rails_wagonways", "steam_engine_house"],
    ["canals", "water_turbine"],
  ],
};

function checkStage(s: StageReport | undefined, maxYears: number): void {
  expect(s, "stage played").toBeDefined();
  expect(s!.gateDay, "gate reached").not.toBeNull();
  expect(s!.deadEndDays).toBe(0);
  expect(s!.longestDecisionGapDays, s!.decisions.map((d) => `${d.id}@${d.day}`).join(" ")).toBeLessThanOrEqual(YEAR);
  expect(s!.maxControlsPerSlowdown).toBeLessThanOrEqual(2);
  expect(s!.gateDay!).toBeLessThan(maxYears * YEAR);
}

describe("the campaign, played by a middling bot", () => {
  const starts: Record<number, SaveGame> = {};
  beforeAll(() => {
    const r = playRun(PLANS, 2);
    starts[3] = r.game.engine.save();
  }, 300_000);

  for (const picks of VARIANTS[3]!)
    it(`Stage 3 reaches its gate taking ${picks.join(", ")}`, () => {
      const r = playRun({ ...PLANS, 3: { ...STAGE3, picks } }, 3, 12 * YEAR, starts[3]);
      const s = r.stages.find((x) => x.stage === 3);
      checkStage(s, 8);
      for (const p of picks) expect(r.game.projects.status(p), summarize(r)).toBe("complete");
      expect(r.game.engine.state.getNumber("dynamo_output_kw")).toBeGreaterThanOrEqual(50);
    }, 300_000);
});
