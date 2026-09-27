// Typed shapes of the compiled tech tree (src/content/tree.json) and the small state interface the
// node logic reads. Package B owns this file. Other packages import these types from
// `src/content` (index.ts); changes here are additive only.

import type { Expr } from "./expr";

export type { Expr, CmpOp, Literal } from "./expr";

// ---- State -----------------------------------------------------------------------------------------

export type StateVarType = "flag" | "number" | "count" | "enum" | "set";

/**
 * A state value. `set` variables hold either a list of members (`deposits_known`, `mineral_sites`)
 * or a map member -> share (`bundles_taken`: topic -> page coverage 0-1; `draft_roster`: pool ->
 * people). Both are plain JSON so the engine can save them as-is.
 */
export type StateValue =
  | boolean
  | number
  | string
  | readonly string[]
  | Readonly<Record<string, number>>;

/**
 * What the node logic needs from the running game. The engine (package A) implements it.
 * `get` answers declared state variables and any metric the engine computes that expressions
 * name without declaring (see `Tree.identifiers`, kind "undeclared", e.g. energy_w_per_person).
 * It returns undefined for names it doesn't know; an undeclared name it doesn't know is then read
 * from `stock` (so an engine may model `ore_kg` as a resource), and a condition on any other unknown
 * name is false.
 */
export interface StateView {
  get(name: string): StateValue | undefined;
  /** Stock on hand of a resource from resources.yaml. */
  stock(resource: string): number;
}

export interface StateVariable {
  id: string;
  type: StateVarType;
  /** Enum members, in declaration order. */
  values?: string[];
  unit?: string;
  description?: string;
  /** From `default:` in state-variables.yaml when present, else false / 0 / first enum value / []. */
  default: StateValue;
}

// ---- Resources and jobs ------------------------------------------------------------------------------

export interface Resource {
  id: string;
  producedBy: string;
  perishable: boolean;
  note?: string;
  /** Display name (resources.yaml `name`), e.g. "Wood (kg)". Optional; added for package D. */
  name?: string;
  /** Fuel kind when burned for work (`wood`, `charcoal`, ...; energy.md), read by the energy system. */
  fuel?: string;
  /** Each unit produced is 1 kWh of delivered shaft work (engines), counted x2.5 (energy.md rule 5). */
  work?: boolean;
}

/**
 * Structured job rates per worker-day, from a stage file's `jobs:` map (open question 25). Resource
 * ids are resources.yaml ids. Added for packages D/G1; all optional.
 */
export interface JobRates {
  inputs?: Record<string, number>;
  outputs?: Record<string, number>;
  /** The part of inputs burned as fuel for work (energy accounting). */
  burns?: Record<string, number>;
  /** Workers wear a tool and drop to bare-hand speed without one. */
  tool?: boolean;
  /** Labor pool the job feeds (`build`). */
  labor?: string;
}

/** A resource that serves as a tool (stage file `tools:` map; open question 26). */
export interface ToolSpec {
  resource: string;
  /** Worker-days one tool lasts. */
  lifeWorkerDays: number;
  /** Counts toward `metal_tools`. */
  metal: boolean;
}

export interface Job {
  id: string;
  /** Available from the start of `startingInStage` (stage file `starting_jobs`). */
  startingInStage: number | null;
  /** Nodes whose completion unlocks the job, in tree order. */
  unlockedBy: string[];
  /** Earliest stage in which the job can exist. */
  stage: number;
  /** Resources whose `produced_by` is this job. */
  produces: string[];
  /** The rate comment after `jobs: [...]` in the stage file, verbatim (all estimates). */
  rateNote?: string;
  /** From the stage file's `jobs:` map, when it lists the job: display name, one line on what it does, one on why. */
  name?: string;
  what?: string;
  why?: string;
  /** Structured rates from the stage file's `jobs:` map. Jobs without them make nothing yet. */
  rates?: JobRates;
}

