// Machine shop model (Stage 3+): the tolerance the shop can hold, shop hours, and the parts queue
// with rejects when a part needs a tighter fit than the shop holds. Dials named as in
// stage3 L77-97 (machine_shop).

export type FlatReference = "none" | "two_plates" | "three_plates";
export type LeadScrew = "hand_chased" | "geared";
export type Gauging = "rule" | "go_no_go_gauges" | "micrometer";
export type Bearings = "wood_and_tallow" | "bronze_and_oil" | "hardened_steel";
export type ShopPower = "line_shaft" | "individual_motors";

/**
 * The tolerance ladder, mm (state-variables L27: "Hand 1.0; flat reference 0.5; lead screw 0.25;
 * gauges 0.1; micrometer 0.02; grinding 0.01"; also stage3 L83, L86, L89 and stage5 L110). Each
 * rung needs every rung below it: you can only hold a tolerance you can measure, and you can only
 * measure against a true reference.
 */
export const TOLERANCE_LADDER_MM = {
  hand: 1.0,
  flat_reference: 0.5,
  lead_screw: 0.25,
  gauges: 0.1,
  micrometer: 0.02,
  grinding: 0.01,
} as const;

/**
 * Two plates lapped together fit each other but can both be curved (stage3 L83). Estimate: a
 * little better than hand work, and a dead end: nothing above it on the ladder works until the
 * third plate.
 */
export const TWO_PLATES_TOLERANCE_MM = 0.75;

/** Productive hours per machinist per day. Estimate (a long 19th-century shift, less setup). */
export const HOURS_PER_MACHINIST_DAY = 10;

/** Individual motors: "shop hours +50%" (stage3 L95, L669). Line shafting "wastes a third ... in belts" (L663): 1 / (1 - 1/3) = 1.5. */
export const SHOP_POWER_HOURS_FACTOR: Readonly<Record<ShopPower, number>> = {
  line_shaft: 1,
  individual_motors: 1.5,
};

/** Planers and milling machines: "Shop hours x3" (stage3 L269). */
export const PLANER_HOURS_FACTOR = 3;
/** Alloy tool steel: "shop hours x2" (stage4 L194). */
export const TOOL_STEEL_HOURS_FACTOR = 2;

export interface MachineShopDials {
  flat_reference: FlatReference;
  lead_screw?: LeadScrew;
  gauging?: Gauging;
  bearings?: Bearings;
  shop_power?: ShopPower;
}

export interface MachineShopOptions {
  /** Machinists working in the shop. */
  machinists: number;
  /** precision_grinding built (stage5 L110: gauging to 0.01 mm). */
  has_precision_grinding?: boolean;
  /** planer_milling built. */
  has_planer?: boolean;
  /** alloy_steels built with tool steel. */
  has_tool_steel?: boolean;
}

/** Best routine fit the shop holds, mm (state tolerance_mm). */
export function toleranceMm(dials: MachineShopDials, has_precision_grinding = false): number {
  if (dials.flat_reference === "none") return TOLERANCE_LADDER_MM.hand;
  if (dials.flat_reference === "two_plates") return TWO_PLATES_TOLERANCE_MM;
  if (dials.lead_screw !== "geared") return TOLERANCE_LADDER_MM.flat_reference;
  const gauging = dials.gauging ?? "rule";
  if (gauging === "rule") return TOLERANCE_LADDER_MM.lead_screw;
  if (gauging === "go_no_go_gauges") return TOLERANCE_LADDER_MM.gauges;
  return has_precision_grinding ? TOLERANCE_LADDER_MM.grinding : TOLERANCE_LADDER_MM.micrometer;
}

/**
 * bearing_quality (state-variables L122: 0 wood/tallow, 1 bronze/oil, 2 bronze/mineral oil,
 * 3 hardened steel balls). Mineral oil comes from the oil node (stage4 L497).
 */
export function bearingQualityOf(bearings: Bearings, has_mineral_oil = false): number {
  if (bearings === "hardened_steel") return 3;
  if (bearings === "bronze_and_oil") return has_mineral_oil ? 2 : 1;
  return 0;
}

export function shopHoursPerDay(dials: MachineShopDials, options: MachineShopOptions): number {
  return (
    Math.max(0, options.machinists) *
    HOURS_PER_MACHINIST_DAY *
    SHOP_POWER_HOURS_FACTOR[dials.shop_power ?? "line_shaft"] *
    (options.has_planer ? PLANER_HOURS_FACTOR : 1) *
    (options.has_tool_steel ? TOOL_STEEL_HOURS_FACTOR : 1)
  );
}

// ---------------------------------------------------------------------------------------------
// Rejects and the queue
// ---------------------------------------------------------------------------------------------

/** Error function (Abramowitz and Stegun 7.1.26, |error| < 1.5e-7). Deterministic. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.327_591_1 * ax);
  const y = 1 - ((((1.061_405_429 * t - 1.453_152_027) * t + 1.421_413_741) * t - 0.284_496_736) * t + 0.254_829_592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Fraction of parts that come out within a required tolerance when the shop routinely holds
 * `held_mm`. Model (estimate): the shop's errors are normal with `held_mm` at two standard
 * deviations, normalised so a part at the shop's own tolerance always passes. A part twice as
 * tight passes ~72% of the time; ten times as tight, ~17%.
 */
export function passFraction(required_mm: number, held_mm: number): number {
  if (required_mm >= held_mm) return 1;
  return erf((Math.SQRT2 * required_mm) / held_mm) / erf(Math.SQRT2);
}

export interface QueuedPart {
  id: string;
  /** Shop hours to make one good part at a fit the shop can hold. */
  hours: number;
  /** Fit the part needs, mm. */
  tolerance_mm: number;
}

export interface QueuedPartResult {
  id: string;
  reject_rate: number;
  /** Hours including remade parts: hours / pass fraction. */
  expected_hours: number;
  /** Tighter than the shop holds: the reject_rate pressure is red (stage3 L32). */
  too_tight: boolean;
  start_day: number;
  finish_day: number;
}

export interface QueueResult {
  parts: QueuedPartResult[];
  /** Days until the last part is done (output queue_days). */
  queue_days: number;
  /** Hours burned on rejects. */
  wasted_hours: number;
  total_hours: number;
}

/**
 * The parts queue in the player's order (the recurring small decision, stage3 L80). Deterministic
 * expected values: each part takes its hours divided by its pass fraction.
 */
export function simulateQueue(parts: ReadonlyArray<QueuedPart>, tolerance_mm: number, shop_hours_per_day: number): QueueResult {
  if (!(shop_hours_per_day > 0)) throw new Error("simulateQueue: the shop needs hours");
  let clock = 0;
  let wasted_hours = 0;
  const results = parts.map((p) => {
    const pass = passFraction(p.tolerance_mm, tolerance_mm);
    const expected_hours = p.hours / pass;
    wasted_hours += expected_hours - p.hours;
    const start_day = clock / shop_hours_per_day;
    clock += expected_hours;
    return {
      id: p.id,
      reject_rate: 1 - pass,
      expected_hours,
      too_tight: p.tolerance_mm < tolerance_mm,
      start_day,
      finish_day: clock / shop_hours_per_day,
    };
  });
  return { parts: results, queue_days: clock / shop_hours_per_day, wasted_hours, total_hours: clock };
}
