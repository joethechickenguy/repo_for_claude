// Types for the engine core (package A). Content types here are the *engine's* input shapes: package B
// maps its loaded tree onto them. Everything in EngineState is plain JSON so a save is a deep copy.

/** Any JSON value. Saves, set-typed state and system data are made of these. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// ---- Content (input) -----------------------------------------------------------------------------

/** The five declared variable types in `tech-tree/state-variables.yaml`. */
export type StateVarType = "flag" | "number" | "count" | "enum" | "set";

/**
 * A state value, as package B defines it (src/content/types.ts): boolean for flags, number for
 * numbers and counts, string for enums, and for sets either a member list (`deposits_known`) or a map
 * member -> share (`bundles_taken`: topic -> coverage). Plain JSON, so saves hold it as-is.
 */
export type { StateValue, StateView, StateWrite } from "../content/types";
import type { StateValue } from "../content/types";

/** A set variable's value: a member list or a member -> share map. */
export type SetValue = Extract<StateValue, object>;

/** One entry of `state-variables.yaml`. */
export interface StateVarDef {
  id: string;
  type: StateVarType;
  /** Enum members; the first is the default initial value. */
  values?: string[];
  unit?: string;
  description?: string;
  /** Initial value (B's `default`). Defaults: flag false, number/count 0, enum first member, set []. */
  initial?: StateValue;
}

/** One entry of `resources.yaml` (plus tool resources the engine needs; see ToolDef). */
export interface ResourceDef {
  id: string;
  producedBy?: string;
  /** Only wood, charcoal and clay are perishable (DESIGN.md, Production). */
  perishable?: boolean;
  /** Fraction of stock lost per day if perishable. Falls back to EngineParams.defaultSpoilPerDay. */
  spoilPerDay?: number;
}

/** Amounts of resources keyed by resource id (`{wood_kg: 1000, blades: 500}`). */
export type ResourceAmounts = Record<string, number>;

/**
 * A job: what one person does in one day at full speed. Rates are per worker-day. A job's throughput
 * is people x tool efficiency (if `tool`) x rate modifiers; inputs, outputs, burns and labor all
 * scale with it. If an input runs short, the whole job runs at the fraction it can supply.
 */
export interface JobDef {
  id: string;
  inputs?: ResourceAmounts;
  outputs?: ResourceAmounts;
  /** The part of inputs burned as fuel for work (energy accounting reads it; package C). */
  burns?: ResourceAmounts;
  /** Workers wear a tool and drop to bare-hand speed without one. */
  tool?: boolean;
  /** Labor pool this job feeds, in person-days per worker-day (`build` for the Build job). */
  labor?: string;
  /** Specialty or trade the job's skill comes from (draft specialty id); informational for modifiers. */
  skill?: string;
}

/** A resource that serves as a tool. Users take the longest-lived tools first. */
export interface ToolDef {
  resource: string;
  /** Worker-days one tool lasts (flint ~20, copper ~200, bronze ~400 per Stage 1's tool_wear). */
  lifeWorkerDays: number;
  /** Counts toward the `metal_tools` binding. */
  metal?: boolean;
}

/**
 * A facility in the works tier: a target output of one resource, made by `primaryJob`, with optional
 * support jobs that make the primary job's inputs. Works are created at runtime (a built furnace) or
 * listed in content.
 */
export interface WorksDef {
  id: string;
  name?: string;
  /** Resource the target is expressed in. */
  output: string;
  /** Job that makes `output`. */
  primaryJob: string;
  /** Support jobs staffed to feed the primary job's inputs. Primary job is implied. */
  supportJobs?: string[];
  /** Department id for the departments tier. */
  department?: string;
}

/** Department ids with default priorities (higher first). */
export interface DepartmentDef {
  id: string;
  name?: string;
  priority?: number;
}

export type LaborTier = "people" | "works" | "departments";

/** Tuning numbers the engine needs. Content may override every one; see params.ts for defaults. */
export interface EngineParams {
  /** Tool jobs run at this fraction of speed with no tool. */
  bareHandEfficiency: number;
  /** Spoilage fraction per day for perishable resources without their own rate. */
  defaultSpoilPerDay: number;
  /** Idle person-days needed to add one trained person to a trade. */
  trainingPersonDaysPerPerson: number;
  /** Pull-based production keeps this many days of consumer demand in stock as a buffer. */
  pullBufferDays: number;
  /** Pull works close a gap between stock and (claims + buffer) over this many days. */
  pullRefillDays: number;
}

/**
 * Which declared state variables the engine keeps up to date itself. A binding pointing at a variable
 * that isn't declared is skipped.
 */
export interface StateBindings {
  /** tools in stock / tool users (1 when nobody uses a tool). */
  toolCoverage: string;
  /** Sum of stocks of metal tools. */
  metalTools: string;
  /** Jobs with at least one person. */
  jobsActive: string;
  /** Works with a target set. */
  worksActive: string;
  /** Enum people | works | departments; the engine reads the tier from it. */
  laborTier: string;
  /** In-game year = day / 365. */
  year: string;
}

