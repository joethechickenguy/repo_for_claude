// What the draft (package I, Stage 0) hands the game at Depart, and the default draft used when no
// draft screen is mounted: every pool and category at its draft.yaml default, spread over
// specialties and topics by `full` with the shared pin-and-spread rule.
import type { Tree } from "../content";
import { spread } from "./controls/spread";

/**
 * The state the draft writes (state-variables.yaml): `draft_roster` pool -> people (specialty ids
 * may be included too), `bundles_taken` topic -> page coverage (pages / full; the loader caps at 1).
 */
export interface DraftOutcome {
  draft_roster: Record<string, number>;
  bundles_taken: Record<string, number>;
}

/** The draft.yaml defaults with no interaction (DESIGN.md: the player "can depart at once"). */
export function defaultDraftOutcome(tree: Tree): DraftOutcome {
  const d = tree.draft;
  const roster: Record<string, number> = {};
  for (const pool of d.roster) {
    roster[pool.id] = pool.default;
    const s = spread(pool.default, pool.specialties.map((x) => ({ id: x.id, weight: x.full })));
    for (const [id, n] of Object.entries(s.values)) roster[id] = n;
  }
  const bundles: Record<string, number> = {};
  for (const cat of d.pages) {
    const s = spread(cat.default, cat.topics.map((t) => ({ id: t.id, weight: t.full })));
    for (const t of cat.topics) bundles[t.id] = t.full > 0 ? (s.values[t.id] ?? 0) / t.full : 0;
  }
  return { draft_roster: roster, bundles_taken: bundles };
}
