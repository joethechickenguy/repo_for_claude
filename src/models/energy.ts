// Energy per person: the accounting rules of tech-tree/energy.md §2.
//
// Heat processes count the fuel burned. Engines and electricity count the work they deliver times a
// fixed factor (rule 5), so a better engine is never punished. Muscle isn't counted beyond the
// baseline. Everything here is a pure function of daily quantities; the engine (package A) sums the
// colony's fuel and work each tick and calls energyPerPerson.
//
// energy.md is prose, not loadable content, so its accounting values live here as named constants
// that cite it. If energy.md changes, change these and the pinned tests together.

import { SECONDS_PER_DAY, SECONDS_PER_YEAR } from "./physics";

/** Wood burned in a kiln or furnace, MJ/kg (energy.md §2 table; prototype value). */
export const WOOD_MJ_PER_KG = 15;

/**
 * Charcoal burned for smelting, MJ/kg, counted including clamp losses: ~29 MJ in the charcoal plus
 * ~46 MJ of wood lost making it (energy.md §2; prototype value). Equals 5 kg of wood at 15 MJ/kg.
 */
export const CHARCOAL_MJ_PER_KG = 75;

/** Coal or coke burned for heat, MJ/kg. Estimate; coals range roughly 24-33 (energy.md §2). */
export const COAL_MJ_PER_KG = 27;

/** Oil or kerosene burned for heat, MJ/kg (energy.md §2). */
export const OIL_MJ_PER_KG = 43;

/**
 * Rule 5: delivered work and electricity count as the fuel a reference plant would burn to make
 * them. Fixed factor 2.5 (energy.md §2, §7: close to the inverse of a mid-century plant's efficiency).
 */
export const WORK_COUNT_FACTOR = 2.5;

/** Metabolism plus cooking fires, W per person, counted for everyone (energy.md §4, game convention). */
export const BASELINE_W_PER_PERSON = 120;

export type FuelKind = "wood" | "charcoal" | "coal" | "oil";

export const FUEL_MJ_PER_KG: Readonly<Record<FuelKind, number>> = {
  wood: WOOD_MJ_PER_KG,
  charcoal: CHARCOAL_MJ_PER_KG,
  coal: COAL_MJ_PER_KG,
  oil: OIL_MJ_PER_KG,
};

/**
 * Fuel burned for real work, kg per day, by kind. Coke is passed as the coal that made it (the
 * energy.md coke furnace rows count coal); stockpiles are not passed at all (rule 2).
 */
export type FuelBurnKgPerDay = Partial<Record<FuelKind, number>>;

/** Average heat power of fuel burned per day, W. */
export function fuelHeatW(fuel: FuelBurnKgPerDay): number {
  let mjPerDay = 0;
  for (const kind of Object.keys(fuel) as FuelKind[]) {
    mjPerDay += (fuel[kind] ?? 0) * FUEL_MJ_PER_KG[kind];
  }
  return (mjPerDay * 1e6) / SECONDS_PER_DAY;
}

/** Delivered shaft work or electricity, counted under rule 5, W. */
export function countedWorkW(delivered_kw: number): number {
  return delivered_kw * 1_000 * WORK_COUNT_FACTOR;
}

export interface EnergyInputs {
  /** Fuel burned per day for heat processes. */
  fuel_kg_per_day?: FuelBurnKgPerDay;
  /** Shaft work delivered by water wheels, turbines, steam and electric motors, kW (not muscle). */
  work_kw?: number;
  /** Electricity used, kW. Don't also count the shaft work that generated it. */
  electricity_kw?: number;
  /** Living colonists (10,000 at the start; deaths lower it). */
  population: number;
  /** Override for the per-person baseline; defaults to BASELINE_W_PER_PERSON. */
  baseline_w_per_person?: number;
}

export interface EnergyBreakdown {
  energy_w_per_person: number;
  baseline_w: number;
  fuel_w: number;
  work_w: number;
  electricity_w: number;
}

/** Watts per person under energy.md's rules, with the parts it came from (per person). */
export function energyPerPerson(inputs: EnergyInputs): EnergyBreakdown {
  const pop = inputs.population;
  if (!(pop > 0)) throw new Error("energyPerPerson: population must be positive");
  const baseline_w = inputs.baseline_w_per_person ?? BASELINE_W_PER_PERSON;
  const fuel_w = fuelHeatW(inputs.fuel_kg_per_day ?? {}) / pop;
  const work_w = countedWorkW(inputs.work_kw ?? 0) / pop;
  const electricity_w = countedWorkW(inputs.electricity_kw ?? 0) / pop;
  return {
    energy_w_per_person: baseline_w + fuel_w + work_w + electricity_w,
    baseline_w,
    fuel_w,
    work_w,
    electricity_w,
  };
}

/** Colony power, W, from an energy per day in MJ. 1 W per person = 10 kW for 10,000 = 864 MJ/day. */
export function mjPerDayToW(mj_per_day: number): number {
  return (mj_per_day * 1e6) / SECONDS_PER_DAY;
}

/** Average power, W, of an annual energy in GJ (for the historical comparisons in energy.md §3). */
export function gjPerYearToW(gj_per_year: number): number {
  return (gj_per_year * 1e9) / SECONDS_PER_YEAR;
}

/** Average power, W, of an energy in kWh spread over a number of years. */
export function kwhOverYearsToW(kwh: number, years: number): number {
  return (kwh * 3.6e6) / (years * SECONDS_PER_YEAR);
}
