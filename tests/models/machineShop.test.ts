// Machine shop model. Worked examples from tech-tree/stages/stage3-steam-and-steel.yaml ("stage3 L"),
// stage4 ("stage4 L"), stage5 ("stage5 L") and state-variables.yaml.
import { describe, expect, it } from "vitest";
import {
  type MachineShopDials,
  TOLERANCE_LADDER_MM,
  bearingQualityOf,
  erf,
  passFraction,
  shopHoursPerDay,
  simulateQueue,
  toleranceMm,
} from "../../src/models/machineShop";
import { expectNear } from "./helpers";

const FULL: MachineShopDials = { flat_reference: "three_plates", lead_screw: "geared", gauging: "micrometer" };

describe("tolerance ladder (state-variables L27; stage3 L83, L86, L89; stage5 L110)", () => {
  it("hand work holds 1.0 mm", () => expect(toleranceMm({ flat_reference: "none" })).toBe(1.0));
  it("three plates in rotation: 1.0 -> 0.5 mm", () => expect(toleranceMm({ flat_reference: "three_plates" })).toBe(0.5));
  it("a geared lead screw: -> 0.25 mm", () => expect(toleranceMm({ flat_reference: "three_plates", lead_screw: "geared" })).toBe(0.25));
  it("go/no-go gauges: 0.1 mm; micrometer: 0.02 mm", () => {
    expect(toleranceMm({ ...FULL, gauging: "go_no_go_gauges" })).toBe(0.1);
    expect(toleranceMm(FULL)).toBe(0.02);
  });
  it("precision grinding: 0.01 mm (stage5 L110)", () => expect(toleranceMm(FULL, true)).toBe(0.01));
  it("the ladder's values are the ones state-variables.yaml lists", () => {
    expect(Object.values(TOLERANCE_LADDER_MM)).toEqual([1.0, 0.5, 0.25, 0.1, 0.02, 0.01]);
  });
  it("two plates fit each other but can both be curved: no flat reference, and nothing above it helps (stage3 L83, L169)", () => {
    const two = toleranceMm({ ...FULL, flat_reference: "two_plates" });
    expect(two).toBeGreaterThan(TOLERANCE_LADDER_MM.flat_reference);
    expect(two).toBeLessThan(TOLERANCE_LADDER_MM.hand);
  });
  it("you can only hold a tolerance you can measure: a micrometer without the geared screw gains nothing (stage3 L89)", () => {
    expect(toleranceMm({ flat_reference: "three_plates", lead_screw: "hand_chased", gauging: "micrometer" })).toBe(0.5);
  });
  it("gauges open the compressors (tolerance_mm <= 0.1, stage4 L296); the Claude expander needs the micrometer (<= 0.05, stage4 L404)", () => {
    expect(toleranceMm({ ...FULL, gauging: "go_no_go_gauges" })).toBeLessThanOrEqual(0.1);
    expect(toleranceMm({ ...FULL, gauging: "go_no_go_gauges" })).toBeGreaterThan(0.05);
    expect(toleranceMm(FULL)).toBeLessThanOrEqual(0.05);
  });
});

describe("bearings (stage3 L91-93; state-variables L122)", () => {
  it("maps the dial to bearing_quality 0-3; mineral oil lifts bronze to 2 (stage4 L497)", () => {
    expect(bearingQualityOf("wood_and_tallow")).toBe(0);
    expect(bearingQualityOf("bronze_and_oil")).toBe(1);
    expect(bearingQualityOf("bronze_and_oil", true)).toBe(2);
    expect(bearingQualityOf("hardened_steel")).toBe(3);
  });
});

describe("shop hours (stage3 L94-96, L269, L663-669; stage4 L194)", () => {
  const base = { flat_reference: "three_plates" as const };
  it("scale with machinists", () => {
    expect(shopHoursPerDay(base, { machinists: 200 })).toBe(2 * shopHoursPerDay(base, { machinists: 100 }));
  });
  it("individual motors: +50%, which is exactly the third that line shafting loses in belts", () => {
    const line = shopHoursPerDay(base, { machinists: 100 });
    const motors = shopHoursPerDay({ ...base, shop_power: "individual_motors" }, { machinists: 100 });
    expectNear(motors / line, 1.5, 1e-12);
    expectNear(1 / (1 - 1 / 3), 1.5, 1e-12);
  });
  it("planers and milling machines x3; alloy tool steel x2", () => {
    const b = shopHoursPerDay(base, { machinists: 100 });
    expect(shopHoursPerDay(base, { machinists: 100, has_planer: true })).toBe(3 * b);
    expect(shopHoursPerDay(base, { machinists: 100, has_tool_steel: true })).toBe(2 * b);
  });
});

describe("rejects and the parts queue (stage3 L27-33, L80)", () => {
  it("erf is accurate", () => {
    expectNear(erf(1), 0.842_700_79, 1e-6);
    expectNear(erf(-0.5), -0.520_499_88, 1e-6);
    expect(erf(0)).toBeCloseTo(0, 8);
  });
  it("a part at or looser than the shop's tolerance never rejects", () => {
    expect(passFraction(0.25, 0.25)).toBe(1);
    expect(passFraction(1, 0.25)).toBe(1);
  });
  it("a tighter part is remade repeatedly: twice as tight passes ~72%, ten times ~17%", () => {
    expectNear(passFraction(0.05, 0.1), 0.715, 0.005);
    expectNear(passFraction(0.01, 0.1), 0.166, 0.005);
  });
  it("shop hours burn with no output on the rejects (stage3 L33)", () => {
    const q = simulateQueue([{ id: "turbine_blades", hours: 100, tolerance_mm: 0.05 }], 0.1, 10);
    expect(q.parts[0]!.too_tight).toBe(true);
    expectNear(q.parts[0]!.reject_rate, 0.285, 0.01);
    expectNear(q.wasted_hours, 100 / 0.715 - 100, 0.01);
  });
  it("order is the decision: a tight part first delays everything behind it", () => {
    const rails = { id: "rails", hours: 50, tolerance_mm: 1 };
    const gauge = { id: "gauge", hours: 50, tolerance_mm: 0.02 };
    const railsFirst = simulateQueue([rails, gauge], 0.1, 10);
    const gaugeFirst = simulateQueue([gauge, rails], 0.1, 10);
    expect(railsFirst.queue_days).toBeCloseTo(gaugeFirst.queue_days, 9);
    expect(railsFirst.parts[0]!.finish_day).toBe(5);
    expect(gaugeFirst.parts[1]!.finish_day).toBeGreaterThan(15);
  });
  it("a better shop clears the same queue faster", () => {
    const parts = [
      { id: "cylinder", hours: 200, tolerance_mm: 0.1 },
      { id: "screws", hours: 100, tolerance_mm: 0.25 },
    ];
    expect(simulateQueue(parts, 0.1, 50).queue_days).toBeLessThan(simulateQueue(parts, 0.25, 50).queue_days);
    expect(simulateQueue(parts, 0.1, 50).wasted_hours).toBe(0);
  });
});
