// Rocket engine workshop model (Stage 5): Isp from mixture ratio, chamber pressure and nozzle
// expansion (sea level and vacuum), thrust, burn time vs cooling, feed-system caps on chamber
// pressure, and the design quantities package H's flaw generation reads (injector quality,
// stability and feed margins, flow separation). Dials named as in stage5 L45-68.
//
// Ideal-rocket equations (Sutton, Rocket Propulsion Elements, ch. 3): c* from the chamber gas,
// thrust coefficient C_F from the isentropic nozzle, Isp = η c* C_F / g0, thrust = C_F Pc At.
// `flaws_found` (a workshop output) comes from package H's firing resolution, not from here.

import { ATM_PA, BAR_PA, G0_M_S2, bisect } from "./physics";

export type EnginePropellants = "ethanol_lox" | "kerosene_lox" | "hypergolic";
export type Cooling = "none" | "film" | "regenerative";
export type Injector = "showerhead" | "impinging" | "impinging_baffled";
export type Feed = "pressure_fed" | "peroxide_turbopump" | "gas_generator_turbopump";

export interface PropellantData {
  /** Characteristic velocity at the best mixture ratio, m/s (ideal, before combustion losses). */
  cstar_peak_m_s: number;
  /** Mixture ratio (oxidizer : fuel by mass) of best performance. */
  best_mixture_ratio: number;
  /** Ratio of specific heats of the exhaust. */
  gamma: number;
}

/**
 * Propellant chemistry. Estimates rounded from equilibrium-chemistry tables at ~20 bar:
 *  - ethanol_lox: 75% ethanol as on the V-2 (stage5 L272); best ratio "about 1.3-1.5" (stage5 L51).
 *  - kerosene_lox: best ratio "about 2.3" (stage5 L51).
 *  - hypergolic: nitric acid with an amine (stage5 L433); best near 2.8 (estimate).
 */
export const PROPELLANTS: Readonly<Record<EnginePropellants, PropellantData>> = {
  ethanol_lox: { cstar_peak_m_s: 1_700, best_mixture_ratio: 1.4, gamma: 1.22 },
  kerosene_lox: { cstar_peak_m_s: 1_780, best_mixture_ratio: 2.3, gamma: 1.22 },
  hypergolic: { cstar_peak_m_s: 1_600, best_mixture_ratio: 2.8, gamma: 1.22 },
};

/**
 * How fast c* falls away from the best mixture ratio: c* × (1 − k ln²(MR/MR_best)). Estimate:
 * ~4% down at 0.7× the best ratio, ~15-20% at twice it.
 */
export const MIXTURE_CURVATURE = 0.35;

/**
 * Combustion efficiency (fraction of ideal c*) by injector. Estimates: the showerhead value is
 * calibrated so V-2 settings give the V-2's 239 s vacuum Isp (open question 12); impinging jets
 * atomise finely; baffles cost a little performance to stop instability.
 */
export const INJECTOR_EFFICIENCY: Readonly<Record<Injector, number>> = {
  showerhead: 0.894,
  impinging: 0.95,
  impinging_baffled: 0.94,
};

/** injector_quality (state-variables L145: 0-2) by injector. */
export const INJECTOR_QUALITY: Readonly<Record<Injector, number>> = {
  showerhead: 0,
  impinging: 1,
  impinging_baffled: 2,
};

/**
 * Chamber pressure each injector burns smoothly up to, bar. Estimates: showerhead "rough burning,
 * instability likely" (stage5 L60) above about the V-2's 15 bar; impinging jets "higher pressure
 * possible"; baffles "fix combustion instability".
 */
export const INJECTOR_STABLE_PC_BAR: Readonly<Record<Injector, number>> = {
  showerhead: 15,
  impinging: 40,
  impinging_baffled: 120,
};

/**
 * Highest chamber pressure each feed system can supply, bar: pressure-fed "caps at ~20" (stage5
 * L54); peroxide turbopump "to ~25 bar" (L379); gas generator "to 60 bar" (L406).
 */
export const FEED_MAX_PC_BAR: Readonly<Record<Feed, number>> = {
  pressure_fed: 20,
  peroxide_turbopump: 25,
  gas_generator_turbopump: 60,
};

/** Film cooling: "a minute, at an Isp cost" (stage5 L57). Estimate: 4% of Isp to the wall film. */
export const FILM_COOLING_ISP_FACTOR = 0.96;
/** Regenerative cooling warms the fuel, "which then burns a little better" (stage5 L309). Estimate. */
export const REGEN_COOLING_ISP_FACTOR = 1.005;

