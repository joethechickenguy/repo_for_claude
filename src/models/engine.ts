// Engine workshop model (Stages 2-4): the Savery pump, atmospheric and pressure engines, the
// boiler's hoop stress and burst date, the separate condenser, rotative output, the generator,
// transmission and the prime mover. Dials and outputs are named as in the stage YAML
// (engine_workshop in stage2 L98-119, stage3 L68-76, stage4 L45-53).

import { COAL_MJ_PER_KG } from "./energy";
import { ATM_PA, COPPER_RESISTIVITY_OHM_M, G0_M_S2, SECONDS_PER_DAY, WATER_DENSITY_KG_M3 } from "./physics";

// ---------------------------------------------------------------------------------------------
// Piston engines
// ---------------------------------------------------------------------------------------------

export type EngineType = "savery" | "newcomen" | "watt" | "high_pressure";
export type PlateType = "hammered" | "rolled" | "open_hearth";
export type Condenser = "none" | "separate";
export type Flywheel = "beam_pump" | "rotative";

/**
 * Effective pressure difference across an atmospheric engine's piston, Pa. stage2 L108:
 * "~50 kPa effective vacuum x piston area" (estimate: half an atmosphere after leakage and
 * incomplete condensation).
 */
export const EFFECTIVE_VACUUM_PA = 50_000;

/** Stroke length, m. Estimate, from the worked example (stage2 L107: "12 strokes/min of 2 m"). */
export const STROKE_M = 2;

/** Strokes per minute. Estimate, from the same worked example (stage2 L107). */
export const STROKES_PER_MIN = 12;

/**
 * Above one atmosphere, steam pushes the piston too. The mean effective pressure over a stroke is
 * taken as half the boiler's gauge pressure (estimate: steam cut off part-way and expanding). This
 * makes "double the pressure, roughly double the power" (stage2 L797) hold at 1 → 2 atm.
 */
export const MEAN_EFFECTIVE_FRACTION_OF_GAUGE = 0.5;

/** Above this boiler pressure (atm) a non-condensing design is a high-pressure engine (stage2 L673: "At 1-2 atm ... Newcomen"). */
export const NEWCOMEN_MAX_BOILER_ATM = 2;

/**
 * Coal-to-work efficiency by engine type ("coal/day at fixed efficiency per type",
 * work-packages.md C).
 *  - newcomen 0.5%: top of the sourced 0.3-0.5% (stage2 L679); it's the value that makes the 4 kW
 *    example burn 2-3 t/day and matches energy.md §1's 10 kW → ~6 t/day.
 *  - watt 2%: a separate condenser cuts coal by about three quarters (stage2 L116-117, sourced).
 *  - high_pressure 2%: estimate; Trevithick's non-condensing engines roughly matched Watt's economy.
 *  - savery 0.3%: estimate, below Newcomen; the bottom of the sourced range.
 */
export const ENGINE_THERMAL_EFFICIENCY: Readonly<Record<EngineType, number>> = {
  savery: 0.003,
  newcomen: 0.005,
  watt: 0.02,
  high_pressure: 0.02,
};

/** Fraction of shaft work that ends up as water lifted (pump rods, bucket leakage). Estimate. */
export const PUMP_EFFICIENCY = 0.6;

/**
 * Boiler radius per metre of cylinder diameter. Estimate: a 0.5 m cylinder drew steam from a
 * haystack boiler about 2 m across. The boiler is not a dial; its size follows the cylinder.
 */
export const BOILER_RADIUS_PER_CYLINDER_DIAMETER = 2;

/**
 * Safe (allowable) hoop stress by plate, Pa. Estimates: wrought iron fails near 300 MPa and ~1/5 of
 * that was a working stress; hammered plate has thin spots, "safe limit ~half of rolled" (stage2
 * L113); open-hearth steel plate (plate_quality, state-variables L67) is stronger again.
 */
export const SAFE_STRESS_PA: Readonly<Record<PlateType, number>> = {
  hammered: 30e6,
  rolled: 60e6,
  open_hearth: 100e6,
};

/** Below this margin the screen shows a burst year (stage2 L113). */
export const SAFE_MARGIN = 1.5;

/** A margin at or under 1 bursts on first firing. */
export const BURST_MARGIN = 1;

/**
 * Years a boiler lasts at a margin just under SAFE_MARGIN, for rolled plate. Estimate: corrosion
 * and fatigue take decades to thin a nearly adequate shell.
 */
export const YEARS_TO_FAILURE_AT_SAFE_MARGIN = 20;

