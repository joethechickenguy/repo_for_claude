// Stage 0 (DESIGN.md § Stage 0; docs/work-packages.md § I). Pure state and reducers: no DOM. Built
// on package D's shared pin-and-spread primitive (src/ui/controls/spread.ts, `spread`/`apportion`/
// `stepByBlock`/`setPinned`), which the draft was the first caller for.
//
// Two things the draft needs that `adjustChild`/`adjustTotal` don't quite give it, so this file adds
// its own small reducers on top of `spread`/`setPinned` instead (documented at each function):
// - A pool or page category's own total never moves just because one of its children was edited: a
//   specialty or topic edit only reallocates the fixed total, it doesn't grow or shrink it (README:
//   "unpinned specialties share the pool's people ... unless the player sets topics directly").
//   `adjustChild` lets the parent total float once every sibling is pinned (right for a target a
//   department sets), which the draft never wants.
// - The roster's ninth pool, `builders`, is the remainder: `roster.children` gives every other pool
//   an explicit (never-null) `pinned` value that this file's `stepPool` sets directly, and leaves
//   `builders` the one always-unpinned child, so `spread()` hands it whatever's left (DESIGN.md,
//   Stage 0: "Any allocation is allowed; builders are the remainder"). Which pool plays that role
//   isn't a declared field in draft.yaml (see tech-tree/open-questions.md, 47); the id is fixed here.

import { apportion, spread, setPinned, stepByBlock } from "../controls";
import type { SpreadChild, SpreadState } from "../controls";
import type { Draft, DraftCategory, DraftPool, Tree } from "../../content";
import type { DraftOutcome } from "../shellDraft";

/** The roster pool that absorbs the remainder (tech-tree/open-questions.md, 47). */
export const BUILDERS_POOL_ID = "builders";

/** The ± step at every level (tech-tree/draft.yaml, work-packages.md § I: "blocks of 100"). */
export const BLOCK = 100;

export interface DraftState {
  /** 9 roster pools; `builders` is the only child ever left unpinned. */
  roster: SpreadState;
  /** Each pool's specialties, spread over that pool's current total. */
  specialties: Record<string, SpreadState>;
  /** Each page category's total pages (independently set, capped by the shared budget). */
  pages: Record<string, number>;
  /** Each category's topics, spread over that category's current total. */
  topics: Record<string, SpreadState>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(Math.max(lo, hi), v));

const pinnedSum = (children: readonly SpreadChild[], excludeId?: string): number =>
  children.reduce((s, c) => (c.id !== excludeId && c.pinned != null ? s + c.pinned : s), 0);

/** What the unpinned children (other than `excludeId`) can hold at most: the sum of their `full`. */
const freeRoom = (children: readonly SpreadChild[], excludeId?: string): number =>
  children.reduce((s, c) => (c.id !== excludeId && c.pinned == null ? s + c.weight : s), 0);

/**
 * The most a parent (pool, category) can hold without pushing an unpinned child past its own `full`:
 * the pins plus the free children's `full`. When every child is pinned the total re-spreads by `full`
 * (rebalanceIfAllPinned), so then it's the sum of every `full`.
 */
const capacity = (children: readonly SpreadChild[]): number =>
  children.every((c) => c.pinned != null)
    ? children.reduce((s, c) => s + c.weight, 0)
    : pinnedSum(children) + freeRoom(children);

/**
 * When every child of a spread is pinned (a pool with one specialty, `primitive`/`cryogenics`' one
 * topic, or every specialty pinned by hand), nothing is left free to take up a new total, so `spread`
 * would leave the difference unassigned (D's `SpreadResult.unassigned`). Re-pin everyone in
 * proportion to their `full`, the same ratio a fresh, all-unpinned spread would use, so the children
 * still sum to `newTotal` exactly. A spread with a free child is untouched: it absorbs the change on
 * its own.
 */
function rebalanceIfAllPinned(children: readonly SpreadChild[], newTotal: number): SpreadChild[] {
  if (children.length === 0 || children.some((c) => c.pinned == null)) return children.map((c) => ({ ...c }));
  const shares = apportion(newTotal, children.map((c) => c.weight));
  return children.map((c, i) => ({ ...c, pinned: shares[i] ?? 0 }));
}

