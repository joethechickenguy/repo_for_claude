// Node availability and building, as pure functions over the tree, a StateView and a NodeBook.
// The engine (package A) owns the NodeBook inside its save and applies what these return:
// resources to consume, state to write, jobs and workshops that open. Nothing here mutates.
//
// Readings of tech-tree/README.md and work-packages.md § B (open-questions.md, "Loader", 18-24):
// - A node is visible when its stage is open, `requires.nodes` are complete, one `any_of` group is
//   complete and every `requires.state` condition holds. Once visible it stays visible (revealed),
//   so a condition that later lapses doesn't pull a project off the list.
// - A stage is open when it is Stage 1 or the previous stage's gate node is complete.
// - Affordable: every `requires.resources` amount is in stock. Starting consumes it all up front.
// - Building consumes Build labor (person-days) until `labor_person_days` is reached; milestones
//   fire when the fraction done reaches `at`; `writes_state` applies on completion.
// - Beat gating is package F's rule and is not applied here.

import { holds } from "./evaluate";
import type { Condition, Milestone, StateValue, StateView, StateWrite, Tree, TreeNode } from "./types";

export interface BuildProgress {
  laborDone: number;
  laborTotal: number;
  milestonesFired: string[];
}

/** The node part of a save: plain JSON. */
export interface NodeBook {
  /** Completed node ids, in completion order. */
  completed: string[];
  /** Nodes being built, in start order. */
  building: Record<string, BuildProgress>;
  /** Nodes that have ever been visible, in reveal order. */
  revealed: string[];
}

/** `closed`: another option of the same exclusive choice was started, so this one is gone for good. */
export type NodeStatus = "hidden" | "available" | "building" | "complete" | "closed";
export type PagesTier = "known" | "partial" | "absent";

export type BuildEvent =
  | { type: "milestone"; node: string; milestone: Milestone }
  | {
      type: "complete";
      node: string;
      /** Every writes_state entry; apply `stateAssignments(node)` for the concrete values. */
      writes: StateWrite[];
      jobs: string[];
      /** Workshop this completion opens, if any. */
      opensWorkshop?: string;
    };

export interface RequirementCheck {
  ok: boolean;
  stageOpen: boolean;
  missingNodes: string[];
  /** True when there are no any_of groups or one group is fully complete. */
  anyOfMet: boolean;
  failedState: Condition[];
}

export function emptyBook(): NodeBook {
  return { completed: [], building: {}, revealed: [] };
}

const node = (tree: Tree, id: string): TreeNode => {
  const n = tree.nodes[id];
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
};

export const isComplete = (book: NodeBook, id: string): boolean => book.completed.includes(id);
export const isBuilding = (book: NodeBook, id: string): boolean => Object.prototype.hasOwnProperty.call(book.building, id);

// ---- stages ------------------------------------------------------------------------------------------------

export function stageOpen(tree: Tree, stage: number, book: NodeBook): boolean {
  const idx = tree.stages.findIndex((s) => s.stage === stage);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return isComplete(book, tree.stages[idx - 1]!.gate.id);
}

/** The latest open stage. */
export function currentStage(tree: Tree, book: NodeBook): number {
  let cur = tree.stages[0]?.stage ?? 1;
  for (const s of tree.stages) if (stageOpen(tree, s.stage, book)) cur = s.stage;
  return cur;
}

// ---- visibility ----------------------------------------------------------------------------------------------

export function checkRequires(tree: Tree, id: string, view: StateView, book: NodeBook): RequirementCheck {
  const n = node(tree, id);
  const open = stageOpen(tree, n.stage, book);
  const missingNodes = n.requires.nodes.filter((p) => !isComplete(book, p));
  const anyOfMet = n.requires.anyOf.length === 0 || n.requires.anyOf.some((g) => g.every((p) => isComplete(book, p)));
  const failedState = n.requires.state.filter((c) => !holds(tree, c.expr, view));
  return { ok: open && missingNodes.length === 0 && anyOfMet && failedState.length === 0, stageOpen: open, missingNodes, anyOfMet, failedState };
}

