// The shell's model and controller (package D), DOM-free so tests drive exactly what the page does.
// It owns one run: the engine, the clock and the systems (energy, campaigns stand-in, projects with
// F's beat gate, the stage gate, F's pressures and introductions, the log), the player's actions
// (people ±, pins, start a project, training) and the views every panel draws.
//
// All player-facing text comes from content (tree) or ../ui/strings.ts.
import {
  checkRequires,
  closedBy,
  reach,
  type Reach,
  currentStage,
  effectiveLabor,
  gateStatus,
  missingResources,
  openWorkshops,
  type Expr,
  type NodeBook,
  type Tree,
} from "../content";
import {
  Clock,
  DECISION_SPEED,
  Engine,
  EnergySystem,
  ENERGY_METRIC,
  loadFromStorage,
  ProjectsSystem,
  saveToStorage,
  type ClockSpeed,
  type EngineContent,
  type PauseReason,
  type SaveGame,
  type SaveStorage,
  type TickReport,
} from "../engine";
import type { TreeRow } from "./controls/peopleTree";
import {
  barViews,
  currentBeat,
  introCard,
  introControls,
  IntroSystem,
  INTRO_PAUSE,
  jobControl,
  nodeBeatOpen,
  pressureControl,
  PressureSystem,
  workshopControl,
  type BarView,
  type IntroCard,
} from "./pressures";
import { fuelsFromTree, gameContent } from "./shellContent";
import { defaultDraftOutcome, type DraftOutcome } from "./shellDraft";
import { fmt, fmtRound, yearDay } from "./shellFormat";
import { GATE_PAUSE, GateSystem, LogSystem, StandInCampaigns, SUPPLIED_METRICS } from "./shellSystems";
import { fill, STRINGS } from "./strings";

/** People moved by one ± on a job row (DESIGN.md: "± blocks"; the prototype's block). */
export const PEOPLE_BLOCK = 100;
/** A works' target moves by this many units a day per ± (works tier). */
export const WORKS_TARGET_STEP = 1;
/** A department's priority moves by one per ± (departments tier). */
export const DEPARTMENT_PRIORITY_STEP = 1;

/** Slide-rule range, DESIGN.md: "a log slide rule from 100 W to 10 kW". */
export const METER_MIN_W = 100;
export const METER_MAX_W = 10000;

export interface StoreRow {
  id: string;
  name: string;
  stock: number;
  /** Net change over the last day (made − used − worn − spoiled). */
  rate: number;
  /** Consumers' full-rate need per day (pull-based demand). */
  demand: number;
  /** Waiting in queued projects' claims. */
  claimed: number;
}

export interface CostLine {
  resource: string;
  name: string;
  amount: number;
  have: number;
}

export interface ProjectCard {
  id: string;
  name: string;
  kind: string;
  problem: string;
  why: string;
  effects: string[];
  status: "available" | "building";
  cost: CostLine[];
  labor: number;
  progress?: { done: number; total: number };
  milestones: { at: number; text: string; fired: boolean }[];
  affordable: boolean;
  missing: CostLine[];
  /** A red bar lists this node among its answers. */
  suggested: boolean;
  /** One line on what this option gives up or gains (node `tradeoff`). */
  tradeoff?: string;
  /** The exclusive choice this card is an option of, while more than one option is open. */
  choice?: { id: string; prompt: string };
  /** For a taken option: the names of the options it closed. */
  choseOver?: string[];
}

export interface MeterView {
  value: number;
  min: number;
  max: number;
  gates: { watts: number; name: string; stage: number }[];
}

/**
 * Nothing in the current stage can move (owner playtest 2026-09-27: years of 20x with nothing to do and
 * no word why). `waiting`: the next projects and what each waits on; `cantMake`: what nothing in this
 * build makes or measures, i.e. the stage's content isn't finished, not a player mistake.
 */
export interface StuckView {
  waiting: { id: string; name: string; needs: string[] }[];
  /** The stage's gate can't be reached with what this build makes: the content isn't finished. */
  deadEnd: boolean;
  /** When `deadEnd`: what nothing makes or supplies (display names). */
  cantMake: string[];
}

/**
 * Play value (estimate): with nothing to build for this many days in a row, the game slows down and
 * says what the next projects wait on. A dead end says so at once.
 */
export const IDLE_NOTICE_DAYS = 60;

/** Pause kind when the current stage stops being able to move; subject is the stage number. */
export const STUCK_PAUSE = "stuck";

