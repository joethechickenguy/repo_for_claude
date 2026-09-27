// Pins every worked number in tech-tree/energy.md. Line numbers cite that file.
import { describe, expect, it } from "vitest";
import {
  BASELINE_W_PER_PERSON,
  CHARCOAL_MJ_PER_KG,
  WOOD_MJ_PER_KG,
  countedWorkW,
  energyPerPerson,
  fuelHeatW,
  gjPerYearToW,
  kwhOverYearsToW,
  mjPerDayToW,
} from "../../src/models/energy";
import { expectBetween, expectNear } from "./helpers";

const POP = 10_000;
/** W per person added by a load, without the baseline. */
const perPerson = (inputs: Parameters<typeof energyPerPerson>[0]) =>
  energyPerPerson({ ...inputs, baseline_w_per_person: 0 }).energy_w_per_person;

describe("energy accounting (energy.md)", () => {
  it("L7: 1 W per person = 10 kW for the colony = 864 MJ per day", () => {
    expect(mjPerDayToW(864)).toBeCloseTo(10_000, 6);
    expect(mjPerDayToW(864) / POP).toBeCloseTo(1, 9);
  });

  it("L46: charcoal counts 75 MJ/kg = 29 MJ + 46 MJ of wood lost = 5 kg wood at 15 MJ/kg", () => {
    expect(CHARCOAL_MJ_PER_KG).toBe(29 + 46);
    // stage1 L148: 100 kg wood -> 20 kg charcoal, i.e. 5 kg wood per kg charcoal
    expect(CHARCOAL_MJ_PER_KG).toBe(5 * WOOD_MJ_PER_KG);
  });

  it("the baseline is 120 W per person (L80) and muscle adds nothing", () => {
    expect(energyPerPerson({ population: POP }).energy_w_per_person).toBe(BASELINE_W_PER_PERSON);
    expect(BASELINE_W_PER_PERSON).toBe(120);
  });

  it("population is a parameter: the same fuel over fewer people is more watts each", () => {
    const a = perPerson({ population: 10_000, fuel_kg_per_day: { coal: 1000 } });
    const b = perPerson({ population: 5_000, fuel_kg_per_day: { coal: 1000 } });
    expect(b).toBeCloseTo(2 * a, 9);
  });

  describe("§1 raw vs rule-5 accounting (L14-16)", () => {
    const newcomenHeatW = 10_000 / 0.005; // 10 kW at 0.5%
    it("a 10 kW Newcomen at 0.5% burns ~2 MW of coal heat, about 6 t of coal a day", () => {
      expect(newcomenHeatW).toBe(2e6);
      const coalKgPerDay = (newcomenHeatW * 86_400) / 27e6;
      expectNear(coalKgPerDay, 6_000, 0.1); // 6.4 t
      expectNear(fuelHeatW({ coal: coalKgPerDay }), 2e6, 1e-9);
    });
    it("raw, that adds ~200 W per person; a Watt engine (a quarter) ~50 W", () => {
      expectNear(newcomenHeatW / POP, 200, 0.01);
      expectNear(newcomenHeatW / 4 / POP, 50, 0.01);
    });
    it("rule 5: either engine delivering 10 kW counts ~2.5 W per person (L106)", () => {
      expectNear(perPerson({ population: POP, work_kw: 10 }), 2.5, 1e-9);
    });
  });

  describe("§3 historical reference points (L67-70)", () => {
    it("~10 GJ/year ≈ 320 W", () => expectNear(gjPerYearToW(10), 320, 0.02));
    it("~20 GJ/year ≈ 630 W", () => expectNear(gjPerYearToW(20), 630, 0.02));
    it("~100 GJ/year ≈ 3.2 kW", () => expectNear(gjPerYearToW(100), 3_200, 0.02));
    it("US 1960: 44 quadrillion BTU / 180 million people ≈ 8 kW", () => {
      const joulesPerYear = 44e15 * 1_055.06;
      expectNear(gjPerYearToW(joulesPerYear / 1e9) / 180e6, 8_000, 0.03);
    });
  });

  describe("§4 gates (L80-84)", () => {
    it("gate 1: ~1,500 kg charcoal a day brings the colony to 250 W", () => {
      expectNear(energyPerPerson({ population: POP, fuel_kg_per_day: { charcoal: 1_500 } }).energy_w_per_person, 250, 0.01);
    });
    it("gate 1: 300 blowpipe smelters, or 100 wind smelters, fed by ~75 burners, is that 1,500 kg", () => {
      expect(300 * 5).toBe(1_500); // L99: 5 kg charcoal per blowpipe smelter-day
      expect(100 * 15).toBe(1_500); // L100: 15 kg per wind smelter-day
      expect(75 * 20).toBe(1_500); // stage1 L148: 20 kg charcoal per burner-day
    });
    it("gate 2: three to four charcoal blast furnaces' worth of fuel reach 600 W", () => {
      const furnace = perPerson({ population: POP, fuel_kg_per_day: { charcoal: 1_500 } }); // L102
      const needed = (600 - BASELINE_W_PER_PERSON) / furnace;
      expectBetween(needed, 3, 4);
    });
    it("gate 3: ~45 t of coal a day reaches ~1.5 kW", () => {
      expectNear(energyPerPerson({ population: POP, fuel_kg_per_day: { coal: 45_000 } }).energy_w_per_person, 1_500, 0.03);
    });
    it("gate 4: ~2 MW of electricity counts ~500 W", () => {
      expectNear(perPerson({ population: POP, electricity_kw: 2_000 }), 500, 1e-9);
    });
    it("L88: the jumps between gates are ×2.1, ×2.4, ×2.5, ×1.7, ×1.4", () => {
      const gates = [120, 250, 600, 1_500, 2_500, 3_500];
      const jumps = gates.slice(1).map((g, i) => g / gates[i]!);
      [2.1, 2.4, 2.5, 1.7, 1.4].forEach((j, i) => expectNear(jumps[i]!, j, 0.02));
    });
  });

  describe("§5 energy impact by source (L98-112)", () => {
    const rows: Array<[string, Parameters<typeof perPerson>[0], number, number]> = [
      ["L98 pit kiln, 100 potters, 2,400 kg wood/day ≈ 40 W", { population: POP, fuel_kg_per_day: { wood: 2_400 } }, 40, 0.05],
      ["L99 blowpipe smelter, 5 kg charcoal/day ≈ 0.4 W", { population: POP, fuel_kg_per_day: { charcoal: 5 } }, 0.4, 0.1],
      ["L100 wind smelter, 15 kg charcoal/day ≈ 1.3 W", { population: POP, fuel_kg_per_day: { charcoal: 15 } }, 1.3, 0.01],
      ["L101 bloomery crew, 10 kg charcoal/day ≈ 0.9 W", { population: POP, fuel_kg_per_day: { charcoal: 10 } }, 0.9, 0.04],
      ["L102 charcoal blast furnace, 1.5 t charcoal/day ≈ 130 W", { population: POP, fuel_kg_per_day: { charcoal: 1_500 } }, 130, 0.01],
      ["L103 cold-blast coke furnace, 8 t coal/day ≈ 250 W", { population: POP, fuel_kg_per_day: { coal: 8_000 } }, 250, 0.01],
      ["L104 hot-blast coke furnace, 5 t coal/day ≈ 160 W", { population: POP, fuel_kg_per_day: { coal: 5_000 } }, 160, 0.03],
      ["L105 water wheel, 3 kW ≈ 0.75 W", { population: POP, work_kw: 3 }, 0.75, 1e-9],
      ["L106 Newcomen or Watt engine, 10 kW ≈ 2.5 W", { population: POP, work_kw: 10 }, 2.5, 1e-9],
      ["L107 factory steam plant, 500 kW ≈ 125 W", { population: POP, work_kw: 500 }, 125, 1e-9],
      ["L108 dynamo at the gate, 50 kW ≈ 12.5 W", { population: POP, electricity_kw: 50 }, 12.5, 1e-9],
      ["L109 grid mid Stage 4, 2 MW ≈ 500 W", { population: POP, electricity_kw: 2_000 }, 500, 1e-9],
      ["L110 aluminum 1 t/day at 20 kWh/kg ≈ 210 W", { population: POP, electricity_kw: (1_000 * 20) / 24 }, 210, 0.01],
      ["L111 LOX 500 kg/day at 1 kWh/kg ≈ 5 W", { population: POP, electricity_kw: (500 * 1) / 24 }, 5, 0.05],
      ["L112 LOX 50 t/day at 1 kWh/kg ≈ 520 W", { population: POP, electricity_kw: (50_000 * 1) / 24 }, 520, 0.01],
    ];
    for (const [name, inputs, expected, rel] of rows) {
      it(name, () => expectNear(perPerson(inputs), expected, rel));
    }
  });

  describe("§6 bottom-up launch estimate (L128-142)", () => {
    // The mockup's vehicle carries 420 + 95 + 22 + 5 = 542 t of propellant (see rocket.test.ts).
    const propellantT = 420 + 95 + 22 + 5;
    it("about 540 t of propellant; at mixture ratio 2.3, roughly 375 t of it oxygen", () => {
      expectNear(propellantT, 540, 0.01);
      expectNear((540 * 2.3) / 3.3, 375, 0.01);
    });
    it("ten vehicles' oxygen, 3,750 t at 1 kWh/kg over five years ≈ 85 kW ≈ 20 W per person", () => {
      const avgW = kwhOverYearsToW(3_750_000 * 1, 5);
      expectNear(avgW, 85_000, 0.02);
      expectNear(countedWorkW(avgW / 1_000) / POP, 20, 0.1);
    });
    it("~1,650 t of kerosene at 43 MJ/kg over five years ≈ 45 W per person", () => {
      expectNear(((540 - 375) * 10), 1_650, 1e-9);
      const avgW = (1_650_000 * 43e6) / (5 * 365.25 * 86_400);
      expectNear(avgW / POP, 45, 0.01);
    });
    it("iron and steel, ~20,000 t/year at ~25 GJ/t ≈ 1.6 kW per person", () => {
      expectNear(gjPerYearToW(20_000 * 25) / POP, 1_600, 0.02);
    });
    it("3-5 MW of electricity (× 2.5) ≈ 0.8-1.3 kW per person", () => {
      expectNear(perPerson({ population: POP, electricity_kw: 3_000 }), 800, 0.07);
      expectNear(perPerson({ population: POP, electricity_kw: 5_000 }), 1_300, 0.04);
    });
  });
});
