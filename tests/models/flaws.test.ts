// Package H's arithmetic: exposure, severity with safety systems, and the seeded launch.
import { describe, expect, it } from "vitest";
import { effectiveSeverity, exposureNeeded, isRevealed, mulberry32, resolveLaunch, seedFrom, type FlawSpec, type MissionSafety } from "../../src/models";

const instability: FlawSpec = { id: "combustion_instability", category: "engine", revealedBy: ["static_fire", "orbital_flight"], exposure: 5, fixMonths: 9, severity: "fatal", phase: "booster" };
const drift: FlawSpec = { id: "gyro_drift", category: "guidance", revealedBy: ["orbital_flight"], exposure: 2, fixMonths: 3, severity: "survivable", phase: "flight" };
const pogo: FlawSpec = { id: "pogo", category: "structure", revealedBy: ["orbital_flight"], exposure: 1, fixMonths: 4, severity: "mission_loss", phase: "booster" };
const SAFE: MissionSafety = { hasEscapeSystem: false, hasPressureSuit: false, hasMidcourse: true, dvMarginKmS: 0.5, survivableMarginKmS: 0.3 };
const ctx = (level: number) => ({ instrumentationLevel: level, instrumentationCut: 2, skilled: false, skilledCut: 1 });

describe("flaws (package H)", () => {
  it("instrumentation and skill cut the tests a flaw needs, never below one", () => {
    expect(exposureNeeded(instability, ctx(0))).toBe(5);
    expect(exposureNeeded(instability, ctx(1))).toBe(3);
    expect(exposureNeeded(instability, ctx(2))).toBe(1);
    expect(exposureNeeded(instability, { ...ctx(2), skilled: true })).toBe(1);
  });

  it("only tests of the right kind count", () => {
    expect(isRevealed(instability, ctx(1), { static_fire: 3 })).toBe(true);
    expect(isRevealed(instability, ctx(1), { static_fire: 2 })).toBe(false);
    expect(isRevealed(instability, ctx(1), { tanking_hold: 9, vacuum_chamber: 9 })).toBe(false);
    expect(isRevealed(instability, ctx(1), { static_fire: 2, orbital_flight: 1 })).toBe(true);
  });

  it("safety systems change severity: escape tower, margin with midcourse", () => {
    expect(effectiveSeverity(instability, SAFE)).toBe("fatal");
    expect(effectiveSeverity(instability, { ...SAFE, hasEscapeSystem: true })).toBe("mission_loss");
    expect(effectiveSeverity(drift, SAFE)).toBe("survivable");
    expect(effectiveSeverity(drift, { ...SAFE, dvMarginKmS: 0.1 })).toBe("fatal");
    expect(effectiveSeverity(drift, { ...SAFE, hasMidcourse: false })).toBe("fatal");
  });

  it("launching with a known fatal flaw always fails, whatever the seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = resolveLaunch([{ spec: instability, known: true, fixed: false }], SAFE, 0.5, seed);
      expect(r.outcome).toBe("pilot_lost");
      expect(r.cause).toBe("combustion_instability");
    }
  });

  it("a fixed flaw never strikes; with nothing unfixed the mission lands", () => {
    for (let seed = 0; seed < 50; seed++) expect(resolveLaunch([{ spec: instability, known: true, fixed: true }], SAFE, 1, seed).outcome).toBe("landed");
  });

  it("the same flaws and seed always give the same result; the chance is the stated one", () => {
    const flaws = [
      { spec: pogo, known: false, fixed: false },
      { spec: drift, known: false, fixed: false },
    ];
    const a = resolveLaunch(flaws, SAFE, 0.5, 1234);
    expect(resolveLaunch(flaws, SAFE, 0.5, 1234)).toEqual(a);
    let lost = 0;
    for (let seed = 0; seed < 2000; seed++) if (resolveLaunch([{ spec: pogo, known: false, fixed: false }], SAFE, 0.5, seedFrom(`s${seed}`)).outcome === "mission_lost") lost++;
    expect(lost / 2000).toBeGreaterThan(0.45);
    expect(lost / 2000).toBeLessThan(0.55);
  });

  it("mulberry32 and seedFrom are deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    expect(seedFrom("abc")).toBe(seedFrom("abc"));
    expect(seedFrom("abc")).not.toBe(seedFrom("abd"));
  });
});
