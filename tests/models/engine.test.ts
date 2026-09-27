// Engine workshop model. Worked examples from tech-tree/stages/stage2-iron.yaml ("stage2 L"),
// stage3-steam-and-steel.yaml ("stage3 L"), stage4-electricity-and-chemistry.yaml ("stage4 L"),
// tech-tree/energy.md and tech-tree/failure-modes.md.
import { describe, expect, it } from "vitest";
import {
  BEARING_MAX_RPM,
  DYNAMO_MAX_KW,
  MAGNETO_MAX_KW,
  type PistonEngineDials,
  SAFE_MARGIN,
  SAFE_STRESS_PA,
  coalPerDayKg,
  engineTypeOf,
  generatorOutput,
  hoopStressPa,
  pistonEngine,
  powerStation,
  saveryPump,
  transmissionLoss,
  yearsToFailure,
} from "../../src/models/engine";
import { energyPerPerson } from "../../src/models/energy";
import { ATM_PA } from "../../src/models/physics";
import { expectBetween, expectNear } from "./helpers";

/** stage2 L107's example: a 0.5 m atmospheric engine at 12 strokes/min of 2 m. */
const NEWCOMEN: PistonEngineDials = {
  lift_height: 30,
  cylinder_diameter: 0.5,
  boiler_pressure: 1,
  plate: { thickness_mm: 10, type: "hammered" },
  condenser: "none",
};

describe("atmospheric engine (stage2 L106-108, L679)", () => {
  const e = pistonEngine(NEWCOMEN);

  it("0.5 m cylinder, 12 strokes/min of 2 m at ~50 kPa: ~4 kW", () => {
    expectNear(e.shaft_kw, 3.93, 0.005);
    expectNear(e.shaft_kw, 4, 0.05);
  });
  it("burns 2-3 t of coal a day (2.5 t at 0.5% efficiency)", () => {
    expectBetween(e.coal_per_day, 2_000, 3_000);
    expectNear(e.coal_per_day, 2_513, 0.005);
  });
  it("is a Newcomen engine at 1-2 atm with no condenser (stage2 L673)", () => {
    expect(e.engine_type).toBe("newcomen");
    expect(engineTypeOf({ boiler_pressure: 2, condenser: "none" })).toBe("newcomen");
    expect(engineTypeOf({ boiler_pressure: 3, condenser: "none" })).toBe("high_pressure");
    expect(engineTypeOf({ boiler_pressure: 1, condenser: "separate" })).toBe("watt");
  });
  it("drains a mine: lifts hundreds of m³ a day from 30 m", () => {
    expectNear(e.water_lifted_per_day, 692, 0.01);
    // Twice as deep, half the water.
    expectNear(pistonEngine({ ...NEWCOMEN, lift_height: 60 }).water_lifted_per_day, e.water_lifted_per_day / 2, 1e-9);
  });
  it("costs a few tonnes of iron to build", () => {
    expectBetween(e.iron_cost_kg, 3_000, 6_000);
  });
  it("at atmospheric pressure the boiler carries no hoop stress: safe, no burst date", () => {
    expect(e.hoop_stress_pa).toBe(0);
    expect(e.years_to_failure).toBeNull();
  });
});

describe("energy.md §1 (L14-16): a 10 kW Newcomen engine", () => {
  it("burns about 6 t of coal a day; a Watt engine a quarter of that", () => {
    expectNear(coalPerDayKg(10, 0.005), 6_400, 0.01);
    expectNear(coalPerDayKg(10, 0.02), 1_600, 0.01);
  });
  it("either one counts ~2.5 W per person under rule 5 (energy.md L106)", () => {
    expect(energyPerPerson({ population: 10_000, work_kw: 10, baseline_w_per_person: 0 }).energy_w_per_person).toBeCloseTo(2.5, 9);
  });
});

