// Pin-and-spread: the one allocation rule behind every row of the people panel (jobs, works,
// departments) and the draft (pool -> specialties, category -> topics). DESIGN.md, Labor: "children
// spread the parent's allocation by size unless pinned".
//
// Pure functions over plain data, integers only, deterministic (largest remainder, ties by list order).
// The API is shared with package I (the draft); extend it additively.

/** One child of a spread row. */
export interface SpreadChild {
  id: string;
  /** Size the unpinned share is proportional to (draft `full`, a works' target...). Negative counts as 0. */
  weight: number;
  /** A fixed value set by hand, or null/undefined when the child takes its share of the rest. */
  pinned?: number | null;
}

export interface SpreadResult {
  /** Value per child id, in the children's order. Integers that sum to `total - unassigned`. */
  values: Record<string, number>;
  /**
   * What couldn't be placed: the remainder when every child is pinned (or every unpinned weight is 0)
   * and the pins sum to less than the total. 0 otherwise.
   */
  unassigned: number;
  /** Pins that didn't fit under the total were cut to what was left, in list order. Their ids. */
  clipped: string[];
}

/** Non-negative integer, flooring fractions (people and pages come whole). */
function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Split `amount` into integers proportional to `weights` (largest remainder; ties go to the earlier
 * entry). All weights zero gives all zeros. Exported because it is useful on its own (I's topics).
 */
export function apportion(amount: number, weights: readonly number[]): number[] {
  const a = whole(amount);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((s, x) => s + x, 0);
  if (a === 0 || sum === 0) return w.map(() => 0);
  const exact = w.map((x) => (a * x) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = a - out.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), w: w[i]! }))
    .filter((e) => e.w > 0)
    .sort((p, q) => (q.frac === p.frac ? p.i - q.i : q.frac - p.frac));
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) out[order[k]!.i]! += 1;
  return out;
}

/**
 * Spread a parent's `total` over its children: pinned children get their pin (cut to what is left,
 * in list order), and the rest is shared by the unpinned children in proportion to weight.
 */
export function spread(total: number, children: readonly SpreadChild[]): SpreadResult {
  const t = whole(total);
  const values: Record<string, number> = {};
  const clipped: string[] = [];
  let left = t;
  for (const c of children) {
    if (c.pinned === null || c.pinned === undefined) continue;
    const want = whole(c.pinned);
    const got = Math.min(want, left);
    if (got < want) clipped.push(c.id);
    values[c.id] = got;
    left -= got;
  }
  const free = children.filter((c) => c.pinned === null || c.pinned === undefined);
  const shares = apportion(left, free.map((c) => c.weight));
  let placed = 0;
  free.forEach((c, i) => {
    values[c.id] = shares[i]!;
    placed += shares[i]!;
  });
  const ordered: Record<string, number> = {};
  for (const c of children) ordered[c.id] = values[c.id] ?? 0;
  return { values: ordered, unassigned: left - placed, clipped };
}

/** Limits for {@link adjustChild} and {@link adjustTotal}. */
export interface SpreadLimits {
  /** Largest parent total allowed (a pool's share of the population, a page budget). Default: no limit. */
  maxTotal?: number;
  /** Smallest parent total allowed. Default 0. */
  minTotal?: number;
}

/** A parent's allocation after an edit: its total and its children with their pins. */
export interface SpreadState {
  total: number;
  children: SpreadChild[];
}

/**
 * The player sets one child by hand (a ± on a topic, a specialty, a job inside a works). That child is
 * pinned at its current value + `delta` (never below 0). If other children are still unpinned they
 * absorb the change and the parent total stays the same, so the child can grow only up to what the
 * other pins leave. If no other child is unpinned, the parent total follows the pins (within limits).
 */
export function adjustChild(
  state: SpreadState,
  id: string,
  delta: number,
  limits: SpreadLimits = {},
): SpreadState {
  const cur = spread(state.total, state.children).values;
  const idx = state.children.findIndex((c) => c.id === id);
  if (idx < 0) return state;
  const othersFree = state.children.some((c, i) => i !== idx && (c.pinned === null || c.pinned === undefined));
  const otherPins = state.children.reduce(
    (s, c, i) => (i !== idx && c.pinned !== null && c.pinned !== undefined ? s + whole(c.pinned) : s),
    0,
  );
  const want = Math.max(0, Math.round((cur[id] ?? 0) + delta));
  let total = whole(state.total);
  let value: number;
  if (othersFree) {
    value = Math.min(want, Math.max(0, total - otherPins));
  } else {
    const max = limits.maxTotal ?? Number.POSITIVE_INFINITY;
    const min = limits.minTotal ?? 0;
    total = Math.max(min, Math.min(max, otherPins + want));
    value = Math.max(0, Math.min(want, total - otherPins));
  }
  const children = state.children.map((c, i) => (i === idx ? { ...c, pinned: value } : { ...c }));
  return { total, children };
}

/**
 * The player changes the parent (a ± on a pool, a category, a department). Pins stay; unpinned children
 * reshare the new total. The total is clamped to the limits and never below the pins' sum.
 */
export function adjustTotal(state: SpreadState, delta: number, limits: SpreadLimits = {}): SpreadState {
  const pins = state.children.reduce(
    (s, c) => (c.pinned !== null && c.pinned !== undefined ? s + whole(c.pinned) : s),
    0,
  );
  const allPinned = state.children.length > 0 && state.children.every((c) => c.pinned !== null && c.pinned !== undefined);
  const max = limits.maxTotal ?? Number.POSITIVE_INFINITY;
  const min = Math.max(limits.minTotal ?? 0, allPinned ? 0 : pins);
  const total = Math.max(min, Math.min(max, whole(state.total) + Math.round(delta)));
  return { total, children: state.children.map((c) => ({ ...c })) };
}

/** Unpin (or pin at its current share) one child. Unpinning returns it to the spread. */
export function setPinned(state: SpreadState, id: string, pinned: boolean): SpreadState {
  const cur = spread(state.total, state.children).values;
  return {
    total: state.total,
    children: state.children.map((c) =>
      c.id !== id ? { ...c } : { ...c, pinned: pinned ? (cur[id] ?? 0) : null },
    ),
  };
}

/**
 * Change a parent total by whole blocks: `delta` blocks of `block` each, snapping to a multiple of
 * `block` first (so 5,030 + one block of 100 is 5,100). Useful for ± buttons.
 */
export function stepByBlock(value: number, blocks: number, block: number): number {
  if (!(block > 0)) return value;
  if (blocks === 0) return value;
  const snapped = blocks > 0 ? Math.ceil(value / block) * block : Math.floor(value / block) * block;
  const moved = snapped === value ? value + blocks * block : snapped + (blocks - Math.sign(blocks)) * block;
  return Math.max(0, moved);
}
