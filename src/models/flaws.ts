// Package H: the test campaign's arithmetic, pure and deterministic. Which flaws a vehicle carries is
// decided by the caller from the stage file's `when` conditions (content); here: how many tests of the
// right kind reveal a flaw, how severe it is once the mission's safety systems are counted, and the
// launch, resolved from a run seed (the only chance in the game, and it's shown: tech-tree/failure-modes.md).

export type TestType = "static_fire" | "tanking_hold" | "vacuum_chamber" | "orbital_flight" | "impactor" | "uncrewed_landing";
export type Severity = "fatal" | "mission_loss" | "survivable";
/** When in the mission a flaw strikes: an escape tower saves the pilot from booster-phase failures. */
export type Phase = "booster" | "flight" | "landing" | "capsule";

export interface FlawSpec {
  id: string;
  /** Public: which area the flaw lives in (engine, feed, structure, cryogenic, flight, guidance, lander, capsule). */
  category: string;
  /** Test types that exercise it. */
  revealedBy: TestType[];
  /** Tests of those kinds before it shows, with no instrumentation or skill. */
  exposure: number;
  fixMonths: number;
  severity: Severity;
  phase: Phase;
}

export interface ExposureContext {
  /** 0-2 (state instrumentation_level). */
  instrumentationLevel: number;
  /** Tests saved per instrumentation level. */
  instrumentationCut: number;
  /** The colony has enough trained rocket engineers to read a test well. */
  skilled: boolean;
  /** Tests saved by skill. */
  skilledCut: number;
}

/** Tests of the right kind needed to reveal a flaw (at least one). */
export function exposureNeeded(spec: FlawSpec, ctx: ExposureContext): number {
  const cut = Math.max(0, ctx.instrumentationLevel) * ctx.instrumentationCut + (ctx.skilled ? ctx.skilledCut : 0);
  return Math.max(1, spec.exposure - cut);
}

/** Tests done so far that exercise this flaw. */
export function exposureSoFar(spec: FlawSpec, testsDone: Readonly<Partial<Record<TestType, number>>>): number {
  return spec.revealedBy.reduce((s, t) => s + (testsDone[t] ?? 0), 0);
}

export function isRevealed(spec: FlawSpec, ctx: ExposureContext, testsDone: Readonly<Partial<Record<TestType, number>>>): boolean {
  return exposureSoFar(spec, testsDone) >= exposureNeeded(spec, ctx);
}

export interface MissionSafety {
  hasEscapeSystem: boolean;
  hasPressureSuit: boolean;
  hasMidcourse: boolean;
  dvMarginKmS: number;
  /** Margin at or above which guidance errors are absorbed (with midcourse correction). */
  survivableMarginKmS: number;
}

/** Guidance flaws: survivable with margin and a midcourse burn, fatal without. */
const GUIDANCE_FLAWS = new Set(["gyro_drift", "cutoff_signal_delay"]);

/** A flaw's severity for this mission: an escape tower, a suit, margin and midcourse change it. */
export function effectiveSeverity(spec: FlawSpec, s: MissionSafety): Severity {
  if (GUIDANCE_FLAWS.has(spec.id)) return s.hasMidcourse && s.dvMarginKmS >= s.survivableMarginKmS ? "survivable" : "fatal";
  if (spec.id === "capsule_leak" && s.hasPressureSuit) return "survivable";
  if (spec.severity === "fatal" && spec.phase === "booster" && s.hasEscapeSystem) return "mission_loss";
  return spec.severity;
}

/** mulberry32: a small seeded PRNG (deterministic; the launch's only source of chance). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from a string (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface LaunchFlaw {
  spec: FlawSpec;
  known: boolean;
  fixed: boolean;
}

export type LaunchOutcome = "landed" | "pilot_lost" | "mission_lost";

export interface LaunchResult {
  outcome: LaunchOutcome;
  /** Flaws that struck, in mission order, with the severity they had. */
  struck: { id: string; severity: Severity }[];
  /** The flaw that decided the outcome (null when it landed). */
  cause: string | null;
}

const PHASE_ORDER: Readonly<Record<Phase, number>> = { booster: 0, flight: 1, capsule: 2, landing: 3 };

/**
 * Fly the mission. Every unfixed flaw the design carries may strike: a known one whose severity is
 * fatal always does (the launch screen says so), any other with `strikeChance`, rolled in mission
 * order from `seed`. The first fatal strike loses the pilot; else the first mission-loss strike loses
 * the mission; survivable strikes are absorbed.
 */
export function resolveLaunch(flaws: readonly LaunchFlaw[], safety: MissionSafety, strikeChance: number, seed: number): LaunchResult {
  const rand = mulberry32(seed);
  const live = flaws
    .filter((f) => !f.fixed)
    .sort((a, b) => PHASE_ORDER[a.spec.phase] - PHASE_ORDER[b.spec.phase] || (a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0));
  const struck: LaunchResult["struck"] = [];
  for (const f of live) {
    const severity = effectiveSeverity(f.spec, safety);
    const roll = rand();
    const strikes = (f.known && severity === "fatal") || roll < strikeChance;
    if (strikes) struck.push({ id: f.spec.id, severity });
  }
  const fatal = struck.find((x) => x.severity === "fatal");
  if (fatal) return { outcome: "pilot_lost", struck, cause: fatal.id };
  const loss = struck.find((x) => x.severity === "mission_loss");
  if (loss) return { outcome: "mission_lost", struck, cause: loss.id };
  return { outcome: "landed", struck, cause: null };
}