/** Hammered plate's thin spots corrode through sooner: its burst date comes this much earlier. Estimate. */
export const YEARS_TO_FAILURE_PLATE_FACTOR: Readonly<Record<PlateType, number>> = {
  hammered: 0.5,
  rolled: 1,
  open_hearth: 1,
};

/** The safety margin shown when the boiler holds no pressure above atmospheric (nothing to burst). */
export const MARGIN_DISPLAY_CAP = 10;

const IRON_DENSITY_KG_M3 = 7_800;
const CAST_IRON_DENSITY_KG_M3 = 7_200;
/** Cylinder wall thickness per metre of bore, and its minimum. Estimate for sand-cast cylinders. */
const CYLINDER_WALL_PER_BORE = 0.05;
const CYLINDER_WALL_MIN_M = 0.025;
/** Beam fittings, pump rods, pipes and valves, kg of iron. Estimate. */
export const ENGINE_FIXED_IRON_KG = 2_000;
/** Separate condenser, air pump and cistern, kg of iron. Estimate. */
export const CONDENSER_IRON_KG = 1_000;
/** Crank, flywheel and shafting for rotative output, kg of iron. Estimate. */
export const ROTATIVE_IRON_KG = 3_000;

export interface Plate {
  thickness_mm: number;
  type: PlateType;
}

export interface PistonEngineDials {
  /** Depth the pump lifts from, m (the Savery dial carries on for every pumping engine). */
  lift_height: number;
  cylinder_diameter: number;
  /** Absolute boiler pressure, atm (1 = atmospheric). */
  boiler_pressure: number;
  plate: Plate;
  condenser?: Condenser;
  flywheel?: Flywheel;
}

export interface PistonEngineOptions {
  /**
   * Multiplier on the plate's safe stress. Content: when iron_quality is red, "tool life and boiler
   * plate strength fall by a third" (stage2 L68), so pass 2/3 then. Default 1.
   */
  plate_strength_factor?: number;
}

export interface PistonEngineResult {
  engine_type: EngineType;
  effective_pressure_pa: number;
  shaft_kw: number;
  /** m³ of water per day (0 for a rotative engine, which turns shafting instead). */
  water_lifted_per_day: number;
  coal_per_day: number;
  /** kg of coal per kWh delivered (state coal_per_engine_kw). */
  coal_per_engine_kw: number;
  iron_cost_kg: number;
  boiler_radius_m: number;
  hoop_stress_pa: number;
  safe_stress_pa: number;
  safety_margin: number;
  /** Years from first firing to the burst; null when the margin is safe. */
  years_to_failure: number | null;
}

/** Which engine a design is (the engine_type state enum). */
export function engineTypeOf(dials: Pick<PistonEngineDials, "boiler_pressure" | "condenser">): EngineType {
  if (dials.condenser === "separate") return "watt";
  return dials.boiler_pressure > NEWCOMEN_MAX_BOILER_ATM ? "high_pressure" : "newcomen";
}

/** Coal to deliver a shaft power at an efficiency, kg per day. */
export function coalPerDayKg(shaft_kw: number, efficiency: number): number {
  return (shaft_kw * 1_000 * SECONDS_PER_DAY) / (efficiency * COAL_MJ_PER_KG * 1e6);
}

/** Coal per kWh delivered at an efficiency, kg/kWh. */
export function coalKgPerKwh(efficiency: number): number {
  return 3.6 / (efficiency * COAL_MJ_PER_KG);
}

/** Water lifted from a depth by a shaft power, m³ per day. */
export function waterLiftedPerDay(shaft_kw: number, lift_height_m: number): number {
  if (!(lift_height_m > 0)) return 0;
  return (shaft_kw * 1_000 * PUMP_EFFICIENCY * SECONDS_PER_DAY) / (WATER_DENSITY_KG_M3 * G0_M_S2 * lift_height_m);
}

/** Thin-wall pressure vessel: σ = P r / t (stage2 L114). P is the gauge pressure, Pa. */
export function hoopStressPa(gauge_pressure_pa: number, radius_m: number, thickness_m: number): number {
  return (Math.max(0, gauge_pressure_pa) * radius_m) / thickness_m;
}

/** Safe stress over working stress, capped for display when the boiler isn't pressurised. */
export function safetyMargin(safe_stress_pa: number, stress_pa: number): number {
  if (stress_pa <= 0) return MARGIN_DISPLAY_CAP;
  return Math.min(MARGIN_DISPLAY_CAP, safe_stress_pa / stress_pa);
}

/**
 * Deterministic burst date (stage2 L119: "years_to_failure = f(safety_margin, plate type)").
 * null: safe (margin ≥ 1.5). 0: bursts on first firing (margin ≤ 1). Between, the life grows with
 * the square of how far the margin is above 1.
 */