/** Reference chamber pressure for burn times, bar (the V-2's 15, stage5 L55). */
export const BURN_REFERENCE_PC_BAR = 15;
/** Uncooled chamber at the reference pressure: "None: seconds" (stage5 L57). Estimate. */
export const UNCOOLED_BURN_S = 5;
/** Film-cooled at the reference pressure: "a minute" (stage5 L57); the V-2 burned ~65 s. */
export const FILM_BURN_S = 60;
/** Wall heat flux ∝ Pc^0.8 (Bartz correlation), so heat-limited burn time ∝ Pc^-0.8. */
export const HEAT_FLUX_PRESSURE_EXPONENT = 0.8;
/** Oxidizer-rich hot gas attacks the wall: burn time × exp(−k (MR/MR_best − 1)) above the best ratio. Estimate. */
export const OXIDIZER_RICH_SENSITIVITY = 2;
/** Beyond this multiple of the best ratio even a regenerative wall burns through (stage5 L51). Estimate. */
export const REGEN_BURNTHROUGH_RATIO = 1.5;
/** Regenerative chamber run oxidizer-rich past that ratio, at the reference pressure, s. Estimate. */
export const REGEN_OXIDIZER_RICH_BURN_S = 30;

/**
 * Flow separates in an over-expanded nozzle when exit pressure falls below ~0.4 of ambient
 * (Summerfield criterion; estimate). The sea-level Isp is then computed for the nozzle cut where
 * the flow leaves the wall, and the design is flagged (side loads).
 */
export const SEPARATION_PRESSURE_RATIO = 0.4;

/** V-2 throat, 0.40 m across (estimate from its drawings). No dial sets engine size; see open question 38. */
export const DEFAULT_THROAT_AREA_M2 = Math.PI * 0.2 ** 2;

export interface RocketEngineDials {
  mixture_ratio: number;
  /** Bar. */
  chamber_pressure: number;
  /** Nozzle expansion ratio, exit area over throat area. */
  nozzle: number;
  /** Before regenerative_cooling adds the dial: none. */
  cooling?: Cooling;
  /** Before injector_design adds the dial: showerhead. */
  injector?: Injector;
  /** Before the feed dial exists the first engine is pressure-fed (stage5 L245). */
  feed?: Feed;
}

export interface RocketEngineOptions {
  propellants: EnginePropellants;
  throat_area_m2?: number;
}

export interface RocketEngineResult {
  /** Sea-level thrust, kN (the stand and the Stage 5 gate measure this). */
  thrust_kn: number;
  thrust_vac_kn: number;
  isp_sl_s: number;
  isp_vac_s: number;
  /** How long the chamber survives, s; Infinity when cooling keeps up. */
  burn_time_s: number;
  /** Chamber pressure actually reached after the feed cap, bar. */
  chamber_pressure_bar: number;
  /** The feed system couldn't supply the dial's pressure. */
  feed_limited: boolean;
  /** Feed cap over the dial's pressure (<1: the dial asks for more than the feed gives). For H. */
  feed_margin: number;
  /** Smooth-burning pressure over the chamber pressure (<1: instability likely). For H. */
  stability_margin: number;
  /** state injector_quality, 0-2. For H. */
  injector_quality: number;
  /** Over-expanded at sea level past the separation point: side loads. For H. */
  flow_separation_sl: boolean;
  oxidizer_rich: boolean;
  cstar_m_s: number;
  exit_pressure_bar: number;
  mass_flow_kg_s: number;
  oxidizer_flow_kg_s: number;
  fuel_flow_kg_s: number;
}

/** Area ratio A/A* at Mach M. */
export function areaRatio(mach: number, gamma: number): number {
  return (1 / mach) * Math.pow((2 / (gamma + 1)) * (1 + ((gamma - 1) / 2) * mach * mach), (gamma + 1) / (2 * (gamma - 1)));
}

/** Supersonic exit Mach for an expansion ratio. */
export function exitMach(expansion: number, gamma: number): number {
  if (expansion <= 1) return 1;
  return bisect((m) => areaRatio(m, gamma), expansion, 1, 50);
}

/** Exit over chamber pressure for an expansion ratio. */
export function exitPressureRatio(expansion: number, gamma: number): number {
  const m = exitMach(expansion, gamma);
  return Math.pow(1 + ((gamma - 1) / 2) * m * m, -gamma / (gamma - 1));
}