// ---- Expressions ---------------------------------------------------------------------------------------

/** A parsed `requires.state` / gate / `red_when` condition, with its source text for the UI. */
export interface Condition {
  text: string;
  expr: Expr;
}

/** How an identifier in an expression is resolved at run time. */
export type IdentifierKind = "state" | "resource" | "undeclared";

// ---- Nodes -----------------------------------------------------------------------------------------------

export type NodeKind = "project" | "upgrade" | "decision_option" | "workshop" | "gate" | "hub";

export interface Milestone {
  /** Fraction of the node's labor at which it fires, 0-1. */
  at: number;
  id: string;
  effect: string;
}

/**
 * One `writes_state` entry. `value` is what completion sets: true for flags; for enums the value
 * from the node's `writes_values` map, or the one enum member the node id names (savery_pump ->
 * savery). null means the simulation or the player's choice owns the value (numbers, counts,
 * sets, and decision nodes like deposit_choice); completion only marks the variable as touched.
 */
export interface StateWrite {
  variable: string;
  value: StateValue | null;
}

export interface NodeRequires {
  nodes: string[];
  /** One group fully complete. Empty: no alternative requirement. */
  anyOf: string[][];
  state: Condition[];
  resources: Record<string, number>;
  /** 0 when the YAML gives none (gates, decisions that cost only the choice). */
  laborPersonDays: number;
}

export interface TreeNode {
  id: string;
  name: string;
  stage: number;
  beat: number;
  kind: NodeKind;
  workshop?: string;
  route: string[];
  criticalPath: boolean;
  problem: string;
  requires: NodeRequires;
  milestones: Milestone[];
  unlocks: { jobs: string[]; effects: string[] };
  readsState: string[];
  writesState: StateWrite[];
  /** Topic or category id from draft.yaml; null for `none` or absent (gates). */
  pagesBundle: string | null;
  withoutPages?: string;
  /**
   * Labor multiplier when the bundle is absent: `without_pages_labor` if the node sets it, else
   * the first "Nx labor" in `without_pages`, else null (the without-pages route is not just slower).
   */
  withoutPagesLaborFactor: number | null;
  numbersStatus?: string;
  sources: string[];
  tags: string[];
  trapLesson?: string;
  notebook: string;
  /** The exclusive choice this node is an option of (stage `choices:`), if any. */
  choice?: string;
  /** One line on what this option gives up or gains, shown on its card (node `tradeoff:`). */
  tradeoff?: string;
  /** Engine modifiers applied for good when the node completes (node `modifiers:`, same shape as `red_modifiers`). */
  modifiers?: PressureModifier[];
  /** Added to a pressure's per-day drift once the node is complete (node `pressure_per_day:`). */
  pressurePerDay?: Record<string, number>;
  /** Numeric state shifted once on completion (node `adjusts_state:`, e.g. `{iron_quality: -1}`). */
  adjustsState?: Record<string, number>;
}

/**
 * An either/or: a stage's `choices:` entry. Starting any option closes the others for good, and the
 * projects panel shows the options together as one decision.
 */
export interface Choice {
  id: string;
  stage: number;
  prompt: string;
  options: string[];
}

// ---- Stages, pressures, workshops -------------------------------------------------------------------------

export type LaborTier = "people" | "works" | "departments";

export interface Pressure {
  id: string;
  stage: number;
  name: string;
  drives: string;
  heartbeat: boolean;
  risesWith: string[];
  /** `expr` is null when `red_when` is prose (most heartbeat bars); package F reads `text`. */
  redWhen: { text: string; expr: Expr | null };
  effectWhenRed: string;
  answers: string[];
  introducedInBeat: number;
  /** How the simulation moves `drives` each day (pressure `model:`), when the YAML gives it. Package F. */
  model?: PressureModel;
  /** `effect_when_red` as production fractions (pressure `red_modifiers:`), applied while red. Package F. */
  redModifiers?: PressureModifier[];
}