export function yearsToFailure(safety_margin: number, plate: PlateType): number | null {
  if (safety_margin >= SAFE_MARGIN) return null;
  if (safety_margin <= BURST_MARGIN) return 0;
  const x = (safety_margin - BURST_MARGIN) / (SAFE_MARGIN - BURST_MARGIN);
  return YEARS_TO_FAILURE_AT_SAFE_MARGIN * x * x * YEARS_TO_FAILURE_PLATE_FACTOR[plate];
}

/** Atmospheric, condensing and high-pressure engines: the engine workshop's live outputs. */
export function pistonEngine(dials: PistonEngineDials, options: PistonEngineOptions = {}): PistonEngineResult {
  const engine_type = engineTypeOf(dials);
  const gaugePa = Math.max(0, dials.boiler_pressure - 1) * ATM_PA;
  const effective_pressure_pa = EFFECTIVE_VACUUM_PA + MEAN_EFFECTIVE_FRACTION_OF_GAUGE * gaugePa;
  const area = Math.PI * (dials.cylinder_diameter / 2) ** 2;
  const shaftW = effective_pressure_pa * area * STROKE_M * (STROKES_PER_MIN / 60);
  const shaft_kw = shaftW / 1_000;
  const efficiency = ENGINE_THERMAL_EFFICIENCY[engine_type];

  const boiler_radius_m = BOILER_RADIUS_PER_CYLINDER_DIAMETER * dials.cylinder_diameter;
  const thickness_m = dials.plate.thickness_mm / 1_000;
  const hoop_stress_pa = hoopStressPa(gaugePa, boiler_radius_m, thickness_m);
  const safe_stress_pa = SAFE_STRESS_PA[dials.plate.type] * (options.plate_strength_factor ?? 1);
  const safety_margin = safetyMargin(safe_stress_pa, hoop_stress_pa);

  const shellIron = 6 * Math.PI * boiler_radius_m ** 2 * thickness_m * IRON_DENSITY_KG_M3; // shell 2r long plus two ends
  const wall = Math.max(CYLINDER_WALL_MIN_M, CYLINDER_WALL_PER_BORE * dials.cylinder_diameter);
  const cylinderIron = Math.PI * dials.cylinder_diameter * (STROKE_M + 0.5) * wall * CAST_IRON_DENSITY_KG_M3;
  const iron_cost_kg =
    shellIron +
    cylinderIron +
    ENGINE_FIXED_IRON_KG +
    (dials.condenser === "separate" ? CONDENSER_IRON_KG : 0) +
    (dials.flywheel === "rotative" ? ROTATIVE_IRON_KG : 0);

  return {
    engine_type,
    effective_pressure_pa,
    shaft_kw,
    water_lifted_per_day: dials.flywheel === "rotative" ? 0 : waterLiftedPerDay(shaft_kw, dials.lift_height),
    coal_per_day: coalPerDayKg(shaft_kw, efficiency),
    coal_per_engine_kw: coalKgPerKwh(efficiency),
    iron_cost_kg,
    boiler_radius_m,
    hoop_stress_pa,
    safe_stress_pa,
    safety_margin,
    years_to_failure: yearsToFailure(safety_margin, dials.plate.type),
  };
}

// ---------------------------------------------------------------------------------------------
// Savery pump (the Stage 2 trap)
// ---------------------------------------------------------------------------------------------

/**
 * Practical suction lift, m. The atmosphere holds up ~10.3 m of water in theory; a real pump stops
 * near 9 m (stage2 L638 "Built at 9 m"; failure-modes.md "The mine drains to 9 m and stops";
 * sourced ~9-10 m, stage2 L643).
 */
export const SUCTION_LIFT_LIMIT_M = 9;

/** Pressure a soldered Savery boiler holds safely, Pa gauge. Estimate: about half an atmosphere. */
export const SAVERY_SAFE_GAUGE_PA = 50_000;

/** Shaft-equivalent power of a Savery engine, kW. Estimate: about one horsepower. */
export const SAVERY_POWER_KW = 0.75;

export interface SaveryResult {
  engine_type: "savery";
  /** Depth drained by suction alone, m. */
  suction_lift_m: number;
  /** Boiler gauge pressure needed to push the rest of the lift, Pa (0 within suction range). */
  required_gauge_pa: number;
  water_lifted_per_day: number;
  coal_per_day: number;
  safety_margin: number;
  years_to_failure: number | null;
}

