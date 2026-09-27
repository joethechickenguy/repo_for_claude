// Rocket engine workshop model. Worked examples from tech-tree/stages/stage5-precision-and-propulsion.yaml
// ("stage5 L"), tech-tree/open-questions.md (12: the real V-2) and tech-tree/failure-modes.md.
import { describe, expect, it } from "vitest";
import {
  FEED_MAX_PC_BAR,
  type RocketEngineDials,
  areaRatio,
  exitMach,
  exitPressureRatio,
  rocketEngine,
  thrustCoefficient,
} from "../../src/models/rocketEngine";
import { ROCKET_PLAY_VALUES } from "../../src/models/rocket";
import { expectBetween, expectNear } from "./helpers";

/** V-2 settings: 75% ethanol / LOX at 1.3, 15 bar, film cooling, peroxide turbopump (stage5 L55, L58, L272, L384). */
const V2: RocketEngineDials = { mixture_ratio: 1.3, chamber_pressure: 15, nozzle: 4, cooling: "film", injector: "showerhead", feed: "peroxide_turbopump" };
const ETH = { propellants: "ethanol_lox" as const };
const KER = { propellants: "kerosene_lox" as const };

describe("nozzle flow", () => {
  it("A/A* = 1 at Mach 1 and the inverse is consistent", () => {
    expect(areaRatio(1, 1.22)).toBeCloseTo(1, 12);
    expect(areaRatio(exitMach(10, 1.22), 1.22)).toBeCloseTo(10, 6);
  });
  it("a longer nozzle expands further: lower exit pressure, higher vacuum thrust coefficient", () => {
    expect(exitPressureRatio(40, 1.22)).toBeLessThan(exitPressureRatio(4, 1.22));
    expect(thrustCoefficient(40, 1.22, 0)).toBeGreaterThan(thrustCoefficient(4, 1.22, 0));
  });
});

describe("the V-2 (stage5 L55: 15 bar; open question 12: 200 s sea level, 239 s vacuum)", () => {
  const v2 = rocketEngine(V2, ETH);
  it("≈ 200 s at sea level and ≈ 239 s in vacuum", () => {
    expectNear(v2.isp_sl_s, 200, 0.02);
    expectNear(v2.isp_vac_s, 239, 0.01);
  });
  it("≈ 250 kN on the stand from its 0.4 m throat: a booster-class engine (stage5 L14)", () => {
    expectNear(v2.thrust_kn, 250, 0.02);
  });
  it("film-cooled, it runs about a minute (stage5 L57; the V-2 burned ~65 s)", () => {
    expectNear(v2.burn_time_s, 60, 1e-9);
  });
  it("so V-2 settings just pass the Stage 5 gate: 250 kN for 60 s (stage5 L14)", () => {
    expect(v2.thrust_kn).toBeGreaterThanOrEqual(250);
    expect(v2.burn_time_s).toBeGreaterThanOrEqual(60);
  });
  it("burns ~130 kg of propellant a second (the V-2's turbopump delivered 'over a hundred', stage5 L389)", () => {
    expectBetween(v2.mass_flow_kg_s, 100, 150);
    expectNear(v2.oxidizer_flow_kg_s / v2.fuel_flow_kg_s, 1.3, 1e-9);
  });
  it("the rocket workshop's play values (280 / 310 s) sit above what these engines give (open question 12)", () => {
    expect(v2.isp_vac_s).toBeLessThan(ROCKET_PLAY_VALUES.isp_s.ethanol_lox);
  });
});