export function isVisible(tree: Tree, id: string, view: StateView, book: NodeBook): boolean {
  return book.revealed.includes(id) || checkRequires(tree, id, view, book).ok;
}

export function nodeStatus(tree: Tree, id: string, view: StateView, book: NodeBook): NodeStatus {
  if (isComplete(book, id)) return "complete";
  if (isBuilding(book, id)) return "building";
  if (closedBy(tree, id, book)) return "closed";
  return isVisible(tree, id, view, book) ? "available" : "hidden";
}

/**
 * The option of `id`'s exclusive choice that was taken (started or finished), when it isn't `id`
 * itself; null when `id` is in no choice or nothing else was taken.
 */
export function closedBy(tree: Tree, id: string, book: NodeBook): string | null {
  const c = tree.nodes[id]?.choice;
  const choice = c ? tree.choices?.[c] : undefined;
  if (!choice) return null;
  return choice.options.find((o) => o !== id && (isComplete(book, o) || isBuilding(book, o))) ?? null;
}

/** Nodes that are available or building, in tree order (optionally one stage). */
export function visibleNodes(tree: Tree, view: StateView, book: NodeBook, stage?: number): string[] {
  return tree.nodeOrder.filter((id) => {
    if (stage !== undefined && tree.nodes[id]!.stage !== stage) return false;
    const s = nodeStatus(tree, id, view, book);
    return s === "available" || s === "building";
  });
}

/** Latch newly visible nodes into `revealed`. `revealed` lists the new ones (for auto-pause). */
export function revealNodes(tree: Tree, view: StateView, book: NodeBook): { book: NodeBook; revealed: string[] } {
  const fresh = tree.nodeOrder.filter(
    (id) => !book.revealed.includes(id) && !isComplete(book, id) && !closedBy(tree, id, book) && checkRequires(tree, id, view, book).ok,
  );
  if (!fresh.length) return { book, revealed: [] };
  return { book: { ...book, revealed: [...book.revealed, ...fresh] }, revealed: fresh };
}

// ---- pages ----------------------------------------------------------------------------------------------------

/**
 * Coverage (0-1) of a topic or category from `bundles_taken`. A map gives topic -> coverage; a list
 * counts listed topics as fully covered. A category is its topics' coverage weighted by `full`.
 */
export function bundleCoverage(tree: Tree, bundle: string, view: StateView): number {
  const taken = view.get("bundles_taken");
  const topicCoverage = (topic: string): number => {
    if (Array.isArray(taken)) return taken.includes(topic) ? 1 : 0;
    if (taken && typeof taken === "object") {
      const v = (taken as Readonly<Record<string, number>>)[topic];
      return typeof v === "number" ? Math.min(1, v) : 0;
    }
    return 0;
  };
  const cat = tree.draft.pages.find((c) => c.id === bundle);
  if (!cat) return topicCoverage(bundle);
  const full = cat.topics.reduce((t, x) => t + x.full, 0);
  if (full <= 0) return 0;
  return cat.topics.reduce((t, x) => t + topicCoverage(x.id) * x.full, 0) / full;
}

export function pagesTier(tree: Tree, id: string, view: StateView): PagesTier {
  const n = node(tree, id);
  if (!n.pagesBundle) return "known";
  const c = bundleCoverage(tree, n.pagesBundle, view);
  const t = tree.draft.coverageTiers;
  return c >= t.known ? "known" : c >= t.partial ? "partial" : "absent";
}

/** Labor for the node given page coverage: × withoutPagesLaborFactor when the bundle is absent. */
export function effectiveLabor(tree: Tree, id: string, view: StateView): number {
  const n = node(tree, id);
  const base = n.requires.laborPersonDays;
  if (n.withoutPagesLaborFactor !== null && pagesTier(tree, id, view) === "absent") return base * n.withoutPagesLaborFactor;
  return base;
}

