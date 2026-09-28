// Supply groups (owner playtest 2026-09-27: "over 20 labor controls in Stage 4; if we need fuel, put
// people on Fuel"). Once a stage is past, its jobs with a `group:` fold into one people row per group
// (Fuel, Tools, Building materials, Metals, Chemicals; resources.yaml `job_groups:`). The player sets
// people per group; this system splits them between the group's jobs by need: what the colony used
// yesterday that no other row made, what projects wait on, and a month's buffer. A group never works
// more people than that; its spares stay idle and train. Any job can be pinned by hand. Current-stage jobs, and jobs with no group, stay rows of their own.
//
// Deterministic: needs come from the last tick's report and the stocks; rounding by largest remainder.
import type { Tree } from "../content";
import type { Engine, EngineSystem, JsonValue, TickContext, TickReport } from "../engine";

/** Estimate (play value): days between re-splits, so crews don't churn daily. A player change re-splits at once. */
export const GROUP_REBALANCE_DAYS = 10;
/** Estimate (play value): stock a group keeps on hand, in days of use. */
export const GROUP_BUFFER_DAYS = 30;
/** Estimate (play value): days over which a group makes up a shortfall (projects waiting, buffer). */
export const GROUP_REFILL_DAYS = 60;
/** Passes of the fixed point: a group's own consumers (charcoal burners want wood) settle in a few. */
const GROUP_PASSES = 4;

export const GROUP_ROW_PREFIX = "group:";

/** What the system needs from the game around it. */
export interface GroupsHost {
  readonly tree: Tree;
  stage(): number;
  /** Jobs the people panel shows (unlocked and introduced). */
  shownJobs(): string[];
  /** Resources shown projects still lack before they can start (largest single shortfall per resource). */
  projectNeeds(): Record<string, number>;
}

interface GroupsData {
  people: Record<string, number>;
  pins: Record<string, number>;
  members: string[];
}

/** People split per job, and how many people would meet today's needs (pins included). */
export interface GroupSplit {
  shares: Record<string, number>;
  needPeople: number;
}

/** Largest-remainder split of `n` whole people by `weights` (all zero: even). Order breaks ties. */
export function splitByWeight(n: number, ids: readonly string[], weights: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const total = ids.reduce((s, id) => s + Math.max(0, weights[id] ?? 0), 0);
  const w = (id: string) => (total > 0 ? Math.max(0, weights[id] ?? 0) / total : 1 / ids.length);
  let given = 0;
  const rest: { id: string; r: number; i: number }[] = [];
  ids.forEach((id, i) => {
    const exact = n * w(id);
    out[id] = Math.floor(exact);
    given += out[id]!;
    rest.push({ id, r: exact - out[id]!, i });
  });
  rest.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < n - given; k++) out[rest[k % rest.length]!.id]! += 1;
  return out;
}

export class GroupsSystem implements EngineSystem {
  readonly id = "groups";
  private d: GroupsData = { people: {}, pins: {}, members: [] };
  private sinceSplit = 0;
  private lastNeed: Record<string, number> = {};
  /** Groups that formed on the last tick, for the log. */
  formed: string[] = [];

  constructor(private readonly host: GroupsHost) {}

  // ---- Membership -------------------------------------------------------------------------------------

  /** Group of a job while it's folded (its stage is past, it's shown, and no works staffs it); else null. */
  groupOf(e: Engine, job: string): string | null {
    const j = this.host.tree.jobs[job];
    if (!j?.group || j.stage >= this.host.stage() || !e.isJobUnlocked(job)) return null;
    if (e.laborTier() !== "people" && e.works().some((w) => w.def.primaryJob === job || (w.def.supportJobs ?? []).includes(job)))
      return null;
    return j.group;
  }

  /** Folded jobs by group, in content order; groups in resources.yaml order, empty ones left out. */
  groups(e: Engine): { id: string; name: string; what: string; jobs: string[] }[] {
    // Membership moves only with the day, the stage, unlocks and the labor tier: cache on those.
    const key = `${e.day}|${this.host.stage()}|${e.unlockedJobs().length}|${e.laborTier()}|${e.works().length}`;
    if (this.cache?.key === key) return this.cache.list;
    const shown = this.host.shownJobs();
    const list = (this.host.tree.jobGroups ?? [])
      .map((g) => ({ ...g, jobs: shown.filter((j) => this.groupOf(e, j) === g.id) }))
      .filter((g) => g.jobs.length > 0);
    this.cache = { key, list };
    return list;
  }
  private cache: { key: string; list: { id: string; name: string; what: string; jobs: string[] }[] } | null = null;

  isMember(job: string): boolean {
    return this.d.members.includes(job);
  }

  people(group: string): number {
    return this.d.people[group] ?? 0;
  }

  pinned(job: string): number | undefined {
    return this.d.pins[job];
  }

