// Furnace workshop model (Stages 1-3): crucible copper, the bloomery, the blast furnace with hot
// blast and flux, and the Bessemer converter. Dials and outputs are named as in the stage YAML
// (furnace_workshop in stage1 L45-57, stage2 L76-96, stage3 L53-67). A campaign is one run; the
// engine (package A) supplies the ore it charges and applies the per-worker rates.

import { interpolate } from "./physics";

export type AirSupply = "blowpipes" | "bellows_crews" | "wind_site";
export type OreChoice = "bog_iron" | "hillside_ore";
export type ChargeMode = "copper" | "iron_bloom" | "iron_blast";
export type BlastSource = "treadwheels" | "water_wheel";
export type FurnaceFuel = "charcoal" | "coke";
export type ConverterLining = "acid_silica" | "basic_dolomite";
export type Manganese = "none" | "spiegeleisen";
export type LowHigh = "low" | "high";

export type FurnaceFailure =
  | "too_cold" // the charge never reaches temperature (stage1 L55)
  | "cast_lumps" // bloomery over-fuelled: brittle cast iron instead of a bloom (stage2 L83)
  | "frozen_short_stack" // blast furnace too short to run liquid (stage2 L86, L451)
  | "frozen_weak_blast" // not enough blast for the stack (stage2 L451)
  | "under_blown" // converter: carbon left, hard and brittle (stage3 L63)
  | "over_blown"; // converter: over-oxidized, weak (stage3 L63)

/** The most iron_quality can be (state-variables L26: "0-3, starts 3"). */
export const IRON_QUALITY_MAX = 3;

// ---------------------------------------------------------------------------------------------
// Temperature: air supply and fuel ratio
// ---------------------------------------------------------------------------------------------

/** An open wood or charcoal fire without forced draft, °C (stage1 L53, L142: "rarely gets past 900 C"). */
export const OPEN_FIRE_C = 900;

/**
 * Peak temperature a well-fuelled charge reaches with each air supply, °C. Estimates: forced draft
 * lifts charcoal "from ~900 C to 1,200 C+" (stage1 L53); blowpipes reach copper's melting point
 * "barely" (stage1 L52).
 */
export const PEAK_TEMPERATURE_C: Readonly<Record<AirSupply, number>> = {
  blowpipes: 1_100,
  bellows_crews: 1_250,
  wind_site: 1_300,
};

/**
 * Charcoal per kg of ore at which the fire reaches its peak, by charge. Below it the temperature
 * falls toward an open fire's in proportion.
 *  - copper 2.0: the prototype's smelter burns 5 kg charcoal on 2.5 kg ore (10 kg per kg copper at
 *    20% yield, stage1 L56, L207).
 *  - iron_bloom 1.0: "charcoal:ore near 1:1" (stage2 L83).
 */
export const FULL_FIRE_FUEL_RATIO: Readonly<Record<"copper" | "iron_bloom", number>> = {
  copper: 2.0,
  iron_bloom: 1.0,
};

/** Temperature a charge needs, °C: copper melts at 1,085 (stage1 L56); a bloom reduces at ~1,200 (stage2 L208). */
export const REQUIRED_TEMPERATURE_C: Readonly<Record<"copper" | "iron_bloom", number>> = {
  copper: 1_085,
  iron_bloom: 1_200,
};

/** Charge temperature from the air supply and the fuel ratio, °C. */
export function furnaceTemperatureC(air_supply: AirSupply, fuel_ratio: number, charge: "copper" | "iron_bloom"): number {
  const fullness = Math.max(0, Math.min(1, fuel_ratio / FULL_FIRE_FUEL_RATIO[charge]));
  return OPEN_FIRE_C + (PEAK_TEMPERATURE_C[air_supply] - OPEN_FIRE_C) * fullness;
}

// ---------------------------------------------------------------------------------------------
// Copper (Stage 1)
// ---------------------------------------------------------------------------------------------

/** Copper out per kg of ore charged (stage1 L207: "20% yield baseline"). */
export const COPPER_YIELD = 0.2;

/**
 * Ore a crucible or furnace works per campaign, relative to blowpipes (stage1 L52: "double or
 * triple output per crucible"; L317 bellows 2x; L290 wind 3x).
 */