/** Ideal thrust coefficient for an expansion ratio at an ambient/chamber pressure ratio. */
export function thrustCoefficient(expansion: number, gamma: number, ambient_over_chamber: number): number {
  const pr = exitPressureRatio(expansion, gamma);
  const momentum = Math.sqrt(
    ((2 * gamma * gamma) / (gamma - 1)) * Math.pow(2 / (gamma + 1), (gamma + 1) / (gamma - 1)) * (1 - Math.pow(pr, (gamma - 1) / gamma)),
  );
  return momentum + (pr - ambient_over_chamber) * expansion;
}

/** Ideal c* at a mixture ratio, m/s. */
export function characteristicVelocity(propellants: EnginePropellants, mixture_ratio: number): number {
  const p = PROPELLANTS[propellants];
  const l = Math.log(Math.max(1e-6, mixture_ratio) / p.best_mixture_ratio);
  return p.cstar_peak_m_s * Math.max(0.3, 1 - MIXTURE_CURVATURE * l * l);
}

export function rocketEngine(dials: RocketEngineDials, options: RocketEngineOptions): RocketEngineResult {
  const prop = PROPELLANTS[options.propellants];
  const gamma = prop.gamma;
  const cooling = dials.cooling ?? "none";
  const injector = dials.injector ?? "showerhead";
  const feed = dials.feed ?? "pressure_fed";
  const at = options.throat_area_m2 ?? DEFAULT_THROAT_AREA_M2;

  const pcBar = Math.min(dials.chamber_pressure, FEED_MAX_PC_BAR[feed]);
  const pc = pcBar * BAR_PA;
  const expansion = Math.max(1, dials.nozzle);

  const coolingFactor = cooling === "film" ? FILM_COOLING_ISP_FACTOR : cooling === "regenerative" ? REGEN_COOLING_ISP_FACTOR : 1;
  const cstar = characteristicVelocity(options.propellants, dials.mixture_ratio) * INJECTOR_EFFICIENCY[injector] * coolingFactor;

  const cfVac = thrustCoefficient(expansion, gamma, 0);
  const pe = exitPressureRatio(expansion, gamma) * pc;
  const flow_separation_sl = pe < SEPARATION_PRESSURE_RATIO * ATM_PA;
  // With separation, the nozzle flows full only to where the pressure falls to the separation point.
  const slExpansion = flow_separation_sl
    ? Math.max(1, bisect((e) => exitPressureRatio(e, gamma), (SEPARATION_PRESSURE_RATIO * ATM_PA) / pc, 1, expansion))
    : expansion;
  const cfSl = Math.max(0, thrustCoefficient(slExpansion, gamma, ATM_PA / pc));

  const mass_flow_kg_s = (pc * at) / cstar;
  const mr = Math.max(0, dials.mixture_ratio);

  const ratioToBest = mr / prop.best_mixture_ratio;
  const wallAttack = Math.exp(-OXIDIZER_RICH_SENSITIVITY * Math.max(0, ratioToBest - 1));
  const pressureScale = Math.pow(BURN_REFERENCE_PC_BAR / Math.max(1, pcBar), HEAT_FLUX_PRESSURE_EXPONENT);
  let burn_time_s: number;
  if (cooling === "regenerative") {
    burn_time_s = ratioToBest > REGEN_BURNTHROUGH_RATIO ? REGEN_OXIDIZER_RICH_BURN_S * pressureScale * wallAttack : Infinity;
  } else {
    burn_time_s = (cooling === "film" ? FILM_BURN_S : UNCOOLED_BURN_S) * pressureScale * wallAttack;
  }

  const stable = INJECTOR_STABLE_PC_BAR[injector];
  return {
    thrust_kn: (cfSl * pc * at) / 1_000,
    thrust_vac_kn: (cfVac * pc * at) / 1_000,
    isp_sl_s: (cstar * cfSl) / G0_M_S2,
    isp_vac_s: (cstar * cfVac) / G0_M_S2,
    burn_time_s,
    chamber_pressure_bar: pcBar,
    feed_limited: dials.chamber_pressure > FEED_MAX_PC_BAR[feed],
    feed_margin: FEED_MAX_PC_BAR[feed] / Math.max(1e-9, dials.chamber_pressure),
    stability_margin: stable / Math.max(1e-9, pcBar),
    injector_quality: INJECTOR_QUALITY[injector],
    flow_separation_sl,
    oxidizer_rich: ratioToBest > 1,
    cstar_m_s: cstar,
    exit_pressure_bar: pe / BAR_PA,
    mass_flow_kg_s,
    oxidizer_flow_kg_s: (mass_flow_kg_s * mr) / (1 + mr),
    fuel_flow_kg_s: mass_flow_kg_s / (1 + mr),
  };
}