/** The Savery fire engine: one dial, lift_height. Past ~9 m it needs steam pressure its boiler can't hold. */
export function saveryPump(dials: { lift_height: number }): SaveryResult {
  const suction_lift_m = Math.min(dials.lift_height, SUCTION_LIFT_LIMIT_M);
  const pushed = Math.max(0, dials.lift_height - SUCTION_LIFT_LIMIT_M);
  const required_gauge_pa = WATER_DENSITY_KG_M3 * G0_M_S2 * pushed;
  const safety_margin = safetyMargin(SAVERY_SAFE_GAUGE_PA, required_gauge_pa);
  return {
    engine_type: "savery",
    suction_lift_m,
    required_gauge_pa,
    water_lifted_per_day: waterLiftedPerDay(SAVERY_POWER_KW, dials.lift_height),
    coal_per_day: coalPerDayKg(SAVERY_POWER_KW, ENGINE_THERMAL_EFFICIENCY.savery),
    safety_margin,
    // A soldered boiler is the weakest plate there is: use the hammered factor.
    years_to_failure: yearsToFailure(safety_margin, "hammered"),
  };
}

// ---------------------------------------------------------------------------------------------
// Generator (stage3 L74-76)
// ---------------------------------------------------------------------------------------------

export type GeneratorKind = "none" | "permanent_magnet" | "self_excited";
export type PrimeMover = "piston" | "turbine" | "water_turbine";

/** Shaft power to electricity. Estimate for a 19th-century dynamo. */
export const GENERATOR_EFFICIENCY = 0.9;

/** Permanent-magnet machines cap at "a few hundred watts" (stage3 L75, L589). Estimate within that. */
export const MAGNETO_MAX_KW = 0.3;

/** Self-excited dynamo: "50-100 kW per machine" (stage3 L75). */
export const DYNAMO_MAX_KW = 100;

/**
 * Self-excited output per rpm at full field, kW. Estimate, calibrated so a belt-driven dynamo at
 * 500 rpm gives the low end of "50-100 kW per machine" and one at 1,000 rpm the top.
 */
export const DYNAMO_KW_PER_RPM = 0.1;

/**
 * The fastest a shaft can run, rpm, by bearing_quality 0-3 (state-variables L122: wood/tallow,
 * bronze/oil, bronze/mineral oil, hardened steel balls). Estimates; bronze runs "5x faster" than
 * wood (stage3 L243).
 */
export const BEARING_MAX_RPM: readonly [number, number, number, number] = [150, 750, 1_500, 3_000];

/**
 * Generator shaft speed by prime mover, rpm. Estimates: a rotative engine belted up to ~500 rpm;
 * a steam turbine geared to ~3,000 (Parsons' first ran 18,000, stage4 L125); a water turbine at a
 * few hundred (stage3 L609).
 */
export const PRIME_MOVER_SHAFT_RPM: Readonly<Record<PrimeMover, number>> = {
  piston: 500,
  turbine: 3_000,
  water_turbine: 500,
};

export interface GeneratorInputs {
  generator: GeneratorKind;
  /** Shaft power available to the generator, kW. */
  shaft_kw: number;
  /** 0-3 (state). */
  bearing_quality: number;
  prime_mover?: PrimeMover;
  /** Override the prime mover's shaft speed, rpm. */
  shaft_rpm?: number;
}

export interface GeneratorResult {
  /** Electric output, kW (state dynamo_output_kw). */
  dynamo_output_kw: number;
  shaft_rpm: number;
  /** What limits the output: the shaft power, the bearings' speed, the machine, or the magnets. */
  limited_by: "none" | "shaft_power" | "shaft_speed" | "bearing_speed" | "machine_size" | "magnets";
}

export function bearingMaxRpm(bearing_quality: number): number {
  const q = Math.max(0, Math.min(3, Math.floor(bearing_quality)));
  return BEARING_MAX_RPM[q as 0 | 1 | 2 | 3];
}

