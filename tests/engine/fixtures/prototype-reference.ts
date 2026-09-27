// The Stage 1 prototype's simulation core, ported from the single-file prototype
// (https://claude.ai/artifact/Tb1R1RLPBZTLbHteuF3ZKz) with the DOM, projects, energy and gate removed.
// Kept as close to the original as TypeScript allows: it is the reference the engine must reproduce
// within 10% over 1,000 days. The prototype steps 0.25 day at a time; the engine steps whole days.

export type ProtoRes = "wood" | "blades" | "clay" | "pots" | "charcoal" | "ore" | "copper" | "ctools";
export type ProtoJob = "gather" | "knap" | "build" | "clay" | "pot" | "char" | "mine" | "smelt" | "cast";

interface RunResult {
  out?: Partial<Record<ProtoRes, number>>;
  inp?: Partial<Record<ProtoRes, number>>;
  labor?: number;
}

const JOBS: { k: ProtoJob; tool?: boolean; run: (n: number, e: number) => RunResult }[] = [
  { k: "gather", tool: true, run: (n, e) => ({ out: { wood: 40 * n * e } }) },
  { k: "knap", run: (n) => ({ out: { blades: 3 * n } }) },
  { k: "build", tool: true, run: (n, e) => ({ labor: n * e }) },
  { k: "clay", tool: true, run: (n, e) => ({ out: { clay: 50 * n * e } }) },
  { k: "pot", run: (n) => ({ inp: { clay: 12 * n, wood: 24 * n }, out: { pots: 2 * n } }) },
  { k: "char", run: (n) => ({ inp: { wood: 100 * n }, out: { charcoal: 20 * n } }) },
  { k: "mine", tool: true, run: (n, e) => ({ out: { ore: 15 * n * e } }) },
  {
    k: "smelt",
    run: (n) => ({ inp: { ore: 2.5 * n, charcoal: 5 * n, pots: 0.05 * n }, out: { copper: 0.5 * n } }),
  },
  { k: "cast", run: (n) => ({ inp: { copper: 4 * n }, out: { ctools: 4 * n } }) },
];

export interface ProtoSnapshot {
  day: number;
  r: Record<ProtoRes, number>;
  /** Cumulative Build labor (person-days) — the prototype's `pd` with a project always active. */
  pd: number;
}

/** Run the prototype with fixed people per job; snapshot at each day in `at`. */
export function runPrototype(A: Partial<Record<ProtoJob, number>>, days: number, at: number[]): ProtoSnapshot[] {
  const r: Record<ProtoRes, number> = { wood: 0, blades: 0, clay: 0, pots: 0, charcoal: 0, ore: 0, copper: 0, ctools: 0 };
  let pd = 0;
  const dt = 0.25;
  const snaps: ProtoSnapshot[] = [];
  const steps = Math.round(days / dt);
  const n = (k: ProtoJob) => A[k] ?? 0;
  for (let s = 1; s <= steps; s++) {
    const users = (["gather", "build", "clay", "mine"] as ProtoJob[]).reduce((a, k) => a + n(k), 0);
    const toolStock = r.ctools + r.blades;
    const cov = users ? Math.min(1, toolStock / users) : 1;
    const e = 0.25 + 0.75 * cov;
    for (const j of JOBS) {
      if (!n(j.k)) continue;
      const res = j.run(n(j.k), j.tool ? e : 1);
      let f = 1;
      if (res.inp)
        for (const k in res.inp) {
          const need = res.inp[k as ProtoRes]! * dt;
          if (need > 0) f = Math.min(f, r[k as ProtoRes] / need);
        }
      f = Math.max(0, Math.min(1, f));
      if (res.inp) for (const k in res.inp) r[k as ProtoRes] -= res.inp[k as ProtoRes]! * dt * f;
      if (res.out) for (const k in res.out) r[k as ProtoRes] += res.out[k as ProtoRes]! * dt * f;
      if (res.labor) pd += res.labor * dt;
    }
    const uC = Math.min(users, r.ctools);
    const uB = Math.min(users - uC, r.blades);
    r.ctools = Math.max(0, r.ctools - uC * 0.005 * dt);
    r.blades = Math.max(0, r.blades - uB * 0.05 * dt);
    const day = s * dt;
    if (Number.isInteger(day) && at.includes(day)) snaps.push({ day, r: { ...r }, pd });
  }
  return snaps;
}