/** The tech map (owner playtest 2026-09-27: "how does the big picture fit together?"). */
export interface TechMap {
  /** Every stage in order, with its gate and energy target. */
  stages: { stage: number; name: string; gate: string; watts: number | null; status: "done" | "current" | "ahead"; done: number; total: number }[];
  /** The stage being shown. */
  stage: number;
  /** Its beats, in order; `here` marks the beat the colony is on. */
  beats: { beat: number; here: boolean; nodes: TechMapNode[] }[];
}

export interface TechMapNode {
  id: string;
  name: string;
  status: "done" | "building" | "ready" | "closed" | "ahead";
  gate: boolean;
  /** Option of an exclusive choice. */
  choice: boolean;
  /** Same-stage prerequisites (all required), and `any_of` groups (one group needed). */
  requires: string[];
  anyOf: string[][];
}

export interface NotebookStage {
  stage: number;
  name: string;
  entries: { id: string; name: string; text: string }[];
}

export interface GameOptions {
  /** Resume this save. */
  save?: SaveGame;
  /** What the draft wrote (new runs). Default: draft.yaml defaults. */
  draft?: DraftOutcome;
}

/** `bloom_kg > 500` -> "Bloom (kg) above 500"; null for anything but a plain comparison. */
function conditionText(x: Expr, label: (ref: string) => string): string | null {
  if (x.kind !== "cmp") return null;
  const op = (STRINGS.stuck.ops as Record<string, string>)[x.op];
  if (!op) return null;
  const v = typeof x.value === "number" ? fmt(x.value) : String(x.value);
  return fill(STRINGS.stuck.cond, { name: label(x.ref), op, value: v });
}