export const AIR_OUTPUT_MULTIPLIER: Readonly<Record<AirSupply, number>> = {
  blowpipes: 1,
  bellows_crews: 2,
  wind_site: 3,
};

/** A wind site's output in the fixed calm season (stage1 L290: "drops 60%"). */
export const WIND_CALM_SEASON_FACTOR = 0.4;

export interface CopperCampaignDials {
  air_supply: AirSupply;
  /** Charcoal per kg of ore. */
  fuel_ratio: number;
}

export interface CampaignResult {
  metal_kg: number;
  fuel_kg: number;
  /** 1 if this campaign failed, else 0: the engine sums it into the workshop's history. */
  failed_campaigns: 0 | 1;
  failure: FurnaceFailure | null;
  temperature_c: number;
}

export interface CopperCampaignResult extends CampaignResult {
  /** Multiplier on a smelter's ore throughput for the air supply (and season). */
  output_multiplier: number;
}

/** Throughput multiplier for an air supply; a wind site loses 60% in the calm season. */
export function airOutputMultiplier(air_supply: AirSupply, calm_season = false): number {
  return AIR_OUTPUT_MULTIPLIER[air_supply] * (air_supply === "wind_site" && calm_season ? WIND_CALM_SEASON_FACTOR : 1);
}

/** One copper campaign on `ore_kg` of ore. Fuel is burned whether or not it succeeds. */
export function smeltCopper(dials: CopperCampaignDials, ore_kg: number, calm_season = false): CopperCampaignResult {
  const temperature_c = furnaceTemperatureC(dials.air_supply, dials.fuel_ratio, "copper");
  const hot = temperature_c >= REQUIRED_TEMPERATURE_C.copper;
  return {
    metal_kg: hot ? ore_kg * COPPER_YIELD : 0,
    fuel_kg: ore_kg * dials.fuel_ratio,
    failed_campaigns: hot ? 0 : 1,
    failure: hot ? null : "too_cold",
    temperature_c,
    output_multiplier: airOutputMultiplier(dials.air_supply, calm_season),
  };
}

// ---------------------------------------------------------------------------------------------
// Bloomery (Stage 2)
// ---------------------------------------------------------------------------------------------

/** Iron content of each deposit, fraction (stage2 L80: "bog ~40% Fe, hillside ~60%"). */
export const ORE_GRADE: Readonly<Record<OreChoice, number>> = {
  bog_iron: 0.4,
  hillside_ore: 0.6,
};

/** Bog iron carries phosphorus (stage2 L80, L165: iron_quality -1). */
export const ORE_PHOSPHORUS: Readonly<Record<OreChoice, LowHigh>> = {
  bog_iron: "high",
  hillside_ore: "low",
};

/** Above this charcoal:ore ratio the bloom absorbs carbon and comes out as brittle cast lumps (stage2 L83). */
export const BLOOM_MAX_FUEL_RATIO = 1.3;

/** Ore-to-bloom yield at the reference grade: "~0.17 ... sourced from experimental smelts" (stage2 L202, L211). */
export const BLOOM_YIELD_AT_REFERENCE = 0.17;
/** The grade that yield is quoted for: good ore, taken as the hillside deposit's ~60%. Estimate. */
export const BLOOM_REFERENCE_GRADE = 0.6;
/**
 * Grade at which a bloomery gets nothing: the slag, mostly iron silicate, takes all the iron.
 * Estimate, chosen so yields fall steeply below ~50% Fe (state-variables L47).
 */
export const BLOOM_ZERO_YIELD_GRADE = 0.25;

/** Bloom per kg of ore at a grade. */
export function bloomYield(grade: number): number {
  return Math.max(0, (BLOOM_YIELD_AT_REFERENCE * (grade - BLOOM_ZERO_YIELD_GRADE)) / (BLOOM_REFERENCE_GRADE - BLOOM_ZERO_YIELD_GRADE));
}

export interface BloomeryDials {
  air_supply: AirSupply;
  fuel_ratio: number;
  ore_choice: OreChoice;
}

export interface BloomeryResult extends CampaignResult {
  iron_quality: number;
  carries_phosphorus: boolean;
}

/** Quality of iron from an ore and fuel, before any steelmaking. */
export function ironQuality(carries_phosphorus: boolean, carries_sulfur: boolean): number {
  return IRON_QUALITY_MAX - (carries_phosphorus ? 1 : 0) - (carries_sulfur ? 1 : 0);
}