/** Sum of a page category's topics' `full` (draft.yaml gives no `full` on the category itself). */
export function categoryFull(cat: DraftCategory): number {
  return cat.topics.reduce((s, t) => s + t.full, 0);
}

const poolDef = (tree: Tree, id: string): DraftPool => {
  const p = tree.draft.roster.find((r) => r.id === id);
  if (!p) throw new Error(`unknown roster pool ${id}`);
  return p;
};
const catDef = (tree: Tree, id: string): DraftCategory => {
  const c = tree.draft.pages.find((x) => x.id === id);
  if (!c) throw new Error(`unknown page category ${id}`);
  return c;
};

// ---- reading current values (spread() is the single source of truth; nothing else is cached) -------

export const poolValue = (state: DraftState, poolId: string): number =>
  spread(state.roster.total, state.roster.children).values[poolId] ?? 0;

export const specialtyValue = (state: DraftState, poolId: string, specialtyId: string): number => {
  const s = state.specialties[poolId];
  return s ? (spread(s.total, s.children).values[specialtyId] ?? 0) : 0;
};

export const topicValue = (state: DraftState, categoryId: string, topicId: string): number => {
  const t = state.topics[categoryId];
  return t ? (spread(t.total, t.children).values[topicId] ?? 0) : 0;
};

export const isSpecialtyPinned = (state: DraftState, poolId: string, specialtyId: string): boolean =>
  (state.specialties[poolId]?.children.find((c) => c.id === specialtyId)?.pinned ?? null) != null;

export const isTopicPinned = (state: DraftState, categoryId: string, topicId: string): boolean =>
  (state.topics[categoryId]?.children.find((c) => c.id === topicId)?.pinned ?? null) != null;

// ---- defaults --------------------------------------------------------------------------------------------

export function defaultDraftState(tree: Tree): DraftState {
  const roster: SpreadState = {
    total: tree.draft.peopleTotal,
    children: tree.draft.roster.map((r) => ({
      id: r.id,
      weight: r.full,
      pinned: r.id === BUILDERS_POOL_ID ? null : r.default,
    })),
  };
  const rosterValues = spread(roster.total, roster.children).values;
  const specialties: Record<string, SpreadState> = {};
  for (const r of tree.draft.roster) {
    specialties[r.id] = {
      total: rosterValues[r.id] ?? 0,
      children: r.specialties.map((s) => ({ id: s.id, weight: s.full, pinned: null })),
    };
  }
  const pages: Record<string, number> = {};
  for (const c of tree.draft.pages) pages[c.id] = c.default;
  const topics: Record<string, SpreadState> = {};
  for (const c of tree.draft.pages) {
    topics[c.id] = {
      total: pages[c.id] ?? 0,
      children: c.topics.map((t) => ({ id: t.id, weight: t.full, pinned: null })),
    };
  }
  return { roster, specialties, pages, topics };
}

// ---- roster: pools and specialties -------------------------------------------------------------------------

function withPoolValue(tree: Tree, state: DraftState, poolId: string, value: number): DraftState {
  const roster: SpreadState = {
    total: state.roster.total,
    children: state.roster.children.map((c) => (c.id === poolId ? { ...c, pinned: value } : c)),
  };
  const values = spread(roster.total, roster.children).values;
  const specialties = { ...state.specialties };
  for (const r of tree.draft.roster) {
    const prev = specialties[r.id]!;
    const total = values[r.id] ?? 0;
    specialties[r.id] = { total, children: rebalanceIfAllPinned(prev.children, total) };
  }
  return { ...state, roster, specialties };
}

/**
 * ± on a pool row (blocks of 100). Clamped to the pool's own `full`, to what it can't take from
 * pools that are pinned lower (there are none — every non-`builders` pool is always explicit — this
 * really guards against `builders` itself, which has no ± of its own and is never passed here), and
 * to what would push `builders` below the specialists already pinned inside it.
 */