/** Everything the engine needs from content. Package B builds this from the loaded tree. */
export interface EngineContent {
  /** People in the colony (draft.yaml people_total). */
  population: number;
  stateVars: StateVarDef[];
  resources: ResourceDef[];
  /** Every job in the game, in a fixed order (production runs in this order each tick). */
  jobs: JobDef[];
  tools: ToolDef[];
  /** Jobs available from day 0. */
  startingJobs: string[];
  /** Count variables idle people can train into (`machinists_trained`, `trained_smiths`, ...). */
  trades?: string[];
  works?: WorksDef[];
  departments?: DepartmentDef[];
  /** Initial stocks. */
  initialStocks?: ResourceAmounts;
  params?: Partial<EngineParams>;
  bindings?: Partial<StateBindings>;
}

// ---- Runtime state (saved) -------------------------------------------------------------------------

/** A works' target: a number (units of output per day), `pull` (fill consumer demand), or none. */
export type WorksTarget = number | "pull" | null;

export interface WorksState {
  def: WorksDef;
  target: WorksTarget;
}

export type ModifierKind = "rate" | "yield" | "toolLife" | "training";

/** Everything that changes during a run. Plain JSON; a save is a copy of this plus system data. */
export interface EngineState {
  day: number;
  stocks: Record<string, number>;
  state: Record<string, StateValue>;
  /** Named numbers that aren't declared state (energy_w_per_person, campaigns_run); set by systems. */
  metrics: Record<string, number>;
  unlockedJobs: string[];
  labor: {
    /** Tier when `labor_tier` isn't a declared variable; otherwise the variable wins. */
    tier: LaborTier;
    /** Player-set people per job (people tier; jobs outside any works in later tiers). */
    manual: Record<string, number>;
    /** Pinned rows `worksId/jobId` -> people. Auto-staffing never touches them. */
    pins: Record<string, number>;
    works: WorksState[];
    departmentPriority: Record<string, number>;
  };
  training: {
    trade: string | null;
    /** Fractional progress toward the next trained person, per trade. */
    progress: Record<string, number>;
  };
  /** `kind|target|source` -> factor. */
  modifiers: Record<string, number>;
  /** source -> resources it is waiting for (a queued node's cost). Counts as demand. */
  claims: Record<string, ResourceAmounts>;
  /** Consumer demand (full-rate input need) from the last tick; pull works staff to it. */
  lastRequested: ResourceAmounts;
  /** Tool efficiency from the last tick; auto-staffing sizes crews with it. */
  lastToolEfficiency: number;
}

/** A versioned save. `systems` holds each registered system's own data by system id. */
export interface SaveGame {
  saveVersion: 1;
  engine: EngineState;
  systems: Record<string, JsonValue>;
}

// ---- Reports ---------------------------------------------------------------------------------------

/**
 * Why a system wants the clock to stop: a red bar, a completed node, a newly visible node. The UI
 * turns it into the one-line reason from its strings; the engine carries no prose.
 */
export interface PauseReason {
  /** e.g. `node_complete`, `node_revealed`, `milestone`, `pressure_red`. */
  kind: string;
  /** The node, pressure or milestone id. */
  subject?: string;
}

export type AssignmentReason = "manual" | "pinned" | "auto";

/** One staffing decision, so the people panel can show what the engine assigned and why. */
export interface AssignmentRecord {
  jobId: string;
  /** Undefined for manual rows outside any works. */
  worksId?: string;
  department?: string;
  people: number;
  reason: AssignmentReason;
  /** People the engine wanted for this row but the pool didn't have. */
  shortfall: number;
}

export interface JobReport {
  people: number;
  /** people x tool efficiency x rate modifiers. */
  throughput: number;
  /** Fraction of throughput actually run (inputs short or pull cap). */
  fraction: number;
  /** Why fraction < 1: the limiting input resource, or `pull` when capped by demand. */
  limitedBy?: string;
}

export interface TickReport {
  /** Day index that this tick simulated (0 for the first). */
  day: number;
  assigned: Record<string, number>;
  idle: number;
  staffing: AssignmentRecord[];
  jobs: Record<string, JobReport>;
  toolUsers: number;
  toolStock: number;
  /** min(1, tools / users). */
  toolCoverage: number;
  /** bare + (1 - bare) x coverage. */
  toolEfficiency: number;
  produced: ResourceAmounts;
  consumed: ResourceAmounts;
  burned: ResourceAmounts;
  worn: ResourceAmounts;
  spoiled: ResourceAmounts;
  /** Consumer full-rate input need this tick (the pull-based demand, before claims). */
  requested: ResourceAmounts;
  /** Labor produced per pool this tick (person-days). */
  labor: Record<string, number>;
  /** Labor taken from each pool by systems this tick. */
  laborUsed: Record<string, number>;
  /** People added to each trade this tick. */
  trained: Record<string, number>;
  /** Why systems asked the clock to stop after this tick. */
  pauseReasons: PauseReason[];
}
