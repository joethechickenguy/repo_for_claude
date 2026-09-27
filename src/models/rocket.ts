// Rocket workshop model (Stage 6): the rocket equation per stage, structural fractions, the Δv
// budget by route, and margin. Mirrors the interface mockup's screen 5
// (https://claude.ai/artifact/UJnA6qpmNJKpMwq957QaBJ), which package E6 rebuilds on this model.
//
// Conventions (from the mockup's code):
//   - A stage's structural fraction k is dry mass per tonne of propellant: dry = k × propellant.
//   - Stages are listed bottom (first to burn) to top (the lander). Each stage carries everything
//     above it; the payload (capsule) rides on top.
//   - Masses in tonnes, speeds in km/s.
// `flaws_expected` (a workshop output) belongs to package H's flaw generation and isn't computed here.

import { G0_M_S2, bisect } from "./physics";

export type Propellants = "ethanol_lox" | "kerosene_lox" | "hypergolic";
export type TankMaterial = "steel" | "aluminum";
export type StageFeed = "pressure_fed" | "turbopump";
export type Route = "direct_ascent" | "parking_orbit";

/**
 * The workshop's play values. They are content, but they exist only as prose in
 * stage6-rocket.yaml, which the content loader can't read, so they live here and can be overridden
 * per call. See tech-tree/open-questions.md (C6).
 */
export interface RocketPlayValues {
  /** Isp by propellant, s. stage6 L58: "Play values: 280 s, 310 s; hypergolic 290 s". */
  isp_s: Readonly<Record<Propellants, number>>;
  /** Dry mass per tonne of propellant. stage6 L61: "Structural fraction 0.14 vs 0.09 (play values)". */
  structural_fraction: Readonly<Record<TankMaterial, number>>;
  /** stage6 L64: pressure-fed "+0.08 structural fraction". */
  pressure_fed_fraction_add: number;
  /** stage6 L64: pressure-fed "-25 s". */
  pressure_fed_isp_loss_s: number;
}

export const ROCKET_PLAY_VALUES: RocketPlayValues = {
  isp_s: { ethanol_lox: 280, kerosene_lox: 310, hypergolic: 290 },
  structural_fraction: { steel: 0.14, aluminum: 0.09 },
  pressure_fed_fraction_add: 0.08,
  pressure_fed_isp_loss_s: 25,
};

/** Mission Δv budget legs, km/s (stage6 L99: "15.3 km/s: ~9.4 to orbit incl. losses, ~3.1 toward the Moon, ~2.8 to brake and land"). */
export interface MissionBudget {
  to_orbit_km_s: number;
  toward_moon_km_s: number;
  brake_and_land_km_s: number;
}

export const MISSION_BUDGET_KM_S: MissionBudget = {
  to_orbit_km_s: 9.4,
  toward_moon_km_s: 3.1,
  brake_and_land_km_s: 2.8,
};

/**
 * Extra Δv each route needs on top of the base budget, km/s. Estimate: a parking orbit costs an
 * upper-stage restart after a coast (ullage burn, restart transients, a second set of steering
 * losses), taken as ~0.1 km/s; direct ascent flies the base budget. Its price is windows and
 * guidance, not Δv. See open-questions.md (13, C7).
 */
export const ROUTE_DV_ADJUST_KM_S: Readonly<Record<Route, number>> = {
  direct_ascent: 0,
  parking_orbit: 0.1,
};

export interface RocketStageDials {
  /** Propellant per stage, t (dial `propellant_mass`). */
  propellant_mass: number;
  propellants: Propellants;
  tank_material: TankMaterial;
  feed: StageFeed;
  /**
   * Optional Isp override, s, e.g. the vacuum Isp the rocket-engine model gives for the engine the
   * colony actually built. When set it replaces the play value, and the pressure-fed Isp penalty
   * is not applied again (the engine model already accounts for its feed).
   */
  isp_s?: number;
}

export interface RocketDesignInputs {
  /** Bottom stage first. stage_count is stages.length. */
  stages: ReadonlyArray<RocketStageDials>;
  /** Capsule and pilot on top of the last stage, t (capsule_mass_t; the mockup uses 1.6). */
  payload_t: number;
  /** Route dial; before guidance_choice there is no route and the base budget applies. */
  route?: Route;
  /** Margin already spent by other nodes, km/s (midcourse ~0.1, suit and tower 0.15: stage6 L181, L236). */
  margin_deductions_km_s?: number;
  play?: RocketPlayValues;
  budget?: MissionBudget;
}