// ---- affordability and building ----------------------------------------------------------------------------------

/** Shortfall per resource; empty when affordable. */
export function missingResources(tree: Tree, id: string, view: StateView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [r, need] of Object.entries(node(tree, id).requires.resources)) {
    const have = view.stock(r);
    if (have < need) out[r] = need - have;
  }
  return out;
}

export const isAffordable = (tree: Tree, id: string, view: StateView): boolean => Object.keys(missingResources(tree, id, view)).length === 0;

export type StartResult =
  | { ok: true; book: NodeBook; consume: Record<string, number>; events: BuildEvent[] }
  | { ok: false; reason: "hidden" | "building" | "complete" | "closed" | "unaffordable"; missing: Record<string, number> };

/**
 * Start building a node: requires must hold (a revealed non-gate node may start after a state
 * condition lapses; a gate is re-checked every time) and resources must be in stock. The caller
 * removes `consume` from stock. A node with no labor completes at once (gates, free choices).
 */
export function startBuild(tree: Tree, id: string, view: StateView, book: NodeBook): StartResult {
  const n = node(tree, id);
  if (isComplete(book, id)) return { ok: false, reason: "complete", missing: {} };
  if (isBuilding(book, id)) return { ok: false, reason: "building", missing: {} };
  if (closedBy(tree, id, book)) return { ok: false, reason: "closed", missing: {} };
  const check = checkRequires(tree, id, view, book);
  const structural = check.stageOpen && check.missingNodes.length === 0 && check.anyOfMet;
  const stateOk = check.failedState.length === 0 || (n.kind !== "gate" && book.revealed.includes(id));
  if (!structural || !stateOk) return { ok: false, reason: "hidden", missing: {} };
  const missing = missingResources(tree, id, view);
  if (Object.keys(missing).length) return { ok: false, reason: "unaffordable", missing };
  const started: NodeBook = {
    ...book,
    revealed: book.revealed.includes(id) ? book.revealed : [...book.revealed, id],
    building: { ...book.building, [id]: { laborDone: 0, laborTotal: effectiveLabor(tree, id, view), milestonesFired: [] } },
  };
  const { book: after, events } = advanceBuild(tree, started, id, 0);
  return { ok: true, book: after, consume: { ...n.requires.resources }, events };
}

/** Add Build labor to one node. Returns the labor actually used (never more than remains). */
export function advanceBuild(tree: Tree, book: NodeBook, id: string, personDays: number): { book: NodeBook; events: BuildEvent[]; used: number } {
  const p = book.building[id];
  if (!p) return { book, events: [], used: 0 };
  const n = node(tree, id);
  const used = Math.max(0, Math.min(personDays, p.laborTotal - p.laborDone));
  const laborDone = p.laborDone + used;
  const done = laborDone >= p.laborTotal;
  const fraction = p.laborTotal > 0 ? laborDone / p.laborTotal : 1;
  const events: BuildEvent[] = [];
  const fired = [...p.milestonesFired];
  for (const m of n.milestones) {
    if (!fired.includes(m.id) && (done || fraction >= m.at)) {
      fired.push(m.id);
      events.push({ type: "milestone", node: id, milestone: m });
    }
  }
  if (!done) {
    return { book: { ...book, building: { ...book.building, [id]: { laborDone, laborTotal: p.laborTotal, milestonesFired: fired } } }, events, used };
  }
  const building = { ...book.building };
  delete building[id];
  const complete: BuildEvent = { type: "complete", node: id, writes: n.writesState, jobs: n.unlocks.jobs };
  const opens = Object.values(tree.workshops).find((w) => w.opensWith === id);
  if (opens) complete.opensWorkshop = opens.id;
  events.push(complete);
  return { book: { ...book, building, completed: [...book.completed, id] }, events, used };
}