export function generatorOutput(inputs: GeneratorInputs): GeneratorResult {
  const rpm = Math.min(inputs.shaft_rpm ?? PRIME_MOVER_SHAFT_RPM[inputs.prime_mover ?? "piston"], bearingMaxRpm(inputs.bearing_quality));
  const fromShaft = Math.max(0, inputs.shaft_kw) * GENERATOR_EFFICIENCY;
  if (inputs.generator === "none") return { dynamo_output_kw: 0, shaft_rpm: rpm, limited_by: "none" };
  if (inputs.generator === "permanent_magnet") {
    return fromShaft <= MAGNETO_MAX_KW
      ? { dynamo_output_kw: fromShaft, shaft_rpm: rpm, limited_by: "shaft_power" }
      : { dynamo_output_kw: MAGNETO_MAX_KW, shaft_rpm: rpm, limited_by: "magnets" };
  }
  const requestedRpm = inputs.shaft_rpm ?? PRIME_MOVER_SHAFT_RPM[inputs.prime_mover ?? "piston"];
  const bySpeed = DYNAMO_KW_PER_RPM * rpm;
  const candidates: Array<[number, GeneratorResult["limited_by"]]> = [
    [fromShaft, "shaft_power"],
    [bySpeed, requestedRpm > rpm ? "bearing_speed" : "shaft_speed"],
    [DYNAMO_MAX_KW, "machine_size"],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  const [kw, limited_by] = candidates[0]!;
  return { dynamo_output_kw: kw, shaft_rpm: rpm, limited_by };
}

// ---------------------------------------------------------------------------------------------
// Transmission (stage4 L48-50)
// ---------------------------------------------------------------------------------------------

export type Transmission = "dc_local" | "ac_transformed";

/**
 * Line voltage by transmission, V. Estimates: Edison's three-wire DC, ±110 V; an 1890s AC line
 * (Ferranti's Deptford station, 1890, sent 10 kV).
 */
export const LINE_VOLTAGE_V: Readonly<Record<Transmission, number>> = {
  dc_local: 220,
  ac_transformed: 10_000,
};

/** Copper conductor cross-section, mm². Estimate for a main feeder. */
export const LINE_CONDUCTOR_MM2 = 100;

export interface TransmissionInputs {
  transmission: Transmission;
  /** Power sent, kW. */
  power_kw: number;
  /** One-way distance, km (the circuit is twice this). */
  distance_km: number;
  conductor_mm2?: number;
}

export interface TransmissionResult {
  voltage_v: number;
  resistance_ohm: number;
  /** Loss ∝ I²R with I = P/V (stage4 L50), percent of the power sent, capped at 100. */
  line_loss_pct: number;
  delivered_kw: number;
}

export function transmissionLoss(inputs: TransmissionInputs): TransmissionResult {
  const voltage_v = LINE_VOLTAGE_V[inputs.transmission];
  const areaM2 = (inputs.conductor_mm2 ?? LINE_CONDUCTOR_MM2) * 1e-6;
  const resistance_ohm = (COPPER_RESISTIVITY_OHM_M * 2 * inputs.distance_km * 1_000) / areaM2;
  const lossFraction = Math.min(1, (Math.max(0, inputs.power_kw) * 1_000 * resistance_ohm) / voltage_v ** 2);
  return {
    voltage_v,
    resistance_ohm,
    line_loss_pct: 100 * lossFraction,
    delivered_kw: inputs.power_kw * (1 - lossFraction),
  };
}

// ---------------------------------------------------------------------------------------------
// Prime mover (stage4 L51-53)
// ---------------------------------------------------------------------------------------------

/** stage4 L52: a turbine gives "about twice the electricity per ton of coal"; L115 "about doubles". */
export const TURBINE_EFFICIENCY_GAIN = 2;

/** Coal-to-shaft efficiency of a steam turbine: twice the best piston engine. */
export const TURBINE_THERMAL_EFFICIENCY = TURBINE_EFFICIENCY_GAIN * Math.max(...Object.values(ENGINE_THERMAL_EFFICIENCY));

/**
 * Coal-to-shaft efficiency of a power station's prime mover. A piston station runs at its engine
 * type's efficiency; a water turbine burns nothing (returns 0: no coal).
 */
export function primeMoverEfficiency(prime_mover: PrimeMover, engine_type: EngineType = "watt"): number {
  if (prime_mover === "turbine") return TURBINE_THERMAL_EFFICIENCY;
  if (prime_mover === "water_turbine") return 0;
  return ENGINE_THERMAL_EFFICIENCY[engine_type];
}

export interface PowerStationResult {
  shaft_kw: number;
  coal_per_day: number;
  /** Coal-to-electricity efficiency (state power_station_efficiency); 0 for a water turbine, which burns nothing. */
  power_station_efficiency: number;
}

/** Shaft power and coal a station needs to deliver an electric output. */
export function powerStation(electric_kw: number, prime_mover: PrimeMover, engine_type: EngineType = "watt"): PowerStationResult {
  const shaft_kw = electric_kw / GENERATOR_EFFICIENCY;
  const eff = primeMoverEfficiency(prime_mover, engine_type);
  return {
    shaft_kw,
    coal_per_day: eff > 0 ? coalPerDayKg(shaft_kw, eff) : 0,
    power_station_efficiency: eff * GENERATOR_EFFICIENCY,
  };
}