export interface RocketStageResult {
  structural_fraction: number;
  isp_s: number;
  exhaust_velocity_km_s: number;
  dry_mass_t: number;
  /** Mass when this stage ignites (itself plus everything above), t. */
  ignition_mass_t: number;
  /** Mass when this stage burns out, t. */
  burnout_mass_t: number;
  mass_ratio: number;
  dv_km_s: number;
}

export type MissionReach = "short_of_orbit" | "orbit" | "toward_moon" | "landed";

export interface RocketDesign {
  stages: RocketStageResult[];
  dv_total_km_s: number;
  /** The route's budget (base legs plus the route adjustment), km/s. */
  budget_km_s: number;
  /** dv_total minus the budget minus deductions, km/s. Negative: the vehicle can't do the mission. */
  dv_margin_km_s: number;
  liftoff_mass_t: number;
  propellant_total_t: number;
  /** How far the total Δv gets along the budget's legs (the mockup's orbit / Moon / landed marks). */
  reach: MissionReach;
}

/** Tsiolkovsky: Δv = v_e ln(m0 / mf). Any consistent mass unit; v_e in km/s gives km/s. */
export function rocketEquationDv(exhaust_velocity_km_s: number, m0: number, mf: number): number {
  if (!(mf > 0) || !(m0 >= mf)) throw new Error("rocketEquationDv: need m0 >= mf > 0");
  return exhaust_velocity_km_s * Math.log(m0 / mf);
}

/** The mass ratio m0/mf a single burn needs for a Δv: exp(Δv / v_e). */
export function massRatioForDv(dv_km_s: number, exhaust_velocity_km_s: number): number {
  return Math.exp(dv_km_s / exhaust_velocity_km_s);
}

/** Exhaust velocity, km/s, from Isp in seconds. */
export function exhaustVelocityKmS(isp_s: number): number {
  return (isp_s * G0_M_S2) / 1_000;
}

export function stageStructuralFraction(stage: RocketStageDials, play: RocketPlayValues = ROCKET_PLAY_VALUES): number {
  return play.structural_fraction[stage.tank_material] + (stage.feed === "pressure_fed" ? play.pressure_fed_fraction_add : 0);
}

export function stageIsp(stage: RocketStageDials, play: RocketPlayValues = ROCKET_PLAY_VALUES): number {
  if (stage.isp_s !== undefined) return stage.isp_s;
  return play.isp_s[stage.propellants] - (stage.feed === "pressure_fed" ? play.pressure_fed_isp_loss_s : 0);
}

/** Total mission budget for a route, km/s. */
export function missionBudgetKmS(route?: Route, budget: MissionBudget = MISSION_BUDGET_KM_S): number {
  const base = budget.to_orbit_km_s + budget.toward_moon_km_s + budget.brake_and_land_km_s;
  return base + (route ? ROUTE_DV_ADJUST_KM_S[route] : 0);
}

