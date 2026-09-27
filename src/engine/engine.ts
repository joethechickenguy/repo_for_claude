// The engine: one tick is one day. Deterministic: the same content, state and calls give the same
// ticks. No randomness, no wall-clock reads; iteration follows content order.
import { rowKey, staff, worksJobs, type StaffingResult } from "./labor";
import { DAYS_PER_YEAR, DEFAULT_BINDINGS, DEFAULT_PARAMS } from "./params";
import { StateError, StateStore } from "./state";
import type {
  EngineContent,
  EngineParams,
  EngineState,
  JobDef,
  JsonValue,
  LaborTier,
  ModifierKind,
  PauseReason,
  ResourceAmounts,
  ResourceDef,
  SaveGame,
  StateBindings,
  StateValue,
  StateView,
  StateWrite,
  TickReport,
  ToolDef,
  WorksDef,
  WorksTarget,
} from "./types";

export class EngineError extends Error {}

/** What a system sees during a tick, after production, tool wear, spoilage and training. */
export interface TickContext {
  readonly engine: Engine;
  /** Day index being simulated. */
  readonly day: number;
  /** The report so far (production is complete). */
  readonly report: TickReport;
  /** Labor left in a pool this tick (person-days). */
  laborAvailable(pool: string): number;
  /** Take up to `amount` person-days from a pool; returns what was granted. Unused labor is lost. */
  takeLabor(pool: string, amount: number): number;
  /** Ask the clock to stop after this tick. */
  pause(reason: PauseReason): void;
}

/**
 * Something that runs once per tick inside the engine: package B's projects (spend Build labor,
 * fire milestones, apply writes_state), package F's pressures, package H's campaign. Systems run in
 * registration order. `save`/`load` carry the system's own data in the save game.
 */
export interface EngineSystem {
  readonly id: string;
  tick(ctx: TickContext): void;
  save?(): JsonValue;
  load?(data: JsonValue): void;
}

export type TickListener = (report: TickReport) => void;

const SAVE_VERSION = 1 as const;

/** Rounding slack so 365 days of 1/365 add up to a whole trained person despite float drift. */
const TRAINING_EPS = 1e-9;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function add(m: ResourceAmounts, k: string, v: number): void {
  m[k] = (m[k] ?? 0) + v;
}

export class Engine implements StateView {
  readonly content: EngineContent;
  readonly params: EngineParams;
  readonly bindings: StateBindings;
  /** Typed access to declared state variables. */
  readonly state: StateStore;

  private s: EngineState;
  private readonly jobDefs: Map<string, JobDef>;
  private readonly resourceDefs: Map<string, ResourceDef>;
  private readonly resourceIds: string[];
  private readonly tools: ToolDef[];
  private readonly systems: EngineSystem[] = [];
  private readonly pendingSystemData: Record<string, JsonValue>;
  private readonly listeners: TickListener[] = [];
  private lastReport: TickReport | null = null;
  private tickCtx: { labor: Record<string, number> } | null = null;

  /** Start a new run from content, or resume from a save. */
  constructor(content: EngineContent, save?: SaveGame) {
    this.content = content;
    this.params = { ...DEFAULT_PARAMS, ...(content.params ?? {}) };
    this.bindings = { ...DEFAULT_BINDINGS, ...(content.bindings ?? {}) };
    this.jobDefs = new Map(content.jobs.map((j) => [j.id, j]));
    this.tools = [...content.tools];

    const resources: ResourceDef[] = [...content.resources];
    for (const t of content.tools) if (!resources.some((r) => r.id === t.resource)) resources.push({ id: t.resource });
    this.resourceDefs = new Map(resources.map((r) => [r.id, r]));
    this.resourceIds = resources.map((r) => r.id);
    this.checkContent();

    if (save) {
      if (save.saveVersion !== SAVE_VERSION) throw new EngineError(`unknown save version ${save.saveVersion}`);
      this.s = clone(save.engine);
      this.pendingSystemData = clone(save.systems);
    } else {
      this.s = this.initialState();
      this.pendingSystemData = {};
    }
    this.state = new StateStore(content.stateVars, this.s.state);
  }

