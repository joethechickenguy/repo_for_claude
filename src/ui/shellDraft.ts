// What the draft (package I, Stage 0) hands the game at Depart, and the default draft used when the
// player departs without touching anything. The defaults come from I's draft model
// (src/ui/draft/model.ts), so there is one implementation of the draft rules.
import type { Tree } from "../content";
import { buildResult, defaultDraftState } from "./draft/model";

/**
 * The state the draft writes (state-variables.yaml): `draft_roster` pool -> people, `bundles_taken`
 * topic -> page coverage (0-1).
 */
export interface DraftOutcome {
  draft_roster: Record<string, number>;
  bundles_taken: Record<string, number>;
}

/** The draft.yaml defaults with no interaction (DESIGN.md: the player "can depart at once"). */
export function defaultDraftOutcome(tree: Tree): DraftOutcome {
  // buildResult already returns this exact shape (I's model.ts DraftResult is this DraftOutcome).
  const r = buildResult(tree, defaultDraftState(tree));
  return { draft_roster: { ...r.draft_roster }, bundles_taken: { ...r.bundles_taken } };
}

const isMap = (v: unknown): v is Record<string, number> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Whatever the draft screen hands to Depart: I's `DraftResult` (this same `DraftOutcome` shape,
 * `{draft_roster, bundles_taken}`) or, defensively, an older `{draftRoster, bundlesTaken}` spelling.
 * Missing parts fall back to the defaults.
 */
export function outcomeFrom(tree: Tree, x: unknown): DraftOutcome {
  const d = defaultDraftOutcome(tree);
  const o = (x ?? {}) as Record<string, unknown>;
  const roster = o.draft_roster ?? o.draftRoster;
  const bundles = o.bundles_taken ?? o.bundlesTaken;
  return {
    draft_roster: isMap(roster) ? { ...roster } : d.draft_roster,
    bundles_taken: isMap(bundles) ? { ...bundles } : d.bundles_taken,
  };
}