/** An id as words for the screen when content gives no name: `iron_kg_total` -> "Iron (kg) total". */
export function idWords(id: string): string {
  const w = id.replace(/_kg(?=_|$)/, " (kg)").replace(/_/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** `trained_smiths` -> "smiths", `electrical_engineers_trained` -> "electrical engineers". */
export function tradeLabel(id: string): string {
  return id.replace(/^trained_|_trained$/g, "").replace(/_/g, " ");
}

/** What needs the player right now, for the banner. */
export interface PauseView {
  line: string;
  cards: IntroCard[];
  reasons: PauseReason[];
}

export class Game {
  readonly content: EngineContent;
  readonly engine: Engine;
  readonly clock: Clock;
  readonly projects: ProjectsSystem;
  readonly pressures: PressureSystem;
  readonly intro: IntroSystem;
  readonly log: LogSystem;
  /**
   * What needs the player (the opening, then every red bar, finished project, new node...). The
   * clock never stops; it drops to 0.5x and these stay on the banner, newer ones added, until the
   * player moves on (dismissDecision).
   */
  decision: PauseReason[] = [];
  /** The player's own speed before the pending decisions slowed the clock; null when none pend. */
  decisionFromSpeed: ClockSpeed | null = null;
  private idleDays = 0;
  private noticed = false;

  constructor(
    readonly tree: Tree,
    opts: GameOptions = {},
  ) {
    this.content = gameContent(tree);
    this.engine = opts.save ? Engine.load(this.content, opts.save) : new Engine(this.content);
    const book = () => this.projects.book;
    this.projects = new ProjectsSystem(tree, this.engine, { gate: (id, b) => nodeBeatOpen(tree, id, b) });
    this.intro = new IntroSystem(tree, book);
    this.pressures = new PressureSystem(tree, book, (c) => this.intro.isIntroduced(c));
    this.log = new LogSystem();
    this.engine.addSystem(new EnergySystem(fuelsFromTree(tree)));
    this.engine.addSystem(new StandInCampaigns());
    this.engine.addSystem(this.projects);
    this.engine.addSystem(new GateSystem(tree, this.projects));
    this.engine.addSystem(this.pressures);
    this.engine.addSystem(this.intro);
    this.engine.addSystem(this.log);
    this.clock = new Clock(this.engine);
    this.clock.onDecision((e) => this.noteDecision(e.reasons, e.fromSpeed));
    // A dead end, or a long stretch with nothing to build, is a decision moment too: slow down and
    // say why, once per stretch.
    this.engine.onTick(() => {
      const s = this.stuck();
      this.idleDays = s ? this.idleDays + 1 : 0;
      const notice = !!s && (s.deadEnd || this.idleDays >= IDLE_NOTICE_DAYS);
      if (notice && !this.noticed) {
        const r = { kind: STUCK_PAUSE, subject: String(this.stage) };
        this.log.add({ day: this.engine.day, ...r });
        this.slowFor([r]);
      }
      this.noticed = notice;
    });

    if (!opts.save) {
      const draft = opts.draft ?? defaultDraftOutcome(tree);
      this.engine.state.setIfDeclared("draft_roster", { ...draft.draft_roster });
      this.engine.state.setIfDeclared("bundles_taken", { ...draft.bundles_taken });
      this.log.add({ day: 0, kind: "opening", subject: String(this.stage) });
      const first = this.intro.collectAndRelease(this.engine);
      if (first.length) this.noteDecision([{ kind: INTRO_PAUSE, subject: first.join(" ") }], this.clock.speed);
    }
  }

  /** Resume the saved run, or null if there is none. */
  static load(tree: Tree, storage: SaveStorage, key?: string): Game | null {
    const e = loadFromStorage(gameContent(tree), storage, key);
    return e ? new Game(tree, { save: e.save() }) : null;
  }

  save(storage: SaveStorage, key?: string): void {
    saveToStorage(this.engine, storage, key);
  }

  get book(): Readonly<NodeBook> {
    return this.projects.book;
  }

  get stage(): number {
    return currentStage(this.tree, this.projects.book);
  }

  // ---- Actions -------------------------------------------------------------------------------------

  /** Simulate one day (tests; the Clock drives real time). Slows down and records a decision like the clock. */
  step(): TickReport {
    const r = this.engine.tick();
    if (r.pauseReasons.length) this.slowFor(r.pauseReasons);
    return r;
  }

  /** The player has seen the banner: clear it (the speed stays wherever it is). */
  dismissDecision(): void {
    this.decision = [];
    this.decisionFromSpeed = null;
  }

  /** Something outside the clock's own ticks needs the player: drop to 0.5x like the clock does. */
  private slowFor(reasons: readonly PauseReason[]): void {
    const from = this.clock.speed;
    this.clock.setSpeed(DECISION_SPEED);
    this.noteDecision(reasons, from);
  }

  private noteDecision(reasons: readonly PauseReason[], fromSpeed: ClockSpeed): void {
    if (!this.decision.length) this.decisionFromSpeed = fromSpeed;
    const key = (r: PauseReason) => `${r.kind} ${r.subject ?? ""}`;
    const seen = new Set(this.decision.map(key));
    this.decision = [...this.decision, ...reasons.filter((r) => !seen.has(key(r)))];
  }

  /**
   * ± on a people-panel row. People tier: [job]. Works tier: [works] moves the target, [works, job]
   * pins that row. Departments tier: [department] moves its priority, deeper rows as the works tier.
   */
  adjust(fullPath: readonly string[], delta: number): void {
    const e = this.engine;
    let path = fullPath;
    if (e.laborTier() === "departments") {
      const inDept = e.works().some((w) => (w.def.department ?? "") === path[0]);
      if (inDept && path.length === 1) {
        const d = path[0]!;
        const step = Math.sign(delta) * DEPARTMENT_PRIORITY_STEP;
        e.setDepartmentPriority(d, (e.departmentPriority(d) ?? 0) + step);
        return;
      }
      if (inDept) path = path.slice(1); // [department, works, job] -> [works, job]
    }
    const works = e.works().find((w) => w.def.id === path[0]);
    if (works && path.length === 1) {
      const cur = typeof works.target === "number" ? works.target : 0;
      e.setWorksTarget(works.def.id, Math.max(0, cur + Math.sign(delta) * WORKS_TARGET_STEP));
      return;
    }
    if (works && path.length === 2) {
      const job = path[1]!;
      const now = e.pins()[`${works.def.id}/${job}`] ?? this.worksRowPeople(works.def.id, job);
      e.pin(works.def.id, job, Math.max(0, now + delta));
      return;
    }
    const job = path[path.length - 1]!;
    if (!e.isJobUnlocked(job)) return;
    e.assign(job, e.manual(job) + delta);
  }

  /**
   * A typed number on a people-panel row: the row is set to it (as many ± as it takes, in one go).
   * Jobs clamp to the idle people available, as ± does. Department priorities aren't counts and
   * aren't typed (their rows say `editable: false`).
   */
  setValue(fullPath: readonly string[], value: number): void {
    const e = this.engine;
    let path = fullPath;
    if (e.laborTier() === "departments") {
      const inDept = e.works().some((w) => (w.def.department ?? "") === path[0]);
      if (inDept && path.length === 1) return;
      if (inDept) path = path.slice(1);
    }
    const v = Math.max(0, Math.round(value));
    const works = e.works().find((w) => w.def.id === path[0]);
    if (works && path.length === 1) {
      e.setWorksTarget(works.def.id, v);
      return;
    }
    if (works && path.length === 2) {
      e.pin(works.def.id, path[1]!, v);
      return;
    }
    const job = path[path.length - 1]!;
    if (!e.isJobUnlocked(job)) return;
    e.assign(job, v);
  }

  /** Pin toggle (works rows). */
  setPinned(path: readonly string[], pinned: boolean): void {
    const e = this.engine;
    const p = e.laborTier() === "departments" ? path.slice(1) : path;
    if (p.length !== 2) return;
    const [w, j] = p as [string, string];
    e.pin(w, j, pinned ? this.worksRowPeople(w, j) : null);
  }

  /** Start building a node from the projects panel. */
  startProject(id: string): boolean {
    if (!this.projects.shown().includes(id)) return false;
    const r = this.projects.start(id);
    if (!r.ok) return false;
    this.log.add({ day: this.engine.day, kind: "started", subject: id });
    if (r.pauses?.length) {
      this.log.addPauses(this.engine.day, r.pauses);
      this.slowFor(r.pauses);
    }
    return true;
  }

  setTrainingTrade(trade: string | null): void {
    this.engine.setTrainingTrade(trade);
  }

  // ---- Views ---------------------------------------------------------------------------------------

  header(): { stage: number; stageName: string; year: number; day: number; energy: number } {
    const s = this.tree.stages.find((x) => x.stage === this.stage);
    const { year, day } = yearDay(this.engine.day);
    return { stage: this.stage, stageName: s?.name ?? "", year, day, energy: this.energy() };
  }

  energy(): number {
    return this.engine.metric(ENERGY_METRIC) ?? 0;
  }

  meter(): MeterView {
    const gates: MeterView["gates"] = [];
    for (const s of this.tree.stages)
      for (const c of s.gate.condition) {
        const x = c.expr;
        if (x.kind === "cmp" && x.ref === ENERGY_METRIC && typeof x.value === "number")
          gates.push({ watts: x.value, name: s.gate.name, stage: s.stage });
      }
    return { value: this.energy(), min: METER_MIN_W, max: METER_MAX_W, gates };
  }

  /** The current stage's gate: name, the checks still unmet (their text), and whether it's done. */
  gate(): { stage: number; name: string; unmet: string[]; routes: string[]; done: boolean } {
    const s = this.tree.stages.find((x) => x.stage === this.stage)!;
    const done = this.projects.isComplete(s.gate.id);
    const unmet = done
      ? []
      : gateStatus(this.tree, s.stage, this.engine).unmet.map((c) => {
          const x = c.expr;
          const now = x.kind === "cmp" ? this.engine.get(x.ref) : undefined;
          return typeof now === "number" ? fill(STRINGS.goal.now, { text: c.text, n: fmtRound(now) }) : c.text;
        });
    // The gate's route requirement (any_of): none of its groups complete yet.
    const g = this.tree.nodes[s.gate.id];
    const book = this.projects.book;
    const groups = g?.requires.anyOf ?? [];
    const routeMet = groups.length === 0 || groups.some((grp) => grp.every((id) => book.completed.includes(id)));
    const routes = done || routeMet ? [] : groups.map((grp) => grp.map((id) => this.tree.nodes[id]?.name ?? id).join(" + "));
    return { stage: s.stage, name: s.gate.name, unmet, routes, done };
  }

  /** Is a stage's gate complete? */
  gateReached(stage: number): boolean {
    const s = this.tree.stages.find((x) => x.stage === stage);
    return !!s && this.projects.isComplete(s.gate.id);
  }

  resourceName(id: string): string {
    return this.tree.resources[id]?.name ?? idWords(id);
  }

  stores(): StoreRow[] {
    const e = this.engine;
    const r = e.report;
    const rows: StoreRow[] = [];
    for (const id of e.resourceList()) {
      const stock = e.stock(id);
      const made = r?.produced[id] ?? 0;
      const used = (r?.consumed[id] ?? 0) + (r?.worn[id] ?? 0) + (r?.spoiled[id] ?? 0);
      const demand = r?.requested[id] ?? 0;
      const claimed = e.claimed(id);
      if (stock < 0.5 && made === 0 && demand === 0 && claimed === 0) continue;
      rows.push({ id, name: this.resourceName(id), stock, rate: made - used, demand, claimed });
    }
    return rows;
  }

  idle(): number {
    return this.engine.idle();
  }

  /** Jobs the people panel shows: unlocked, with rates, introduced. */
  shownJobs(): string[] {
    return this.engine
      .unlockedJobs()
      .map((j) => j.id)
      .filter((id) => this.intro.isIntroduced(jobControl(id)));
  }

  jobName(id: string): string {
    return this.tree.jobs[id]?.name ?? id;
  }

  /** Rows for the recursive people control at the current labor tier. */
  peopleRows(): TreeRow[] {
    const e = this.engine;
    const tier = e.laborTier();
    const staffing = e.staffing();
    const idle = staffing.idle;
    const report = e.report;
    const shown = new Set(this.shownJobs());
    const jobRow = (id: string, people: number, extra: Partial<TreeRow> = {}): TreeRow => {
      const jr = report?.jobs[id];
      let detail: string | undefined;
      let tone: TreeRow["tone"] = "normal";
      if (jr && people > 0 && jr.fraction < 0.98 && jr.limitedBy) {
        detail =
          jr.limitedBy === "pull"
            ? STRINGS.people.pullCapped
            : fill(STRINGS.people.short, { what: this.resourceName(jr.limitedBy).toLowerCase() });
        tone = jr.limitedBy === "pull" ? "auto" : "short";
      }
      return {
        id,
        name: this.jobName(id),
        value: people,
        note: this.tree.jobs[id]?.what ?? "",
        ...(detail ? { detail } : {}),
        tone,
        canInc: idle > 0,
        canDec: people > 0,
        ...extra,
      };
    };

    if (tier === "people") {
      return e
        .unlockedJobs()
        .filter((j) => shown.has(j.id))
        .map((j) => jobRow(j.id, e.manual(j.id), { step: PEOPLE_BLOCK }));
    }

    // Works and departments: works rows with their jobs; manual jobs outside works stay flat.
    const worksRows = (filter?: (dept: string | undefined) => boolean): TreeRow[] =>
      e
        .works()
        .filter((w) => !filter || filter(w.def.department))
        .map((w) => {
          const recs = staffing.records.filter((r) => r.worksId === w.def.id);
          const people = recs.reduce((s, r) => s + r.people, 0);
          const short = recs.reduce((s, r) => s + r.shortfall, 0);
          const target =
            w.target === "pull" ? STRINGS.people.pull : w.target === null ? "" : fill(STRINGS.people.target, { n: fmtRound(w.target) });
          return {
            id: w.def.id,
            name: w.def.name ?? this.resourceName(w.def.output),
            value: people,
            detail: short > 0 ? `${target} · ${fill(STRINGS.people.shortfall, { n: fmt(short) })}` : target,
            tone: short > 0 ? "short" : "normal",
            step: WORKS_TARGET_STEP,
            // The number is people at work; ± moves the output target. Typing a target here would
            // be confusing, so works rows take ± only (their job rows are typed).
            editable: false,
            children: recs.map((r) =>
              jobRow(r.jobId, r.people, {
                canPin: true,
                pinned: r.reason === "pinned",
                tone: r.reason === "auto" ? "auto" : r.shortfall > 0 ? "short" : "normal",
                step: PEOPLE_BLOCK,
              }),
            ),
          } satisfies TreeRow;
        });
    const inWorks = new Set(e.works().flatMap((w) => [w.def.primaryJob, ...(w.def.supportJobs ?? [])]));
    const flat = e
      .unlockedJobs()
      .filter((j) => shown.has(j.id) && !inWorks.has(j.id))
      .map((j) => jobRow(j.id, e.manual(j.id), { step: PEOPLE_BLOCK }));
    if (tier === "works") return [...worksRows(), ...flat];
    const depts = [...new Set(e.works().map((w) => w.def.department ?? ""))];
    depts.sort((a, b) => (e.departmentPriority(b) ?? 0) - (e.departmentPriority(a) ?? 0));
    return [
      ...depts.map((d) => {
        const kids = worksRows((x) => (x ?? "") === d);
        return {
          id: d,
          name: (this.content.departments ?? []).find((x) => x.id === d)?.name ?? d,
          value: kids.reduce((s, k) => s + k.value, 0),
          detail: fill(STRINGS.people.priority, { n: e.departmentPriority(d) ?? 0 }),
          step: DEPARTMENT_PRIORITY_STEP,
          editable: false,
          children: kids,
        } satisfies TreeRow;
      }),
      ...flat,
    ];
  }

  /** Trades idle people can train in: `trained_smiths` / `machinists_trained` -> "smiths" / "machinists". */
  trades(): { id: string; label: string }[] {
    return (this.content.trades ?? []).map((id) => ({ id, label: tradeLabel(id) }));
  }

  /**
   * The training line under the people panel (owner playtest 2026-09-27: "what does 'idle people
   * train as' mean?"). Shown only when someone is idle or has trained, so it never sits there
   * unexplained. `perYear` is the engine's own rate; `matters` lists open-stage projects that read
   * a trade, so the player sees why it's worth picking.
   */
  training(): {
    show: boolean;
    idle: number;
    personDays: number;
    trades: { id: string; label: string; trained: number; progress: number; matters: string[] }[];
  } {
    const e = this.engine;
    const book = this.projects.book;
    const open = new Set(this.tree.stages.filter((s) => s.stage <= this.stage).map((s) => s.stage));
    const trades = this.trades().map((t) => {
      const v = e.get(t.id);
      const matters = this.tree.nodeOrder
        .filter((id) => {
          const n = this.tree.nodes[id]!;
          return open.has(n.stage) && !book.completed.includes(id) && n.readsState.includes(t.id);
        })
        .map((id) => this.tree.nodes[id]!.name);
      return { ...t, trained: typeof v === "number" ? v : 0, progress: e.trainingProgress(t.id), matters };
    });
    const idle = this.idle();
    return {
      show: idle > 0 || trades.some((t) => t.trained > 0 || t.progress > 0),
      idle,
      personDays: e.params.trainingPersonDaysPerPerson,
      trades,
    };
  }

  /** Nodes a red bar lists as answers (suggested). */
  suggestedNodes(): Set<string> {
    const out = new Set<string>();
    for (const s of this.tree.stages)
      for (const p of s.pressures) if (this.pressures.red().includes(p.id)) p.answers.forEach((a) => out.add(a));
    return out;
  }

  projectCards(): ProjectCard[] {
    const e = this.engine;
    const suggested = this.suggestedNodes();
    const cards: ProjectCard[] = [];
    for (const id of this.projects.shown()) {
      const n = this.tree.nodes[id]!;
      if (n.kind === "gate") continue; // the gate completes on its own; the goal line shows it
      const status = this.projects.status(id) as "available" | "building";
      const cost = Object.entries(n.requires.resources).map(([r, a]) => ({ resource: r, name: this.resourceName(r), amount: a, have: e.stock(r) }));
      const missing = Object.entries(missingResources(this.tree, id, e)).map(([r, a]) => ({ resource: r, name: this.resourceName(r), amount: a, have: e.stock(r) }));
      const b = this.projects.book.building[id];
      const labor = b ? b.laborTotal : effectiveLabor(this.tree, id, e);
      const fired = b?.milestonesFired ?? [];
      cards.push({
        id,
        name: n.name,
        kind: n.kind,
        problem: n.problem,
        why: n.notebook,
        effects: n.unlocks.effects,
        status,
        cost,
        labor,
        ...(b ? { progress: { done: b.laborDone, total: b.laborTotal } } : {}),
        milestones: n.milestones.map((m) => ({ at: m.at, text: m.effect, fired: fired.includes(m.id) })),
        affordable: missing.length === 0,
        missing,
        suggested: suggested.has(id),
        ...(n.tradeoff ? { tradeoff: n.tradeoff } : {}),
        ...this.choiceFields(id),
      });
    }
    // Options of one choice sit together, where the first of them would be.
    const order = new Map<string, number>();
    cards.forEach((c, i) => {
      const key = c.choice?.id ?? c.id;
      if (!order.has(key)) order.set(key, i);
    });
    return cards
      .map((c, i) => ({ c, i }))
      .sort((a, b) => order.get(a.c.choice?.id ?? a.c.id)! - order.get(b.c.choice?.id ?? b.c.id)! || a.i - b.i)
      .map((x) => x.c);
  }

  /** A card's place in an exclusive choice: grouped while options are open, "chosen over" once taken. */
  private choiceFields(id: string): Pick<ProjectCard, "choice" | "choseOver"> {
    const cid = this.tree.nodes[id]?.choice;
    const c = cid ? this.tree.choices?.[cid] : undefined;
    if (!c) return {};
    const st = this.projects.status(id);
    if (st === "building" || st === "complete") {
      const closed = c.options.filter((o) => o !== id).map((o) => this.tree.nodes[o]?.name ?? o);
      return closed.length ? { choseOver: closed } : {};
    }
    return { choice: { id: c.id, prompt: c.prompt } };
  }

  bars(): BarView[] {
    return barViews(this.tree, this.engine, this.projects.book, (c) => this.intro.isIntroduced(c), this.projects.shown(), this.stage);
  }

  /** Workshops open and introduced (E packages mount into them; until then the shell shows the loop). */
  workshops(): { id: string; name: string; loop: string }[] {
    return openWorkshops(this.tree, this.projects.book as NodeBook)
      .filter((w) => this.intro.isIntroduced(workshopControl(w)))
      .map((w) => ({ id: w, name: this.tree.workshops[w]!.name, loop: this.tree.workshops[w]!.loop }));
  }

  /** Name of whatever a pause reason or log entry is about. */
  subjectName(kind: string, subject: string | undefined): string {
    const s = subject ?? "";
    if (kind === "milestone") {
      for (const n of Object.values(this.tree.nodes)) {
        const m = n.milestones.find((x) => x.id === s);
        if (m) return m.effect;
      }
    }
    if (kind === "pressure_red") return this.tree.stages.flatMap((x) => x.pressures).find((p) => p.id === s)?.name ?? s;
    if (kind === "workshop_open") return this.tree.workshops[s]?.name ?? s;
    if (kind === GATE_PAUSE || kind === "opening") return this.tree.stages.find((x) => String(x.stage) === s)?.gate.name ?? s;
    return this.tree.nodes[s]?.name ?? s;
  }

  /** The log, newest first, as text. */
  logLines(): { stamp: string; text: string; kind: string }[] {
    return [...this.log.entries()].reverse().map((l) => {
      const { year, day } = yearDay(l.day);
      const stamp = fill(STRINGS.log.stamp, { year, day });
      let text: string;
      if (l.kind === "opening") text = this.tree.stages.find((x) => String(x.stage) === l.subject)?.openingProblem ?? "";
      else if (l.kind === GATE_PAUSE) text = fill(STRINGS.log.gate, { n: l.subject ?? "" });
      else {
        const t = (STRINGS.log as Record<string, string>)[l.kind] ?? "{name}";
        text = fill(t, { name: this.subjectName(l.kind, l.subject) });
      }
      return { stamp, text, kind: l.kind };
    });
  }

  /** One line for the pause banner, and the introduction cards the pause carries. */
  pauseView(reasons: readonly PauseReason[] = this.decision): PauseView {
    const order = [GATE_PAUSE, "node_complete", "pressure_red", "workshop_open", "milestone", "node_revealed"];
    const sorted = [...reasons].filter((r) => r.kind !== INTRO_PAUSE).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const parts = sorted.map((r) => {
      if (r.kind === GATE_PAUSE) return fill(STRINGS.pause.gate, { n: r.subject ?? "" });
      const t = (STRINGS.pause as Record<string, string>)[r.kind] ?? "{name}";
      return fill(t, { name: this.subjectName(r.kind, r.subject) });
    });
    const cards = reasons.filter((r) => r.kind === INTRO_PAUSE).flatMap((r) => introControls(r.subject).map((c) => introCard(this.tree, c)));
    return { line: parts.join(STRINGS.pause.join), cards, reasons: [...reasons] };
  }

  notebook(): NotebookStage[] {
    const out: NotebookStage[] = [];
    for (const id of this.projects.book.completed) {
      const n = this.tree.nodes[id];
      if (!n || !n.notebook) continue;
      let s = out.find((x) => x.stage === n.stage);
      if (!s) {
        s = { stage: n.stage, name: this.tree.stages.find((x) => x.stage === n.stage)?.name ?? "", entries: [] };
        out.push(s);
      }
      s.entries.push({ id, name: n.name, text: n.notebook });
    }
    return out.sort((a, b) => a.stage - b.stage);
  }

  /**
   * Null while there is something to build: a project under way, or a shown project that can start
   * now or once jobs already working make what it lacks. Otherwise, what the next projects wait on,
   * and whether the stage's gate can be reached at all with what this build can make (`deadEnd`).
   */
  stuck(): StuckView | null {
    const e = this.engine;
    const book = this.projects.book;
    const stage = this.stage;
    const gateId = this.tree.stages.find((s) => s.stage === stage)!.gate.id;
    if (this.projects.isComplete(gateId)) return null;
    if (Object.keys(book.building).length > 0) return null;
    const makeableNow = (r: string): boolean => e.unlockedJobs().some((j) => (j.outputs?.[r] ?? 0) > 0);
    const cards = this.projectCards();
    if (cards.some((c) => c.status === "available" && (c.affordable || c.missing.every((m) => makeableNow(m.resource))))) return null;

    const label = (ref: string): string =>
      this.tree.resources[ref] ? this.resourceName(ref) : (this.tree.stateVariables[ref]?.description ?? idWords(ref));
    const waiting: StuckView["waiting"] = [];
    for (const id of this.tree.stages.find((s) => s.stage === stage)!.nodes) {
      const n = this.tree.nodes[id]!;
      const st = this.projects.status(id);
      if (st === "complete" || st === "closed" || st === "building") continue;
      const chk = checkRequires(this.tree, id, e, book as NodeBook);
      if (chk.missingNodes.length || !chk.anyOfMet || !nodeBeatOpen(this.tree, id, book)) continue; // not next up yet
      const needs = chk.failedState.map((c) => conditionText(c.expr, label) ?? c.text);
      for (const [r, amount] of Object.entries(missingResources(this.tree, id, e)))
        needs.push(fill(STRINGS.stuck.more, { n: fmt(Math.ceil(amount)), name: this.resourceName(r).toLowerCase() }));
      if (needs.length) waiting.push({ id, name: n.name, needs });
    }
    const r = this.reachNow();
    const deadEnd = !r.nodes.has(gateId);
    return { waiting, deadEnd, cantMake: deadEnd ? [...r.missing].map(label) : [] };
  }

  /** What can still be reached in the current stage from here (src/content/reach.ts), cached by progress. */
  private reachNow(): Reach {
    const book = this.projects.book;
    const closed = this.tree.nodeOrder.filter((id) => closedBy(this.tree, id, book as NodeBook));
    const key = `${this.stage}|${book.completed.join(",")}|${closed.join(",")}`;
    if (this.reachCache?.key !== key)
      this.reachCache = { key, reach: reach(this.tree, this.stage, book.completed, closed, SUPPLIED_METRICS) };
    return this.reachCache.reach;
  }
  private reachCache: { key: string; reach: Reach } | null = null;

  /** The tech map for one stage (default: the current one), plus the chain of every stage. */
  techMap(stage: number = this.stage): TechMap {
    const book = this.projects.book;
    const shown = new Set(this.projects.shown());
    const watts = new Map(this.meter().gates.map((g) => [g.stage, g.watts]));
    const stages = this.tree.stages.map((s) => {
      const ids = s.nodes.filter((id) => this.tree.nodes[id]!.kind !== "gate");
      return {
        stage: s.stage,
        name: s.name,
        gate: s.gate.name,
        watts: watts.get(s.stage) ?? null,
        status: (book.completed.includes(s.gate.id) ? "done" : s.stage === this.stage ? "current" : "ahead") as TechMap["stages"][number]["status"],
        done: ids.filter((id) => book.completed.includes(id)).length,
        total: ids.length,
      };
    });
    const st = this.tree.stages.find((s) => s.stage === stage) ?? this.tree.stages[0]!;
    const here = stage === this.stage ? currentBeat(this.tree, stage, book) : -1;
    const inStage = new Set(st.nodes);
    const status = (id: string): TechMapNode["status"] => {
      const s = this.projects.status(id);
      if (s === "complete") return "done";
      if (s === "building") return "building";
      if (s === "closed") return "closed";
      return s === "available" && shown.has(id) ? "ready" : "ahead";
    };
    const beats = [...new Set(st.nodes.map((id) => this.tree.nodes[id]!.beat))].sort((a, b) => a - b);
    return {
      stages,
      stage: st.stage,
      beats: beats.map((beat) => ({
        beat,
        here: beat === here,
        nodes: st.nodes
          .filter((id) => this.tree.nodes[id]!.beat === beat)
          .map((id) => {
            const n = this.tree.nodes[id]!;
            return {
              id,
              name: n.name,
              status: status(id),
              gate: n.kind === "gate",
              choice: !!n.choice,
              requires: n.requires.nodes.filter((r) => inStage.has(r)),
              anyOf: n.requires.anyOf.map((g) => g.filter((r) => inStage.has(r))).filter((g) => g.length > 0),
            };
          }),
      })),
    };
  }

  /** Tool users and tools (the heartbeat's numbers in words). */
  tools(): { tools: number; users: number; coverage: number } {
    const e = this.engine;
    const tools = e.content.tools.reduce((s, t) => s + e.stock(t.resource), 0);
    const assigned = e.staffing().assigned;
    const users = e.unlockedJobs().reduce((s, j) => s + (j.tool ? (assigned[j.id] ?? 0) : 0), 0);
    return { tools, users, coverage: users > 0 ? Math.min(1, tools / users) : 1 };
  }

  private worksRowPeople(worksId: string, jobId: string): number {
    return this.engine.staffing().records.find((r) => r.worksId === worksId && r.jobId === jobId)?.people ?? 0;
  }
}

/** Control id helpers re-exported for the DOM shell. */
export { jobControl, pressureControl, workshopControl };
