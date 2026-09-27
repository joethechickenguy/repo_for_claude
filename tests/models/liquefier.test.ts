// Liquefier workshop model. Worked examples from tech-tree/stages/stage4-electricity-and-chemistry.yaml
// ("stage4 L"), tech-tree/energy.md and tech-tree/open-questions.md.
import { describe, expect, it } from "vitest";
import {
  AIR_CP_KJ_KG_K,
  AIR_LATENT_KJ_KG,
  AIR_R_KJ_KG_K,
  JT_K_PER_ATM,
  LIQUID_AIR_C,
  columnPurityPct,
  compressorKwFor,
  liquefier,
  temperatureAtDay,
} from "../../src/models/liquefier";
import { energyPerPerson } from "../../src/models/energy";
import { expectBetween, expectNear } from "./helpers";

const LINDE = { method: "throttle_regenerative" as const, pressure: 200, exchanger_length: 10, column: 30 };
const CLAUDE = { method: "expansion_engine" as const, pressure: 50, exchanger_length: 10, column: 30 };
const PLANT = { compressor_kw: 50 };

describe("Linde plant: ~1 kWh/kg? (stage4 L60, L381; energy.md L111, L118; open question 11)", () => {
  const r = liquefier(LINDE, PLANT);

  it("physics gives ≈ 2.35 kWh/kg at 200 atm with a long exchanger, not the YAML's ~1 (open question C3)", () => {
    expectNear(r.kwh_per_kg!, 2.35, 0.01);
  });
  it("no simple throttle cycle can reach 1 kWh/kg: even an ideal compressor and ideal exchanger need ~1.3", () => {
    const tAmb = 293.15;
    const idealWork = AIR_R_KJ_KG_K * tAmb * Math.log(200); // isothermal, 100% efficient
    const idealYield = (AIR_CP_KJ_KG_K * JT_K_PER_ATM * 199) / (AIR_CP_KJ_KG_K * (tAmb - (LIQUID_AIR_C + 273.15)) + AIR_LATENT_KJ_KG);
    const floorKwhPerKg = idealWork / idealYield / 3_600;
    expectNear(floorKwhPerKg, 1.3, 0.05);
    expect(floorKwhPerKg).toBeGreaterThan(1);
  });
  it("liquefies about 9% of the air it compresses (Linde's real plants: a few percent to ~10%)", () => {
    expectBetween(r.liquid_yield, 0.05, 0.1);
  });
  it("continuous: a 50 kW compressor makes the gate's 500 kg/day of oxygen (stage4 L14)", () => {
    expect(r.oxygen_kg_per_day).toBeGreaterThanOrEqual(500);
    expectNear(compressorKwFor(500, r.kwh_per_kg!), 49, 0.02);
  });
  it("energy.md L111 counts the 500 kg/day plant at ~5 W per person; with the model's kWh/kg it's ~12 W", () => {
    const kw = compressorKwFor(500, r.kwh_per_kg!);
    expectNear(energyPerPerson({ population: 10_000, electricity_kw: kw, baseline_w_per_person: 0 }).energy_w_per_person, 12.2, 0.02);
  });
});

describe("Claude plant (stage4 L60, L408)", () => {
  it("about half the energy of Linde", () => {
    const linde = liquefier(LINDE, PLANT).kwh_per_kg!;
    const claude = liquefier(CLAUDE, PLANT).kwh_per_kg!;
    expectNear(claude / linde, 0.5, 0.05);
  });
  it("~1.2 kWh/kg: the figure the YAML gives for Linde is a Claude-cycle figure", () => {
    expectNear(liquefier(CLAUDE, PLANT).kwh_per_kg!, 1.18, 0.02);
  });
  it("works at far lower pressure than a throttle plant needs", () => {
    expect(liquefier({ ...CLAUDE, pressure: 40 }, PLANT).kg_per_day).toBeGreaterThan(0);
    expect(liquefier({ ...LINDE, pressure: 40 }, PLANT).kwh_per_kg!).toBeGreaterThan(10);
  });
});