/**
 * Per-day movement of a pressure's variable: + `perUnitProduced[r]` for each unit of r produced that
 * day, + `perUnitConsumed[r]` per unit consumed, + `perDay`, clamped to [min, max]. The variable's
 * start is its state default. Numbers are estimates (play values).
 */
export interface PressureModel {
  perUnitProduced: Record<string, number>;
  perUnitConsumed: Record<string, number>;
  /** + this per effective worker-day of a job (people x efficiency x modifiers x the fraction that ran). */
  perWorker?: Record<string, number>;
  perDay: number;
  min?: number;
  max?: number;
  /** A flow bar: the variable restarts at 0 each day, so it shows today's net (e.g. fuel made minus used). */
  flow?: boolean;
}

/** One engine modifier a red bar applies: kind `rate` | `yield` | `toolLife` | `training`. */
export interface PressureModifier {
  kind: "rate" | "yield" | "toolLife" | "training";
  target: string;
  factor: number;
}

export interface Gate {
  id: string;
  name: string;
  /** Every check, including numeric keys like `energy_w_per_person: 250` as `>=` conditions. */
  condition: Condition[];
  routes: string[];
  score?: string;
}

export interface Stage {
  stage: number;
  file: string;
  name: string;
  openingProblem: string;
  heartbeat: string | null;
  laborTier: LaborTier;
  startingJobs: string[];
  gate: Gate;
  pressures: Pressure[];
  /** Workshops defined or extended in this stage file. */
  workshops: string[];
  /** Node ids in file order. */
  nodes: string[];
}

export interface Dial {
  id: string;
  name: string;
  options?: string[];
  range?: [number, number];
  addedBy: string;
  effect: string;
  basis: string;
  /** Stage file that added the dial (base or extension). */
  stage: number;
}

/** A workshop with every `extends: true` block merged in, dials in arrival order. */
export interface Workshop {
  id: string;
  name: string;
  opensWith: string;
  loop: string;
  outputs: string[];
  failureRule?: string;
  stage: number;
  dials: Dial[];
}

// ---- Draft --------------------------------------------------------------------------------------------------

export interface DraftSpecialty {
  id: string;
  name: string;
  full: number;
  speeds: string;
}

export interface DraftPool {
  id: string;
  name: string;
  default: number;
  thin: number;
  full: number;
  absent: string;
  note?: string;
  specialties: DraftSpecialty[];
}

export interface DraftTopic {
  id: string;
  name: string;
  full: number;
  skips: string;
}

export interface DraftCategory {
  id: string;
  name: string;
  default: number;
  topics: DraftTopic[];
}

export interface DraftArea {
  id: string;
  name: string;
  roster: string;
  pages: string;
}

export interface Draft {
  peopleTotal: number;
  pageBudget: number;
  roster: DraftPool[];
  pages: DraftCategory[];
  areas: DraftArea[];
  /** Page coverage thresholds (draft.yaml `coverage_tiers`, else its documented 1.0 / 0.5). */
  coverageTiers: { known: number; partial: number };
}

// ---- The whole tree ------------------------------------------------------------------------------------------

export interface Tree {
  version: 1;
  stages: Stage[];
  /** Every node of every stage, keyed by id. `nodeOrder` gives tree order. */
  nodes: Record<string, TreeNode>;
  nodeOrder: string[];
  stateVariables: Record<string, StateVariable>;
  resources: Record<string, Resource>;
  jobs: Record<string, Job>;
  workshops: Record<string, Workshop>;
  draft: Draft;
  /** Every identifier used in a node, gate or pressure expression, with how it resolves. */
  identifiers: Record<string, IdentifierKind>;
  warnings: string[];
  /** Tool resources from the stage files' `tools:` maps, keyed by resource id. Added for D/G1. */
  tools?: Record<string, ToolSpec>;
  /** Exclusive choices from the stage files' `choices:` lists, keyed by id. */
  choices?: Record<string, Choice>;
}
