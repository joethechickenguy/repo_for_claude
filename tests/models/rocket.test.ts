// Rocket workshop model. Worked examples from tech-tree/stages/stage6-rocket.yaml (cited "stage6 L"),
// tech-tree/failure-modes.md, tech-tree/energy.md and the interface mockup's screen 5
// (https://claude.ai/artifact/UJnA6qpmNJKpMwq957QaBJ, `R` and `calc()` in its script).
import { describe, expect, it } from "vitest";
import {
  MISSION_BUDGET_KM_S,
  ROCKET_PLAY_VALUES,
  type RocketStageDials,
  designRocket,
  exhaustVelocityKmS,
  massRatioForDv,
  missionBudgetKmS,
  optimalStaging,
  rocketEquationDv,
  singleStageMaxDvKmS,
  stageIsp,
  stageStructuralFraction,
} from "../../src/models/rocket";
import { expectBetween, expectNear } from "./helpers";

/** The mockup's vehicle: 420 / 95 / 22 / 5 t; kerosene steel, kerosene aluminum ×2, ethanol aluminum pressure-fed lander; 1.6 t capsule. */
const MOCKUP_STAGES: RocketStageDials[] = [
  { propellant_mass: 420, propellants: "kerosene_lox", tank_material: "steel", feed: "turbopump" },
  { propellant_mass: 95, propellants: "kerosene_lox", tank_material: "aluminum", feed: "turbopump" },
  { propellant_mass: 22, propellants: "kerosene_lox", tank_material: "aluminum", feed: "turbopump" },
  { propellant_mass: 5, propellants: "ethanol_lox", tank_material: "aluminum", feed: "pressure_fed" },
];
const MOCKUP_PAYLOAD_T = 1.6;

describe("rocket equation", () => {
  it("Δv = v_e ln(m0/mf) (stage6 L53, L109)", () => {
    expect(rocketEquationDv(3, Math.E, 1)).toBeCloseTo(3, 12);
    expect(massRatioForDv(3, 3)).toBeCloseTo(Math.E, 12);
  });

  it("stage6 L55: doubling propellant never doubles Δv", () => {
    const one = designRocket({ stages: MOCKUP_STAGES, payload_t: MOCKUP_PAYLOAD_T }).dv_total_km_s;
    const doubled = designRocket({
      stages: MOCKUP_STAGES.map((s) => ({ ...s, propellant_mass: 2 * s.propellant_mass })),
      payload_t: MOCKUP_PAYLOAD_T,
    }).dv_total_km_s;
    expect(doubled).toBeGreaterThan(one);
    expect(doubled).toBeLessThan(2 * one);
  });
});

describe("play values (stage6 L58-64)", () => {
  it("Isp 280 / 310 / 290 s; pressure-fed costs 25 s", () => {
    expect(ROCKET_PLAY_VALUES.isp_s).toEqual({ ethanol_lox: 280, kerosene_lox: 310, hypergolic: 290 });
    expect(stageIsp({ propellant_mass: 1, propellants: "hypergolic", tank_material: "steel", feed: "pressure_fed" })).toBe(265);
  });
  it("structural fraction 0.14 steel, 0.09 aluminum; pressure-fed adds 0.08", () => {
    expect(stageStructuralFraction({ propellant_mass: 1, propellants: "kerosene_lox", tank_material: "steel", feed: "turbopump" })).toBe(0.14);
    expect(stageStructuralFraction({ propellant_mass: 1, propellants: "kerosene_lox", tank_material: "aluminum", feed: "pressure_fed" })).toBeCloseTo(0.17, 12);
  });
  it("an Isp override (from the rocket-engine model) replaces the play value and its feed penalty", () => {
    expect(stageIsp({ propellant_mass: 1, propellants: "ethanol_lox", tank_material: "steel", feed: "pressure_fed", isp_s: 239 })).toBe(239);
  });
});