export function stepPool(tree: Tree, state: DraftState, poolId: string, blocks: number): DraftState {
  if (poolId === BUILDERS_POOL_ID) return state; // builders has no ± of its own: it is the remainder
  return setPool(tree, state, poolId, stepByBlock(poolValue(state, poolId), blocks, BLOCK));
}

/** A typed value on a pool row: any whole number, clamped exactly as ± is. */
export function setPool(tree: Tree, state: DraftState, poolId: string, value: number): DraftState {
  if (poolId === BUILDERS_POOL_ID) return state;
  const def = poolDef(tree, poolId);
  const cur = poolValue(state, poolId);
  const builders = state.specialties[BUILDERS_POOL_ID]!.children;
  // Builders take the remainder, so shrinking this pool grows builders: never past what builders'
  // own specialties can hold.
  const buildersRoom = capacity(builders) - poolValue(state, BUILDERS_POOL_ID);
  const lo = Math.max(pinnedSum(state.specialties[poolId]!.children), cur - buildersRoom);
  const otherPoolsPinned = pinnedSum(state.roster.children, poolId);
  const buildersFloor = pinnedSum(builders);
  const hi = Math.min(def.full, state.roster.total - otherPoolsPinned - buildersFloor, capacity(state.specialties[poolId]!.children));
  return withPoolValue(tree, state, poolId, clamp(Math.round(value), lo, hi));
}

/**
 * ± on a specialty row: reallocates within the pool's fixed total and pins the edited specialty.
 * Exception: when no sibling specialty is free to absorb the change (every other one is already
 * pinned — a pool with only one specialty always falls here, `builders`' laborers/masons do not),
 * there is nowhere for the difference to go but the pool's own total, so this cascades to
 * {@link stepPool} instead and pins the edited specialty at its new share of the result.
 */
export function stepSpecialty(tree: Tree, state: DraftState, poolId: string, specialtyId: string, blocks: number): DraftState {
  const pool = state.specialties[poolId];
  if (!pool) return state;
  return setSpecialty(tree, state, poolId, specialtyId, stepByBlock(specialtyValue(state, poolId, specialtyId), blocks, BLOCK));
}

/** A typed value on a specialty row: the same rules as ±, for any whole number. */
export function setSpecialty(tree: Tree, state: DraftState, poolId: string, specialtyId: string, value: number): DraftState {
  const pool = state.specialties[poolId];
  if (!pool) return state;
  const def = poolDef(tree, poolId).specialties.find((s) => s.id === specialtyId);
  if (!def) return state;
  const otherHasFree = pool.children.some((c) => c.id !== specialtyId && c.pinned == null);
  const cur = specialtyValue(state, poolId, specialtyId);
  if (otherHasFree) {
    const otherPinned = pinnedSum(pool.children, specialtyId);
    const hi = Math.min(def.full, pool.total - otherPinned);
    // The free siblings absorb the rest; not past their own `full`.
    const lo = Math.max(0, pool.total - otherPinned - freeRoom(pool.children, specialtyId));
    const next = clamp(Math.round(value), lo, hi);
    const children = pool.children.map((c) => (c.id === specialtyId ? { ...c, pinned: next } : c));
    return { ...state, specialties: { ...state.specialties, [poolId]: { total: pool.total, children } } };
  }
  // Clamp to the specialty's own range first, so the pool never moves more than the specialty can take.
  const want = clamp(Math.round(value), 0, def.full);
  return cascadeSpecialty(tree, state, poolId, specialtyId, setPool(tree, state, poolId, pool.total + want - cur));
}

/** No free sibling: the pool total moved (to `moved`); the edited specialty takes the difference. */
function cascadeSpecialty(tree: Tree, state: DraftState, poolId: string, specialtyId: string, moved: DraftState): DraftState {
  const pool = state.specialties[poolId]!;
  const def = poolDef(tree, poolId).specialties.find((s) => s.id === specialtyId);
  if (!def) return state;
  const newTotal = poolValue(moved, poolId);
  const delta = newTotal - pool.total;
  const cur = specialtyValue(state, poolId, specialtyId);
  const next = clamp(cur + delta, 0, def.full);
  const children = pool.children.map((c) => (c.id === specialtyId ? { ...c, pinned: next } : c));
  return { ...moved, specialties: { ...moved.specialties, [poolId]: { total: newTotal, children } } };
}