/** One bloomery campaign on `ore_kg` of ore. */
export function smeltBloom(dials: BloomeryDials, ore_kg: number): BloomeryResult {
  const temperature_c = furnaceTemperatureC(dials.air_supply, dials.fuel_ratio, "iron_bloom");
  const failure: FurnaceFailure | null =
    temperature_c < REQUIRED_TEMPERATURE_C.iron_bloom ? "too_cold" : dials.fuel_ratio > BLOOM_MAX_FUEL_RATIO ? "cast_lumps" : null;
  const carries_phosphorus = ORE_PHOSPHORUS[dials.ore_choice] === "high";
  return {
    metal_kg: failure ? 0 : ore_kg * bloomYield(ORE_GRADE[dials.ore_choice]),
    fuel_kg: ore_kg * dials.fuel_ratio,
    failed_campaigns: failure ? 1 : 0,
    failure,
    temperature_c,
    iron_quality: ironQuality(carries_phosphorus, false),
    carries_phosphorus,
  };
}

// ---------------------------------------------------------------------------------------------
// Blast furnace (Stages 2-3)
// ---------------------------------------------------------------------------------------------

/** Below this stack height iron doesn't absorb enough carbon to melt (stage2 L86: "Above ~5 m"). */
export const MIN_LIQUID_STACK_M = 5;

/** A reference furnace: this stack gives REFERENCE_PIG_T_PER_DAY. Estimate. */
export const REFERENCE_STACK_M = 6;
/** "cast iron, ~1 t/day" (stage2 L86, L446). */
export const REFERENCE_PIG_T_PER_DAY = 1;

/**
 * Blast a stack needs, kW per metre of height. Estimate: one ~3 kW water wheel (stage2 L417) or
 * ~60 treadwheel walkers (stage2 L89) blows a 6 m stack.
 */
export const BLAST_KW_PER_STACK_M = 0.5;

/** Power of one water wheel site, kW (stage2 L417: "~3 kW (estimate)"). */
export const WATER_WHEEL_KW = 3;
/** Walkers a treadwheel blast needs per furnace (stage2 L89: "~60 walkers per furnace (estimate)"). */
export const TREADWHEEL_WALKERS_PER_FURNACE = 60;
/** Sustained output of one treadwheel walker, W. Estimate, so 60 walkers match one wheel. */
export const WALKER_W = 50;

/** Below this fraction of the blast it needs, the furnace freezes. Estimate. */
export const FREEZE_BLAST_FRACTION = 0.8;

/**
 * Cold-blast fuel per tonne of pig iron, t.
 *  - charcoal 1.5: energy.md L102 and stage2 L446 ("1.5-2 t").
 *  - coke 5.04: Neilson's 8.06 t of coal per t of iron (energy.md L114, sourced) made into coke at
 *    1.6 kg coal per kg coke (stage2 L357, estimate). stage2 L446 says "1.5-2 t ... coke", which
 *    disagrees; see open-questions.md C2.
 */
export const COLD_BLAST_FUEL_T_PER_T: Readonly<Record<FurnaceFuel, number>> = {
  charcoal: 1.5,
  coke: 8.06 / 1.6,
};

/** Coal per kg of coke (stage2 L357 comment: "1.6 kg coal -> 1 kg coke (estimates)"). */
export const COAL_PER_KG_COKE = 1.6;

/**
 * Fuel per tonne of iron vs blast temperature, as a fraction of cold blast. Neilson 1828: 8.06 →
 * 5.16 t at 149 °C (stage3 L363, sourced); "by two thirds at 300 C+" (stage3 L57, estimate).
 */
export const HOT_BLAST_FUEL_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [20, 1],
  [149, 5.16 / 8.06],
  [300, 1 / 3],
];

/** Lime per tonne of ore at which slag flows best, kg. Estimate, mid-range of the 0-300 dial. */
export const FLUX_OPTIMUM_KG_PER_T_ORE = 150;
/** Yield gain at the optimum flux (stage2 L95: "yield +25% in the blast furnace"). */
export const FLUX_YIELD_GAIN = 0.25;
/** Throughput lost per unit of flux above the optimum, relative: at twice the optimum, half the output. Estimate ("Too much thickens the slag", stage2 L95). */
export const THICK_SLAG_LOSS_PER_EXCESS = 0.5;
/** Fraction of the ore's iron that reaches the pig with no flux. Estimate, so the best flux gives 0.9. */
export const BLAST_BASE_RECOVERY = 0.72;
/** Iron fraction of pig iron (~4% carbon plus silicon, stage2 L457). */
export const PIG_IRON_FE = 0.94;