/**
 * Spread a day's Build labor evenly over every active build, in start order; labor a finishing build
 * doesn't need flows to the rest. Returns the labor left over when nothing is being built.
 */
export function advanceBuilds(tree: Tree, book: NodeBook, personDays: number): { book: NodeBook; events: BuildEvent[]; unused: number } {
  let left = personDays;
  const events: BuildEvent[] = [];
  let cur = book;
  for (let guard = 0; left > 1e-9 && guard < 1000; guard++) {
    const ids = Object.keys(cur.building);
    if (!ids.length) break;
    const share = left / ids.length;
    let usedThisRound = 0;
    for (const id of ids) {
      const r = advanceBuild(tree, cur, id, share);
      cur = r.book;
      events.push(...r.events);
      usedThisRound += r.used;
    }
    left -= usedThisRound;
    if (usedThisRound <= 1e-9) break;
  }
  return { book: cur, events, unused: Math.max(0, left) };
}

/** The concrete state a completed node sets (flags true, resolved enums); simulation-owned writes are omitted. */
export function stateAssignments(tree: Tree, id: string): Record<string, StateValue> {
  const out: Record<string, StateValue> = {};
  for (const w of node(tree, id).writesState) if (w.value !== null) out[w.variable] = w.value;
  return out;
}

// ---- jobs, workshops, gates --------------------------------------------------------------------------------------

/** Starting jobs of every open stage plus jobs unlocked by completed nodes, in first-available order. */
export function availableJobs(tree: Tree, book: NodeBook): string[] {
  const out: string[] = [];
  const add = (j: string) => {
    if (!out.includes(j)) out.push(j);
  };
  for (const s of tree.stages) if (stageOpen(tree, s.stage, book)) s.startingJobs.forEach(add);
  for (const id of book.completed) tree.nodes[id]?.unlocks.jobs.forEach(add);
  return out;
}

/**
 * A workshop is open once its `opens_with` node, or any node of kind `workshop` naming it, is complete:
 * a trap (the Savery pump) mustn't be the only door into a workshop the real route needs.
 */
export const isWorkshopOpen = (tree: Tree, workshop: string, book: NodeBook): boolean => {
  const w = tree.workshops[workshop];
  if (!w) return false;
  if (isComplete(book, w.opensWith)) return true;
  return book.completed.some((id) => tree.nodes[id]?.kind === "workshop" && tree.nodes[id]?.workshop === workshop);
};

export const openWorkshops = (tree: Tree, book: NodeBook): string[] => Object.keys(tree.workshops).filter((w) => isWorkshopOpen(tree, w, book));

/** Dial ids the player can set: the workshop is open and the dial's `added_by` node is complete. */
export function availableDials(tree: Tree, workshop: string, book: NodeBook): string[] {
  const w = tree.workshops[workshop];
  if (!w || !isWorkshopOpen(tree, workshop, book)) return [];
  // The opening node's dials come with the workshop however it opened.
  return w.dials.filter((d) => d.addedBy === w.opensWith || isComplete(book, d.addedBy)).map((d) => d.id);
}

/** The stage gate's checks (gate.condition) with the unmet ones listed for the UI. */
export function gateStatus(tree: Tree, stage: number, view: StateView): { met: boolean; unmet: Condition[] } {
  const s = tree.stages.find((x) => x.stage === stage);
  if (!s) throw new Error(`unknown stage ${stage}`);
  const unmet = s.gate.condition.filter((c) => !holds(tree, c.expr, view));
  return { met: unmet.length === 0, unmet };
}

/** Initial value of every declared state variable (from the tree's defaults). */
export function initialState(tree: Tree): Record<string, StateValue> {
  const out: Record<string, StateValue> = {};
  for (const [id, v] of Object.entries(tree.stateVariables)) out[id] = Array.isArray(v.default) ? [...v.default] : v.default;
  return out;
}