describe("mixture ratio (stage5 L50-52)", () => {
  const bestOf = (props: typeof ETH | typeof KER) => {
    let best = 0;
    let bestMr = 0;
    for (let mr = 1.0; mr <= 3.0001; mr += 0.05) {
      const isp = rocketEngine({ mixture_ratio: mr, chamber_pressure: 15, nozzle: 4 }, props).isp_vac_s;
      if (isp > best) [best, bestMr] = [isp, mr];
    }
    return bestMr;
  };
  it("the optimum for alcohol/LOX is about 1.3-1.5", () => expectBetween(bestOf(ETH), 1.3, 1.5));
  it("for kerosene about 2.3", () => expectNear(bestOf(KER), 2.3, 0.03));
  it("too fuel-rich: low performance", () => {
    expect(rocketEngine({ ...V2, mixture_ratio: 1.0 }, ETH).isp_vac_s).toBeLessThan(rocketEngine({ ...V2, mixture_ratio: 1.4 }, ETH).isp_vac_s);
  });
  it("too oxidizer-rich: burns through the wall", () => {
    const rich = rocketEngine({ ...V2, mixture_ratio: 2.5 }, ETH);
    expect(rich.oxidizer_rich).toBe(true);
    expect(rich.burn_time_s).toBeLessThan(rocketEngine(V2, ETH).burn_time_s / 3);
    expect(rocketEngine({ ...V2, cooling: "regenerative", mixture_ratio: 2.5 }, ETH).burn_time_s).toBeLessThan(Infinity);
    expect(rocketEngine({ ...V2, cooling: "regenerative", mixture_ratio: 1.5 }, ETH).burn_time_s).toBe(Infinity);
  });
});

describe("chamber pressure and feed (stage5 L53-55, L62-64, L379, L406)", () => {
  it("higher pressure: more thrust per engine and better sea-level Isp", () => {
    const lo = rocketEngine({ ...V2, feed: "gas_generator_turbopump", chamber_pressure: 15 }, ETH);
    const hi = rocketEngine({ ...V2, feed: "gas_generator_turbopump", chamber_pressure: 40 }, ETH);
    expect(hi.thrust_kn).toBeGreaterThan(2 * lo.thrust_kn);
    expect(hi.isp_sl_s).toBeGreaterThan(lo.isp_sl_s);
  });
  it("pressure-fed caps at ~20 bar, peroxide turbopumps ~25, gas generators 60", () => {
    expect(FEED_MAX_PC_BAR).toEqual({ pressure_fed: 20, peroxide_turbopump: 25, gas_generator_turbopump: 60 });
    const pf = rocketEngine({ ...V2, feed: "pressure_fed", chamber_pressure: 40 }, ETH);
    expect(pf.chamber_pressure_bar).toBe(20);
    expect(pf.feed_limited).toBe(true);
    expect(pf.feed_margin).toBe(0.5);
    expect(rocketEngine({ ...V2, feed: "gas_generator_turbopump", chamber_pressure: 40 }, ETH).chamber_pressure_bar).toBe(40);
  });
  it("the first engine is pressure-fed, uncooled, showerhead: it runs for seconds and burns through (stage5 L245, L250)", () => {
    const first = rocketEngine({ mixture_ratio: 1.3, chamber_pressure: 10, nozzle: 4 }, ETH);
    expectBetween(first.burn_time_s, 1, 10);
    expect(first.injector_quality).toBe(0);
  });
});

describe("cooling (stage5 L56-58)", () => {
  const at = (cooling: RocketEngineDials["cooling"]) => rocketEngine({ ...V2, cooling }, ETH);
  it("none: seconds; film: a minute; regenerative: indefinite", () => {
    expectBetween(at("none").burn_time_s, 1, 10);
    expectNear(at("film").burn_time_s, 60, 1e-9);
    expect(at("regenerative").burn_time_s).toBe(Infinity);
  });
  it("film cooling costs Isp", () => {
    expect(at("film").isp_vac_s).toBeLessThan(at("none").isp_vac_s);
    expect(at("regenerative").isp_vac_s).toBeGreaterThanOrEqual(at("none").isp_vac_s);
  });
  it("higher chamber pressure shortens a heat-limited burn (wall heat flux ∝ Pc^0.8)", () => {
    const hot = rocketEngine({ ...V2, chamber_pressure: 25 }, ETH);
    expectNear(hot.burn_time_s, 60 * Math.pow(15 / 25, 0.8), 1e-9);
  });
});