/** Pin (freezing the specialty's current share) or unpin (returning it to the automatic spread). */
export function toggleSpecialtyPin(state: DraftState, poolId: string, specialtyId: string): DraftState {
  const pool = state.specialties[poolId];
  if (!pool) return state;
  const next = setPinned(pool, specialtyId, !isSpecialtyPinned(state, poolId, specialtyId));
  return { ...state, specialties: { ...state.specialties, [poolId]: next } };
}

// ---- pages: categories and topics -----------------------------------------------------------------------------

/** ± on a category row (blocks of 100). Categories aren't spread against one another — DESIGN.md,
 * Stage 0: pages are a *budget*, not all 10,000 need to be spent — so this only clamps to the
 * category's own capacity, what its pinned topics already hold, and the budget left after the other
 * categories. */
export function stepCategory(tree: Tree, state: DraftState, categoryId: string, blocks: number): DraftState {
  return setCategory(tree, state, categoryId, stepByBlock(state.pages[categoryId] ?? 0, blocks, BLOCK));
}

/** A typed value on a category row: any whole number, clamped exactly as ± is. */
export function setCategory(tree: Tree, state: DraftState, categoryId: string, value: number): DraftState {
  const def = catDef(tree, categoryId);
  const cat = state.topics[categoryId];
  if (!cat) return state;
  const lo = pinnedSum(cat.children);
  const othersSum = Object.entries(state.pages).reduce((s, [id, v]) => (id === categoryId ? s : s + v), 0);
  const hi = Math.min(categoryFull(def), tree.draft.pageBudget - othersSum, capacity(cat.children));
  const next = clamp(Math.round(value), lo, hi);
  return {
    ...state,
    pages: { ...state.pages, [categoryId]: next },
    topics: { ...state.topics, [categoryId]: { total: next, children: rebalanceIfAllPinned(cat.children, next) } },
  };
}

/**
 * ± on a topic row: reallocates within the category's fixed total and pins the edited topic.
 * Exception: when no sibling topic is free to absorb the change (a category with only one topic —
 * `primitive` and `cryogenics` both have exactly one — always falls here, and so does any category
 * whose other topics are all pinned), the difference has nowhere to go but the category's own total,
 * so this cascades to {@link stepCategory} instead.
 */
export function stepTopic(tree: Tree, state: DraftState, categoryId: string, topicId: string, blocks: number): DraftState {
  const cat = state.topics[categoryId];
  if (!cat) return state;
  return setTopic(tree, state, categoryId, topicId, stepByBlock(topicValue(state, categoryId, topicId), blocks, BLOCK));
}

/** A typed value on a topic row: the same rules as ±, for any whole number. */
export function setTopic(tree: Tree, state: DraftState, categoryId: string, topicId: string, value: number): DraftState {
  const cat = state.topics[categoryId];
  if (!cat) return state;
  const def = catDef(tree, categoryId).topics.find((t) => t.id === topicId);
  if (!def) return state;
  const otherHasFree = cat.children.some((c) => c.id !== topicId && c.pinned == null);
  const cur = topicValue(state, categoryId, topicId);
  if (otherHasFree) {
    const otherPinned = pinnedSum(cat.children, topicId);
    const hi = Math.min(def.full, cat.total - otherPinned);
    const lo = Math.max(0, cat.total - otherPinned - freeRoom(cat.children, topicId));
    const next = clamp(Math.round(value), lo, hi);
    const children = cat.children.map((c) => (c.id === topicId ? { ...c, pinned: next } : c));
    return { ...state, topics: { ...state.topics, [categoryId]: { total: cat.total, children } } };
  }
  // Clamp to the topic's own range first, so the category never moves more than the topic can take.
  const want = clamp(Math.round(value), 0, def.full);
  return cascadeTopic(tree, state, categoryId, topicId, setCategory(tree, state, categoryId, cat.total + want - cur));
}

