// Liquefier workshop model (Stage 4): cascade, Hampson-Linde (throttle with regenerative exchange)
// and Claude (expansion engine) plants, and the rectifying column. Dials named as in stage4 L54-71.
//
// The regenerative cycle in one line: each pass the incoming high-pressure air is precooled by the
// returning cold stream (exchanger effectiveness ε) and then cooled a little more by expansion
// (ΔT). The cold end settles at T* = T_amb − ΔT / (1 − ε): a longer exchanger (ε → 1) drives the
// asymptote down until air liquefies. The yield per kg compressed is the net refrigeration over the
// heat a kg must lose to become liquid, and the energy per kg is the compressor's work over that.

import { HOURS_PER_DAY, SECONDS_PER_DAY, cToK, kToC } from "./physics";

export type LiquefierMethod = "cascade" | "throttle_regenerative" | "expansion_engine";

/** Ambient (and compressor aftercooler) temperature, °C. Estimate. */
export const AMBIENT_C = 20;
/** Air liquefies at about -190 °C at the throttle exit (stage4 L66, L349). */
export const LIQUID_AIR_C = -190;

/** Specific heat of air, kJ/(kg·K). */
export const AIR_CP_KJ_KG_K = 1.005;
/** Heat of vaporisation of air, kJ/kg. */
export const AIR_LATENT_KJ_KG = 205;
/** Specific gas constant of air, kJ/(kg·K). */
export const AIR_R_KJ_KG_K = 0.287;
/** Ratio of specific heats of air. */
export const AIR_GAMMA = 1.4;

/**
 * Joule-Thomson cooling of air near room temperature, K per atm of pressure drop. Estimate
 * (measured values are ~0.2-0.27 K/bar, falling at high pressure): "Joule-Thomson cooling per bar
 * is small; regenerative exchange multiplies it" (stage4 L64).
 */
export const JT_K_PER_ATM = 0.2;

/** Heat leaking into the cold end, as K of lost cooling per pass. Estimate for a lagged early plant. */
export const HEAT_LEAK_K = 2;

/**
 * Counterflow exchanger: number of transfer units per unit of the exchanger_length dial.
 * Estimate, chosen so length 1 stalls well above -100 °C (stage4 L385) and length 10 at 200 atm
 * approaches ideal exchange.
 */
export const EXCHANGER_NTU_PER_UNIT = 0.5;

/**
 * Isothermal efficiency of an intercooled multistage compressor. Estimate for a steam-era machine
 * (modern ones reach ~0.7).
 */
export const COMPRESSOR_ISOTHERMAL_EFFICIENCY = 0.6;

/**
 * Claude's expansion engine: the share of the compressed stream sent through it, its isentropic
 * efficiency, and its inlet temperature. Estimates (Claude's engine ran "at around -140 C",
 * stage4 L418; the inlet is taken warmer, ~-73 °C, part-way down the exchanger).
 */
export const EXPANDER_FLOW_FRACTION = 0.5;
export const EXPANDER_ISENTROPIC_EFFICIENCY = 0.7;
export const EXPANDER_INLET_C = -73;

/** Cascade: "a few liters a day, proving it can be done" (stage4 L355), whatever it's given. Estimate. */
export const CASCADE_LITERS_PER_DAY = 5;
/** Cascade energy per kg: a laboratory chain of compressors for each gas. Estimate. */
export const CASCADE_KWH_PER_KG = 20;
/** Cascade: the first drops come the day it runs. Estimate. */
export const CASCADE_DAYS_TO_FIRST_DROP = 1;

/**
 * Heat capacity of the exchanger per unit of exchanger_length, kJ/K: about a tonne of copper tube
 * and steel shell at ~0.3 kJ/(kg·K). Estimate. Sets how many days the first cool-down takes.
 */
export const EXCHANGER_HEAT_CAPACITY_KJ_K_PER_UNIT = 300;

/** Oxygen in air, mole fraction (stage4 L69: "Zero trays: liquid air, 21% oxygen"). */
export const AIR_OXYGEN_FRACTION = 0.21;
/**
 * Enrichment per tray: the oxygen/nitrogen ratio multiplies by this per tray. Estimate calibrated
 * to "30+ trays give 99% oxygen" (stage4 L69), which implies finite reflux and tray efficiency
 * well below the ideal relative volatility (~4).
 */
