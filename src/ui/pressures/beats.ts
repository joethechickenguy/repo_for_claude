// Beat gating (package F; work-packages.md § F): nodes of beat N appear only after at least one node
// of beat N-1 of the same stage is complete, on top of their own requirements, so controls arrive in
// order. Pure functions over the tree and the node book.
//
// Readings (open question 41): "beat N-1" is the nearest lower beat that has nodes in that stage (a
// stage may skip a beat number); the lowest beat of a stage is always open (the stage itself opens
// with the previous gate, which B already checks).
//
// G4 (open question 60): a beat of optional nodes only (oil, aluminum; rails or canals) mustn't hold
// the rest of the stage hostage, so a beat waits on the nearest lower beat that has a critical-path
// node; and a gate waits only on its own requirements.
import { isComplete, type NodeBook, type Tree } from "../../content";

/** Beats that have nodes in a stage, ascending. */
export function stageBeats(tree: Tree, stage: number): number[] {
  const s = new Set<number>();
  for (const id of tree.nodeOrder) {
    const n = tree.nodes[id]!;
    if (n.stage === stage) s.add(n.beat);
  }
  return [...s].sort((a, b) => a - b);
}

/** Is beat `beat` of `stage` open: the nearest lower beat with nodes has a completed node? */
export function beatOpen(tree: Tree, stage: number, beat: number, book: Readonly<NodeBook>): boolean {
  const lower = stageBeats(tree, stage).filter((b) => b < beat);
  if (lower.length === 0) return true;
  const critical = lower.filter((b) => tree.nodeOrder.some((id) => tree.nodes[id]!.stage === stage && tree.nodes[id]!.beat === b && tree.nodes[id]!.criticalPath));
  const prev = (critical.length ? critical : lower)[(critical.length ? critical : lower).length - 1]!;
  return tree.nodeOrder.some((id) => {
    const n = tree.nodes[id]!;
    return n.stage === stage && n.beat === prev && isComplete(book as NodeBook, id);
  });
}

/** The gate the projects system applies: a node's beat must be open. */
export function nodeBeatOpen(tree: Tree, id: string, book: Readonly<NodeBook>): boolean {
  const n = tree.nodes[id];
  if (n?.kind === "gate") return true;
  return !!n && beatOpen(tree, n.stage, n.beat, book);
}

/** The highest open beat of a stage (for the header and tests). */
export function currentBeat(tree: Tree, stage: number, book: Readonly<NodeBook>): number {
  let cur = 0;
  for (const b of stageBeats(tree, stage)) if (beatOpen(tree, stage, b, book)) cur = b;
  return cur;
}