  /** People at work in a group now (at most its people; the rest are spare). */
  working(e: Engine, group: string): number {
    return this.groups(e).find((g) => g.id === group)?.jobs.reduce((s, j) => s + e.manual(j), 0) ?? 0;
  }

  /**
   * Each group's people as they really stand: those at work plus its spares, and spares are idle
   * people, so they only count while nobody else has taken them (Build, a new job). Groups claim the
   * idle in resources.yaml order.
   */
  standing(e: Engine): Record<string, { people: number; working: number }> {
    let idle = e.idle();
    const out: Record<string, { people: number; working: number }> = {};
    for (const g of this.groups(e)) {
      const working = g.jobs.reduce((s, j) => s + e.manual(j), 0);
      const spare = Math.max(0, Math.min(this.people(g.id) - working, idle));
      idle -= spare;
      out[g.id] = { people: working + spare, working };
    }
    return out;
  }

  /** People who would meet the group's needs at the last split (pins included); 0 before one. */
  needPeople(group: string): number {
    return this.lastNeed[group] ?? 0;
  }

  // ---- Player actions ----------------------------------------------------------------------------------

  /** ± or a typed number on a group row: people for the whole group, split at once. */
  setPeople(e: Engine, group: string, people: number): void {
    const now = this.working(e, group);
    this.d.people[group] = Math.max(0, Math.min(Math.round(people), now + e.idle()));
    this.split(e, e.report);
  }

  /**
   * ± or a typed number on a job inside a group: pins it there; the group grows or shrinks with it by
   * what the job really got. The other jobs keep their shares (the free people are unchanged), so no
   * re-split until the next one is due.
   */
  pin(e: Engine, group: string, job: string, people: number | null): void {
    if (people === null) {
      delete this.d.pins[job];
      this.split(e, e.report);
      return;
    }
    const before = e.manual(job);
    const got = e.assign(job, Math.max(0, Math.round(people)));
    this.d.pins[job] = got;
    this.d.people[group] = Math.max(0, this.people(group) + got - before);
  }

  // ---- The split --------------------------------------------------------------------------------------

  tick(ctx: TickContext): void {
    const e = ctx.engine;
    this.formed = [];
    const now = new Set(this.groups(e).flatMap((g) => g.jobs));
    let changed = false;
    // Jobs leaving a group (a works took them) keep their crew as a plain row.
    for (const j of this.d.members) {
      if (now.has(j)) continue;
      const g = this.host.tree.jobs[j]?.group;
      if (g) this.d.people[g] = Math.max(0, this.people(g) - e.manual(j));
      delete this.d.pins[j];
      changed = true;
    }
    // Jobs joining bring their crew, so nothing lurches at the gate.
    for (const j of now) {
      if (this.d.members.includes(j)) continue;
      const g = this.host.tree.jobs[j]!.group!;
      if (!(g in this.d.people)) this.formed.push(g);
      this.d.people[g] = this.people(g) + e.manual(j);
      changed = true;
    }
    this.d.members = [...now];
    this.formed = [...new Set(this.formed)];
    this.sinceSplit++;
    if (changed || this.sinceSplit >= GROUP_REBALANCE_DAYS) {
      this.split(e, ctx.report);
      this.reconcile(e);
    }
  }

  /** Store each group's standing people, so spares someone else took don't come back later. */
  private reconcile(e: Engine): void {
    for (const [g, st] of Object.entries(this.standing(e))) this.d.people[g] = st.people;
  }

  /** Recompute every group's shares from needs and write them as the jobs' people. */
  split(e: Engine, report: TickReport | null): void {
    this.sinceSplit = 0;
    for (const g of this.groups(e)) {
      const s = this.plan(e, report, g.jobs, this.people(g.id));
      this.lastNeed[g.id] = s.needPeople;
      for (const j of g.jobs) e.assign(j, 0);
      for (const j of g.jobs) e.assign(j, s.shares[j] ?? 0);
    }
  }

  /**
   * Shares for one group's jobs: pins first, then the rest by need, never more than the need (spare
   * people stay idle and train; a surplus would only ask other groups for inputs nobody uses).
   */
  plan(e: Engine, report: TickReport | null, jobs: readonly string[], people: number): GroupSplit {
    const pins: Record<string, number> = {};
    let pinned = 0;
    for (const j of jobs) {
      const p = this.d.pins[j];
      if (p === undefined) continue;
      pins[j] = p;
      pinned += p;
    }
    const free = jobs.filter((j) => pins[j] === undefined);
    const needs = this.needs(e, report, jobs, free);
    const freeNeed = free.reduce((s, j) => s + Math.ceil((needs[j] ?? 0) - 1e-9), 0);
    const rest = Math.min(Math.max(0, people - pinned), freeNeed);
    return { shares: { ...pins, ...splitByWeight(rest, free, needs) }, needPeople: pinned + freeNeed };
  }

