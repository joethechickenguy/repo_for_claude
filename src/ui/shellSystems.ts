// Engine systems the shell adds (package D): the stage gate, a stand-in for the furnace workshop's
// campaign count until E1 lands, and the log. Deterministic; each saves its own data.
import { currentStage, gateStatus, type Tree } from "../content";
import { ENERGY_METRIC, type EngineSystem, type JsonValue, type PauseReason, type ProjectsSystem, type TickContext } from "../engine";

/** Pause kind when a stage gate completes; subject is the stage number. */
export const GATE_PAUSE = "gate";

/**
 * Completes the current stage's gate the day its checks hold (the gate has no cost or labor), and
 * opens the next stage's starting jobs.
 */
export class GateSystem implements EngineSystem {
  readonly id = "gate";
  constructor(
    private readonly tree: Tree,
    private readonly projects: ProjectsSystem,
  ) {}

  tick(ctx: TickContext): void {
    const book = this.projects.book;
    const stage = currentStage(this.tree, book);
    const s = this.tree.stages.find((x) => x.stage === stage);
    if (!s) return;
    const gid = s.gate.id;
    if (this.projects.isComplete(gid) || !book.revealed.includes(gid)) return;
    if (!gateStatus(this.tree, stage, ctx.engine).met) return;
    const r = this.projects.start(gid);
    if (!r.ok) return;
    for (const p of r.pauses ?? []) ctx.pause(p);
    ctx.pause({ kind: GATE_PAUSE, subject: String(stage) });
    const next = this.tree.stages.find((x) => x.stage > stage);
    for (const j of next?.startingJobs ?? []) if (ctx.engine.jobDef(j)) ctx.engine.unlockJob(j);
  }
}

/**
 * Estimate, stand-in until package E1's furnace workshop: stage1 `furnace_workshop.loop` says "A
 * campaign is one furnace run (~30 days)", so every 30 days on which copper is smelted count as one
 * campaign (`campaigns_run`, read by wind_furnaces and pot_bellows). The same stand-in as A's
 * headless test. E1 replaces this system.
 */
export const STANDIN_CAMPAIGN_DAYS = 30;
export const CAMPAIGNS_METRIC = "campaigns_run";

/**
 * Names conditions may read that no state variable or resource declares, because a running system
 * sets them each tick (energy, the campaigns stand-in). Reachability (src/content/reach.ts) treats
 * these as able to come true; anything else undeclared can never come true.
 */
export const SUPPLIED_METRICS: ReadonlySet<string> = new Set([ENERGY_METRIC, CAMPAIGNS_METRIC]);

export class StandInCampaigns implements EngineSystem {
  readonly id = "campaigns";
  private days = 0;
  /** A day smelting any of these counts (copper in Stage 1, bloom and iron from Stage 2). */
  constructor(private readonly metals: readonly string[] = ["copper_kg", "bloom_kg", "iron_kg"]) {}
  tick(ctx: TickContext): void {
    if (this.metals.some((m) => (ctx.report.produced[m] ?? 0) > 0)) this.days++;
    ctx.engine.setMetric(CAMPAIGNS_METRIC, Math.floor(this.days / STANDIN_CAMPAIGN_DAYS));
  }
  save(): JsonValue {
    return this.days;
  }
  load(d: JsonValue): void {
    this.days = typeof d === "number" ? d : 0;
  }
}

/** One log line, structured: the shell turns it into text from strings and content. */
export interface LogEntry {
  day: number;
  kind: string;
  subject?: string;
}

/** Log entries kept (oldest dropped). */
const LOG_KEEP = 400;

/** Pause kinds that are worth a log line (intro cards are not). */
const LOGGED = new Set(["node_complete", "node_revealed", "milestone", "pressure_red", "workshop_open", GATE_PAUSE]);

export class LogSystem implements EngineSystem {
  readonly id = "log";
  private list: LogEntry[] = [];

  add(entry: LogEntry): void {
    this.list.push({ ...entry });
    if (this.list.length > LOG_KEEP) this.list.splice(0, this.list.length - LOG_KEEP);
  }

  /** Log the pauses a tick (or an action) produced. */
  addPauses(day: number, reasons: readonly PauseReason[]): void {
    for (const r of reasons) if (LOGGED.has(r.kind)) this.add({ day, kind: r.kind, ...(r.subject ? { subject: r.subject } : {}) });
  }

  entries(): readonly LogEntry[] {
    return this.list;
  }

  tick(ctx: TickContext): void {
    this.addPauses(ctx.day + 1, ctx.report.pauseReasons);
  }

  save(): JsonValue {
    return this.list as unknown as JsonValue;
  }

  load(d: JsonValue): void {
    this.list = Array.isArray(d) ? (JSON.parse(JSON.stringify(d)) as LogEntry[]) : [];
  }
}