export const TRAY_SEPARATION_FACTOR = Math.pow(99 / 1 / (21 / 79), 1 / 30);

/** Liquid nitrogen and liquid oxygen densities, kg/L. */
export const LIQUID_N2_KG_PER_L = 0.807;
export const LOX_KG_PER_L = 1.141;

export interface LiquefierDials {
  method: LiquefierMethod;
  /** Compressor pressure, atm (added by compressors). */
  pressure?: number;
  /** Heat exchanger length, dial units 1-10 (added by linde_liquefier). */
  exchanger_length?: number;
  /** Rectifying column trays (added by air_separation); 0 or absent = liquid air. */
  column?: number;
}

export interface LiquefierOptions {
  /** Electric power given to the compressor, kW: the plant's size. */
  compressor_kw: number;
}

export interface LiquefierResult {
  /** Liquid product per day, L (liquid air with no column, oxygen-rich liquid with one). */
  liters_per_day: number;
  kg_per_day: number;
  /** Oxygen in the product, kg/day (the gate's lox_kg_per_day counts this). */
  oxygen_kg_per_day: number;
  /** Electricity per kg of liquid product; null when the plant never liquefies. */
  kwh_per_kg: number | null;
  /** Oxygen mole percent of the product. */
  purity_pct: number;
  /** Days from start to the first drop; null when the asymptote is above liquefaction. */
  days_to_first_drop: number | null;
  /** The cold end's asymptote, °C (the screen shows it); clamped at LIQUID_AIR_C once it liquefies. */
  asymptote_c: number;
  /** Fraction of compressed air that leaves as liquid. */
  liquid_yield: number;
  /** Exchanger effectiveness ε. */
  exchanger_effectiveness: number;
  /** Cooling per pass from expansion, K (JT, plus the expansion engine's work). */
  cooling_per_pass_k: number;
  /** Cool-down time constant, days (for temperatureAtDay). */
  cooldown_time_constant_days: number;
}

/** Isothermal compression work per kg with the compressor's efficiency, kJ/kg. */
export function compressorWorkKjPerKg(pressure_atm: number): number {
  return (AIR_R_KJ_KG_K * cToK(AMBIENT_C) * Math.log(Math.max(1, pressure_atm))) / COMPRESSOR_ISOTHERMAL_EFFICIENCY;
}

export function exchangerEffectiveness(exchanger_length: number): number {
  return 1 - Math.exp(-EXCHANGER_NTU_PER_UNIT * Math.max(0, exchanger_length));
}

/** Oxygen mole percent after a column of `trays` (0 = liquid air). */
export function columnPurityPct(trays: number): number {
  const ratio = (AIR_OXYGEN_FRACTION / (1 - AIR_OXYGEN_FRACTION)) * Math.pow(TRAY_SEPARATION_FACTOR, Math.max(0, trays));
  return (100 * ratio) / (1 + ratio);
}

/** Density of a nitrogen-oxygen liquid by oxygen mole fraction, kg/L (linear mix). */
function liquidDensity(oxygenFraction: number): number {
  return LIQUID_N2_KG_PER_L + (LOX_KG_PER_L - LIQUID_N2_KG_PER_L) * oxygenFraction;
}

/** Oxygen mass fraction of a liquid with an oxygen mole fraction. */
function oxygenMassFraction(x: number): number {
  return (x * 32) / (x * 32 + (1 - x) * 28.01);
}

/** Expansion-engine cooling per kg of compressed air, kJ/kg. */
export function expanderCoolingKjPerKg(pressure_atm: number): number {
  const isentropic = 1 - Math.pow(Math.max(1, pressure_atm), -(AIR_GAMMA - 1) / AIR_GAMMA);
  return EXPANDER_FLOW_FRACTION * EXPANDER_ISENTROPIC_EFFICIENCY * AIR_CP_KJ_KG_K * cToK(EXPANDER_INLET_C) * isentropic;
}