/** The workshop's live calculation. Pure; deterministic. */
export function designRocket(inputs: RocketDesignInputs): RocketDesign {
  const play = inputs.play ?? ROCKET_PLAY_VALUES;
  const budget = inputs.budget ?? MISSION_BUDGET_KM_S;
  if (!(inputs.payload_t >= 0)) throw new Error("designRocket: payload must be >= 0");

  const results: RocketStageResult[] = [];
  let above = inputs.payload_t;
  // Burn order is bottom first, but each stage's masses depend on everything above it: work top down.
  for (let i = inputs.stages.length - 1; i >= 0; i--) {
    const stage = inputs.stages[i]!;
    const propellant = Math.max(0, stage.propellant_mass);
    const k = stageStructuralFraction(stage, play);
    const isp = stageIsp(stage, play);
    const ve = exhaustVelocityKmS(isp);
    const dry = propellant * k;
    const m0 = propellant + dry + above;
    const mf = dry + above;
    const dv = mf > 0 ? rocketEquationDv(ve, m0, mf) : 0;
    results.unshift({
      structural_fraction: k,
      isp_s: isp,
      exhaust_velocity_km_s: ve,
      dry_mass_t: dry,
      ignition_mass_t: m0,
      burnout_mass_t: mf,
      mass_ratio: mf > 0 ? m0 / mf : 1,
      dv_km_s: dv,
    });
    above = m0;
  }

  const dv_total_km_s = results.reduce((sum, s) => sum + s.dv_km_s, 0);
  const budget_km_s = missionBudgetKmS(inputs.route, budget);
  const orbit = budget.to_orbit_km_s + (inputs.route ? ROUTE_DV_ADJUST_KM_S[inputs.route] : 0);
  const moon = orbit + budget.toward_moon_km_s;
  const reach: MissionReach =
    dv_total_km_s >= budget_km_s ? "landed" : dv_total_km_s >= moon ? "toward_moon" : dv_total_km_s >= orbit ? "orbit" : "short_of_orbit";

  return {
    stages: results,
    dv_total_km_s,
    budget_km_s,
    dv_margin_km_s: dv_total_km_s - budget_km_s - (inputs.margin_deductions_km_s ?? 0),
    liftoff_mass_t: above,
    propellant_total_t: inputs.stages.reduce((sum, s) => sum + Math.max(0, s.propellant_mass), 0),
    reach,
  };
}

/**
 * The most Δv one stage can give with no payload at all: v_e ln((1 + k) / k). Used for the
 * single-stage and black-powder what-ifs (stage6 L107; failure-modes.md traps).
 */
export function singleStageMaxDvKmS(stage: RocketStageDials, play: RocketPlayValues = ROCKET_PLAY_VALUES): number {
  const k = stageStructuralFraction(stage, play);
  return exhaustVelocityKmS(stageIsp(stage, play)) * Math.log((1 + k) / k);
}

export interface StagingSpec {
  isp_s: number;
  /** Dry mass per tonne of propellant (the workshop convention). */
  structural_fraction: number;
}

export interface OptimalStaging {
  liftoff_mass_t: number;
  propellant_mass_t: number[];
  dv_km_s: number[];
}

/**
 * Minimum-liftoff-mass staging for a target Δv (Lagrange multiplier method; Curtis, Orbital
 * Mechanics for Engineering Students, §11.6). Stages bottom first. Returns null when the target is
 * beyond what these stages can give at any size. For the workshop's previews, such as the aluminum
 * node's "steel vehicle vs aluminum vehicle" (stage4 L454).
 */
export function optimalStaging(stages: ReadonlyArray<StagingSpec>, payload_t: number, target_dv_km_s: number): OptimalStaging | null {
  if (stages.length === 0 || !(payload_t > 0)) return null;
  const c = stages.map((s) => exhaustVelocityKmS(s.isp_s));
  // Classical structural coefficient: dry / (dry + propellant).
  const eps = stages.map((s) => s.structural_fraction / (1 + s.structural_fraction));
  const ceiling = c.reduce((sum, ci, i) => sum + ci * Math.log(1 / eps[i]!), 0);
  if (!(target_dv_km_s < ceiling)) return null;

  const massRatio = (i: number, eta: number) => (c[i]! * eta - 1) / (c[i]! * eps[i]! * eta);
  const dvAt = (eta: number) => c.reduce((sum, ci, i) => sum + ci * Math.log(massRatio(i, eta)), 0);
  const etaMin = Math.max(...c.map((ci, i) => 1 / (ci * (1 - eps[i]!)))) * (1 + 1e-12);
  let etaMax = etaMin * 2;
  while (dvAt(etaMax) < target_dv_km_s) etaMax *= 2;
  const eta = bisect(dvAt, target_dv_km_s, etaMin, etaMax);

  const propellant: number[] = new Array<number>(stages.length).fill(0);
  const dv: number[] = new Array<number>(stages.length).fill(0);
  let above = payload_t;
  for (let i = stages.length - 1; i >= 0; i--) {
    const n = massRatio(i, eta);
    const m0 = (n * above * (1 - eps[i]!)) / (1 - n * eps[i]!);
    const stageMass = m0 - above;
    propellant[i] = stageMass * (1 - eps[i]!);
    dv[i] = c[i]! * Math.log(n);
    above = m0;
  }
  return { liftoff_mass_t: above, propellant_mass_t: propellant, dv_km_s: dv };
}