  /** Resume a run from a save (same as `new Engine(content, save)`). */
  static load(content: EngineContent, save: SaveGame): Engine {
    return new Engine(content, save);
  }

  // ---- Time ----------------------------------------------------------------------------------------

  /** Days simulated so far. */
  get day(): number {
    return this.s.day;
  }

  /** In-game year (fractional). */
  get year(): number {
    return this.s.day / DAYS_PER_YEAR;
  }

  /** The last tick's report, or null before the first tick. */
  get report(): TickReport | null {
    return this.lastReport;
  }

  /** Run `days` ticks; returns the last report. Does not stop for pause requests (the Clock does). */
  run(days: number): TickReport | null {
    for (let i = 0; i < days; i++) this.tick();
    return this.lastReport;
  }

  onTick(listener: TickListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  // ---- Resources -----------------------------------------------------------------------------------

  resourceList(): readonly string[] {
    return this.resourceIds;
  }

  stock(resource: string): number {
    return this.s.stocks[resource] ?? 0;
  }

  stocks(): Readonly<Record<string, number>> {
    return this.s.stocks;
  }

  canAfford(cost: ResourceAmounts): boolean {
    return Object.entries(cost).every(([r, a]) => this.stock(r) >= a);
  }

  /** Remove `cost` from stock if all of it is there; otherwise change nothing. */
  spend(cost: ResourceAmounts): boolean {
    for (const r of Object.keys(cost)) this.needResource(r);
    if (!this.canAfford(cost)) return false;
    for (const [r, a] of Object.entries(cost)) this.s.stocks[r] = this.stock(r) - a;
    return true;
  }

  /** Add to stock (a milestone's find, a refund). Negative amounts are refused. */
  addStock(resource: string, amount: number): void {
    this.needResource(resource);
    if (!(amount >= 0)) throw new EngineError(`addStock ${resource}: amount must be >= 0`);
    this.s.stocks[resource] = this.stock(resource) + amount;
  }

  /**
   * Register what `source` (a queued node, a works) is waiting for. Claims count as demand: pull
   * works fill them, and the stores panel shows them. `null` removes the claim.
   */
  setClaim(source: string, amounts: ResourceAmounts | null): void {
    if (amounts === null) {
      delete this.s.claims[source];
      return;
    }
    for (const r of Object.keys(amounts)) this.needResource(r);
    this.s.claims[source] = { ...amounts };
  }

  /** Total claimed amount of a resource across sources. */
  claimed(resource: string): number {
    let t = 0;
    for (const c of Object.values(this.s.claims)) t += c[resource] ?? 0;
    return t;
  }

  /** Consumers' full-rate need per day from the last tick (the pull-based demand). */
  requested(resource: string): number {
    return this.s.lastRequested[resource] ?? 0;
  }

  // ---- State ---------------------------------------------------------------------------------------

  /**
   * StateView (package B): a declared state variable, else a metric the engine or a system computes
   * (energy_w_per_person, campaigns_run). Undefined for unknown names; a condition on one is false.
   * B's `lookupFor` sends resources.yaml names to `stock()`; engine resources the YAML doesn't
   * declare (ore_kg, copper_tools) are answered here with their stock.
   */
  get(name: string): StateValue | undefined {
    if (this.state.has(name)) return this.state.get(name);
    if (Object.prototype.hasOwnProperty.call(this.s.metrics, name)) return this.s.metrics[name];
    if (this.resourceDefs.has(name)) return this.stock(name);
    return undefined;
  }

  /**
   * Apply a completed node's `writes_state` (B's StateWrite list). Entries with a value are set;
   * `value: null` means the simulation owns the variable and nothing is written. Returns the ids written.
   */
  applyWrites(writes: readonly StateWrite[]): string[] {
    const written: string[] = [];
    for (const w of writes) {
      if (!this.state.has(w.variable)) throw new StateError(`writes_state: '${w.variable}' is not declared`);
      if (w.value === null) continue;
      this.state.set(w.variable, w.value);
      written.push(w.variable);
    }
    return written;
  }

  /** A named number that isn't declared state (e.g. `energy_w_per_person`, `campaigns_run`). */
  metric(name: string): number | undefined {
    return this.s.metrics[name];
  }

  setMetric(name: string, value: number): void {
    if (!Number.isFinite(value)) throw new EngineError(`metric ${name} must be finite`);
    this.s.metrics[name] = value;
  }

  // ---- Jobs and labor ------------------------------------------------------------------------------

  get population(): number {
    return this.content.population;
  }

  jobDef(id: string): JobDef | undefined {
    return this.jobDefs.get(id);
  }

  unlockJob(id: string): void {
    if (!this.jobDefs.has(id)) throw new EngineError(`unknown job '${id}'`);
    if (!this.s.unlockedJobs.includes(id)) this.s.unlockedJobs.push(id);
  }

  isJobUnlocked(id: string): boolean {
    return this.s.unlockedJobs.includes(id);
  }

  /** Unlocked jobs in content order (the order production runs). */
  unlockedJobs(): JobDef[] {
    const set = new Set(this.s.unlockedJobs);
    return this.content.jobs.filter((j) => set.has(j.id));
  }

  laborTier(): LaborTier {
    if (this.state.has(this.bindings.laborTier)) return this.state.getEnum(this.bindings.laborTier) as LaborTier;
    return this.s.labor.tier;
  }

  setLaborTier(tier: LaborTier): void {
    this.s.labor.tier = tier;
    this.state.setIfDeclared(this.bindings.laborTier, tier);
  }

  /**
   * Set the player's people on a job (people tier, and jobs outside any works later). Clamped so the
   * manual total never exceeds the population; returns the number actually set.
   */
  assign(jobId: string, people: number): number {
    if (!this.isJobUnlocked(jobId)) throw new EngineError(`job '${jobId}' is not unlocked`);
    const others = Object.entries(this.s.labor.manual).reduce((a, [k, v]) => (k === jobId ? a : a + v), 0);
    const n = Math.max(0, Math.min(Math.floor(people), this.population - others));
    if (n === 0) delete this.s.labor.manual[jobId];
    else this.s.labor.manual[jobId] = n;
    return n;
  }

  /** The player's manual count for a job. */
  manual(jobId: string): number {
    return this.s.labor.manual[jobId] ?? 0;
  }

  /** People working each job right now (staffing recomputed from current settings). */
  assigned(jobId: string): number {
    return this.staffing().assigned[jobId] ?? 0;
  }

  /** Idle people right now; they train in the chosen trade. */
  idle(): number {
    return this.staffing().idle;
  }

  /**
   * Current staffing: who is on what, with a record per row (manual, pinned, auto) and shortfalls.
   * Pure: recomputed from settings, so the UI can call it after every +/-.
   */
  staffing(): StaffingResult {
    return this.computeStaffing(this.modCache(), this.s.lastToolEfficiency);
  }

  /** Add a works (a facility). Replaces a works with the same id, keeping its target. */
  addWorks(def: WorksDef, target: WorksTarget = null): void {
    for (const j of [def.primaryJob, ...(def.supportJobs ?? [])])
      if (!this.jobDefs.has(j)) throw new EngineError(`works ${def.id}: unknown job '${j}'`);
    this.needResource(def.output);
    const i = this.s.labor.works.findIndex((w) => w.def.id === def.id);
    if (i >= 0) this.s.labor.works[i] = { def: clone(def), target: this.s.labor.works[i]!.target };
    else this.s.labor.works.push({ def: clone(def), target });
  }

  removeWorks(id: string): void {
    this.s.labor.works = this.s.labor.works.filter((w) => w.def.id !== id);
    for (const k of Object.keys(this.s.labor.pins)) if (k.startsWith(`${id}/`)) delete this.s.labor.pins[k];
  }

  works(): ReadonlyArray<Readonly<{ def: WorksDef; target: WorksTarget }>> {
    return this.s.labor.works;
  }

  /** Set a works' target: units of output per day, `pull` (fill demand), or null (only pinned rows). */
  setWorksTarget(id: string, target: WorksTarget): void {
    const w = this.s.labor.works.find((x) => x.def.id === id);
    if (!w) throw new EngineError(`unknown works '${id}'`);
    if (typeof target === "number" && !(target >= 0)) throw new EngineError(`works ${id}: target must be >= 0`);
    w.target = target;
  }

  /** Move a works to a new position in the staffing order (works tier fills in list order). */
  moveWorks(id: string, index: number): void {
    const i = this.s.labor.works.findIndex((w) => w.def.id === id);
    if (i < 0) throw new EngineError(`unknown works '${id}'`);
    const [w] = this.s.labor.works.splice(i, 1);
    this.s.labor.works.splice(Math.max(0, Math.min(index, this.s.labor.works.length)), 0, w!);
  }

  /** Pin a row inside a works to a fixed number of people; null unpins. Auto-staffing never touches pins. */
  pin(worksId: string, jobId: string, people: number | null): void {
    const key = rowKey(worksId, jobId);
    if (people === null) {
      delete this.s.labor.pins[key];
      return;
    }
    const w = this.s.labor.works.find((x) => x.def.id === worksId);
    if (!w || !worksJobs(w).includes(jobId)) throw new EngineError(`no row ${key}`);
    this.s.labor.pins[key] = Math.max(0, Math.floor(people));
  }

  pins(): Readonly<Record<string, number>> {
    return this.s.labor.pins;
  }

  setDepartmentPriority(department: string, priority: number): void {
    this.s.labor.departmentPriority[department] = priority;
  }

  departmentPriority(department: string): number | undefined {
    return this.s.labor.departmentPriority[department];
  }

  // ---- Training ------------------------------------------------------------------------------------

  /** The trade idle people train in (a count variable from `trades`), or null for none. */
  setTrainingTrade(trade: string | null): void {
    if (trade !== null && !(this.content.trades ?? []).includes(trade))
      throw new EngineError(`'${trade}' is not a trade`);
    this.s.training.trade = trade;
  }

  trainingTrade(): string | null {
    return this.s.training.trade;
  }

  /** Fraction of the way to the next trained person in a trade. */
  trainingProgress(trade: string): number {
    return this.s.training.progress[trade] ?? 0;
  }

  // ---- Modifiers -----------------------------------------------------------------------------------

  /**
   * Set a multiplier from a named source; null removes it. Factors from different sources multiply.
   * - `rate`, target job id: scales the job's throughput (inputs and outputs), e.g. wind furnaces 3x,
   *   a red pressure's production fraction, a specialty's fill.
   * - `yield`, target job id: scales outputs only.
   * - `toolLife`, target tool resource: scales how long a tool lasts (iron 3x bronze, iron_quality).
   * - `training`, target trade id: scales training speed (teachers).
   * Target `*` applies to every target of that kind.
   */
  setModifier(kind: ModifierKind, target: string, source: string, factor: number | null): void {
    const key = `${kind}|${target}|${source}`;
    if (factor === null) {
      delete this.s.modifiers[key];
      return;
    }
    if (!(factor >= 0) || !Number.isFinite(factor)) throw new EngineError(`modifier ${key}: bad factor ${factor}`);
    this.s.modifiers[key] = factor;
  }

  /** Product of all modifiers of a kind on a target (including `*`). */
  modifier(kind: ModifierKind, target: string): number {
    return this.modCache().get(kind, target);
  }

  // ---- Systems -------------------------------------------------------------------------------------

  /** Register a per-tick system. If the engine was loaded from a save, the system's data is restored. */
  addSystem(system: EngineSystem): void {
    if (this.systems.some((s) => s.id === system.id)) throw new EngineError(`system '${system.id}' already added`);
    this.systems.push(system);
    const data = this.pendingSystemData[system.id];
    if (data !== undefined && system.load) system.load(clone(data));
  }

  // ---- Save / load ---------------------------------------------------------------------------------

  /** A deep copy of the run, including each system's data. JSON-safe. */
  save(): SaveGame {
    const systems: Record<string, JsonValue> = clone(this.pendingSystemData);
    for (const sys of this.systems) if (sys.save) systems[sys.id] = clone(sys.save());
    return { saveVersion: SAVE_VERSION, engine: clone(this.s), systems };
  }

  // ---- The tick ------------------------------------------------------------------------------------

  /** Simulate one day. */
  tick(): TickReport {
    const dt = 1;
    const day = this.s.day;
    const mods = this.modCache();
    const staffing = this.computeStaffing(mods, this.s.lastToolEfficiency);
    const jobs = this.unlockedJobs();
    const bare = this.params.bareHandEfficiency;

    const report: TickReport = {
      day,
      assigned: staffing.assigned,
      idle: staffing.idle,
      staffing: staffing.records,
      jobs: {},
      toolUsers: 0,
      toolStock: 0,
      toolCoverage: 1,
      toolEfficiency: 1,
      produced: {},
      consumed: {},
      burned: {},
      worn: {},
      spoiled: {},
      requested: {},
      labor: {},
      laborUsed: {},
      trained: {},
      pauseReasons: [],
    };

    // Tool coverage from stocks at the start of the day.
    let users = 0;
    for (const j of jobs) if (j.tool) users += staffing.assigned[j.id] ?? 0;
    const toolStock = this.toolStock();
    const coverage = users > 0 ? Math.min(1, toolStock / users) : 1;
    const eff = bare + (1 - bare) * coverage;
    report.toolUsers = users;
    report.toolStock = toolStock;
    report.toolCoverage = coverage;
    report.toolEfficiency = eff;

    // Throughput and consumer demand at full rate.
    const thr: Record<string, number> = {};
    for (const j of jobs) {
      const n = staffing.assigned[j.id] ?? 0;
      thr[j.id] = n * (j.tool ? eff : 1) * mods.get("rate", j.id);
      for (const [r, a] of Object.entries(j.inputs ?? {})) add(report.requested, r, thr[j.id]! * a);
    }

    // Pull allowance: pull-managed output may fill demand + claims + buffer, never more.
    const allowed: Record<string, number> = {};
    for (const jobId of staffing.pullJobs) {
      for (const r of Object.keys(this.jobDefs.get(jobId)?.outputs ?? {})) {
        if (r in allowed) continue;
        const req = report.requested[r] ?? 0;
        allowed[r] = Math.max(0, req * dt + this.claimed(r) + this.params.pullBufferDays * req - this.stock(r));
      }
    }

    // Production, in content order.
    const stocks = this.s.stocks;
    for (const j of jobs) {
      const n = staffing.assigned[j.id] ?? 0;
      const t = thr[j.id] ?? 0;
      if (n <= 0) continue;
      let f = 1;
      let limitedBy: string | undefined;
      for (const [r, a] of Object.entries(j.inputs ?? {})) {
        const need = t * a * dt;
        if (need <= 0) continue;
        const fr = (stocks[r] ?? 0) / need;
        if (fr < f) {
          f = fr;
          limitedBy = r;
        }
      }
      f = Math.max(0, Math.min(1, f));
      const yieldF = mods.get("yield", j.id);
      if (staffing.pullJobs.has(j.id) && j.outputs) {
        let cap = 0;
        for (const [r, a] of Object.entries(j.outputs)) {
          const full = t * a * yieldF * dt;
          cap = Math.max(cap, full > 0 ? (allowed[r] ?? 0) / full : 1);
        }
        if (cap < f) {
          f = Math.max(0, cap);
          limitedBy = "pull";
        }
      }
      for (const [r, a] of Object.entries(j.inputs ?? {})) {
        const used = t * a * dt * f;
        stocks[r] = (stocks[r] ?? 0) - used;
        add(report.consumed, r, used);
      }
      for (const [r, a] of Object.entries(j.outputs ?? {})) {
        const made = t * a * yieldF * dt * f;
        stocks[r] = (stocks[r] ?? 0) + made;
        add(report.produced, r, made);
        if (r in allowed) allowed[r] = Math.max(0, (allowed[r] as number) - made);
      }
      for (const [r, a] of Object.entries(j.burns ?? {})) add(report.burned, r, t * a * dt * f);
      if (j.labor) add(report.labor, j.labor, t * dt * f);
      report.jobs[j.id] = { people: n, throughput: t, fraction: f, ...(limitedBy ? { limitedBy } : {}) };
    }

    // Tool wear: users take the longest-lived tools first.
    let remaining = users;
    for (const tool of this.toolsByLife(mods)) {
      if (remaining <= 0) break;
      const have = stocks[tool.resource] ?? 0;
      const u = Math.min(remaining, have);
      if (u <= 0) continue;
      const life = tool.lifeWorkerDays * mods.get("toolLife", tool.resource);
      const wear = life > 0 ? Math.min(have, (u * dt) / life) : have;
      stocks[tool.resource] = have - wear;
      add(report.worn, tool.resource, wear);
      remaining -= u;
    }

    // Spoilage: perishables only.
    for (const r of this.resourceIds) {
      const def = this.resourceDefs.get(r);
      if (!def?.perishable) continue;
      const rate = def.spoilPerDay ?? this.params.defaultSpoilPerDay;
      const have = stocks[r] ?? 0;
      if (have <= 0 || rate <= 0) continue;
      const lost = have * (1 - Math.pow(1 - rate, dt));
      stocks[r] = have - lost;
      add(report.spoiled, r, lost);
    }

    // Training: idle person-days become trained people in the chosen trade.
    const trade = this.s.training.trade;
    if (trade && staffing.idle > 0) {
      const gain =
        (staffing.idle * dt * mods.get("training", trade)) / this.params.trainingPersonDaysPerPerson;
      const p = (this.s.training.progress[trade] ?? 0) + gain;
      const whole = Math.floor(p + TRAINING_EPS);
      this.s.training.progress[trade] = Math.max(0, p - whole);
      if (whole > 0 && this.state.has(trade)) {
        const before = this.state.getNumber(trade);
        const after = Math.min(this.population, before + whole);
        this.state.set(trade, after);
        report.trained[trade] = after - before;
      }
    }

    this.s.lastRequested = report.requested;
    this.s.lastToolEfficiency = eff;
    this.s.day = day + 1;
    this.updateBindings(users, staffing);

    // Systems: projects, pressures, campaigns.
    this.tickCtx = { labor: { ...report.labor } };
    const ctx: TickContext = {
      engine: this,
      day,
      report,
      laborAvailable: (pool) => this.tickCtx?.labor[pool] ?? 0,
      takeLabor: (pool, amount) => {
        const tc = this.tickCtx;
        if (!tc) return 0;
        const got = Math.max(0, Math.min(amount, tc.labor[pool] ?? 0));
        tc.labor[pool] = (tc.labor[pool] ?? 0) - got;
        add(report.laborUsed, pool, got);
        return got;
      },
      pause: (reason) => void report.pauseReasons.push({ ...reason }),
    };
    try {
      for (const sys of this.systems) sys.tick(ctx);
    } finally {
      this.tickCtx = null;
    }

    this.lastReport = report;
    for (const l of [...this.listeners]) l(report);
    return report;
  }

  // ---- Internals -----------------------------------------------------------------------------------

  private initialState(): EngineState {
    const stocks: Record<string, number> = {};
    for (const r of this.resourceIds) stocks[r] = 0;
    for (const [r, a] of Object.entries(this.content.initialStocks ?? {})) {
      if (!this.resourceDefs.has(r)) throw new EngineError(`initialStocks: unknown resource '${r}'`);
      stocks[r] = a;
    }
    const departmentPriority: Record<string, number> = {};
    for (const d of this.content.departments ?? []) if (d.priority !== undefined) departmentPriority[d.id] = d.priority;
    const st: EngineState = {
      day: 0,
      stocks,
      state: StateStore.initialValues(this.content.stateVars),
      metrics: {},
      unlockedJobs: [...this.content.startingJobs],
      labor: {
        tier: "people",
        manual: {},
        pins: {},
        works: (this.content.works ?? []).map((def) => ({ def: clone(def), target: null })),
        departmentPriority,
      },
      training: { trade: null, progress: {} },
      modifiers: {},
      claims: {},
      lastRequested: {},
      lastToolEfficiency: 1,
    };
    return st;
  }

  private checkContent(): void {
    const c = this.content;
    if (!(c.population > 0)) throw new EngineError("population must be > 0");
    for (const j of c.jobs)
      for (const part of [j.inputs, j.outputs, j.burns])
        for (const r of Object.keys(part ?? {}))
          if (!this.resourceDefs.has(r)) throw new EngineError(`job ${j.id}: unknown resource '${r}'`);
    for (const id of c.startingJobs) if (!this.jobDefs.has(id)) throw new EngineError(`unknown starting job '${id}'`);
    const declared = new Set(c.stateVars.map((v) => v.id));
    for (const t of c.trades ?? []) if (!declared.has(t)) throw new EngineError(`trade '${t}' is not declared state`);
  }

  private needResource(r: string): void {
    if (!this.resourceDefs.has(r)) throw new EngineError(`unknown resource '${r}'`);
  }

  private toolStock(): number {
    let t = 0;
    for (const tool of this.tools) t += this.s.stocks[tool.resource] ?? 0;
    return t;
  }

  /** Tools by effective life, longest first; ties keep content order. */
  private toolsByLife(mods: ModCache): ToolDef[] {
    const life = (t: ToolDef) => t.lifeWorkerDays * mods.get("toolLife", t.resource);
    return [...this.tools].sort((a, b) => {
      const la = life(a);
      const lb = life(b);
      return la === lb ? 0 : lb > la ? 1 : -1;
    });
  }

  private computeStaffing(mods: ModCache, eff: number): StaffingResult {
    const jobs = this.unlockedJobs();
    const perWorker = (jobId: string) => {
      const j = this.jobDefs.get(jobId);
      return j ? (j.tool ? eff : 1) * mods.get("rate", jobId) : 0;
    };
    return staff({
      tier: this.laborTier(),
      population: this.population,
      jobs,
      manual: this.s.labor.manual,
      pins: this.s.labor.pins,
      works: this.s.labor.works,
      departmentPriority: this.s.labor.departmentPriority,
      outputPerWorker: (jobId, r) =>
        perWorker(jobId) * (this.jobDefs.get(jobId)?.outputs?.[r] ?? 0) * mods.get("yield", jobId),
      inputPerWorker: (jobId, r) => perWorker(jobId) * (this.jobDefs.get(jobId)?.inputs?.[r] ?? 0),
      pullTarget: (r) => {
        const req = this.s.lastRequested[r] ?? 0;
        const gap = this.claimed(r) + this.params.pullBufferDays * req - this.stock(r);
        return req + Math.max(0, gap) / this.params.pullRefillDays;
      },
    });
  }

  private updateBindings(users: number, staffing: StaffingResult): void {
    const b = this.bindings;
    const st = this.state;
    st.setIfDeclared(b.toolCoverage, users > 0 ? this.toolStock() / users : 1);
    let metal = 0;
    for (const t of this.tools) if (t.metal) metal += this.s.stocks[t.resource] ?? 0;
    st.setIfDeclared(b.metalTools, metal);
    let active = 0;
    for (const n of Object.values(staffing.assigned)) if (n > 0) active++;
    st.setIfDeclared(b.jobsActive, active);
    st.setIfDeclared(b.worksActive, this.s.labor.works.filter((w) => w.target !== null).length);
    st.setIfDeclared(b.year, this.year);
  }

  private modCache(): ModCache {
    return new ModCache(this.s.modifiers);
  }
}

/** Products of modifiers per kind and target, built once per tick. */
class ModCache {
  private readonly byKey = new Map<string, number>();
  constructor(modifiers: Readonly<Record<string, number>>) {
    for (const [key, f] of Object.entries(modifiers)) {
      const [kind, target] = key.split("|");
      const k = `${kind}|${target}`;
      this.byKey.set(k, (this.byKey.get(k) ?? 1) * f);
    }
  }
  get(kind: ModifierKind, target: string): number {
    return (this.byKey.get(`${kind}|${target}`) ?? 1) * (this.byKey.get(`${kind}|*`) ?? 1);
  }
}