export interface BlastFurnaceDials {
  stack_height: number;
  blast_source: BlastSource;
  ore_choice: OreChoice;
  /** Before coal_seam_choice adds the dial, the fuel is charcoal. */
  furnace_fuel?: FurnaceFuel;
  /** Lime per tonne of ore, kg (0 before lime_burning adds the dial). */
  flux?: number;
  /** °C (20 = cold blast, before hot_blast adds the dial). */
  blast_temperature?: number;
}

export interface BlastFurnaceOptions {
  /** coal_sulfur state: coke from the high-sulfur seam carries sulfur (stage2 L92). */
  coal_sulfur?: LowHigh;
  /** Walkers on the treadwheels; defaults to the ~60 a furnace needs. */
  treadwheel_walkers?: number;
  /** Water wheels assigned to this furnace's blast; default 1. */
  water_wheels?: number;
}

export interface BlastFurnaceResult {
  /** Pig iron per day, kg (0 when frozen). */
  metal_kg_per_day: number;
  ore_kg_per_day: number;
  /** Fuel charged per day, kg of charcoal or coke. */
  fuel_kg_per_day: number;
  /** Coal burned per day to make that coke, kg (0 on charcoal). For energy accounting. */
  coal_kg_per_day: number;
  lime_kg_per_day: number;
  /** Fuel per tonne of iron (state coke_rate). */
  coke_rate: number;
  blast_kw: number;
  blast_kw_needed: number;
  failure: FurnaceFailure | null;
  iron_quality: number;
  carries_phosphorus: boolean;
  carries_sulfur: boolean;
}

export function hotBlastFuelFactor(blast_temperature_c: number): number {
  return interpolate(HOT_BLAST_FUEL_ANCHORS, blast_temperature_c);
}

export function blastKw(source: BlastSource, options: BlastFurnaceOptions = {}): number {
  return source === "water_wheel"
    ? WATER_WHEEL_KW * (options.water_wheels ?? 1)
    : ((options.treadwheel_walkers ?? TREADWHEEL_WALKERS_PER_FURNACE) * WALKER_W) / 1_000;
}

/** A blast furnace running continuously: daily throughput for a set of dials. */
export function blastFurnace(dials: BlastFurnaceDials, options: BlastFurnaceOptions = {}): BlastFurnaceResult {
  const fuel = dials.furnace_fuel ?? "charcoal";
  const flux = Math.max(0, dials.flux ?? 0);
  const blast_kw = blastKw(dials.blast_source, options);
  const blast_kw_needed = BLAST_KW_PER_STACK_M * dials.stack_height;
  const blastFraction = blast_kw / blast_kw_needed;
  const failure: FurnaceFailure | null =
    dials.stack_height < MIN_LIQUID_STACK_M ? "frozen_short_stack" : blastFraction < FREEZE_BLAST_FRACTION ? "frozen_weak_blast" : null;

  const excess = Math.max(0, flux - FLUX_OPTIMUM_KG_PER_T_ORE) / FLUX_OPTIMUM_KG_PER_T_ORE;
  const slagFactor = Math.max(0, 1 - THICK_SLAG_LOSS_PER_EXCESS * excess);
  const pigT = failure
    ? 0
    : (REFERENCE_PIG_T_PER_DAY * dials.stack_height * Math.min(1, blastFraction) * slagFactor) / REFERENCE_STACK_M;
  const recovery = BLAST_BASE_RECOVERY * (1 + FLUX_YIELD_GAIN * Math.min(1, flux / FLUX_OPTIMUM_KG_PER_T_ORE));
  const oreT = (pigT * PIG_IRON_FE) / (ORE_GRADE[dials.ore_choice] * recovery);
  const coke_rate = COLD_BLAST_FUEL_T_PER_T[fuel] * hotBlastFuelFactor(dials.blast_temperature ?? 20);
  const fuelT = pigT * coke_rate;
  const carries_phosphorus = ORE_PHOSPHORUS[dials.ore_choice] === "high";
  const carries_sulfur = fuel === "coke" && options.coal_sulfur === "high";

  return {
    metal_kg_per_day: pigT * 1_000,
    ore_kg_per_day: oreT * 1_000,
    fuel_kg_per_day: fuelT * 1_000,
    coal_kg_per_day: fuel === "coke" ? fuelT * 1_000 * COAL_PER_KG_COKE : 0,
    lime_kg_per_day: oreT * flux,
    coke_rate,
    blast_kw,
    blast_kw_needed,
    failure,
    iron_quality: ironQuality(carries_phosphorus, carries_sulfur),
    carries_phosphorus,
    carries_sulfur,
  };
}

