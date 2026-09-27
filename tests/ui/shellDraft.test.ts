// The draft's result (package I) is carried into the engine's state when the run starts.
import { describe, expect, it } from "vitest";
import { bundleCoverage, pagesTier, tree } from "../../src/content";
import { buildResult, defaultDraftState } from "../../src/ui/draft/model";
import { defaultDraftOutcome, outcomeFrom } from "../../src/ui/shellDraft";
import { Game } from "../../src/ui/shellGame";

describe("draft -> game start", () => {
  it("the default outcome is I's model with no interaction", () => {
    const r = buildResult(tree, defaultDraftState(tree));
    expect(defaultDraftOutcome(tree)).toEqual({ draft_roster: r.draftRoster, bundles_taken: r.bundlesTaken });
  });

  it("accepts I's DraftResult and the state-variable spelling", () => {
    const r = { draftRoster: { builders: 9000, teachers: 1000 }, bundlesTaken: { metallurgy_1: 1 } };
    expect(outcomeFrom(tree, r)).toEqual({ draft_roster: r.draftRoster, bundles_taken: r.bundlesTaken });
    expect(outcomeFrom(tree, { draft_roster: { builders: 1 }, bundles_taken: { survey_copper_tin: 0.5 } }).bundles_taken).toEqual({ survey_copper_tin: 0.5 });
    expect(outcomeFrom(tree, undefined)).toEqual(defaultDraftOutcome(tree));
  });

  it("draft_roster and bundles_taken land in the engine and drive page tiers", () => {
    const full = outcomeFrom(tree, { draftRoster: { builders: 10000 }, bundlesTaken: { primitive_technology: 1, metallurgy_1: 1 } });
    const g = new Game(tree, { draft: full });
    expect(g.engine.state.get("draft_roster")).toEqual({ builders: 10000 });
    expect(g.engine.state.get("bundles_taken")).toEqual({ primitive_technology: 1, metallurgy_1: 1 });
    expect(bundleCoverage(tree, "metallurgy_1", g.engine)).toBe(1);
    expect(pagesTier(tree, "digging_sticks", g.engine)).toBe("known");
    const none = new Game(tree, { draft: outcomeFrom(tree, { bundlesTaken: {} }) });
    expect(pagesTier(tree, "digging_sticks", none.engine)).toBe("absent");
    // digging_sticks without pages: "1.5x labor"; the card shows it.
    const card = (game: Game) => {
      game.adjust(["gather_wood"], 1000);
      game.step();
      return game.projectCards().find((c) => c.id === "digging_sticks")!;
    };
    expect(card(none).labor).toBe(card(g).labor * 1.5);
  });
});