describe("the mockup's 4-stage rocket (mockup screen 5)", () => {
  const d = designRocket({ stages: MOCKUP_STAGES, payload_t: MOCKUP_PAYLOAD_T });

  it("totals ≈ 13.6 km/s (work-packages.md C; brief)", () => {
    expectNear(d.dv_total_km_s, 13.64, 0.002);
  });
  it("per stage 3.50 / 3.70 / 3.66 / 2.78 km/s, dry 58.8 / 8.55 / 1.98 / 0.85 t (the mockup's table)", () => {
    [3.505, 3.699, 3.66, 2.781].forEach((v, i) => expectNear(d.stages[i]!.dv_km_s, v, 0.001));
    [58.8, 8.55, 1.98, 0.85].forEach((v, i) => expectNear(d.stages[i]!.dry_mass_t, v, 1e-9));
  });
  it("lifts off at ≈ 614 t carrying ≈ 540 t of propellant (energy.md L128)", () => {
    expectNear(d.liftoff_mass_t, 613.78, 1e-6);
    expectNear(d.propellant_total_t, 540, 0.01);
  });
  it("is 1.66 km/s short of the 15.3 budget: it reaches toward the Moon but hits it too fast (mockup dvtext)", () => {
    expect(d.budget_km_s).toBeCloseTo(15.3, 12);
    expectNear(d.dv_margin_km_s, -1.655, 0.002);
    expect(d.reach).toBe("toward_moon");
  });
  it("the lander's 2.78 km/s covers the ~2.8 km/s braking leg (stage6 L99, L263)", () => {
    expectNear(d.stages[3]!.dv_km_s, MISSION_BUDGET_KM_S.brake_and_land_km_s, 0.01);
  });
});

describe("mission budget and margin", () => {
  it("stage6 L99: 15.3 = 9.4 + 3.1 + 2.8", () => {
    expect(missionBudgetKmS()).toBeCloseTo(15.3, 12);
  });
  it("routes differ: parking orbit costs more Δv than direct ascent (open question 13; estimate)", () => {
    expect(missionBudgetKmS("parking_orbit")).toBeGreaterThan(missionBudgetKmS("direct_ascent"));
    expect(missionBudgetKmS("direct_ascent")).toBeCloseTo(15.3, 12);
  });
  it("margin deductions (midcourse ~0.1, suit and tower 0.15: stage6 L181, L236) come off the margin", () => {
    const base = designRocket({ stages: MOCKUP_STAGES, payload_t: MOCKUP_PAYLOAD_T });
    const less = designRocket({ stages: MOCKUP_STAGES, payload_t: MOCKUP_PAYLOAD_T, margin_deductions_km_s: 0.25 });
    expectNear(base.dv_margin_km_s - less.dv_margin_km_s, 0.25, 1e-9);
  });
  it("a heavier capsule eats margin (1.6 t vs 1.3 t with duralumin, stage6 L207)", () => {
    const steel = designRocket({ stages: MOCKUP_STAGES, payload_t: 1.6 });
    const dural = designRocket({ stages: MOCKUP_STAGES, payload_t: 1.3 });
    expect(dural.dv_margin_km_s).toBeGreaterThan(steel.dv_margin_km_s);
  });
});