export function liquefier(dials: LiquefierDials, options: LiquefierOptions): LiquefierResult {
  const purity_pct = columnPurityPct(dials.column ?? 0);
  const x = purity_pct / 100;
  const density = liquidDensity(x);

  if (dials.method === "cascade") {
    const kg = CASCADE_LITERS_PER_DAY * density;
    return {
      liters_per_day: CASCADE_LITERS_PER_DAY,
      kg_per_day: kg,
      oxygen_kg_per_day: kg * oxygenMassFraction(x),
      kwh_per_kg: CASCADE_KWH_PER_KG,
      purity_pct,
      days_to_first_drop: CASCADE_DAYS_TO_FIRST_DROP,
      asymptote_c: LIQUID_AIR_C,
      liquid_yield: 0,
      exchanger_effectiveness: 0,
      cooling_per_pass_k: 0,
      cooldown_time_constant_days: 0,
    };
  }

  const pressure = Math.max(1, dials.pressure ?? 1);
  const eps = exchangerEffectiveness(dials.exchanger_length ?? 0);
  const jt = JT_K_PER_ATM * (pressure - 1);
  const expander = dials.method === "expansion_engine" ? expanderCoolingKjPerKg(pressure) / AIR_CP_KJ_KG_K : 0;
  const cooling_per_pass_k = jt + expander;
  const netK = cooling_per_pass_k - HEAT_LEAK_K;

  const tAmb = cToK(AMBIENT_C);
  const tLiq = cToK(LIQUID_AIR_C);
  const tStar = eps < 1 ? tAmb - netK / (1 - eps) : netK > 0 ? -Infinity : tAmb;
  const liquefies = tStar <= tLiq;

  const span = AIR_CP_KJ_KG_K * (tAmb - tLiq) + AIR_LATENT_KJ_KG;
  const refrigeration = AIR_CP_KJ_KG_K * netK - (1 - eps) * AIR_CP_KJ_KG_K * (tAmb - tLiq);
  const liquid_yield = liquefies ? Math.max(0, refrigeration / span) : 0;

  const workKjPerKg = compressorWorkKjPerKg(pressure);
  const massFlowKgS = workKjPerKg > 0 ? Math.max(0, options.compressor_kw) / workKjPerKg : 0;
  const kg_per_day = massFlowKgS * liquid_yield * SECONDS_PER_DAY;
  const kwh_per_kg = liquid_yield > 0 ? workKjPerKg / liquid_yield / 3_600 : null;

  // Cool-down: exponential approach to T* with time constant C / (ṁ cp (1 − ε)).
  const conductance = massFlowKgS * AIR_CP_KJ_KG_K * (1 - eps);
  const tauS = conductance > 0 ? (EXCHANGER_HEAT_CAPACITY_KJ_K_PER_UNIT * Math.max(1, dials.exchanger_length ?? 1)) / conductance : Infinity;
  const days_to_first_drop =
    liquefies && Number.isFinite(tauS) && Number.isFinite(tStar) ? (tauS * Math.log((tAmb - tStar) / (tLiq - tStar))) / SECONDS_PER_DAY : liquefies && massFlowKgS > 0 ? 0 : null;

  return {
    liters_per_day: kg_per_day / density,
    kg_per_day,
    oxygen_kg_per_day: kg_per_day * oxygenMassFraction(x),
    kwh_per_kg,
    purity_pct,
    days_to_first_drop,
    asymptote_c: kToC(Math.max(tStar, tLiq)),
    liquid_yield,
    exchanger_effectiveness: eps,
    cooling_per_pass_k,
    cooldown_time_constant_days: tauS / SECONDS_PER_DAY,
  };
}

/** Cold-end temperature a number of days after start, °C: the curve the player watches fall. */
export function temperatureAtDay(result: LiquefierResult, day: number): number {
  if (result.cooldown_time_constant_days <= 0) return result.asymptote_c;
  const tAmb = cToK(AMBIENT_C);
  const tLiq = cToK(LIQUID_AIR_C);
  // Reconstruct the unclamped asymptote from the cooling and effectiveness.
  const netK = result.cooling_per_pass_k - HEAT_LEAK_K;
  const tStar = result.exchanger_effectiveness < 1 ? tAmb - netK / (1 - result.exchanger_effectiveness) : tLiq;
  const t = tStar + (tAmb - tStar) * Math.exp(-Math.max(0, day) / result.cooldown_time_constant_days);
  return kToC(Math.max(t, tLiq));
}

/** Compressor power a plant needs for a daily output of liquid, kW (for sizing to the gate). */
export function compressorKwFor(kg_per_day: number, kwh_per_kg: number): number {
  return (kg_per_day * kwh_per_kg) / HOURS_PER_DAY;
}