/** No free sibling: the category total moved (to `moved`); the edited topic takes the difference. */
function cascadeTopic(tree: Tree, state: DraftState, categoryId: string, topicId: string, moved: DraftState): DraftState {
  const cat = state.topics[categoryId]!;
  const def = catDef(tree, categoryId).topics.find((t) => t.id === topicId);
  if (!def) return state;
  const newTotal = moved.pages[categoryId] ?? cat.total;
  const delta = newTotal - cat.total;
  const cur = topicValue(state, categoryId, topicId);
  const next = clamp(cur + delta, 0, def.full);
  const children = cat.children.map((c) => (c.id === topicId ? { ...c, pinned: next } : c));
  return { ...moved, topics: { ...moved.topics, [categoryId]: { total: newTotal, children } } };
}

export function toggleTopicPin(state: DraftState, categoryId: string, topicId: string): DraftState {
  const cat = state.topics[categoryId];
  if (!cat) return state;
  const next = setPinned(cat, topicId, !isTopicPinned(state, categoryId, topicId));
  return { ...state, topics: { ...state.topics, [categoryId]: next } };
}

// ---- weakest area (DESIGN.md § Stage 0, draft.yaml "Weakest area") ------------------------------------------------

/** A category's page coverage: its topics' coverage (pages / topic.full, capped at 1) weighted by `full`. */
export function categoryCoverage(tree: Tree, state: DraftState, categoryId: string): number {
  const def = catDef(tree, categoryId);
  const full = categoryFull(def);
  if (full <= 0) return 0;
  const covered = def.topics.reduce((s, t) => s + Math.min(1, topicValue(state, categoryId, t.id) / t.full) * t.full, 0);
  return covered / full;
}

export interface WeakestArea {
  id: string;
  name: string;
  score: number;
}

/**
 * "Weakest area: {name}", recomputed on every change (draft.yaml, "Weakest area"). Score per area is
 * min(roster fill, page coverage); the lowest wins; ties go to the earlier area in draft.yaml's list
 * (ordered by the stage it first matters in).
 */
export function weakestArea(tree: Tree, state: DraftState): WeakestArea {
  let best: WeakestArea | null = null;
  for (const area of tree.draft.areas) {
    const pool = poolDef(tree, area.roster);
    const rosterFill = pool.full > 0 ? Math.min(1, poolValue(state, area.roster) / pool.full) : 1;
    const pagesCoverage = categoryCoverage(tree, state, area.pages);
    const score = Math.min(rosterFill, pagesCoverage);
    if (!best || score < best.score) best = { id: area.id, name: area.name, score };
  }
  if (!best) throw new Error("draft.yaml declares no areas");
  return best;
}

// ---- the departure result (docs/work-packages.md § I) ------------------------------------------------------------
//
// D's shell already has a landing spot for this: `../shellDraft.ts`'s `DraftOutcome` ({draft_roster,
// bundles_taken}, the state variables' own names) is what `Game`'s constructor takes and writes
// straight into state with `setIfDeclared`. `mountDraft`'s result reuses that type instead of a
// competing one, and follows the same convention its `defaultDraftOutcome` set: `draft_roster` holds
// both pool ids and specialty ids in one flat map (state-variables.yaml only documents "pool ->
// drafted specialists", but nothing stops a finer key, and D's own default already writes one).

export type DraftResult = DraftOutcome;

export function buildResult(tree: Tree, state: DraftState): DraftResult {
  const draft_roster: Record<string, number> = {};
  for (const r of tree.draft.roster) {
    draft_roster[r.id] = poolValue(state, r.id);
    for (const s of r.specialties) draft_roster[s.id] = specialtyValue(state, r.id, s.id);
  }
  const bundles_taken: Record<string, number> = {};
  for (const c of tree.draft.pages) {
    for (const t of c.topics) bundles_taken[t.id] = t.full > 0 ? Math.min(1, topicValue(state, c.id, t.id) / t.full) : 0;
  }
  return { draft_roster, bundles_taken };
}

export type { Draft };