  /**
   * People each unpinned job needs to cover what the colony uses of its outputs that other rows don't
   * make, what projects wait on, and a buffer. A resource's need goes to its most productive maker
   * in the group (latest in content order on a tie: the newer method). Tools count as one need, for
   * the longest-lived tool the group can make.
   */
  private needs(e: Engine, report: TickReport | null, jobs: readonly string[], free: readonly string[]): Record<string, number> {
    const perWorker = (j: string) => {
      const def = e.jobDef(j);
      return (def?.tool ? (report?.toolEfficiency ?? 1) : 1) * e.modifier("rate", j);
    };
    const out = (j: string, r: string) => perWorker(j) * (e.jobDef(j)?.outputs?.[r] ?? 0) * e.modifier("yield", j);
    const inp = (j: string, r: string) => perWorker(j) * (e.jobDef(j)?.inputs?.[r] ?? 0);

    // What the group's own jobs asked for and made yesterday: taken out, then put back at the new crews.
    const memberAsk: Record<string, number> = {};
    const memberMade: Record<string, number> = {};
    for (const j of jobs) {
      const jr = report?.jobs[j];
      const thr = jr ? jr.throughput : 0;
      for (const [r, a] of Object.entries(e.jobDef(j)?.inputs ?? {})) memberAsk[r] = (memberAsk[r] ?? 0) + thr * a;
      for (const [r, a] of Object.entries(e.jobDef(j)?.outputs ?? {}))
        memberMade[r] = (memberMade[r] ?? 0) + thr * (jr?.fraction ?? 0) * a * e.modifier("yield", j);
    }
    const external = (r: string) => Math.max(0, (report?.requested[r] ?? 0) - (memberAsk[r] ?? 0));
    const otherMade = (r: string) => Math.max(0, (report?.produced[r] ?? 0) - (memberMade[r] ?? 0));
    const waiting = this.host.projectNeeds();

    // Who makes what: the best maker among the group's jobs (pinned ones count, they just don't move).
    const toolDefs = e.content.tools ?? [];
    const toolLife = new Map(toolDefs.map((t) => [t.resource, t.lifeWorkerDays]));
    const makers = new Map<string, string>();
    for (const j of jobs) {
      for (const r of Object.keys(e.jobDef(j)?.outputs ?? {})) {
        const cur = makers.get(r);
        if (!cur || out(j, r) >= out(cur, r)) makers.set(r, j);
      }
    }
    let bestTool: string | null = null;
    for (const r of makers.keys()) if (toolLife.has(r) && (!bestTool || toolLife.get(r)! >= toolLife.get(bestTool)!)) bestTool = r;

    let crews: Record<string, number> = Object.fromEntries(jobs.map((j) => [j, this.d.pins[j] ?? e.manual(j)]));
    let need: Record<string, number> = {};
    for (let pass = 0; pass < GROUP_PASSES; pass++) {
      const ownAsk: Record<string, number> = {};
      for (const j of jobs) for (const [r] of Object.entries(e.jobDef(j)?.inputs ?? {})) ownAsk[r] = (ownAsk[r] ?? 0) + (crews[j] ?? 0) * inp(j, r);
      const target = (r: string): number => {
        if (toolLife.has(r)) {
          if (r !== bestTool) return 0;
          const life = toolLife.get(r)!;
          const users = report?.toolUsers ?? 0;
          let others = 0;
          for (const t of toolDefs) others += otherMade(t.resource) * (t.lifeWorkerDays / life);
          const stockAll = toolDefs.reduce((s, t) => s + e.stock(t.resource), 0);
          return Math.max(0, users / life - others) + Math.max(0, users - stockAll) / GROUP_REFILL_DAYS;
        }
        const daily = Math.max(0, external(r) + (ownAsk[r] ?? 0) - otherMade(r));
        const gap = e.claimed(r) + (waiting[r] ?? 0) + GROUP_BUFFER_DAYS * daily - e.stock(r);
        return daily + Math.max(0, gap) / GROUP_REFILL_DAYS;
      };
      need = {};
      for (const j of jobs) {
        let n = 0;
        for (const r of Object.keys(e.jobDef(j)?.outputs ?? {})) {
          if (makers.get(r) !== j) continue;
          const rate = out(j, r);
          if (rate > 0) n = Math.max(n, target(r) / rate);
        }
        need[j] = n;
      }
      crews = Object.fromEntries(jobs.map((j) => [j, this.d.pins[j] ?? need[j] ?? 0]));
    }
    return Object.fromEntries(free.map((j) => [j, need[j] ?? 0]));
  }

  save(): JsonValue {
    return JSON.parse(JSON.stringify(this.d)) as JsonValue;
  }

  load(data: JsonValue): void {
    const o = (data ?? {}) as Partial<GroupsData>;
    this.d = { people: { ...(o.people ?? {}) }, pins: { ...(o.pins ?? {}) }, members: [...(o.members ?? [])] };
  }
}
