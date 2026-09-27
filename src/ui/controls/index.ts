// Shared UI controls (package D). The draft (package I) uses these too; extend additively.
export { PeopleTree, mountPeopleTree, DEFAULT_TREE_LABELS } from "./peopleTree";
export type { TreeRow, TreeHandlers, TreeLabels, TreeOptions } from "./peopleTree";
export { apportion, spread, adjustChild, adjustTotal, setPinned, stepByBlock } from "./spread";
export type { SpreadChild, SpreadResult, SpreadLimits, SpreadState } from "./spread";