describe("pressure and exchanger (stage4 L62-67, L385)", () => {
  it("higher pressure: more cooling per pass", () => {
    expect(liquefier({ ...LINDE, pressure: 200 }, PLANT).cooling_per_pass_k).toBeGreaterThan(liquefier({ ...LINDE, pressure: 50 }, PLANT).cooling_per_pass_k);
  });
  it("JT cooling per atmosphere is small: 200 atm through the valve cools air only ~40 K", () => {
    expectNear(liquefier(LINDE, PLANT).cooling_per_pass_k, 39.8, 1e-9);
  });
  it("too short never reaches -190 C; the screen shows the asymptote", () => {
    const short = liquefier({ ...LINDE, exchanger_length: 2 }, PLANT);
    expect(short.asymptote_c).toBeGreaterThan(LIQUID_AIR_C);
    expect(short.days_to_first_drop).toBeNull();
    expect(short.kg_per_day).toBe(0);
    expect(short.kwh_per_kg).toBeNull();
  });
  it("without pages the exchanger starts at 1 and the plant stalls above -100 C at any pressure (L385)", () => {
    for (const pressure of [20, 50, 100, 200]) {
      expect(liquefier({ ...LINDE, pressure, exchanger_length: 1 }, PLANT).asymptote_c).toBeGreaterThan(-100);
    }
  });
  it("longer counterflow: each pass starts colder, the asymptote falls", () => {
    const a = [1, 2, 3].map((L) => liquefier({ ...LINDE, exchanger_length: L }, PLANT).asymptote_c);
    expect(a[1]!).toBeLessThan(a[0]!);
    expect(a[2]!).toBeLessThan(a[1]!);
  });
});

describe("the first drop (stage4 L57, L392)", () => {
  const r = liquefier(LINDE, PLANT);
  it("runs for in-game days before the first drop", () => {
    expectBetween(r.days_to_first_drop!, 1, 7);
  });
  it("the player watches the temperature fall toward the asymptote", () => {
    expect(temperatureAtDay(r, 0)).toBeCloseTo(20, 9);
    expect(temperatureAtDay(r, 1)).toBeLessThan(temperatureAtDay(r, 0));
    expect(temperatureAtDay(r, r.days_to_first_drop!)).toBeCloseTo(LIQUID_AIR_C, 6);
    expect(temperatureAtDay(r, 100)).toBe(LIQUID_AIR_C);
  });
});

describe("cascade, the trap (stage4 L59-61, L341-362; failure-modes.md)", () => {
  it("a few liters a day, flat however much power it's given", () => {
    const small = liquefier({ method: "cascade" }, { compressor_kw: 10 });
    const big = liquefier({ method: "cascade" }, { compressor_kw: 1_000 });
    expectBetween(small.liters_per_day, 1, 10);
    expect(big.liters_per_day).toBe(small.liters_per_day);
    expect(big.oxygen_kg_per_day).toBeLessThan(500);
  });
});

describe("rectifying column (stage4 L68-70, L443)", () => {
  it("zero trays: liquid air, 21% oxygen", () => expectNear(columnPurityPct(0), 21, 1e-9));
  it("30+ trays give 99% oxygen", () => {
    expectNear(columnPurityPct(30), 99, 1e-9);
    expect(columnPurityPct(40)).toBeGreaterThan(99);
  });
  it("each tray separates a little more", () => {
    expect(columnPurityPct(10)).toBeGreaterThan(columnPurityPct(9));
    expect(columnPurityPct(1) - columnPurityPct(0)).toBeLessThan(5);
  });
  it("liquid air is four-fifths nitrogen: without a column only ~23% of the product's mass is oxygen (L427)", () => {
    const air = liquefier({ ...LINDE, column: 0 }, PLANT);
    expectNear(air.oxygen_kg_per_day / air.kg_per_day, 0.233, 0.01);
  });
});