describe("what-ifs and traps", () => {
  const steelStage: RocketStageDials = { propellant_mass: 100, propellants: "ethanol_lox", tank_material: "steel", feed: "turbopump" };

  it("stage6 L107: the trap's own arithmetic, ln(1/0.14) × 2.9 km/s, is 5.70 (the YAML says ≈ 5.8; open question C4)", () => {
    expectNear(2.9 * Math.log(1 / 0.14), 5.70, 0.001);
  });
  it("failure-modes.md L67: ln(7) × 2.9 is 5.64 (the file says ≈ 5.7; open question C4)", () => {
    expectNear(2.9 * Math.log(7), 5.64, 0.001);
  });
  it("in the workshop (dry = 0.14 × propellant) a single steel stage tops out at 5.76 km/s on ethanol, 6.38 on kerosene: short of 9.4 either way", () => {
    expectNear(singleStageMaxDvKmS(steelStage), 5.76, 0.002);
    expectNear(singleStageMaxDvKmS({ ...steelStage, propellants: "kerosene_lox" }), 6.38, 0.002);
    expect(singleStageMaxDvKmS({ ...steelStage, propellants: "kerosene_lox" })).toBeLessThan(MISSION_BUDGET_KM_S.to_orbit_km_s);
    // A real single stage with any payload does worse than the zero-payload ceiling.
    const one = designRocket({ stages: [{ ...steelStage, propellant_mass: 1000 }], payload_t: 1.6 });
    expect(one.dv_total_km_s).toBeLessThan(5.76);
    expect(one.reach).toBe("short_of_orbit");
  });
  it("stage6 L52: one stage can't reach orbit even in aluminum; two reach orbit but never the Moon; three reach the Moon", () => {
    const al = { isp_s: 310, structural_fraction: 0.09 };
    expect(singleStageMaxDvKmS({ ...steelStage, propellants: "kerosene_lox", tank_material: "aluminum" })).toBeLessThan(9.4);
    expect(optimalStaging([al, al], 1.6, 9.4)).not.toBeNull();
    expect(optimalStaging([al, al], 1.6, 15.3)).toBeNull();
    expect(optimalStaging([al, al, al], 1.6, 15.3)).not.toBeNull();
  });
  it("failure-modes.md L66: black powder at ~0.8 km/s needs a mass ratio of ~130,000 to reach orbit", () => {
    expectNear(massRatioForDv(9.4, 0.8), 130_000, 0.03);
  });
  it("Isp to exhaust speed: 2.9 km/s is 296 s, not one of the play values (open question C4)", () => {
    expectNear(exhaustVelocityKmS(296), 2.9, 0.001);
  });
});

describe("optimal staging", () => {
  it("returns stages that, fed back through designRocket, give exactly the target Δv", () => {
    const specs = [
      { isp_s: 310, structural_fraction: 0.14 },
      { isp_s: 310, structural_fraction: 0.14 },
      { isp_s: 280, structural_fraction: 0.14 },
    ];
    const opt = optimalStaging(specs, 1.6, 12.5)!;
    expect(opt).not.toBeNull();
    const check = designRocket({
      stages: opt.propellant_mass_t.map((p, i) => ({
        propellant_mass: p,
        propellants: "kerosene_lox" as const,
        tank_material: "steel" as const,
        feed: "turbopump" as const,
        isp_s: specs[i]!.isp_s,
      })),
      payload_t: 1.6,
    });
    expectNear(check.dv_total_km_s, 12.5, 1e-6);
    expectNear(check.liftoff_mass_t, opt.liftoff_mass_t, 1e-6);
    opt.dv_km_s.forEach((dv, i) => expectNear(dv, check.stages[i]!.dv_km_s, 1e-6));
  });

  it("stage4 L454: a steel vehicle is 'nearly twice' an aluminum one; the model gives ≈ 2.5× (open question C5)", () => {
    // Same engines as the mockup: kerosene turbopump stages 1-3, ethanol pressure-fed lander.
    const al = optimalStaging(
      [
        { isp_s: 310, structural_fraction: 0.09 },
        { isp_s: 310, structural_fraction: 0.09 },
        { isp_s: 310, structural_fraction: 0.09 },
        { isp_s: 255, structural_fraction: 0.17 },
      ],
      1.6,
      15.3,
    )!;
    const steel = optimalStaging(
      [
        { isp_s: 310, structural_fraction: 0.14 },
        { isp_s: 310, structural_fraction: 0.14 },
        { isp_s: 310, structural_fraction: 0.14 },
        { isp_s: 255, structural_fraction: 0.22 },
      ],
      1.6,
      15.3,
    )!;
    expectNear(al.liftoff_mass_t, 1_002, 0.01);
    expectNear(steel.liftoff_mass_t, 2_480, 0.01);
    expectBetween(steel.liftoff_mass_t / al.liftoff_mass_t, 2.4, 2.6);
  });
});
