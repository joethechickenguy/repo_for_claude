// Builds the two `TreeRow` trees (roster, pages) and the weakest-area line from a `DraftState`. No
// DOM here; `index.ts` feeds these into package D's `PeopleTree` (src/ui/controls).
import type { Tree } from "../../content";
import type { TreeRow } from "../controls";
import { fill, STRINGS } from "../strings";
import {
  BLOCK,
  BUILDERS_POOL_ID,
  categoryFull,
  isSpecialtyPinned,
  isTopicPinned,
  poolValue,
  specialtyValue,
  stepCategory,
  stepPool,
  stepSpecialty,
  stepTopic,
  topicValue,
  weakestArea,
  type DraftState,
} from "./model";

/** 10000 -> "10,000". */
const num = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Whether a dry-run ± of `blocks` actually moves the value (drives a row's canInc/canDec). */
function moves(before: number, after: number, blocks: number): boolean {
  return blocks > 0 ? after > before : after < before;
}

/** "Changes: A, B, C" for the nodes whose `pages_bundle` is this topic or category id, else undefined. */
function bundleHint(tree: Tree, bundleId: string): string | undefined {
  const names = tree.nodeOrder.filter((id) => tree.nodes[id]!.pagesBundle === bundleId).map((id) => tree.nodes[id]!.name);
  return names.length ? fill(STRINGS.draft.changes, { list: names.join(", ") }) : undefined;
}

export function rosterRows(tree: Tree, state: DraftState): TreeRow[] {
  return tree.draft.roster.map((pool) => {
    const value = poolValue(state, pool.id);
    const isBuilders = pool.id === BUILDERS_POOL_ID;
    const canInc = !isBuilders && moves(value, poolValue(stepPool(tree, state, pool.id, 1), pool.id), 1);
    const canDec = !isBuilders && moves(value, poolValue(stepPool(tree, state, pool.id, -1), pool.id), -1);
    return {
      id: pool.id,
      name: pool.name,
      value,
      detail: fill(STRINGS.draft.ofFull, { full: num(pool.full) }),
      note: pool.absent || undefined,
      step: isBuilders ? 0 : BLOCK,
      canInc,
      canDec,
      children: pool.specialties.map((spec) => {
        const sv = specialtyValue(state, pool.id, spec.id);
        const inc = stepSpecialty(tree, state, pool.id, spec.id, 1);
        const dec = stepSpecialty(tree, state, pool.id, spec.id, -1);
        return {
          id: spec.id,
          name: spec.name,
          value: sv,
          detail: fill(STRINGS.draft.ofFull, { full: num(spec.full) }),
          note: spec.speeds || undefined,
          step: BLOCK,
          canInc: moves(sv, specialtyValue(inc, pool.id, spec.id), 1),
          canDec: moves(sv, specialtyValue(dec, pool.id, spec.id), -1),
          canPin: true,
          pinned: isSpecialtyPinned(state, pool.id, spec.id),
        };
      }),
    };
  });
}

export function pagesRows(tree: Tree, state: DraftState): TreeRow[] {
  return tree.draft.pages.map((cat) => {
    const value = state.pages[cat.id] ?? 0;
    const inc = stepCategory(tree, state, cat.id, 1);
    const dec = stepCategory(tree, state, cat.id, -1);
    return {
      id: cat.id,
      name: cat.name,
      value,
      detail: fill(STRINGS.draft.ofFull, { full: num(categoryFull(cat)) }),
      hint: bundleHint(tree, cat.id),
      step: BLOCK,
      canInc: moves(value, inc.pages[cat.id] ?? 0, 1),
      canDec: moves(value, dec.pages[cat.id] ?? 0, -1),
      children: cat.topics.map((topic) => {
        const tv = topicValue(state, cat.id, topic.id);
        const tInc = stepTopic(tree, state, cat.id, topic.id, 1);
        const tDec = stepTopic(tree, state, cat.id, topic.id, -1);
        return {
          id: topic.id,
          name: topic.name,
          value: tv,
          detail: fill(STRINGS.draft.ofFull, { full: num(topic.full) }),
          note: topic.skips || undefined,
          hint: bundleHint(tree, topic.id),
          step: BLOCK,
          canInc: moves(tv, topicValue(tInc, cat.id, topic.id), 1),
          canDec: moves(tv, topicValue(tDec, cat.id, topic.id), -1),
          canPin: true,
          pinned: isTopicPinned(state, cat.id, topic.id),
        };
      }),
    };
  });
}

export function weakestAreaLine(tree: Tree, state: DraftState): string {
  return fill(STRINGS.draft.weakest, { name: weakestArea(tree, state).name });
}

export function peopleLine(tree: Tree, state: DraftState): string {
  const used = tree.draft.roster.reduce((s, r) => s + poolValue(state, r.id), 0);
  return fill(STRINGS.draft.peopleLine, { used: num(used), total: num(tree.draft.peopleTotal) });
}

export function pagesLine(tree: Tree, state: DraftState): string {
  const used = Object.values(state.pages).reduce((a, b) => a + b, 0);
  return fill(STRINGS.draft.pagesLine, { used: num(used), budget: num(tree.draft.pageBudget) });
}