describe("separate condenser (stage2 L115-117, L673, L732, L743)", () => {
  it("cuts coal by about three quarters for the same engine: Newcomen burns ~4x a condensing engine", () => {
    const newcomen = pistonEngine(NEWCOMEN);
    const watt = pistonEngine({ ...NEWCOMEN, condenser: "separate" });
    expect(watt.engine_type).toBe("watt");
    expect(watt.shaft_kw).toBeCloseTo(newcomen.shaft_kw, 9);
    expectNear(watt.coal_per_day / newcomen.coal_per_day, 0.25, 1e-9);
  });
  it("adds iron: a condenser is hardware", () => {
    expect(pistonEngine({ ...NEWCOMEN, condenser: "separate" }).iron_cost_kg).toBeGreaterThan(pistonEngine(NEWCOMEN).iron_cost_kg);
  });
});

describe("boiler pressure (stage2 L109-111, L797)", () => {
  it("double the pressure, roughly double the power from the same cylinder", () => {
    const one = pistonEngine(NEWCOMEN).shaft_kw;
    const two = pistonEngine({ ...NEWCOMEN, boiler_pressure: 2 }).shaft_kw;
    expectNear(two / one, 2, 0.02);
  });
  it("more power, more coal, more stress on the boiler (within an engine type)", () => {
    for (const [lo, hi] of [
      [1, 2], // newcomen
      [3, 6], // high_pressure
    ] as const) {
      const low = pistonEngine({ ...NEWCOMEN, boiler_pressure: lo });
      const high = pistonEngine({ ...NEWCOMEN, boiler_pressure: hi });
      expect(high.engine_type).toBe(low.engine_type);
      expect(high.shaft_kw).toBeGreaterThan(low.shaft_kw);
      expect(high.coal_per_day).toBeGreaterThan(low.coal_per_day);
      expect(high.hoop_stress_pa).toBeGreaterThan(low.hoop_stress_pa);
    }
  });
  it("crossing 2 atm makes it a high-pressure engine, which burns less coal per kWh than Newcomen's", () => {
    const newcomen = pistonEngine({ ...NEWCOMEN, boiler_pressure: 2 });
    const hp = pistonEngine({ ...NEWCOMEN, boiler_pressure: 3 });
    expect(hp.engine_type).toBe("high_pressure");
    expect(hp.coal_per_engine_kw).toBeLessThan(newcomen.coal_per_engine_kw);
  });
});

