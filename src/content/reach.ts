// What the content can actually produce (owner playtest 2026-09-27: Stage 2 opened, then nothing could
// ever move because no Stage 2 job had rates, and the game said "keep working"). Pure functions over
// the tree: which jobs make a resource, from which stage they can exist, and which resources a stage's
// nodes need that nothing in the build can make yet (a content gap, not a player mistake).
import { exprRefs } from "./expr";
import type { Tree } from "./types";

/** Jobs whose structured rates output `resource`. */
export function producers(tree: Tree, resource: string): string[] {
  return Object.values(tree.jobs)
    .filter((j) => (j.rates?.outputs?.[resource] ?? 0) > 0)
    .map((j) => j.id);
}

/** The earliest stage a job can be worked in: a starting job, or unlocked by a node of that stage. */
export function jobFirstStage(tree: Tree, jobId: string): number | null {
  const j = tree.jobs[jobId];
  if (!j) return null;
  const stages = j.unlockedBy.map((n) => tree.nodes[n]?.stage ?? Infinity);
  if (j.startingInStage !== null) stages.push(j.startingInStage);
  const first = Math.min(...stages);
  return Number.isFinite(first) ? first : null;
}

/** Can anything make `resource` by `stage` (a job with rates that exists by then)? */
export function producibleBy(tree: Tree, resource: string, stage: number): boolean {
  return producers(tree, resource).some((j) => {
    const s = jobFirstStage(tree, j);
    return s !== null && s <= stage;
  });
}

/** Resources a node needs: its `requires.resources`, plus resources its state conditions compare. */
export function resourcesNeeded(tree: Tree, id: string): string[] {
  const n = tree.nodes[id];
  if (!n) return [];
  const out = new Set(Object.keys(n.requires.resources));
  for (const c of n.requires.state) for (const ref of exprRefs(c.expr)) if (ref in tree.resources) out.add(ref);
  return [...out];
}

export interface ContentGap {
  node: string;
  resource: string;
}

/** Every (node, resource) in `stage` where the node needs a resource nothing can make by that stage. */
export function stageGaps(tree: Tree, stage: number): ContentGap[] {
  const out: ContentGap[] = [];
  for (const id of tree.nodeOrder) {
    if (tree.nodes[id]!.stage !== stage) continue;
    for (const r of resourcesNeeded(tree, id)) if (!producibleBy(tree, r, stage)) out.push({ node: id, resource: r });
  }
  return out;
}

export interface Reach {
  /** Nodes that can still be completed (or already are), given what can be made. */
  nodes: Set<string>;
  /** Resources some reachable job makes. */
  makes: Set<string>;
  /** Names a condition reads that nothing declares, makes or supplies, and resources nothing reachable makes. */
  missing: Set<string>;
}

/**
 * What can still be reached up to `stage`, working forward from `done` (completed nodes): starting
 * jobs and jobs unlocked by reachable nodes make resources; a node is reachable when its required
 * nodes, one `any_of` group, its resources and the resources its conditions compare are all
 * reachable. Other conditions (on declared state or `supplied` metrics) are assumed able to come true.
 * `closed` nodes (the options not taken) are never reachable. Repeats until nothing changes.
 */
export function reach(tree: Tree, stage: number, done: readonly string[], closed: readonly string[], supplied: ReadonlySet<string>): Reach {
  const nodes = new Set(done);
  const shut = new Set(closed);
  const jobs = new Set<string>();
  for (const j of Object.values(tree.jobs)) if (j.startingInStage !== null && j.startingInStage <= stage) jobs.add(j.id);
  const makes = new Set<string>();
  const refresh = (): void => {
    for (const id of nodes) for (const j of tree.nodes[id]?.unlocks.jobs ?? []) jobs.add(j);
    for (const j of jobs) for (const [r, v] of Object.entries(tree.jobs[j]?.rates?.outputs ?? {})) if (v > 0) makes.add(r);
  };
  const nameOk = (ref: string): boolean => (ref in tree.resources ? makes.has(ref) : ref in tree.stateVariables || supplied.has(ref));
  refresh();
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of tree.nodeOrder) {
      const n = tree.nodes[id]!;
      if (n.stage > stage || nodes.has(id) || shut.has(id)) continue;
      const r = n.requires;
      if (!r.nodes.every((p) => nodes.has(p))) continue;
      if (r.anyOf.length && !r.anyOf.some((g) => g.every((p) => nodes.has(p)))) continue;
      if (!Object.keys(r.resources).every((res) => makes.has(res))) continue;
      if (!r.state.every((c) => exprRefs(c.expr).every(nameOk))) continue;
      nodes.add(id);
      changed = true;
    }
    if (changed) refresh();
  }
  const missing = new Set<string>();
  for (const id of tree.nodeOrder) {
    const n = tree.nodes[id]!;
    if (n.stage !== stage || nodes.has(id) || shut.has(id)) continue;
    for (const res of Object.keys(n.requires.resources)) if (!makes.has(res)) missing.add(res);
    for (const c of n.requires.state) for (const ref of exprRefs(c.expr)) if (!nameOk(ref)) missing.add(ref);
  }
  return { nodes, makes, missing };
}