// ---------------------------------------------------------------------------------------------
// Bessemer converter (Stage 3)
// ---------------------------------------------------------------------------------------------

/** Carbon in pig iron, % (stage2 L457: "about 4% carbon"). */
export const PIG_CARBON_PCT = 4;
/**
 * Carbon burns out roughly exponentially over the blow; this time constant (min) leaves ~0.3% C,
 * a mild steel, at 20 minutes ("in twenty minutes, tons of iron become steel", stage3 L342). Estimate.
 */
export const BLOW_CARBON_TIME_CONSTANT_MIN = 20 / Math.log(PIG_CARBON_PCT / 0.3);
/** Above this carbon the steel is "hard and brittle" (stage3 L63). Estimate. */
export const UNDER_BLOWN_ABOVE_CARBON_PCT = 0.8;
/** Below this the metal has started taking up oxygen: "over-oxidized, weak" (stage3 L63). Estimate. */
export const OVER_BLOWN_BELOW_CARBON_PCT = 0.2;

export interface ConverterDials {
  converter_lining: ConverterLining;
  /** Minutes. */
  blow_time: number;
  manganese: Manganese;
}

export interface ConverterInputs {
  /** Phosphorus in the pig (iron_ore_phosphorus state, or the blast furnace's carries_phosphorus). */
  iron_ore_phosphorus: LowHigh;
  /** Sulfur in the pig: pass "high" only if it was smelted with high-sulfur coke. */
  coal_sulfur: LowHigh;
}

export interface ConverterResult {
  carbon_pct: number;
  /** 0-3 (state-variables L70: "Bessemer 1; manganese/basic lining 2"). 0 when the heat is spoiled. */
  steel_quality: number;
  iron_quality: number;
  failure: FurnaceFailure | null;
  /** Acid lining can't remove phosphorus: brittle when cold (stage3 L60, L339). */
  cold_short: boolean;
  /** Sulfur left in without manganese: cracks at forging heat (stage3 L66). */
  hot_short: boolean;
}

export function carbonAfterBlowPct(blow_time_min: number): number {
  return PIG_CARBON_PCT * Math.exp(-Math.max(0, blow_time_min) / BLOW_CARBON_TIME_CONSTANT_MIN);
}

/** One converter heat. */
export function bessemerBlow(dials: ConverterDials, inputs: ConverterInputs): ConverterResult {
  const carbon_pct = carbonAfterBlowPct(dials.blow_time);
  const withMn = dials.manganese === "spiegeleisen";
  // Mushet's fix: spiegeleisen after the blow removes the oxygen and adds back carbon, so an
  // over-blown heat is recovered when manganese is used.
  const failure: FurnaceFailure | null =
    carbon_pct > UNDER_BLOWN_ABOVE_CARBON_PCT ? "under_blown" : carbon_pct < OVER_BLOWN_BELOW_CARBON_PCT && !withMn ? "over_blown" : null;
  const cold_short = inputs.iron_ore_phosphorus === "high" && dials.converter_lining === "acid_silica";
  const hot_short = inputs.coal_sulfur === "high" && !withMn;

  let steel_quality = 0;
  if (!failure) steel_quality = withMn && !cold_short ? 2 : 1;

  const iron_quality = Math.max(
    0,
    IRON_QUALITY_MAX - (cold_short ? 1 : 0) - (hot_short ? 1 : 0) - (failure === "over_blown" ? 1 : 0),
  );
  return { carbon_pct, steel_quality, iron_quality, failure, cold_short, hot_short };
}