describe("hoop stress and the burst date (stage2 L112-114, L119, L760, L770)", () => {
  it("σ = P r / t", () => {
    expect(hoopStressPa(1e6, 1, 0.01)).toBeCloseTo(1e8, 3);
    const e = pistonEngine({ ...NEWCOMEN, boiler_pressure: 3, plate: { thickness_mm: 10, type: "rolled" } });
    expectNear(e.hoop_stress_pa, (2 * ATM_PA * e.boiler_radius_m) / 0.01, 1e-12);
  });
  it("hammered plate's safe limit is ~half of rolled: same design, half the margin", () => {
    expect(SAFE_STRESS_PA.hammered / SAFE_STRESS_PA.rolled).toBe(0.5);
    const base = { ...NEWCOMEN, boiler_pressure: 3 };
    const hammered = pistonEngine({ ...base, plate: { thickness_mm: 10, type: "hammered" } });
    const rolled = pistonEngine({ ...base, plate: { thickness_mm: 10, type: "rolled" } });
    expectNear(rolled.safety_margin / hammered.safety_margin, 2, 1e-9);
  });
  it("rolled plate: the same margin needs half the thickness or allows twice the (gauge) pressure (stage2 L760)", () => {
    const hammered = pistonEngine({ ...NEWCOMEN, boiler_pressure: 2, plate: { thickness_mm: 12, type: "hammered" } });
    const halfThick = pistonEngine({ ...NEWCOMEN, boiler_pressure: 2, plate: { thickness_mm: 6, type: "rolled" } });
    const twicePressure = pistonEngine({ ...NEWCOMEN, boiler_pressure: 3, plate: { thickness_mm: 12, type: "rolled" } });
    expectNear(halfThick.safety_margin, hammered.safety_margin, 1e-9);
    expectNear(twicePressure.safety_margin, hammered.safety_margin, 1e-9);
  });
  it("for margins under 1.5 the screen shows the year the boiler will burst; at 1.5 and above, none", () => {
    expect(SAFE_MARGIN).toBe(1.5);
    expect(yearsToFailure(1.5, "rolled")).toBeNull();
    expect(yearsToFailure(1.49, "rolled")).toBeGreaterThan(0);
    expect(yearsToFailure(1.0, "rolled")).toBe(0);
  });
  it("is deterministic, earlier at lower margins, and earlier for hammered plate", () => {
    expect(yearsToFailure(1.3, "rolled")).toBe(yearsToFailure(1.3, "rolled"));
    expect(yearsToFailure(1.2, "rolled")!).toBeLessThan(yearsToFailure(1.4, "rolled")!);
    expect(yearsToFailure(1.3, "hammered")!).toBeLessThan(yearsToFailure(1.3, "rolled")!);
  });
  it("without pages the first boiler is built at margin 1.3 (stage2 L678): a hammered one bursts within a few years", () => {
    // The mockup's high-pressure option: "A boiler explodes in year three".
    expectBetween(yearsToFailure(1.3, "hammered")!, 2, 5);
  });
  it("a thin hammered boiler pushed to 6 atm bursts on first firing; rolled plate of 20 mm makes it safe", () => {
    const thin = pistonEngine({ ...NEWCOMEN, boiler_pressure: 6, plate: { thickness_mm: 10, type: "hammered" } });
    expect(thin.safety_margin).toBeLessThan(1);
    expect(thin.years_to_failure).toBe(0);
    const thick = pistonEngine({ ...NEWCOMEN, boiler_pressure: 6, plate: { thickness_mm: 20, type: "rolled" } });
    expect(thick.safety_margin).toBeGreaterThanOrEqual(SAFE_MARGIN);
  });
  it("red iron_quality: plate strength falls by a third (stage2 L68), and so does the margin", () => {
    const base = { ...NEWCOMEN, boiler_pressure: 3, plate: { thickness_mm: 10, type: "rolled" as const } };
    expectNear(pistonEngine(base, { plate_strength_factor: 2 / 3 }).safety_margin, (pistonEngine(base).safety_margin * 2) / 3, 1e-9);
  });
});

describe("Savery pump, the Stage 2 trap (stage2 L103-105, L638, L648; failure-modes.md L63)", () => {
  it("drains to 9 m by suction alone, with no boiler pressure", () => {
    const s = saveryPump({ lift_height: 9 });
    expect(s.suction_lift_m).toBe(9);
    expect(s.required_gauge_pa).toBe(0);
    expect(s.years_to_failure).toBeNull();
  });
  it("stops at ~10 m however well it's made: deeper water needs steam pressure", () => {
    const s = saveryPump({ lift_height: 20 });
    expect(s.suction_lift_m).toBe(9);
    expectNear(s.required_gauge_pa, 1_000 * 9.80665 * 11, 1e-9); // 11 m of water pushed
  });
  it("pushing higher bursts its soldered boiler", () => {
    expect(saveryPump({ lift_height: 20 }).years_to_failure).toBe(0);
    expect(saveryPump({ lift_height: 60 }).safety_margin).toBeLessThan(0.1);
  });
});

describe("rotative output (stage3 L71-73)", () => {
  it("turns shafting instead of pumping: output in kW, no water", () => {
    const r = pistonEngine({ ...NEWCOMEN, condenser: "separate", flywheel: "rotative" });
    expect(r.water_lifted_per_day).toBe(0);
    expect(r.shaft_kw).toBeGreaterThan(0);
  });
});

