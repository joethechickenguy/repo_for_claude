// Labor tiers (DESIGN.md, Labor). People: the player sets people per job and the engine does nothing.
// Works: each facility with a target is staffed from the pool in order. Departments: works are staffed
// in department priority order. Pinned rows are never touched. Every assignment is recorded.
//
// Auto-staffing is deliberately dumb: size a crew from per-worker rates, fill in order, show it.
import type { AssignmentRecord, JobDef, LaborTier, WorksState } from "./types";

/** Key of a pinned row inside a works. */
export function rowKey(worksId: string, jobId: string): string {
  return `${worksId}/${jobId}`;
}

/** Jobs a works staffs: its primary job then its support jobs, without duplicates. */
export function worksJobs(w: WorksState): string[] {
  const out = [w.def.primaryJob];
  for (const j of w.def.supportJobs ?? []) if (!out.includes(j)) out.push(j);
  return out;
}

export interface StaffingInput {
  tier: LaborTier;
  population: number;
  /** Unlocked jobs in content order. */
  jobs: readonly JobDef[];
  manual: Readonly<Record<string, number>>;
  pins: Readonly<Record<string, number>>;
  works: readonly WorksState[];
  departmentPriority: Readonly<Record<string, number>>;
  /** Expected output of `resource` per worker-day of `jobId` (tool efficiency and modifiers applied). */
  outputPerWorker(jobId: string, resource: string): number;
  /** Expected input of `resource` per worker-day of `jobId`. */
  inputPerWorker(jobId: string, resource: string): number;
  /** Units per day a `pull` works should make of `resource`. */
  pullTarget(resource: string): number;
}

export interface StaffingResult {
  assigned: Record<string, number>;
  records: AssignmentRecord[];
  idle: number;
  /** Jobs in works whose target is `pull`: their output is capped at demand plus buffer. */
  pullJobs: Set<string>;
}

/** Tiny tolerance so 10 / 2.5 workers doesn't round up to 5. */
const CEIL_EPS = 1e-9;

export function staff(input: StaffingInput): StaffingResult {
  const unlocked = new Set(input.jobs.map((j) => j.id));
  const jobDefs = new Map(input.jobs.map((j) => [j.id, j]));
  const assigned: Record<string, number> = {};
  for (const j of input.jobs) assigned[j.id] = 0;
  const records: AssignmentRecord[] = [];
  const pullJobs = new Set<string>();
  let idle = input.population;

  const take = (want: number): number => {
    const got = Math.max(0, Math.min(Math.floor(want), idle));
    idle -= got;
    return got;
  };

  if (input.tier === "people") {
    for (const j of input.jobs) {
      const want = input.manual[j.id] ?? 0;
      if (want <= 0) continue;
      const got = take(want);
      assigned[j.id] = got;
      records.push({ jobId: j.id, people: got, reason: "manual", shortfall: want - got });
    }
    return { assigned, records, idle, pullJobs };
  }

  // Works and departments tiers.
  const covered = new Set<string>();
  for (const w of input.works) for (const j of worksJobs(w)) covered.add(j);

  // 1. Manual rows: jobs outside every works keep the player's counts.
  for (const j of input.jobs) {
    if (covered.has(j.id)) continue;
    const want = input.manual[j.id] ?? 0;
    if (want <= 0) continue;
    const got = take(want);
    assigned[j.id] = (assigned[j.id] ?? 0) + got;
    records.push({ jobId: j.id, people: got, reason: "manual", shortfall: want - got });
  }

  // 2. Works in staffing order.
  const order = orderWorks(input);

  // 2a. Pinned rows first, in works order: they are never touched.
  const pinRecord = new Map<string, AssignmentRecord>();
  for (const w of order) {
    for (const jobId of worksJobs(w)) {
      const key = rowKey(w.def.id, jobId);
      const want = input.pins[key];
      if (want === undefined || !unlocked.has(jobId)) continue;
      const got = take(want);
      assigned[jobId] = (assigned[jobId] ?? 0) + got;
      const rec: AssignmentRecord = {
        jobId,
        worksId: w.def.id,
        department: w.def.department,
        people: got,
        reason: "pinned",
        shortfall: want - got,
      };
      records.push(rec);
      pinRecord.set(key, rec);
    }
  }

  // 2b. Auto crews to hit each target.
  for (const w of order) {
    if (w.target === null) continue;
    if (w.target === "pull") for (const j of worksJobs(w)) pullJobs.add(j);
    const target = w.target === "pull" ? input.pullTarget(w.def.output) : w.target;
    const plan = planCrew(w, Math.max(0, target), input, unlocked, jobDefs);
    for (const [jobId, want] of plan) {
      const key = rowKey(w.def.id, jobId);
      const pinned = pinRecord.get(key);
      if (pinned) {
        pinned.shortfall = Math.max(pinned.shortfall, want - pinned.people);
        continue;
      }
      if (input.pins[key] !== undefined) continue; // pinned but locked job
      const got = take(want);
      assigned[jobId] = (assigned[jobId] ?? 0) + got;
      records.push({
        jobId,
        worksId: w.def.id,
        department: w.def.department,
        people: got,
        reason: "auto",
        shortfall: want - got,
      });
    }
  }

  return { assigned, records, idle, pullJobs };
}

/** Works tier: list order. Departments tier: by department priority, highest first; ties keep list order. */
function orderWorks(input: StaffingInput): WorksState[] {
  const list = [...input.works];
  if (input.tier !== "departments") return list;
  const prio = (w: WorksState) =>
    w.def.department !== undefined && input.departmentPriority[w.def.department] !== undefined
      ? (input.departmentPriority[w.def.department] as number)
      : Number.NEGATIVE_INFINITY;
  // Array.prototype.sort is stable, so equal priorities keep list order.
  return list.sort((a, b) => {
    const pa = prio(a);
    const pb = prio(b);
    return pa === pb ? 0 : pb > pa ? 1 : -1;
  });
}

/**
 * People per job (including pinned) a works needs to make `target` units of its output a day. The
 * primary job is sized to the target; each support job is sized to the inputs of the job it feeds.
 * Returns jobs in the order they were sized.
 */
function planCrew(
  w: WorksState,
  target: number,
  input: StaffingInput,
  unlocked: Set<string>,
  jobDefs: Map<string, JobDef>,
): Map<string, number> {
  const plan = new Map<string, number>();
  const support = (w.def.supportJobs ?? []).filter((j) => unlocked.has(j));

  const size = (jobId: string, resource: string, amount: number, path: Set<string>): void => {
    if (!unlocked.has(jobId) || amount <= 0) return;
    const rate = input.outputPerWorker(jobId, resource);
    if (rate <= 0) return;
    const pinned = input.pins[rowKey(w.def.id, jobId)];
    const want = Math.ceil(amount / rate - CEIL_EPS);
    // A pinned row keeps its people; the plan still records how many were wanted (for the shortfall).
    const people = pinned !== undefined ? pinned : want;
    if (pinned !== undefined) plan.set(jobId, Math.max(plan.get(jobId) ?? 0, want));
    else plan.set(jobId, (plan.get(jobId) ?? 0) + want);
    const def = jobDefs.get(jobId);
    const next = new Set(path).add(jobId);
    for (const res of Object.keys(def?.inputs ?? {})) {
      const supplier = support.find(
        (q) => !next.has(q) && (jobDefs.get(q)?.outputs?.[res] ?? 0) > 0,
      );
      if (supplier) size(supplier, res, input.inputPerWorker(jobId, res) * people, next);
    }
  };

  size(w.def.primaryJob, w.def.output, target, new Set());
  return plan;
}