describe("injector (stage5 L59-61; failure-modes.md L10-11)", () => {
  it("showerhead: instability likely above ~15 bar; impinging jets allow higher pressure; baffles fix it", () => {
    const pc = { ...V2, chamber_pressure: 25 };
    expect(rocketEngine({ ...pc, injector: "showerhead" }, ETH).stability_margin).toBeLessThan(1);
    expect(rocketEngine({ ...pc, injector: "impinging" }, ETH).stability_margin).toBeGreaterThan(1);
    expect(rocketEngine({ ...pc, injector: "impinging_baffled" }, ETH).stability_margin).toBeGreaterThan(
      rocketEngine({ ...pc, injector: "impinging" }, ETH).stability_margin,
    );
  });
  it("sets injector_quality 0-2 for package H (injector_quality 0 guarantees combustion_instability)", () => {
    expect(rocketEngine({ ...V2, injector: "showerhead" }, ETH).injector_quality).toBe(0);
    expect(rocketEngine({ ...V2, injector: "impinging" }, ETH).injector_quality).toBe(1);
    expect(rocketEngine({ ...V2, injector: "impinging_baffled" }, ETH).injector_quality).toBe(2);
  });
  it("impinging jets burn more completely: higher Isp than a showerhead", () => {
    expect(rocketEngine({ ...V2, injector: "impinging" }, ETH).isp_vac_s).toBeGreaterThan(rocketEngine(V2, ETH).isp_vac_s);
  });
});

describe("nozzle expansion (stage5 L65-67)", () => {
  const base: RocketEngineDials = { mixture_ratio: 2.3, chamber_pressure: 15, nozzle: 4, cooling: "regenerative", injector: "impinging", feed: "gas_generator_turbopump" };
  it("sea-level engines want a short nozzle; vacuum stages want a long one", () => {
    const short = rocketEngine(base, KER);
    const long = rocketEngine({ ...base, nozzle: 40 }, KER);
    expect(short.isp_sl_s).toBeGreaterThan(long.isp_sl_s);
    expect(long.isp_vac_s).toBeGreaterThan(short.isp_vac_s);
  });
  it("an over-expanded nozzle at sea level separates (flagged for H) instead of giving negative thrust", () => {
    const long = rocketEngine({ ...base, nozzle: 40 }, KER);
    expect(long.flow_separation_sl).toBe(true);
    expect(long.isp_sl_s).toBeGreaterThan(0);
    expect(rocketEngine(base, KER).flow_separation_sl).toBe(false);
  });
  it("a kerosene gas-generator engine at 60 bar with a long nozzle reaches 300-330 s in vacuum (F-1: 304 s at ε 16)", () => {
    expectBetween(rocketEngine({ ...base, chamber_pressure: 60, nozzle: 40 }, KER).isp_vac_s, 300, 330);
  });
});

describe("the Stage 5 gate is reachable on each route (stage5 L14-15)", () => {
  const gate = (r: ReturnType<typeof rocketEngine>) => r.thrust_kn >= 250 && r.burn_time_s >= 60;
  it("gas generator, regenerative, kerosene", () => {
    expect(gate(rocketEngine({ mixture_ratio: 2.3, chamber_pressure: 40, nozzle: 8, cooling: "regenerative", injector: "impinging_baffled", feed: "gas_generator_turbopump" }, KER))).toBe(true);
  });
  it("peroxide turbopump, regenerative, alcohol", () => {
    expect(gate(rocketEngine({ mixture_ratio: 1.4, chamber_pressure: 25, nozzle: 5, cooling: "regenerative", injector: "impinging", feed: "peroxide_turbopump" }, ETH))).toBe(true);
  });
  it("the pressure-fed trap passes too (stage5 L351: 'Scales to a booster and passes the gate')", () => {
    expect(gate(rocketEngine({ mixture_ratio: 1.4, chamber_pressure: 20, nozzle: 4, cooling: "regenerative", injector: "impinging", feed: "pressure_fed" }, ETH))).toBe(true);
  });
});