describe("generator (stage3 L74-76, L589, L644)", () => {
  it("a permanent-magnet machine caps at a few hundred watts however much shaft power it gets", () => {
    const g = generatorOutput({ generator: "permanent_magnet", shaft_kw: 100, bearing_quality: 3 });
    expect(g.dynamo_output_kw).toBe(MAGNETO_MAX_KW);
    expectBetween(g.dynamo_output_kw * 1_000, 100, 900);
    expect(g.limited_by).toBe("magnets");
  });
  it("self-excited: 50-100 kW per machine with bronze bearings or better", () => {
    const bronze = generatorOutput({ generator: "self_excited", shaft_kw: 200, bearing_quality: 1 });
    const balls = generatorOutput({ generator: "self_excited", shaft_kw: 200, bearing_quality: 3, prime_mover: "turbine" });
    expectBetween(bronze.dynamo_output_kw, 50, 100);
    expect(balls.dynamo_output_kw).toBe(DYNAMO_MAX_KW);
  });
  it("is limited by bearing_quality and shaft speed: wooden bearings can't turn a dynamo fast enough", () => {
    const wood = generatorOutput({ generator: "self_excited", shaft_kw: 200, bearing_quality: 0 });
    expect(wood.dynamo_output_kw).toBeLessThan(50);
    expect(wood.limited_by).toBe("bearing_speed");
  });
  it("bronze bearings let shafts run 5x faster than wood and tallow (stage3 L243)", () => {
    expect(BEARING_MAX_RPM[1] / BEARING_MAX_RPM[0]).toBe(5);
  });
  it("the Stage 3 gate is reachable: a 1.2 m, 3 atm rotative engine with bronze bearings delivers 50 kW", () => {
    const engine = pistonEngine({ ...NEWCOMEN, cylinder_diameter: 1.2, boiler_pressure: 3, plate: { thickness_mm: 20, type: "rolled" }, flywheel: "rotative" });
    const g = generatorOutput({ generator: "self_excited", shaft_kw: engine.shaft_kw, bearing_quality: 1 });
    expect(g.dynamo_output_kw).toBeGreaterThanOrEqual(50);
  });
  it("can't make more than the shaft gives", () => {
    const g = generatorOutput({ generator: "self_excited", shaft_kw: 10, bearing_quality: 3 });
    expectNear(g.dynamo_output_kw, 9, 1e-9);
    expect(g.limited_by).toBe("shaft_power");
  });
});

describe("transmission (stage4 L48-50, L98-100)", () => {
  it("DC: about a kilometre before losses bite", () => {
    expect(transmissionLoss({ transmission: "dc_local", power_kw: 10, distance_km: 1 }).line_loss_pct).toBeLessThan(10);
    expect(transmissionLoss({ transmission: "dc_local", power_kw: 10, distance_km: 3 }).line_loss_pct).toBeGreaterThan(20);
  });
  it("AC with transformers: megawatts across the whole colony at a few percent", () => {
    expect(transmissionLoss({ transmission: "ac_transformed", power_kw: 2_000, distance_km: 10 }).line_loss_pct).toBeLessThan(10);
  });
  it("loss ∝ I²R: ten times the voltage, a hundredth of the loss (stage4 L98-100)", () => {
    const low = transmissionLoss({ transmission: "dc_local", power_kw: 5, distance_km: 1 });
    // Same power at 10x the voltage: compare through the formula with a matching line.
    const high = (5_000 * low.resistance_ohm) / (10 * low.voltage_v) ** 2;
    expectNear(high * 100, low.line_loss_pct / 100, 1e-9);
  });
  it("delivered power is what's left after the loss; loss never exceeds what's sent", () => {
    const t = transmissionLoss({ transmission: "dc_local", power_kw: 500, distance_km: 20 });
    expect(t.line_loss_pct).toBe(100);
    expect(t.delivered_kw).toBe(0);
  });
});

describe("prime mover (stage4 L51-53, L115)", () => {
  it("a steam turbine gives about twice the electricity per ton of coal", () => {
    const piston = powerStation(500, "piston");
    const turbine = powerStation(500, "turbine");
    expectNear(piston.coal_per_day / turbine.coal_per_day, 2, 1e-9);
    expectNear(turbine.power_station_efficiency / piston.power_station_efficiency, 2, 1e-9);
  });
  it("a water turbine burns no fuel", () => {
    expect(powerStation(500, "water_turbine").coal_per_day).toBe(0);
  });
});
